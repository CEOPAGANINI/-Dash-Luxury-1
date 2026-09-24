"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  informarIpAction,
  lerAgoraAction,
  removerServidorAction,
} from "./actions";
import { Bloco, Vazio } from "./como-funciona";
import { MedidasDoServidor } from "./medidas-do-servidor";
import {
  formatarDataHora,
  formatarHora,
  isPublicIpv4,
  type ServidorDetalheDTO,
} from "./modelo";
import {
  ComandoDeInstalacao,
  ConfirmarServidor,
  GerarNovoComando,
  motivoParaNaoGerarComando,
} from "./novo-servidor";
import { PreRequisitos } from "./pre-requisitos";
import type { Instalacao } from "./servico";
import {
  AvisoDeAtualizacao,
  BotaoCopiar,
  ConfirmacaoDigitada,
  Dado,
  RetornoDaOperacao,
  Selo,
} from "./servidores-painel";
import { TabelaDeSites } from "./sites-painel";
import { useEstadoVps } from "./use-estado-vps";
import { useOperacao } from "./use-operacao";
import {
  rotuloDaTarefa,
  rotuloDoServidor,
  tempoDesde,
  type EstadoDaTela,
  type Tom,
} from "./vps-cliente";

/*
  /servidor/[servidorId]: sinal, saúde, nginx, sites, tarefas e agente de
  um servidor.

  Tudo que aparece é o que o agente informou e quando: sem leitura, "—".
  O painel não liga nem desliga serviço nenhum na VPS (o nginx aqui é só
  leitura), e as travas locais (pausado, somente leitura) são decisão de
  quem tem o console: o painel mostra e não desfaz.

  Remover do painel corta o acesso do agente, mas a VPS continua servindo
  os sites até alguém desinstalar lá. Por isso os comandos de
  desinstalação ficam sempre à vista, e de novo depois da remoção.
*/

function ComandosDeDesinstalacao({
  comandos,
}: {
  comandos: { manterSites: string; removerSites: string };
}) {
  const manter = React.useRef<HTMLElement>(null);
  const tudo = React.useRef<HTMLElement>(null);
  return (
    <div className="min-w-0 space-y-3">
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-6">
          Tirar o agente e manter os sites no ar (sem ninguém para
          atualizá-los):
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code
            ref={manter}
            className="bg-muted/30 min-w-0 border px-2 py-1 font-mono text-xs break-all"
          >
            {comandos.manterSites}
          </code>
          <BotaoCopiar texto={comandos.manterSites} alvo={manter} />
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm leading-6">
          Tirar o agente e também os sites (nginx, certificados e pastas):
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code
            ref={tudo}
            className="bg-muted/30 min-w-0 border px-2 py-1 font-mono text-xs break-all"
          >
            {comandos.removerSites}
          </code>
          <BotaoCopiar texto={comandos.removerSites} alvo={tudo} />
        </div>
      </div>
    </div>
  );
}

