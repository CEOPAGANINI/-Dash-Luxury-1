"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { BlockPicker } from "@/components/ui/block-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { criarSiteAction } from "./actions";
import { Bloco, Vazio } from "./como-funciona";
import {
  controlCharacters,
  formatarDataHora,
  lerDominioDoSite,
  VPS_INPUT_LIMITS,
  type SiteDTO,
} from "./modelo";
import type { CheckoutOpcaoDTO } from "./queries";
import {
  AvisoDeAtualizacao,
  BotaoCopiar,
  RetornoDaOperacao,
  Selo,
} from "./servidores-painel";
import { useEstadoVps } from "./use-estado-vps";
import { useOperacao } from "./use-operacao";
import {
  hostsReservadosDaTela,
  rotuloDoDnsDoSite,
  rotuloDoHttps,
  rotuloDoNoAr,
  type EstadoDaTela,
} from "./vps-cliente";

/*
  /servidor/sites: a tabela de todos os sites e o bloco "Novo site".

  Criar site exige um servidor `ativo` (confirmado pelo dono): antes disso
  não há para quem mandar a tarefa de configurar, e o bloco nem aparece.
  As escolhas (servidor, www, checkout, origem) são BlockPicker; o campo
  escondido de cada um entra no FormData da action.
*/

/** A URL que o /checkout do site vai abrir. */
export function urlDoCheckout(
  origem: string,
  checkout: CheckoutOpcaoDTO,
): string {
  return `${origem}/checkout/${checkout.slug}`;
}

