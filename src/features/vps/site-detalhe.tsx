"use client";

import * as React from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileArchive,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { BlockPicker } from "@/components/ui/block-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  alterarCheckoutAction,
  alterarDominiosAction,
  ativarVersaoAction,
  conferirPublicoAction,
  emitirSslAction,
  forcarRemocaoSiteAction,
  reaplicarSiteAction,
  removerSiteAction,
  verificarDnsAction,
} from "./actions";
import { Bloco, Vazio } from "./como-funciona";
import {
  formatarBytes,
  formatarData,
  formatarDataHora,
  formatarHora,
  lerDominioDoSite,
  type ReleaseDTO,
  type ResultadoVps,
  type SiteDetalheDTO,
} from "./modelo";
import {
  AvisoDeAtualizacao,
  BotaoCopiar,
  ConfirmacaoDigitada,
  Dado,
  RetornoDaOperacao,
  Selo,
} from "./servidores-painel";
import { EscolhaDeCheckout } from "./sites-painel";
import { useEstadoVps } from "./use-estado-vps";
import { useOperacao } from "./use-operacao";
import {
  enviarZip,
  hostsReservadosDaTela,
  problemaDoArquivo,
  rotuloDaTarefa,
  rotuloDaVersao,
  rotuloDoDns,
  rotuloDoHttps,
  rotuloDoNoAr,
  snippetDoRastreio,
  type EstadoDaTela,
  type ProblemaDoEnvio,
} from "./vps-cliente";

/*
  /servidor/sites/[siteId]: tudo de um site, na ordem em que o dono faz as
  coisas — domínio, HTTPS, publicar, conferir.

  Dois níveis de verdade, sempre separados na tela:
  - "Ativa no servidor": o agente informou no pulso que `current` aponta
    para esta versão;
  - "No ar em https://…": o PAINEL buscou o domínio pelo IP do servidor e
    o conteúdo bateu com o index.html da versão ativa. Só isso libera o
    link "Abrir site". O que o agente diz, sozinho, não vira "No ar".

  Cada bloco tem a própria operação (feedback perto do botão), e toda
  action que muda algo pede o polling na hora, para a tela não esperar
  15 s para mostrar a tarefa na fila.
*/

const DEZ_MINUTOS = 10 * 60_000;
const VINTE_HORAS = 20 * 3_600_000;
const VINTE_DIAS = 20 * 86_400_000;

/** "hh:mm" quando é de hoje; com a data quando é mais velho (hora sozinha enganaria). */
function momentoCurto(valor: string, agora: string): string {
  return Date.parse(agora) - Date.parse(valor) > VINTE_HORAS
    ? formatarDataHora(valor)
    : formatarHora(valor);
}

