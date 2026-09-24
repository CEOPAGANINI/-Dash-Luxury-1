"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  Globe,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  confirmarServidorAction,
  criarServidorAction,
  novaInstalacaoAction,
} from "./actions";
import { Bloco, Vazio } from "./como-funciona";
import {
  controlCharacters,
  formatarDataHora,
  formatarHora,
  VPS_INPUT_LIMITS,
  type ServidorDTO,
} from "./modelo";
import type { Instalacao } from "./servico";
import {
  AvisoDeAtualizacao,
  BotaoCopiar,
  Dado,
  RetornoDaOperacao,
} from "./servidores-painel";
import { useEstadoVps } from "./use-estado-vps";
import { useOperacao } from "./use-operacao";
import type { EstadoDaTela } from "./vps-cliente";
import styles from "./novo-servidor-nexus.module.css";

/*
  /servidor/novo: do nome ao "é o meu servidor".

  O código de instalação só existe na resposta da action: fica no estado
  desta tela e some quando ela desmonta (o banco guarda só o sha256). Por
  isso "aparece só agora" é literal: sair da tela e voltar pede um comando
  novo.

  Depois de colado o comando, a tela pergunta a cada 5 s até o agente se
  registrar, e aí mostra o que ele relatou (hostname, sistema, IP) para o
  dono conferir com o painel do provedor antes de dizer "é o meu".
*/

/** Por que não dá para gerar comando (null = dá). */
export function motivoParaNaoGerarComando(estado: EstadoDaTela): string | null {
  if (!estado.podeAlterar)
    return "Falta VPS_CHAVE_MESTRA na Vercel: sem ela o painel não assina nenhuma tarefa.";
  for (const chave of ["https", "origem_checkout"] as const) {
    const pendencia = estado.pendencias.find((p) => p.chave === chave);
    if (pendencia && !pendencia.ok) return pendencia.texto;
  }
  return null;
}

export function ComandoDeInstalacao({
  instalacao,
  agora,
}: {
  instalacao: Instalacao;
  agora: string;
}) {
  const pre = React.useRef<HTMLPreElement>(null);
  const vencido = Date.parse(instalacao.expiraEm) <= Date.parse(agora);
  return (
    <Bloco
      rotulo="Passo 2"
      titulo="Instale o agente"
      descricao="Cole no console da VPS e aperte Enter. Não precisa digitar senha aqui."
    >
      <div className={styles.terminal}>
        <div className={styles.terminalHeader}>
          <Terminal aria-hidden />
          <span>Console de instalação</span>
        </div>
        <pre ref={pre} className={styles.command}>
          <code>{instalacao.comando}</code>
        </pre>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotaoCopiar texto={instalacao.comando} alvo={pre} />
        <span
          className={
            vencido ? "text-warning text-xs" : "text-muted-foreground text-xs"
          }
        >
          {vencido
            ? `Venceu às ${formatarHora(instalacao.expiraEm)}: gere outro.`
            : `Vale até ${formatarHora(instalacao.expiraEm)} · aparece só agora`}
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        O comando baixa o instalador, confere o código sha256 dele e só então
        roda. O código de conferência só garante que o arquivo chegou inteiro;
        ele não protege contra um painel comprometido.
      </p>
    </Bloco>
  );
}

/** Pede um código de instalação novo (o anterior deixa de valer). */
export function GerarNovoComando({
  servidorId,
  motivo,
  destino,
  aoGerar,
}: {
  servidorId: string;
  /** Por que não dá (null = dá). */
  motivo: string | null;
  destino: string;
  aoGerar: (instalacao: Instalacao) => void;
}) {
  const operacao = useOperacao();
  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        variant="outline"
        loading={Boolean(operacao.ocupado)}
        disabled={motivo !== null}
        onClick={() => {
          const dados = new FormData();
          dados.set("servidorId", servidorId);
          void operacao
            .executar("Gerando o comando…", () =>
              novaInstalacaoAction(null, dados),
            )
            .then((resultado) => {
              if (resultado?.ok && resultado.dados)
                aoGerar(resultado.dados.instalacao);
            });
        }}
      >
        {!operacao.ocupado && <RefreshCw aria-hidden />}
        <span>Gerar novo comando</span>
      </Button>
      {motivo && (
        <p className="text-muted-foreground text-xs leading-5">{motivo}</p>
      )}
      <RetornoDaOperacao operacao={operacao} destino={destino} />
    </div>
  );
}