export function TabelaDeSites({
  sites,
  mostrarServidor = true,
}: {
  sites: SiteDTO[];
  mostrarServidor?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
          <tr>
            <th className="border-b px-4 py-3 font-extrabold">Site</th>
            <th className="border-b px-3 py-3 font-extrabold">Domínio</th>
            {mostrarServidor && (
              <th className="border-b px-3 py-3 font-extrabold">Servidor</th>
            )}
            <th className="border-b px-3 py-3 font-extrabold">Versão ativa</th>
            <th className="border-b px-3 py-3 font-extrabold">No ar</th>
            <th className="border-b px-3 py-3 font-extrabold">HTTPS</th>
            <th className="border-b px-3 py-3 font-extrabold">DNS</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => {
            const principal =
              site.dominios.find((d) => d.principal) ?? site.dominios[0];
            const outros = site.dominios.length - 1;
            return (
              <tr key={site.id} className="hover:bg-muted/20">
                <td className="border-b px-4 py-3">
                  <Link
                    href={`/servidor/sites/${site.id}`}
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    {site.nome}
                  </Link>
                  {site.estado === "removendo" && (
                    <span className="text-muted-foreground block text-xs">
                      Removendo…
                    </span>
                  )}
                </td>
                <td className="border-b px-3 py-3 break-all">
                  {principal?.hostname ?? "—"}
                  {outros > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      +{outros}
                    </span>
                  )}
                </td>
                {mostrarServidor && (
                  <td className="border-b px-3 py-3">
                    {site.servidorNome || "—"}
                  </td>
                )}
                <td className="border-b px-3 py-3">
                  {site.versaoAtiva
                    ? formatarDataHora(site.versaoAtiva.criadaEm)
                    : "Página de espera"}
                </td>
                <td className="border-b px-3 py-3">
                  <Selo rotulo={rotuloDoNoAr(site.noAr)} />
                </td>
                <td className="border-b px-3 py-3">
                  <Selo rotulo={rotuloDoHttps(site.https)} />
                </td>
                <td className="border-b px-3 py-3">
                  <Selo rotulo={rotuloDoDnsDoSite(site)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Os destinos possíveis do /checkout de um site, com o link de cada um
 * para copiar (o dono pode querer o endereço no próprio HTML).
 */
export function EscolhaDeCheckout({
  checkouts,
  origens,
  checkoutId,
  origem,
  onCheckout,
  onOrigem,
  desligado,
}: {
  checkouts: CheckoutOpcaoDTO[];
  origens: string[];
  checkoutId: string;
  origem: string;
  onCheckout: (valor: string) => void;
  onOrigem: (valor: string) => void;
  desligado: boolean;
}) {
  const idCheckout = React.useId();
  const idOrigem = React.useId();
  return (
    <div className="min-w-0 space-y-3">
      <div className="min-w-0 space-y-1.5">
        <p id={idCheckout} className="text-sm font-medium">
          O botão /checkout vai para
        </p>
        <BlockPicker
          labelledBy={idCheckout}
          name="checkoutId"
          value={checkoutId}
          onChange={onCheckout}
          disabled={desligado}
          size="sm"
          options={[
            ...checkouts.map((c) => ({
              value: c.id,
              label: c.nome,
              title: urlDoCheckout(origem, c),
            })),
            { value: "nenhum", label: "Nenhum" },
          ]}
        />
        {checkouts.length === 0 && (
          <p className="text-muted-foreground text-xs leading-5">
            Nenhum checkout publicado neste painel. Publique um em Transações
            para o botão /checkout ter para onde ir.
          </p>
        )}
      </div>
      {origens.length > 1 && (
        <div className="min-w-0 space-y-1.5">
          <p id={idOrigem} className="text-sm font-medium">
            Endereço do checkout
          </p>
          <BlockPicker
            labelledBy={idOrigem}
            name="origemCheckout"
            value={origem}
            onChange={onOrigem}
            disabled={desligado}
            size="sm"
            options={origens.map((o) => ({ value: o, label: o }))}
          />
        </div>
      )}
      {origens.length === 1 && (
        <input type="hidden" name="origemCheckout" value={origem} />
      )}
      {checkouts.length > 0 && (
        <ul className="divide-border/60 divide-y border">
          {checkouts.map((c) => (
            <li
              key={c.id}
              className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-xs leading-5 break-all">
                <b>{c.nome}</b>{" "}
                <span className="text-muted-foreground">
                  {urlDoCheckout(origem, c)}
                </span>
              </span>
              <BotaoCopiar
                texto={urlDoCheckout(origem, c)}
                rotulo="Copiar link"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NovoSite({
  estado,
  aoCriar,
}: {
  estado: EstadoDaTela;
  aoCriar: () => void;
}) {
  const operacao = useOperacao();
  const ativos = estado.servidores.filter((s) => s.estado === "ativo");
  const [servidorId, setServidorId] = React.useState(ativos[0]?.id ?? "");
  const [www, setWww] = React.useState("sim");
  const [checkoutId, setCheckoutId] = React.useState(
    estado.checkouts[0]?.id ?? "nenhum",
  );
  const [origem, setOrigem] = React.useState(estado.origens[0] ?? "");
  const [criado, setCriado] = React.useState<string | null>(null);
  const idNome = React.useId();
  const idDominio = React.useId();
  const idServidor = React.useId();
  const idWww = React.useId();
  // Um servidor escolhido que deixou de estar ativo cai para o primeiro.
  const servidorEscolhido = ativos.some((s) => s.id === servidorId)
    ? servidorId
    : (ativos[0]?.id ?? "");
  // Idem para um checkout que foi despublicado enquanto a tela estava aberta.
  const checkoutEscolhido =
    checkoutId === "nenhum" || estado.checkouts.some((c) => c.id === checkoutId)
      ? checkoutId
      : "nenhum";
  const desligado = !estado.podeAlterar;

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const nome = String(dados.get("nome") ?? "").trim();
    const dominio = String(dados.get("dominio") ?? "");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Dê um nome ao site.";
    else if (
      nome.length > VPS_INPUT_LIMITS.name ||
      controlCharacters.test(nome)
    )
      erros.nome = `Até ${VPS_INPUT_LIMITS.name} caracteres, sem caracteres de controle.`;
    if (!lerDominioDoSite(dominio, hostsReservadosDaTela(estado)))
      erros.dominio =
        "Digite só o domínio, ex.: loja.com.br (sem https://, sem barra; não vale o endereço do próprio painel nem *.vercel.app).";
    if (Object.keys(erros).length > 0)
      return operacao.recusar("Confira os campos destacados.", erros);
    const resultado = await operacao.executar("Criando o site…", () =>
      criarSiteAction(null, dados),
    );
    if (resultado?.ok && resultado.dados) {
      setCriado(resultado.dados.siteId);
      formulario.reset();
      aoCriar();
    }
  }

  return (
    <Bloco
      rotulo="Novo site"
      titulo="Criar um site"
      descricao="O servidor prepara a pasta e uma página de espera. Depois você aponta o DNS e envia o ZIP."
    >
      <form onSubmit={(evento) => void criar(evento)} className="space-y-4">
        {ativos.length >= 2 ? (
          <div className="min-w-0 space-y-1.5">
            <p id={idServidor} className="text-sm font-medium">
              Servidor
            </p>
            <BlockPicker
              labelledBy={idServidor}
              name="servidorId"
              value={servidorEscolhido}
              onChange={setServidorId}
              disabled={desligado}
              size="sm"
              options={ativos.map((s) => ({ value: s.id, label: s.nome }))}
            />
          </div>
        ) : (
          <input type="hidden" name="servidorId" value={servidorEscolhido} />
        )}
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={idNome} className="block text-sm font-medium">
              Nome do site
            </label>
            <Input
              id={idNome}
              name="nome"
              maxLength={VPS_INPUT_LIMITS.name}
              autoComplete="off"
              placeholder="Cadeira X"
              disabled={desligado}
              aria-invalid={Boolean(operacao.erros.nome) || undefined}
            />
            {operacao.erros.nome && (
              <p className="text-destructive text-xs">{operacao.erros.nome}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={idDominio} className="block text-sm font-medium">
              Domínio
            </label>
            <Input
              id={idDominio}
              name="dominio"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              placeholder="loja.com.br"
              disabled={desligado}
              aria-invalid={Boolean(operacao.erros.dominio) || undefined}
            />
            {operacao.erros.dominio && (
              <p className="text-destructive text-xs leading-5">
                {operacao.erros.dominio}
              </p>
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <p id={idWww} className="text-sm font-medium">
            Incluir www
          </p>
          <BlockPicker
            labelledBy={idWww}
            name="incluirWww"
            value={www}
            onChange={setWww}
            disabled={desligado}
            size="sm"
            options={[
              { value: "sim", label: "Sim" },
              { value: "nao", label: "Não" },
            ]}
          />
        </div>
        <EscolhaDeCheckout
          checkouts={estado.checkouts}
          origens={estado.origens}
          checkoutId={checkoutEscolhido}
          origem={origem}
          onCheckout={setCheckoutId}
          onOrigem={setOrigem}
          desligado={desligado}
        />
        <Button
          type="submit"
          loading={Boolean(operacao.ocupado)}
          disabled={desligado || !servidorEscolhido}
        >
          {!operacao.ocupado && <Plus aria-hidden />}
          <span>Criar site</span>
        </Button>
        {desligado && (
          <p className="text-muted-foreground text-xs leading-5">
            Falta VPS_CHAVE_MESTRA na Vercel: sem ela o painel não manda tarefa
            nenhuma ao servidor.
          </p>
        )}
        <RetornoDaOperacao operacao={operacao} destino="/servidor/sites" />
        {criado && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/servidor/sites/${criado}`}>
              <span>Abrir o site criado</span>
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
      </form>
    </Bloco>
  );
}

export function SitesPainel({ inicial }: { inicial: EstadoDaTela }) {
  const { estado, falha, atualizar } = useEstadoVps(inicial);
  const temAtivo = estado.servidores.some((s) => s.estado === "ativo");

  return (
    <div className="min-w-0 space-y-4">
      <AvisoDeAtualizacao falha={falha} destino="/servidor/sites" />
      {estado.sites.length > 0 ? (
        <Bloco
          rotulo="Sites"
          titulo={
            estado.sites.length === 1
              ? "1 site neste painel"
              : `${estado.sites.length} sites neste painel`
          }
          descricao="“No ar” só aparece depois que o painel confere o domínio pelo lado de fora."
          semRespiro
        >
          <TabelaDeSites sites={estado.sites} />
        </Bloco>
      ) : temAtivo ? (
        <Vazio>
          Nenhum site neste painel ainda. Crie o primeiro no bloco abaixo.
        </Vazio>
      ) : (
        <Vazio>
          Conecte e confirme um servidor antes de criar um site.{" "}
          <Link
            href="/servidor"
            className="font-semibold underline underline-offset-4"
          >
            Ver servidores
          </Link>
        </Vazio>
      )}
      {temAtivo && <NovoSite estado={estado} aoCriar={atualizar} />}
    </div>
  );
}