function comSite(
  siteId: string,
  campos: Record<string, string> = {},
): FormData {
  const dados = new FormData();
  dados.set("siteId", siteId);
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

function dominioPrincipal(site: SiteDetalheDTO): string | null {
  return (
    (site.dominios.find((d) => d.principal) ?? site.dominios[0])?.hostname ??
    null
  );
}

/** O endereço do site como o visitante abre (https só com certificado). */
function enderecoDoSite(site: SiteDetalheDTO): string | null {
  const principal = dominioPrincipal(site);
  if (!principal) return null;
  return `${site.https.estado === "ativo" ? "https" : "http"}://${principal}/`;
}

/** Por que o HTTPS não pode ser pedido agora (null = pode). */
function motivoParaNaoPedirHttps(
  site: SiteDetalheDTO,
  agora: string,
  podeAlterar: boolean,
): string | null {
  if (!podeAlterar)
    return "Falta VPS_CHAVE_MESTRA na Vercel: sem ela o painel não manda tarefa.";
  if (site.https.estado === "emitindo")
    return "O pedido de HTTPS está em andamento.";
  const ip = site.ipsEsperados.ipv4[0] ?? "o IP do servidor";
  const pendente = site.dominios.find((d) => d.dns !== "ok");
  if (pendente)
    return `Falta o DNS de ${pendente.hostname} apontar para ${ip}.`;
  const velho = site.dominios.find(
    (d) =>
      !d.verificadoEm ||
      Date.parse(agora) - Date.parse(d.verificadoEm) > DEZ_MINUTOS,
  );
  if (velho)
    return "A última verificação do DNS tem mais de 10 min: verifique de novo.";
  if (!site.nginx.aplicadoEm)
    return "Falta o servidor aplicar a configuração do site.";
  if (
    site.https.podeTentarEm &&
    Date.parse(site.https.podeTentarEm) > Date.parse(agora)
  )
    return `Espere até ${formatarHora(site.https.podeTentarEm)}: o Let's Encrypt limita as tentativas.`;
  if (site.tarefaAberta) return "Espere a tarefa em andamento terminar.";
  return null;
}

/** Por que não dá para mandar uma tarefa a este site agora (null = dá). */
function motivoParaNaoMandar(
  site: SiteDetalheDTO,
  estado: EstadoDaTela,
): string | null {
  if (!estado.podeAlterar)
    return "Falta VPS_CHAVE_MESTRA na Vercel: sem ela o painel não manda tarefa.";
  const servidor = estado.servidores.find((s) => s.id === site.servidorId);
  if (!servidor || servidor.estado !== "ativo")
    return "O servidor deste site não está ativo (confirmado) no painel.";
  if (site.estado === "removendo") return "O site está sendo removido.";
  if (site.tarefaAberta)
    return "Espere a tarefa em andamento terminar: o servidor faz uma de cada vez por site.";
  return null;
}

// ---------------------------------------------------------------------------
// Botões de uma action só
// ---------------------------------------------------------------------------

function BotaoDeAcao({
  rotulo,
  andando,
  icone,
  acao,
  motivo,
  destino,
  aoConcluir,
  variante = "outline",
}: {
  rotulo: string;
  /** O que aparece em role="status" enquanto a action roda. */
  andando: string;
  icone?: React.ReactNode;
  acao: () => Promise<ResultadoVps<unknown>>;
  motivo: string | null;
  destino: string;
  aoConcluir: () => void;
  variante?: "outline" | "default";
}) {
  const operacao = useOperacao();
  return (
    <div className="min-w-0 space-y-1.5">
      <Button
        type="button"
        variant={variante}
        loading={Boolean(operacao.ocupado)}
        disabled={motivo !== null}
        onClick={() => {
          void operacao.executar(andando, acao).then((resultado) => {
            if (resultado?.ok) aoConcluir();
          });
        }}
      >
        {!operacao.ocupado && icone}
        <span>{rotulo}</span>
      </Button>
      {motivo && (
        <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
      )}
      <RetornoDaOperacao operacao={operacao} destino={destino} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

function Passos({ site }: { site: SiteDetalheDTO }) {
  const ip = site.ipsEsperados.ipv4[0] ?? null;
  const faltaDns = site.dominios.filter((d) => d.dns !== "ok");
  const passos = [
    {
      nome: "Domínio (DNS)",
      feito: site.dominios.length > 0 && faltaDns.length === 0,
      texto:
        faltaDns.length === 0
          ? "Os domínios apontam para o servidor."
          : ip
            ? `Falta apontar ${faltaDns.map((d) => d.hostname).join(", ")} para ${ip}.`
            : "Falta saber o IP público do servidor.",
    },
    {
      nome: "HTTPS",
      feito: site.https.estado === "ativo",
      texto:
        site.https.estado === "ativo"
          ? site.https.validoAte
            ? `Ativo até ${formatarData(site.https.validoAte)}.`
            : "Ativo."
          : site.https.estado === "emitindo"
            ? "Pedido em andamento."
            : site.https.estado === "erro"
              ? "O último pedido falhou: veja o bloco HTTPS."
              : "É pedido sozinho quando o DNS ficar certo.",
    },
    {
      nome: "Publicar",
      feito: site.versaoAtiva !== null,
      texto: site.versaoAtiva
        ? `Versão de ${formatarDataHora(site.versaoAtiva.criadaEm)}.`
        : "Falta enviar o ZIP das páginas.",
    },
    {
      nome: "No ar",
      feito: site.noAr.estado === "ok",
      texto:
        site.noAr.estado === "ok"
          ? `Conferido às ${formatarHora(site.noAr.em)}.`
          : "Falta conferir o domínio pelo lado de fora.",
    },
  ];
  return (
    <ol className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {passos.map((passo, i) => (
        <li key={passo.nome} className="bg-card min-w-0 border px-3 py-3">
          <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            {i + 1} · {passo.nome}
          </span>
          <p
            className={cn(
              "mt-1 text-sm leading-6 break-words",
              passo.feito ? "text-success" : "text-muted-foreground",
            )}
          >
            <span className="sr-only">
              {passo.feito ? "Feito: " : "Falta: "}
            </span>
            {passo.texto}
          </p>
        </li>
      ))}
    </ol>
  );
}

const TEXTO_DO_ESTADO_DO_SITE: Record<SiteDetalheDTO["estado"], string> = {
  configurando: "Configurando no servidor…",
  ativo: "Configurado no servidor",
  erro: "A configuração falhou",
  removendo: "Removendo…",
};

function BlocoDoSite({
  site,
  motivo,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  return (
    <Bloco
      rotulo="Site"
      titulo="No servidor"
      descricao="A pasta, o nginx e o que o agente diz ter. Reaplicar refaz a pasta e o nginx com os dados atuais (a versão no ar não muda)."
    >
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        <Dado nome="Servidor">
          <Link
            href={`/servidor/${site.servidorId}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {site.servidorNome || "—"}
          </Link>
        </Dado>
        <Dado nome="Pasta">{`/var/www/dash-funil/${site.slug}`}</Dado>
        <Dado nome="Configuração">{TEXTO_DO_ESTADO_DO_SITE[site.estado]}</Dado>
        <Dado nome="nginx">
          {site.nginx.aplicadoEm
            ? `Aplicado em ${formatarDataHora(site.nginx.aplicadoEm)}`
            : "Ainda não aplicado"}
        </Dado>
        <Dado nome="O agente informa">
          {site.naVps === "presente"
            ? "O site existe no servidor"
            : site.naVps === "ausente"
              ? "O site NÃO existe no servidor"
              : "Ainda não informou"}
        </Dado>
      </dl>
      {site.nginx.erro && (
        <p
          role="alert"
          className="text-destructive text-sm leading-6 break-words"
        >
          {site.nginx.erro}
        </p>
      )}
      <BotaoDeAcao
        rotulo="Reaplicar no servidor"
        andando="Pedindo ao servidor…"
        icone={<RefreshCw aria-hidden />}
        acao={() => reaplicarSiteAction(null, comSite(site.id))}
        motivo={motivo}
        destino={destino}
        aoConcluir={atualizar}
      />
    </Bloco>
  );
}

function BlocoDns({
  site,
  estado,
  motivo,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const idDominio = React.useId();
  const idWww = React.useId();
  const principal = dominioPrincipal(site) ?? "";
  const [www, setWww] = React.useState(
    site.dominios.some((d) => d.hostname === `www.${principal}`)
      ? "sim"
      : "nao",
  );
  const { ipv4, ipv6 } = site.ipsEsperados;
  const verificadoEm = site.dominios
    .map((d) => d.verificadoEm)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  async function trocar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    if (!lerDominioDoSite(dados.get("dominio"), hostsReservadosDaTela(estado)))
      return operacao.recusar("Confira o domínio.", {
        dominio:
          "Digite só o domínio, ex.: loja.com.br (sem https://, sem barra; não vale *.vercel.app nem o endereço do painel).",
      });
    const resultado = await operacao.executar("Trocando os domínios…", () =>
      alterarDominiosAction(null, dados),
    );
    if (resultado?.ok) atualizar();
  }

  return (
    <Bloco
      rotulo="Passo 1"
      titulo="Domínio e DNS"
      descricao="Crie estes registros no painel de DNS do seu domínio. Em alguns provedores a raiz se chama @ e o www é só www. Com Cloudflare, deixe a nuvem cinza (só DNS)."
    >
      {ipv4.length === 0 && (
        <p className="text-warning text-sm leading-6">
          Informe o IP público da VPS (painel do provedor) na{" "}
          <Link
            href={`/servidor/${site.servidorId}`}
            className="font-semibold underline underline-offset-4"
          >
            página do servidor
          </Link>
          .
        </p>
      )}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
            <tr>
              <th className="border-b px-4 py-2.5 font-extrabold">Tipo</th>
              <th className="border-b px-3 py-2.5 font-extrabold">Nome</th>
              <th className="border-b px-3 py-2.5 font-extrabold">
                Valor a criar
              </th>
              <th className="border-b px-3 py-2.5 font-extrabold">Situação</th>
            </tr>
          </thead>
          <tbody>
            {site.dominios.map((d) => (
              <React.Fragment key={d.hostname}>
                <tr>
                  <td className="border-b px-4 py-2.5 font-bold">A</td>
                  <td className="border-b px-3 py-2.5 break-all">
                    {d.hostname}
                  </td>
                  <td className="border-b px-3 py-2.5 tabular-nums">
                    {ipv4.length ? ipv4.join(", ") : "—"}
                  </td>
                  <td className="border-b px-3 py-2.5">
                    <Selo rotulo={rotuloDoDns(d)} />
                  </td>
                </tr>
                {ipv6.length > 0 && (
                  <tr>
                    <td className="text-muted-foreground border-b px-4 py-2.5">
                      AAAA (opcional)
                    </td>
                    <td className="border-b px-3 py-2.5 break-all">
                      {d.hostname}
                    </td>
                    <td className="border-b px-3 py-2.5 break-all tabular-nums">
                      {ipv6.join(", ")}
                    </td>
                    <td className="text-muted-foreground border-b px-3 py-2.5 text-xs">
                      Só se quiser IPv6; um AAAA errado derruba o HTTPS.
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        {verificadoEm
          ? `Na última verificação (${formatarHora(verificadoEm)}), a situação era a da tabela. O DNS pode levar de minutos a horas para mudar.`
          : "O DNS ainda não foi verificado."}{" "}
        O HTTPS é pedido sozinho quando todos ficam certos.
      </p>
      <BotaoDeAcao
        rotulo="Verificar DNS"
        andando="Consultando o DNS…"
        icone={<Search aria-hidden />}
        acao={() => verificarDnsAction(null, comSite(site.id))}
        motivo={estado.podeAlterar ? null : "Falta VPS_CHAVE_MESTRA na Vercel."}
        destino={destino}
        aoConcluir={atualizar}
      />

      <form
        onSubmit={(evento) => void trocar(evento)}
        className="border-t pt-4"
      >
        <fieldset className="min-w-0 space-y-3" disabled={motivo !== null}>
          <legend className="text-sm font-bold">Trocar domínios</legend>
          <input type="hidden" name="siteId" value={site.id} />
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={idDominio} className="block text-sm font-medium">
              Domínio principal
            </label>
            <Input
              id={idDominio}
              name="dominio"
              defaultValue={principal}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="url"
              className="max-w-md"
              aria-invalid={Boolean(operacao.erros.dominio) || undefined}
            />
            {operacao.erros.dominio && (
              <p className="text-destructive text-xs leading-5">
                {operacao.erros.dominio}
              </p>
            )}
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
              size="sm"
              disabled={motivo !== null}
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Não" },
              ]}
            />
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            Trocar os domínios volta o site para sem HTTPS até o DNS novo ficar
            certo.
          </p>
          <Button
            type="submit"
            variant="outline"
            loading={Boolean(operacao.ocupado)}
          >
            <span>Trocar domínios</span>
          </Button>
          {motivo && (
            <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
          )}
        </fieldset>
        <RetornoDaOperacao operacao={operacao} destino={destino} />
      </form>
    </Bloco>
  );
}

function BlocoHttps({
  site,
  estado,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  atualizar: () => void;
}) {
  const { https } = site;
  const restante = https.validoAte
    ? Date.parse(https.validoAte) - Date.parse(estado.agora)
    : null;
  return (
    <Bloco
      rotulo="Passo 2"
      titulo="HTTPS"
      descricao="Certificado do Let's Encrypt, pedido pelo servidor e renovado sozinho."
      acoes={<Selo rotulo={rotuloDoHttps(https)} />}
    >
      {https.estado === "ativo" && https.validoAte && (
        <p className="text-sm leading-6">
          HTTPS ativo até {formatarData(https.validoAte)} (renovação automática
          {https.conferidoEm
            ? `; conferido ${momentoCurto(https.conferidoEm, estado.agora)}`
            : ""}
          ).
        </p>
      )}
      {https.estado === "ativo" &&
        restante !== null &&
        restante < VINTE_DIAS && (
          <p className="text-warning text-sm leading-6">
            A renovação automática parece não ter rodado.
          </p>
        )}
      {https.erro && (
        <p
          role="alert"
          className="text-destructive text-sm leading-6 break-words"
        >
          {https.erro}
        </p>
      )}
      {https.estado !== "ativo" && (
        <BotaoDeAcao
          rotulo="Ativar HTTPS"
          andando="Pedindo o HTTPS ao servidor…"
          icone={<ShieldCheck aria-hidden />}
          acao={() => emitirSslAction(null, comSite(site.id))}
          motivo={motivoParaNaoPedirHttps(
            site,
            estado.agora,
            estado.podeAlterar,
          )}
          destino={destino}
          aoConcluir={atualizar}
        />
      )}
    </Bloco>
  );
}

function BlocoPublicar({
  site,
  motivo,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const entrada = React.useRef<HTMLInputElement>(null);
  const idArquivo = React.useId();
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [confirmar, setConfirmar] = React.useState(false);
  const [problemas, setProblemas] = React.useState<ProblemaDoEnvio[]>([]);
  const [avisos, setAvisos] = React.useState<string[]>([]);
  const principal = dominioPrincipal(site) ?? site.nome;

  function escolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.currentTarget.files?.[0] ?? null;
    setArquivo(null);
    setConfirmar(false);
    setProblemas([]);
    setAvisos([]);
    operacao.limpar();
    if (!escolhido) return;
    const problema = problemaDoArquivo(escolhido);
    if (problema) {
      operacao.recusar(problema);
      evento.currentTarget.value = "";
      return;
    }
    setArquivo(escolhido);
  }

  async function publicar() {
    if (!arquivo) return;
    const escolhido = arquivo;
    const resultado = await operacao.executar(
      "Enviando o ZIP…",
      async (): Promise<ResultadoVps> => {
        const envio = await enviarZip(site.id, escolhido);
        if (envio.ok) {
          setAvisos(envio.avisos);
          return {
            ok: true,
            mensagem:
              "Versão enviada. O servidor baixa e troca em até 30 s; a versão anterior continua guardada nele.",
          };
        }
        setProblemas(envio.problemas);
        return {
          ok: false,
          mensagem: envio.mensagem,
          codigo: envio.codigo ?? undefined,
        };
      },
    );
    setConfirmar(false);
    if (resultado?.ok) {
      setArquivo(null);
      if (entrada.current) entrada.current.value = "";
      atualizar();
    }
  }

  const desligado = motivo !== null || Boolean(operacao.ocupado);

  return (
    <Bloco
      rotulo="Passo 3"
      titulo="Publicar"
      descricao="Um ZIP de até 3 MB com o index.html e o que ele usa (HTML, CSS, JS, imagens e fontes). Cada envio vira uma versão nova; a atual fica guardada no servidor."
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          ref={entrada}
          id={idArquivo}
          type="file"
          accept=".zip,application/zip"
          className="peer sr-only"
          disabled={desligado}
          onChange={escolher}
        />
        <label
          htmlFor={idArquivo}
          data-slot="button"
          aria-disabled={desligado || undefined}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "peer-focus-visible:ring-ring/50 peer-focus-visible:ring-[3px]",
            desligado && "pointer-events-none opacity-50",
          )}
        >
          <FileArchive aria-hidden />
          <span>Escolher ZIP</span>
        </label>
        {arquivo && (
          <span className="text-muted-foreground min-w-0 text-sm break-all">
            {arquivo.name} · {formatarBytes(arquivo.size)}
          </span>
        )}
      </div>
      {arquivo && !confirmar && (
        <Button
          type="button"
          disabled={desligado}
          onClick={() => setConfirmar(true)}
        >
          <Upload aria-hidden />
          <span>Publicar</span>
        </Button>
      )}
      {arquivo && confirmar && (
        <div
          role="group"
          aria-label="Confirmar a publicação"
          className="min-w-0 space-y-3 border p-3"
        >
          <p className="text-sm leading-6 break-words">
            Publicar em {principal} agora? A versão atual continua guardada no
            servidor.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              loading={Boolean(operacao.ocupado)}
              disabled={motivo !== null}
              onClick={() => void publicar()}
            >
              <span>Publicar agora</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(operacao.ocupado)}
              onClick={() => setConfirmar(false)}
            >
              <span>Cancelar</span>
            </Button>
          </div>
        </div>
      )}
      {motivo && (
        <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
      )}
      <RetornoDaOperacao operacao={operacao} destino={destino} />
      {problemas.length > 0 && (
        <ul className="text-destructive list-disc space-y-1 pl-5 text-sm leading-6">
          {problemas.map((p) => (
            <li key={`${p.arquivo}:${p.motivo}`} className="break-words">
              <b>{p.arquivo}</b>: {p.motivo}
            </li>
          ))}
        </ul>
      )}
      {avisos.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs leading-5">
          {avisos.map((aviso) => (
            <li key={aviso} className="break-words">
              {aviso}
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

function VoltarParaVersao({
  versao,
  motivo,
  destino,
  atualizar,
}: {
  versao: ReleaseDTO;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const [confirmar, setConfirmar] = React.useState(false);
  return (
    <div className="min-w-0 space-y-1.5">
      {confirmar ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            loading={Boolean(operacao.ocupado)}
            disabled={motivo !== null}
            onClick={() => {
              const dados = new FormData();
              dados.set("versaoId", versao.id);
              void operacao
                .executar("Pedindo a volta…", () =>
                  ativarVersaoAction(null, dados),
                )
                .then((resultado) => {
                  setConfirmar(false);
                  if (resultado?.ok) atualizar();
                });
            }}
          >
            <span>Confirmar a volta</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(operacao.ocupado)}
            onClick={() => setConfirmar(false)}
          >
            <span>Cancelar</span>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={motivo !== null}
          title={motivo ?? undefined}
          onClick={() => setConfirmar(true)}
        >
          <span>Voltar para esta</span>
        </Button>
      )}
      <RetornoDaOperacao operacao={operacao} destino={destino} />
    </div>
  );
}

/** O index.html é obrigatório no ZIP: toda versão tem a landing. */
function paginasPresentes(versao: ReleaseDTO): string {
  const p = versao.paginas;
  const lista = [
    "landing",
    p.obrigado ? "obrigado" : null,
    p.upsell ? "upsell" : null,
    p.downsell ? "downsell" : null,
    p.legais?.length ? `${p.legais.length} ${p.legais.length === 1 ? "legal" : "legais"}` : null,
  ].filter(Boolean);
  return lista.join(", ");
}

function BlocoVersoes({
  site,
  motivo,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  const ativa = site.versaoAtiva;
  const informa = site.servidorInforma;
  const divergencia =
    informa && ativa && informa !== ativa.id
      ? informa === "vazio"
        ? "O servidor diz que ainda mostra a página de espera, e não a versão ativa no painel. Espere a próxima leitura ou reaplique o site."
        : "O servidor diz que mostra outra versão, e não a ativa no painel. Espere a próxima leitura ou reaplique o site."
      : informa && !ativa && informa !== "vazio"
        ? "O servidor diz que mostra uma versão que o painel não tem como ativa."
        : null;

  return (
    <Bloco
      rotulo="Versões"
      titulo="As últimas 5 versões"
      descricao="Voltar usa as cópias guardadas no servidor. Se o servidor for trocado, envie o ZIP de novo."
      semRespiro
    >
      {divergencia && (
        <p className="text-warning border-b px-4 py-2.5 text-sm leading-6">
          {divergencia}
        </p>
      )}
      {site.versoes.length === 0 ? (
        <div className="px-4 py-4">
          <Vazio>
            Nenhuma versão enviada. O site mostra a página de espera.
          </Vazio>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
              <tr>
                <th className="border-b px-4 py-2.5 font-extrabold">Data</th>
                <th className="border-b px-3 py-2.5 font-extrabold">Por</th>
                <th className="border-b px-3 py-2.5 text-right font-extrabold">
                  Arquivos
                </th>
                <th className="border-b px-3 py-2.5 text-right font-extrabold">
                  Tamanho
                </th>
                <th className="border-b px-3 py-2.5 font-extrabold">Páginas</th>
                <th className="border-b px-3 py-2.5 font-extrabold">Estado</th>
                <th className="border-b px-3 py-2.5 font-extrabold">
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {site.versoes.map((versao) => (
                <tr key={versao.id} className="align-top">
                  <td className="border-b px-4 py-2.5">
                    {formatarDataHora(versao.criadaEm)}
                    {versao.arquivo && (
                      <span className="text-muted-foreground block text-xs break-all">
                        {versao.arquivo}
                      </span>
                    )}
                  </td>
                  <td className="border-b px-3 py-2.5 break-all">
                    {versao.por}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {versao.arquivos}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right tabular-nums">
                    {formatarBytes(versao.bytesZip)}
                    <span className="text-muted-foreground block text-xs">
                      {formatarBytes(versao.bytes)} aberto
                    </span>
                  </td>
                  <td className="border-b px-3 py-2.5">
                    {paginasPresentes(versao)}
                  </td>
                  <td className="border-b px-3 py-2.5">
                    <Selo rotulo={rotuloDaVersao(versao, informa)} />
                  </td>
                  <td className="border-b px-3 py-2.5">
                    {versao.estado === "no_servidor" && !versao.ativa && (
                      <VoltarParaVersao
                        versao={versao}
                        motivo={motivo}
                        destino={destino}
                        atualizar={atualizar}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

function BlocoPaginas({ site }: { site: SiteDetalheDTO }) {
  const versao = site.versaoAtiva;
  const endereco = enderecoDoSite(site);
  const p = versao?.paginas ?? {};
  const presente = (caminho: string | null | undefined) =>
    caminho
      ? `arquivo presente (página estática): ${caminho}`
      : "não existe nesta versão";
  return (
    <Bloco
      rotulo="Funil"
      titulo="Páginas nesta versão"
      descricao="O que o ZIP ativo tem, lido do próprio arquivo. Página estática não cobra nada sozinha."
    >
      {!versao ? (
        <Vazio>Nenhuma versão ativa: o site mostra a página de espera.</Vazio>
      ) : (
        <dl className="grid min-w-0 gap-x-6 gap-y-3 md:grid-cols-2">
          <Dado nome="Landing">{endereco ?? "—"}</Dado>
          <Dado nome="Checkout">
            {site.checkout.url
              ? `no painel, via /checkout → ${site.checkout.url}`
              : "sem destino: o /checkout deste site não leva a um checkout"}
          </Dado>
          <Dado nome="Obrigado">
            {presente(p.obrigado)}
            <span className="text-muted-foreground block text-xs leading-5">
              Depois do pagamento o cliente volta para o checkout do painel, não
              para o obrigado deste site.
            </span>
          </Dado>
          <Dado nome="Upsell">
            {p.upsell
              ? "Arquivo presente (página estática): não cobra com um clique."
              : "não existe nesta versão"}
          </Dado>
          <Dado nome="Downsell">
            {p.downsell
              ? "Arquivo presente (página estática): não cobra com um clique."
              : "não existe nesta versão"}
          </Dado>
          <Dado nome="Páginas legais">
            {p.legais?.length ? p.legais.join(", ") : "nenhuma nesta versão"}
          </Dado>
        </dl>
      )}
      <p className="text-muted-foreground text-xs leading-5">
        A landing do painel (/p/…) não vai para o servidor nesta versão: as
        páginas chegam só pelo ZIP.
      </p>
    </Bloco>
  );
}

function BlocoNoAr({
  site,
  estado,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  atualizar: () => void;
}) {
  const { noAr } = site;
  const url = noAr.url ?? enderecoDoSite(site);
  const hora = noAr.em ? formatarHora(noAr.em) : null;
  const principal = site.dominios.find((d) => d.principal) ?? site.dominios[0];
  const motivo = !estado.podeAlterar
    ? "Falta VPS_CHAVE_MESTRA na Vercel."
    : principal?.dns !== "ok"
      ? "A conferência só roda com o DNS do domínio principal certo."
      : null;

  let frase: string;
  switch (noAr.estado) {
    case "ok":
      frase = `No ar em ${url ?? "—"}: mostra a versão de ${formatarDataHora(site.versaoAtiva?.criadaEm ?? null)} (conferido ${hora ?? "—"}).`;
      break;
    case "pagina_de_espera":
      frase = `Mostra a página de espera (conferido ${hora ?? "—"}).`;
      break;
    case "outra_coisa":
      frase = `Responde outra coisa (conferido ${hora ?? "—"}): há DNS, CDN ou cache na frente?`;
      break;
    case "erro":
      frase = `A conferência falhou (${hora ?? "—"}).`;
      break;
    case "nao_conferido":
      frase = "Não conferido.";
      break;
  }

  return (
    <Bloco
      rotulo="Passo 4"
      titulo="No ar"
      descricao="O painel busca o domínio pelo IP do servidor e compara com o index.html da versão ativa. O que o servidor diz, sozinho, não conta."
      acoes={<Selo rotulo={rotuloDoNoAr(noAr)} />}
    >
      <p
        className={cn(
          "text-sm leading-6 break-words",
          noAr.estado === "ok" && "text-success",
          noAr.estado === "erro" && "text-destructive",
        )}
      >
        {frase}
      </p>
      {noAr.detalhe && (
        <p className="text-muted-foreground text-xs leading-5 break-words">
          {noAr.detalhe}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <BotaoDeAcao
          rotulo="Conferir do lado de fora"
          andando="Conferindo o domínio…"
          icone={<Search aria-hidden />}
          acao={() => conferirPublicoAction(null, comSite(site.id))}
          motivo={motivo}
          destino={destino}
          aoConcluir={atualizar}
        />
        {noAr.estado === "ok" && url && (
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <span>Abrir site</span>
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>
    </Bloco>
  );
}

function BlocoCheckout({
  site,
  estado,
  motivo,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
  motivo: string | null;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const prefixo = `${site.checkout.origem}/checkout/`;
  const slugAtual = site.checkout.url?.startsWith(prefixo)
    ? site.checkout.url.slice(prefixo.length)
    : null;
  const idAtual =
    estado.checkouts.find((c) => c.slug === slugAtual)?.id ?? "nenhum";
  const [checkoutId, setCheckoutId] = React.useState(idAtual);
  const [origem, setOrigem] = React.useState(
    estado.origens.includes(site.checkout.origem)
      ? site.checkout.origem
      : (estado.origens[0] ?? site.checkout.origem),
  );
  const escolhido =
    checkoutId === "nenhum" || estado.checkouts.some((c) => c.id === checkoutId)
      ? checkoutId
      : "nenhum";

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const resultado = await operacao.executar("Salvando o checkout…", () =>
      alterarCheckoutAction(null, dados),
    );
    if (resultado?.ok) atualizar();
  }

  return (
    <Bloco
      rotulo="Checkout"
      titulo="Para onde vai o /checkout"
      descricao="No HTML do ZIP, o botão de compra aponta para /checkout (ex.: /checkout?qty=1). O servidor manda para o checkout escolhido aqui, com a mesma query. O pagamento acontece no painel."
    >
      <p className="text-sm leading-6 break-words">
        Agora: {site.checkout.url ?? "nenhum destino configurado"}
      </p>
      {site.checkout.aviso && (
        <p className="text-warning text-sm leading-6">{site.checkout.aviso}</p>
      )}
      <form onSubmit={(evento) => void salvar(evento)} className="space-y-3">
        <input type="hidden" name="siteId" value={site.id} />
        <EscolhaDeCheckout
          checkouts={estado.checkouts}
          origens={estado.origens}
          checkoutId={escolhido}
          origem={origem}
          onCheckout={setCheckoutId}
          onOrigem={setOrigem}
          desligado={motivo !== null}
        />
        <Button
          type="submit"
          variant="outline"
          loading={Boolean(operacao.ocupado)}
          disabled={motivo !== null}
        >
          <span>Salvar checkout</span>
        </Button>
        {motivo && (
          <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
        )}
        <RetornoDaOperacao operacao={operacao} destino={destino} />
      </form>
    </Bloco>
  );
}

function BlocoRastreio({
  site,
  estado,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
}) {
  const pre = React.useRef<HTMLPreElement>(null);
  const snippet = snippetDoRastreio(estado.appUrl, site.rastreioProduto);
  return (
    <Bloco
      rotulo="Rastreio"
      titulo="Visitas do site no painel"
      descricao="Cole antes do </body> de cada página do ZIP. O navegador do visitante manda as visitas direto para o painel."
    >
      <pre
        ref={pre}
        className="bg-muted/30 max-w-full border p-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap"
      >
        <code>{snippet}</code>
      </pre>
      <BotaoCopiar texto={snippet} alvo={pre} />
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Dado nome="Rastreio nesta versão">
          {site.versaoAtiva
            ? site.versaoAtiva.temRastreio
              ? "presente"
              : "ausente"
            : "sem versão ativa"}
        </Dado>
        <Dado nome="Produto contado">
          {site.rastreioProduto ??
            "Sem produto: as visitas deste site não entram na contagem da oferta."}
        </Dado>
      </dl>
      <p className="text-muted-foreground text-xs leading-5">
        O consentimento é pedido de novo no checkout, e a mesma pessoa conta
        como dois visitantes (o site e o painel guardam o identificador em
        endereços diferentes).
      </p>
    </Bloco>
  );
}

function BlocoTarefas({ site }: { site: SiteDetalheDTO }) {
  return (
    <Bloco rotulo="Tarefas" titulo="Últimas tarefas deste site" semRespiro>
      {site.tarefas.length === 0 ? (
        <div className="px-4 py-4">
          <Vazio>Nenhuma tarefa enviada para este site ainda.</Vazio>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
              <tr>
                <th className="border-b px-4 py-2.5 font-extrabold">Tarefa</th>
                <th className="border-b px-3 py-2.5 font-extrabold">Estado</th>
                <th className="border-b px-3 py-2.5 font-extrabold">Criada</th>
                <th className="border-b px-3 py-2.5 font-extrabold">Vence</th>
              </tr>
            </thead>
            <tbody>
              {site.tarefas.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="border-b px-4 py-2.5">{t.rotulo}</td>
                  <td className="border-b px-3 py-2.5">
                    <Selo rotulo={rotuloDaTarefa(t)} />
                  </td>
                  <td className="border-b px-3 py-2.5">
                    {formatarDataHora(t.criadaEm)}
                  </td>
                  <td className="border-b px-3 py-2.5">
                    {formatarHora(t.expiraEm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

function BlocoRemover({
  site,
  estado,
  destino,
  atualizar,
}: {
  site: SiteDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  atualizar: () => void;
}) {
  const remover = useOperacao();
  const forcar = useOperacao();
  const alvo = dominioPrincipal(site) ?? site.slug;
  const servidorAtivo = estado.servidores.some(
    (s) => s.id === site.servidorId && s.estado === "ativo",
  );
  const motivo = !estado.podeAlterar
    ? "Falta VPS_CHAVE_MESTRA na Vercel."
    : !servidorAtivo
      ? "O servidor deste site não está ativo no painel."
      : site.tarefaAberta
        ? "Espere a tarefa em andamento terminar."
        : null;

  return (
    <Bloco
      rotulo="Remover"
      titulo="Remover site"
      descricao="O servidor tira o site do nginx, apaga o certificado e guarda a pasta por 7 dias. O domínio deixa de mostrar estas páginas."
    >
      {site.estado === "removendo" ? (
        <p role="status" className="text-muted-foreground text-sm leading-6">
          Remoção pedida: o servidor busca em até 30 s.
        </p>
      ) : (
        <>
          <ConfirmacaoDigitada
            rotulo="Remover site"
            alvo={alvo}
            confirmar="Remover o site"
            ocupado={Boolean(remover.ocupado)}
            desligado={motivo !== null}
            explicacao={
              <>
                Remover <b className="break-all">{alvo}</b> do servidor{" "}
                {site.servidorNome}? As versões guardadas vão para a lixeira do
                servidor.
              </>
            }
            onConfirmar={(confirmacao) => {
              void remover
                .executar("Pedindo a remoção…", () =>
                  removerSiteAction(null, comSite(site.id, { confirmacao })),
                )
                .then((resultado) => {
                  if (resultado?.ok) atualizar();
                });
            }}
          />
          {motivo && (
            <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
          )}
        </>
      )}
      <RetornoDaOperacao operacao={remover} destino={destino} />
      {site.podeForcarRemocao && (
        <div className="min-w-0 space-y-2 border-t pt-3">
          <p className="text-muted-foreground text-xs leading-5">
            O servidor não confirmou a remoção (falhou, venceu ou não
            respondeu), ou o servidor saiu do painel.
          </p>
          <ConfirmacaoDigitada
            rotulo="Remover do painel mesmo sem resposta"
            alvo={alvo}
            confirmar="Tirar do painel"
            ocupado={Boolean(forcar.ocupado)}
            desligado={!estado.podeAlterar}
            explicacao="O site sai do painel sem a confirmação do servidor. A VPS pode continuar servindo este site até você desinstalar o agente ou apagar a pasta nela."
            onConfirmar={(confirmacao) => {
              void forcar
                .executar("Tirando do painel…", () =>
                  forcarRemocaoSiteAction(
                    null,
                    comSite(site.id, { confirmacao }),
                  ),
                )
                .then((resultado) => {
                  if (resultado?.ok) atualizar();
                });
            }}
          />
          <RetornoDaOperacao operacao={forcar} destino={destino} />
        </div>
      )}
    </Bloco>
  );
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

export function SiteDetalhe({
  inicial,
  siteId,
}: {
  inicial: EstadoDaTela;
  siteId: string;
}) {
  const { estado, falha, atualizar } = useEstadoVps(inicial, { siteId });
  const destino = `/servidor/sites/${siteId}`;
  const site = estado.site;

  if (!site)
    return (
      <div className="min-w-0 space-y-4">
        <AvisoDeAtualizacao falha={falha} destino={destino} />
        <Vazio>
          Este site não está mais no painel.{" "}
          <Link
            href="/servidor/sites"
            className="font-semibold underline underline-offset-4"
          >
            Ver sites
          </Link>
        </Vazio>
      </div>
    );

  const motivo = motivoParaNaoMandar(site, estado);

  return (
    <div className="min-w-0 space-y-4">
      <AvisoDeAtualizacao falha={falha} destino={destino} />
      <Passos site={site} />

      {site.naVps === "ausente" && (
        <div className="bg-card min-w-0 space-y-2 border px-4 py-3">
          <p role="alert" className="text-destructive text-sm leading-6">
            O servidor não tem este site (foi trocado ou reinstalado?).
            Reaplique e envie o ZIP de novo.
          </p>
          <BotaoDeAcao
            rotulo="Reaplicar no servidor"
            andando="Pedindo ao servidor…"
            icone={<RefreshCw aria-hidden />}
            acao={() => reaplicarSiteAction(null, comSite(site.id))}
            motivo={motivo}
            destino={destino}
            aoConcluir={atualizar}
          />
        </div>
      )}

      {site.tarefaAberta && (
        <p
          role="status"
          aria-live="polite"
          className="text-muted-foreground text-sm leading-6"
        >
          Em andamento: {site.tarefaAberta.rotulo} —{" "}
          {site.tarefaAberta.rotuloEstado} (vence às{" "}
          {formatarHora(site.tarefaAberta.expiraEm)}).
        </p>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BlocoDns
          site={site}
          estado={estado}
          motivo={motivo}
          destino={destino}
          atualizar={atualizar}
        />
        <div className="min-w-0 space-y-4">
          <BlocoHttps
            site={site}
            estado={estado}
            destino={destino}
            atualizar={atualizar}
          />
          <BlocoNoAr
            site={site}
            estado={estado}
            destino={destino}
            atualizar={atualizar}
          />
        </div>
      </div>

      <BlocoPublicar
        site={site}
        motivo={motivo}
        destino={destino}
        atualizar={atualizar}
      />
      <BlocoVersoes
        site={site}
        motivo={motivo}
        destino={destino}
        atualizar={atualizar}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BlocoPaginas site={site} />
        <BlocoCheckout
          site={site}
          estado={estado}
          motivo={motivo}
          destino={destino}
          atualizar={atualizar}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BlocoRastreio site={site} estado={estado} />
        <BlocoDoSite
          site={site}
          motivo={motivo}
          destino={destino}
          atualizar={atualizar}
        />
      </div>

      <BlocoTarefas site={site} />
      <BlocoRemover
        site={site}
        estado={estado}
        destino={destino}
        atualizar={atualizar}
      />
    </div>
  );
}