function BlocoSinal({
  servidor,
  estado,
  destino,
  atualizar,
}: {
  servidor: ServidorDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const idIp = React.useId();
  const registro = servidor.registro;

  async function gravarIp(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const ip = String(dados.get("ip") ?? "").trim();
    if (ip && !isPublicIpv4(ip))
      return operacao.recusar(
        "Digite um IPv4 público, como o painel do provedor mostra (ou deixe vazio para usar o que o agente relata).",
        { ip: "IPv4 público inválido." },
      );
    const resultado = await operacao.executar("Gravando o IP…", () =>
      informarIpAction(null, dados),
    );
    if (resultado?.ok) atualizar();
  }

  return (
    <Bloco
      rotulo="Sinal"
      titulo="Conexão do agente"
      descricao="O agente pulsa a cada 30 s (a cada 5 s com esta tela aberta ou com tarefa na fila)."
      acoes={<Selo rotulo={rotuloDoServidor(servidor, estado.agora)} />}
    >
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Dado nome="Último pulso">
          {servidor.sinal.ultimoPulsoEm
            ? `${formatarDataHora(servidor.sinal.ultimoPulsoEm)} (há ${tempoDesde(servidor.sinal.ultimoPulsoEm, estado.agora)})`
            : "—"}
        </Dado>
        <Dado nome="IP visto pelo painel">{registro?.ipVisto ?? "—"}</Dado>
        <Dado nome="IPs públicos que o agente informou">
          {registro?.ipsPublicos.length ? registro.ipsPublicos.join(", ") : "—"}
        </Dado>
        <Dado nome="IP para o DNS">
          {servidor.ipDoDns
            ? `${servidor.ipDoDns}${servidor.ipInformado ? " (informado por você)" : ""}`
            : "—"}
        </Dado>
      </dl>
      {servidor.relogio && (
        <p className="text-warning text-sm leading-6">
          O relógio da VPS está{" "}
          {Math.max(
            1,
            Math.round(Math.abs(servidor.relogio.desvioSegundos) / 60),
          )}{" "}
          min fora de hora. O agente compensa, mas rode{" "}
          <code className="font-mono text-xs">
            sudo timedatectl set-ntp true
          </code>
          .
        </p>
      )}
      {!servidor.ipDoDns && (
        <p className="text-warning text-sm leading-6">
          Informe o IP público da VPS (painel do provedor).
        </p>
      )}
      <form onSubmit={(evento) => void gravarIp(evento)} className="space-y-2">
        <input type="hidden" name="servidorId" value={servidor.id} />
        <label htmlFor={idIp} className="block text-sm font-medium">
          Informar IP público
        </label>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Input
            id={idIp}
            name="ip"
            defaultValue={servidor.ipInformado ?? ""}
            inputMode="decimal"
            autoComplete="off"
            placeholder="O IPv4 que o provedor mostra"
            className="max-w-xs"
            disabled={!estado.podeAlterar}
            aria-invalid={Boolean(operacao.erros.ip) || undefined}
          />
          <Button
            type="submit"
            variant="outline"
            loading={Boolean(operacao.ocupado)}
            disabled={!estado.podeAlterar}
          >
            <span>Gravar IP</span>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-5">
          Use quando o provedor põe a VPS atrás de NAT e o agente não enxerga o
          IP público. Vazio volta a usar o que o agente relata.
        </p>
        <RetornoDaOperacao operacao={operacao} destino={destino} />
      </form>
    </Bloco>
  );
}

function BlocoSaude({
  servidor,
  estado,
  destino,
  atualizar,
}: {
  servidor: ServidorDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  atualizar: () => void;
}) {
  const operacao = useOperacao();
  const motivo = !estado.podeAlterar
    ? "Falta VPS_CHAVE_MESTRA na Vercel."
    : servidor.estado !== "ativo"
      ? "O servidor ainda não foi confirmado."
      : null;
  return (
    <Bloco
      rotulo="Saúde"
      titulo="Disco, memória e CPU"
      descricao="A última leitura que o agente mandou. Não há histórico: sem gráfico de linha."
    >
      <MedidasDoServidor
        leitura={servidor.leitura}
        erroLeitura={servidor.erroLeitura}
        sinal={servidor.sinal}
        agora={estado.agora}
        acao={
          <div className="min-w-0 space-y-1.5">
            <Button
              type="button"
              variant="outline"
              loading={Boolean(operacao.ocupado)}
              disabled={motivo !== null}
              onClick={() => {
                const dados = new FormData();
                dados.set("servidorId", servidor.id);
                void operacao
                  .executar("Pedindo a leitura…", () =>
                    lerAgoraAction(null, dados),
                  )
                  .then((resultado) => {
                    if (resultado?.ok) atualizar();
                  });
              }}
            >
              {!operacao.ocupado && <RefreshCw aria-hidden />}
              <span>Ler agora</span>
            </Button>
            {motivo && (
              <p className="text-muted-foreground text-xs leading-5">
                {motivo}
              </p>
            )}
            <RetornoDaOperacao operacao={operacao} destino={destino} />
          </div>
        }
      />
    </Bloco>
  );
}

function BlocoServidorWeb({ servidor }: { servidor: ServidorDetalheDTO }) {
  const nginx = servidor.nginx;
  const configuracao: { texto: string; tom: Tom } =
    nginx?.configOk === true
      ? { texto: "Configuração ok", tom: "success" }
      : nginx?.configOk === false
        ? { texto: "Configuração com erro", tom: "destructive" }
        : { texto: "—", tom: "muted" };
  const ligado: { texto: string; tom: Tom } =
    nginx?.ativo === true
      ? { texto: "Ligado", tom: "success" }
      : nginx?.ativo === false
        ? { texto: "Desligado", tom: "destructive" }
        : { texto: "—", tom: "muted" };
  return (
    <Bloco
      rotulo="Servidor web"
      titulo="nginx"
      descricao="Somente leitura: este painel não inicia nem interrompe serviços."
    >
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Dado nome="Versão">{nginx?.versao ?? "—"}</Dado>
        <Dado nome="Configuração">
          <Selo rotulo={configuracao} />
        </Dado>
        <Dado nome="Serviço">
          <Selo rotulo={ligado} />
        </Dado>
      </dl>
    </Bloco>
  );
}

function BlocoTarefas({ servidor }: { servidor: ServidorDetalheDTO }) {
  return (
    <Bloco
      rotulo="Tarefas"
      titulo="Tarefas recentes"
      descricao="As 20 últimas. Cada tarefa vale 10 min: se o servidor não buscar nesse tempo, ela vence."
      semRespiro
    >
      {servidor.tarefas.length === 0 ? (
        <div className="px-4 py-4">
          <Vazio>Nenhuma tarefa enviada a este servidor ainda.</Vazio>
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
                <th className="border-b px-3 py-2.5 font-extrabold">Por</th>
              </tr>
            </thead>
            <tbody>
              {servidor.tarefas.map((t) => (
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
                  <td className="border-b px-3 py-2.5 break-all">{t.por}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloco>
  );
}

function BlocoAgente({
  servidor,
  estado,
  destino,
  aoGerar,
  aoRemover,
}: {
  servidor: ServidorDetalheDTO;
  estado: EstadoDaTela;
  destino: string;
  aoGerar: (instalacao: Instalacao) => void;
  aoRemover: () => void;
}) {
  const operacao = useOperacao();
  const { travas } = servidor;
  return (
    <Bloco
      rotulo="Agente"
      titulo="O programa instalado na VPS"
      descricao="Atualizar o agente é colar um comando novo: ele nunca se atualiza sozinho."
    >
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-3">
        <Dado nome="Versão">{servidor.versaoAgente ?? "—"}</Dado>
        <Dado nome="Chave">{`geração ${servidor.geracaoChave}`}</Dado>
        <Dado nome="Confirmado">
          {servidor.confirmado
            ? `${formatarDataHora(servidor.confirmado.em)}${servidor.confirmado.por ? ` por ${servidor.confirmado.por}` : ""}`
            : "ainda não"}
        </Dado>
      </dl>
      {travas.pausado || travas.somenteLeitura ? (
        <ul className="text-warning list-disc space-y-1 pl-5 text-sm leading-6">
          {travas.pausado && (
            <li>
              Pausado na VPS: o painel não desfaz. No console, rode{" "}
              <code className="font-mono text-xs">sudo dash-agent retomar</code>
              .
            </li>
          )}
          {travas.somenteLeitura && (
            <li>
              Somente leitura na VPS: o painel não desfaz. No console, rode{" "}
              <code className="font-mono text-xs">
                sudo dash-agent liberar-escrita
              </code>
              .
            </li>
          )}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm leading-6">
          Sem travas locais: o agente aceita as tarefas assinadas pelo painel.
        </p>
      )}

      {/* Esperando o agente, o bloco de instalação lá em cima já oferece o
          comando novo; aqui ele seria o mesmo botão duas vezes. */}
      {servidor.estado !== "aguardando_agente" && (
        <>
          <GerarNovoComando
            servidorId={servidor.id}
            motivo={motivoParaNaoGerarComando(estado)}
            destino={destino}
            aoGerar={aoGerar}
          />
          <p className="text-muted-foreground text-xs leading-5">
            O comando novo reinstala o agente (na mesma VPS ou em outra). O
            agente atual continua valendo até o novo se registrar.
          </p>
        </>
      )}

      <div className="min-w-0 space-y-3 border-t pt-4">
        <p className="text-sm font-bold">Desinstalar da VPS</p>
        <ComandosDeDesinstalacao comandos={estado.comandoDesinstalar} />
      </div>

      <div className="min-w-0 space-y-2 border-t pt-4">
        <ConfirmacaoDigitada
          rotulo="Remover servidor"
          alvo={servidor.nome}
          confirmar="Remover do painel"
          ocupado={Boolean(operacao.ocupado)}
          desligado={!estado.podeAlterar}
          explicacao={
            <>
              Remover <b className="break-all">{servidor.nome}</b> do painel
              corta o acesso do agente na hora e tira do painel{" "}
              {servidor.totalSites === 1
                ? "o site deste servidor"
                : `os ${servidor.totalSites} sites deste servidor`}
              . A VPS continua servindo os sites até você desinstalar o agente
              nela.
            </>
          }
          onConfirmar={(confirmacao) => {
            const dados = new FormData();
            dados.set("servidorId", servidor.id);
            dados.set("confirmacao", confirmacao);
            void operacao
              .executar("Removendo o servidor…", () =>
                removerServidorAction(null, dados),
              )
              .then((resultado) => {
                if (resultado?.ok) aoRemover();
              });
          }}
        />
        <RetornoDaOperacao operacao={operacao} destino={destino} />
      </div>
    </Bloco>
  );
}

export function ServidorDetalhe({
  inicial,
  servidorId,
}: {
  inicial: EstadoDaTela;
  servidorId: string;
}) {
  const { estado, falha, atualizar } = useEstadoVps(inicial, { servidorId });
  const [instalacao, setInstalacao] = React.useState<Instalacao | null>(null);
  const [removido, setRemovido] = React.useState(false);
  const [resposta, setResposta] = React.useState<string | null>(null);
  const destino = `/servidor/${servidorId}`;
  const servidor = estado.servidor;

  if (!servidor)
    return (
      <div className="min-w-0 space-y-4">
        <AvisoDeAtualizacao falha={falha} destino={destino} />
        <Bloco
          rotulo="Servidor"
          titulo={
            removido
              ? "Servidor removido do painel"
              : "Este servidor não está mais no painel"
          }
          descricao="A VPS continua servindo os sites até você desinstalar o agente nela. No console da VPS:"
        >
          <ComandosDeDesinstalacao comandos={estado.comandoDesinstalar} />
          <Button asChild size="sm" variant="outline">
            <Link href="/servidor">
              <ArrowLeft aria-hidden />
              <span>Ver servidores</span>
            </Link>
          </Button>
        </Bloco>
      </div>
    );

  const faltas = estado.pendencias.filter((p) => !p.ok);

  return (
    <div className="min-w-0 space-y-4">
      <AvisoDeAtualizacao falha={falha} destino={destino} />
      {faltas.length > 0 && (
        <PreRequisitos pendencias={estado.pendencias} soFaltas />
      )}

      {servidor.estado === "aguardando_confirmacao" && (
        <ConfirmarServidor
          servidor={servidor}
          destino={destino}
          aoResponder={(_tipo, mensagem) => {
            setResposta(mensagem);
            setInstalacao(null);
            atualizar();
          }}
        />
      )}
      {resposta && servidor.estado !== "aguardando_confirmacao" && (
        <p role="status" className="text-success text-sm leading-6">
          {resposta}
        </p>
      )}

      {servidor.estado === "aguardando_agente" &&
        (instalacao ? (
          <ComandoDeInstalacao instalacao={instalacao} agora={estado.agora} />
        ) : (
          <Bloco
            rotulo="Instalação"
            titulo="Esperando o agente"
            descricao={
              servidor.instalacao
                ? `Há um comando valendo até ${formatarHora(servidor.instalacao.expiraEm)}, mas ele só aparece uma vez, na hora em que é gerado. Se você não tem mais o comando, gere outro.`
                : "Nenhum comando valendo agora. Gere um e cole no console da VPS."
            }
          >
            <GerarNovoComando
              servidorId={servidor.id}
              motivo={motivoParaNaoGerarComando(estado)}
              destino={destino}
              aoGerar={(nova) => {
                setInstalacao(nova);
                atualizar();
              }}
            />
          </Bloco>
        ))}

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <BlocoSinal
          servidor={servidor}
          estado={estado}
          destino={destino}
          atualizar={atualizar}
        />
        <BlocoServidorWeb servidor={servidor} />
      </div>

      <BlocoSaude
        servidor={servidor}
        estado={estado}
        destino={destino}
        atualizar={atualizar}
      />

      <Bloco
        rotulo="Sites"
        titulo="Sites neste servidor"
        semRespiro
        acoes={
          <Button asChild size="sm" variant="outline">
            <Link href="/servidor/sites">
              <span>Todos os sites</span>
            </Link>
          </Button>
        }
      >
        {servidor.sites.length === 0 ? (
          <div className="px-4 py-4">
            <Vazio>Nenhum site neste servidor.</Vazio>
          </div>
        ) : (
          <TabelaDeSites sites={servidor.sites} mostrarServidor={false} />
        )}
      </Bloco>

      <BlocoTarefas servidor={servidor} />

      {servidor.estado !== "aguardando_agente" && instalacao && (
        <ComandoDeInstalacao instalacao={instalacao} agora={estado.agora} />
      )}
      <BlocoAgente
        servidor={servidor}
        estado={estado}
        destino={destino}
        aoGerar={(nova) => {
          setInstalacao(nova);
          atualizar();
        }}
        aoRemover={() => {
          setRemovido(true);
          atualizar();
        }}
      />
    </div>
  );
}