/**
 * "É o seu servidor?": o que o agente relatou ao se registrar, para o dono
 * conferir. Só depois do sim o painel manda tarefas. O não corta o acesso
 * deste agente na hora.
 */
export function ConfirmarServidor({
  servidor,
  destino,
  aoResponder,
}: {
  servidor: ServidorDTO;
  destino: string;
  aoResponder: (resposta: "sim" | "nao", mensagem: string) => void;
}) {
  const operacao = useOperacao();
  const registro = servidor.registro;

  function responder(resposta: "sim" | "nao") {
    const dados = new FormData();
    dados.set("servidorId", servidor.id);
    dados.set("resposta", resposta);
    void operacao
      .executar(
        resposta === "sim" ? "Confirmando o servidor…" : "Cortando o acesso…",
        () => confirmarServidorAction(null, dados),
      )
      .then((resultado) => {
        if (resultado?.ok) aoResponder(resposta, resultado.mensagem);
      });
  }

  return (
    <Bloco
      rotulo="Passo 3"
      titulo="É o seu servidor?"
      descricao="Confira com o que o painel do provedor mostra. Até o sim, o painel não manda nenhuma tarefa para este servidor."
    >
      <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Dado nome="Hostname">{registro?.hostname ?? "—"}</Dado>
        <Dado nome="Sistema">{registro?.so ?? "—"}</Dado>
        <Dado nome="IP visto pelo painel">{registro?.ipVisto ?? "—"}</Dado>
        <Dado nome="Registrado em">
          {formatarDataHora(registro?.registradoEm ?? null)}
        </Dado>
      </dl>
      {registro && registro.ipsPublicos.length > 0 && (
        <p className="text-muted-foreground text-xs leading-5 break-words">
          IPs públicos que o agente informou: {registro.ipsPublicos.join(", ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          loading={operacao.ocupado === "Confirmando o servidor…"}
          disabled={Boolean(operacao.ocupado)}
          onClick={() => responder("sim")}
        >
          <span>Sim, é o meu</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={operacao.ocupado === "Cortando o acesso…"}
          disabled={Boolean(operacao.ocupado)}
          onClick={() => responder("nao")}
        >
          <span>Não é o meu</span>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        &ldquo;Não é o meu&rdquo; corta o acesso deste agente na hora. Depois,
        gere um comando novo e cole no servidor certo.
      </p>
      <RetornoDaOperacao operacao={operacao} destino={destino} />
    </Bloco>
  );
}

export function NovoServidor({ inicial }: { inicial: EstadoDaTela }) {
  const { estado, falha, atualizar } = useEstadoVps(inicial);
  const operacao = useOperacao();
  const [criado, setCriado] = React.useState<{
    servidorId: string;
    instalacao: Instalacao | null;
    /** `agora` do estado no clique: um estado mais novo já traz o servidor. */
    agoraNaCriacao: string;
  } | null>(null);
  const [resposta, setResposta] = React.useState<{
    tipo: "sim" | "nao";
    mensagem: string;
  } | null>(null);
  const campoNome = React.useId();

  const motivo = motivoParaNaoGerarComando(estado);
  const servidor = criado
    ? (estado.servidores.find((s) => s.id === criado.servidorId) ?? null)
    : null;
  // Logo depois de criar, o polling ainda não trouxe o servidor: isso é
  // "esperando", e não "sumiu".
  const situacao = !criado
    ? null
    : servidor
      ? servidor.estado
      : estado.agora === criado.agoraNaCriacao
        ? "aguardando_agente"
        : "sumiu";
  const instalacaoValida =
    criado?.instalacao != null &&
    Date.parse(criado.instalacao.expiraEm) > Date.parse(estado.agora);
  const destino = "/servidor/novo";
  const conexaoConcluida = servidor?.estado === "ativo";
  const etapaAtual =
    situacao === "sumiu"
      ? 0
      : !criado
        ? 1
        : servidor?.estado === "aguardando_confirmacao" || conexaoConcluida
          ? 3
          : 2;

  async function gerar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const nome = String(dados.get("nome") ?? "").trim();
    if (!nome)
      return operacao.recusar("Dê um nome ao servidor.", {
        nome: "Dê um nome.",
      });
    if (nome.length > VPS_INPUT_LIMITS.name || controlCharacters.test(nome))
      return operacao.recusar(
        `O nome vai até ${VPS_INPUT_LIMITS.name} caracteres, sem caracteres de controle.`,
        { nome: "Nome inválido." },
      );
    const agoraNaCriacao = estado.agora;
    const resultado = await operacao.executar("Gerando o comando…", () =>
      criarServidorAction(null, dados),
    );
    if (resultado?.ok && resultado.dados) {
      setResposta(null);
      setCriado({
        servidorId: resultado.dados.servidorId,
        instalacao: resultado.dados.instalacao,
        agoraNaCriacao,
      });
      atualizar();
    }
  }

  return (
    <div className={styles.onboarding}>
      <AvisoDeAtualizacao falha={falha} destino={destino} />

      <ol className={styles.steps} aria-label="Etapas para conectar o servidor">
        {["Nome", "Instalação", "Confirmação"].map((nome, indice) => {
          const numero = indice + 1;
          const concluida = conexaoConcluida || numero < etapaAtual;
          const atual = !conexaoConcluida && numero === etapaAtual;
          return (
            <li
              key={nome}
              className={styles.step}
              data-state={concluida ? "complete" : atual ? "current" : "next"}
              aria-current={atual ? "step" : undefined}
            >
              <span className={styles.stepNumber} aria-hidden>
                {concluida ? <Check /> : `0${numero}`}
              </span>
              <span className={styles.stepText}>
                <strong>{nome}</strong>
                <span>
                  {concluida
                    ? "Concluído"
                    : atual
                      ? "Em andamento"
                      : "A seguir"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className={styles.layout}>
        <div className={styles.main}>
          <Bloco
            rotulo="Passo 1"
            titulo="Nome do servidor"
            descricao="Só para você reconhecer o servidor no painel."
            className={styles.namePanel}
          >
            <form
              onSubmit={(evento) => void gerar(evento)}
              className={styles.form}
            >
              <div className="min-w-0 space-y-2">
                <label
                  htmlFor={campoNome}
                  className="block text-sm font-medium"
                >
                  Nome do servidor
                </label>
                <Input
                  id={campoNome}
                  name="nome"
                  maxLength={VPS_INPUT_LIMITS.name}
                  autoComplete="off"
                  placeholder="VPS da loja"
                  aria-invalid={Boolean(operacao.erros.nome) || undefined}
                  disabled={motivo !== null}
                  className={styles.nameInput}
                />
                {operacao.erros.nome && (
                  <p className="text-destructive text-xs">
                    {operacao.erros.nome}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                loading={Boolean(operacao.ocupado)}
                disabled={motivo !== null}
                className={styles.generateButton}
              >
                {!operacao.ocupado && <Terminal aria-hidden />}
                <span>Gerar comando</span>
              </Button>
              {motivo && (
                <p className="text-muted-foreground text-xs leading-5">
                  {motivo}
                </p>
              )}
              <RetornoDaOperacao operacao={operacao} destino={destino} />
            </form>
          </Bloco>

          {!criado && (
            <div className={styles.upcoming} aria-label="Próximos passos">
              <div className={styles.upcomingStep}>
                <Terminal aria-hidden className={styles.upcomingIcon} />
                <span className={styles.upcomingLabel}>
                  Passo 2 · Instalação
                </span>
                <h3>O comando aparece aqui</h3>
                <p>
                  Depois de dar um nome, copie o comando gerado e execute no
                  console da sua VPS.
                </p>
              </div>
              <div className={styles.upcomingStep}>
                <ShieldCheck aria-hidden className={styles.upcomingIcon} />
                <span className={styles.upcomingLabel}>
                  Passo 3 · Confirmação
                </span>
                <h3>Confira a identidade</h3>
                <p>
                  Quando o agente responder, confira o hostname, o sistema e o
                  IP antes de confirmar o servidor.
                </p>
              </div>
            </div>
          )}

          {situacao === "aguardando_agente" && criado?.instalacao && (
            <ComandoDeInstalacao
              instalacao={criado.instalacao}
              agora={estado.agora}
            />
          )}

          {situacao === "aguardando_agente" && criado && (
            <div className={styles.connectionStatus}>
              {instalacaoValida ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-muted-foreground text-sm leading-6"
                >
                  Esperando o servidor… A tela confere sozinha a cada 5 s.
                </p>
              ) : (
                <>
                  <p className="text-warning text-sm leading-6">
                    {resposta?.tipo === "nao"
                      ? resposta.mensagem
                      : "O comando venceu antes de o servidor se registrar. Gere outro."}
                  </p>
                  <GerarNovoComando
                    servidorId={criado.servidorId}
                    motivo={motivo}
                    destino={destino}
                    aoGerar={(instalacao) => {
                      setResposta(null);
                      setCriado({
                        servidorId: criado.servidorId,
                        instalacao,
                        agoraNaCriacao: estado.agora,
                      });
                      atualizar();
                    }}
                  />
                </>
              )}
            </div>
          )}

          {servidor?.estado === "aguardando_confirmacao" && (
            <ConfirmarServidor
              servidor={servidor}
              destino={destino}
              aoResponder={(tipo, mensagem) => {
                setResposta({ tipo, mensagem });
                if (tipo === "nao")
                  setCriado({
                    servidorId: servidor.id,
                    instalacao: null,
                    agoraNaCriacao: estado.agora,
                  });
                atualizar();
              }}
            />
          )}

          {servidor?.estado === "ativo" && (
            <Bloco rotulo="Pronto" titulo={`${servidor.nome} está conectado`}>
              <p role="status" className="text-success text-sm leading-6">
                {resposta?.tipo === "sim"
                  ? resposta.mensagem
                  : "Servidor confirmado."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/servidor/${servidor.id}`}>
                    <span>Abrir o servidor</span>
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/servidor/sites">
                    <span>Criar um site</span>
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </Bloco>
          )}

          {situacao === "sumiu" && (
            <Vazio>
              Este servidor não aparece mais no painel (foi removido?).{" "}
              <Link
                href="/servidor"
                className="font-semibold underline underline-offset-4"
              >
                Ver servidores
              </Link>
            </Vazio>
          )}
        </div>

        <aside className={styles.sidebar} aria-label="Requisitos da VPS">
          <Bloco
            rotulo="Antes de começar"
            titulo="O que a VPS precisa ter"
            descricao="O instalador confere o sistema e para com uma mensagem em português se algo não servir, antes de mexer em qualquer coisa."
          >
            <ul className={styles.requirements}>
              <li>
                <Server aria-hidden />
                <div>
                  <strong>Sistema compatível</strong>
                  <p>
                    VPS limpa com Ubuntu 22.04 ou 24.04, ou Debian 12 ou 13, sem
                    aaPanel, cPanel, Plesk ou Apache, e pelo menos 1 GB livre em
                    /var.
                  </p>
                </div>
              </li>
              <li>
                <Globe aria-hidden />
                <div>
                  <strong>Rede liberada</strong>
                  <p>
                    Portas 80 e 443 liberadas no firewall do provedor (o
                    instalador só abre as duas no ufw da própria VPS).
                  </p>
                </div>
              </li>
              <li>
                <KeyRound aria-hidden />
                <div>
                  <strong>Acesso ao console</strong>
                  <p>Acesso ao console da VPS como root (ou com sudo).</p>
                </div>
              </li>
              <li>
                <Clock3 aria-hidden />
                <div>
                  <strong>Horário sincronizado</strong>
                  <p>
                    Relógio certo (NTP ligado): as tarefas vencem em 10 min.
                  </p>
                </div>
              </li>
            </ul>
          </Bloco>
          <p className={styles.sidebarNote}>
            A conexão começa no console da VPS. Você não precisa informar a
            senha do servidor neste painel.
          </p>
        </aside>
      </div>
    </div>
  );
}
