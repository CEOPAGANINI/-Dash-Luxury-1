"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { reentrarAction } from "./actions";
import { Bloco, Vazio } from "./como-funciona";
import { MedidasDoServidor } from "./medidas-do-servidor";
import { formatarHora, type ServidorDTO } from "./modelo";
import { PreRequisitos } from "./pre-requisitos";
import { useEstadoVps, type FalhaDeAtualizacao } from "./use-estado-vps";
import type { Operacao } from "./use-operacao";
import {
  CLASSE_DO_TOM,
  copiarTexto,
  MENSAGEM_SESSAO_EXPIRADA,
  rotuloDoServidor,
  type EstadoDaTela,
  type Rotulo,
} from "./vps-cliente";

/*
  /servidor: a lista de servidores, e as peças de tela que as outras ilhas
  do Servidor reusam (selo de estado, retorno de operação, copiar,
  confirmação digitando o nome, aviso de atualização).

  Regras da pele que valem para todas:
  - nenhum <select>: escolha é BlockPicker;
  - botão com ícone leva o texto num <span>. A pele legada apaga o fundo
    de qualquer botão cujo único filho-elemento é um <svg> (o texto solto
    é nó de texto, não conta como filho), e o Button com `loading` põe um
    <svg> na frente do texto;
  - estado é Badge sem fundo, com a cor só pelo tom do texto.
*/

// ---------------------------------------------------------------------------
// Peças compartilhadas
// ---------------------------------------------------------------------------

/** O estado de algo, em Badge sem fundo: a cor vem só do texto. */
export function Selo({
  rotulo,
  className,
}: {
  rotulo: Rotulo;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      data-tone={rotulo.tom}
      className={cn(
        "max-w-full text-left whitespace-normal",
        CLASSE_DO_TOM[rotulo.tom],
        className,
      )}
    >
      {rotulo.texto}
    </Badge>
  );
}

/** Falha do polling: os dados ficam na tela e o aviso diz desde quando. */
export function AvisoDeAtualizacao({
  falha,
  destino,
}: {
  falha: FalhaDeAtualizacao | null;
  /** A tela atual, para o login devolver a pessoa para cá. */
  destino: string;
}) {
  if (!falha) return null;
  if (falha.tipo === "sessao")
    return (
      <p role="alert" className="text-destructive text-sm leading-6">
        {MENSAGEM_SESSAO_EXPIRADA}{" "}
        <Link
          href={`/login?redirect=${encodeURIComponent(destino)}`}
          className="font-semibold underline underline-offset-4"
        >
          Entrar
        </Link>
      </p>
    );
  return (
    <p role="alert" className="text-warning text-sm leading-6 break-words">
      Não foi possível atualizar (última atualização{" "}
      {formatarHora(falha.ultimaEm)}). Tentando de novo.
      {falha.detalhe ? ` ${falha.detalhe}` : ""}
    </p>
  );
}

/** Login recente vencido (ou sessão vencida): sai e volta pelo login. */
function Reentrar({
  destino,
  motivo,
}: {
  destino: string;
  motivo: "login_antigo" | "sem_sessao";
}) {
  const [, acao, pendente] = useActionState(reentrarAction, null);
  return (
    <form action={acao} className="flex min-w-0 flex-wrap items-center gap-2">
      <input type="hidden" name="destino" value={destino} />
      <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-5">
        {motivo === "login_antigo"
          ? "Esta ação pede um login feito há pouco, nesta sessão. Entre de novo e volte para cá."
          : "Entre de novo e volte para cá."}
      </p>
      <Button type="submit" size="sm" variant="outline" loading={pendente}>
        <span>Entrar de novo</span>
      </Button>
    </form>
  );
}

/**
 * O que a operação está fazendo (role="status") e o que deu errado
 * (role="alert"). A região de status fica sempre no DOM: vazia não ocupa
 * altura, e o leitor de tela anuncia quando o texto chega.
 */
export function RetornoDaOperacao({
  operacao,
  destino,
}: {
  operacao: Operacao;
  destino: string;
}) {
  return (
    <div className="min-w-0">
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-sm leading-6 break-words",
          operacao.ocupado ? "text-muted-foreground" : "text-success",
        )}
      >
        {operacao.ocupado || operacao.aviso}
      </p>
      {operacao.erro && (
        <p
          role="alert"
          className="text-destructive text-sm leading-6 break-words"
        >
          {operacao.erro}
        </p>
      )}
      {(operacao.codigo === "login_antigo" ||
        operacao.codigo === "sem_sessao") && (
        <Reentrar destino={destino} motivo={operacao.codigo} />
      )}
    </div>
  );
}

/** Copiar com seleção do texto como plano B (http, permissão negada). */
export function BotaoCopiar({
  texto,
  alvo,
  rotulo = "Copiar",
}: {
  texto: string;
  /** O elemento cujo texto é selecionado quando a cópia não é permitida. */
  alvo?: React.RefObject<HTMLElement | null>;
  rotulo?: string;
}) {
  const [feito, setFeito] = React.useState<
    "" | "copiado" | "selecionado" | "falhou"
  >("");
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void copiarTexto(texto, alvo?.current).then(setFeito);
        }}
      >
        {feito === "copiado" ? <Check aria-hidden /> : <Copy aria-hidden />}
        <span>{feito === "copiado" ? "Copiado" : rotulo}</span>
      </Button>
      <span role="status" className="text-muted-foreground text-xs">
        {feito === "selecionado"
          ? "Texto selecionado: aperte Ctrl+C (ou ⌘C)."
          : feito === "falhou"
            ? "Não deu para copiar: selecione o texto e copie."
            : ""}
      </span>
    </span>
  );
}

/**
 * Ação destrutiva em dois passos: o botão abre a confirmação, e o botão
 * vermelho só acende depois de digitado o nome exato (o servidor confere
 * de novo; digitar é o freio contra o clique errado).
 */
export function ConfirmacaoDigitada({
  rotulo,
  alvo,
  explicacao,
  confirmar,
  ocupado,
  desligado = false,
  onConfirmar,
}: {
  rotulo: string;
  /** O texto que precisa ser digitado (nome do servidor, domínio). */
  alvo: string;
  explicacao: React.ReactNode;
  /** O texto do botão vermelho. */
  confirmar: string;
  ocupado: boolean;
  desligado?: boolean;
  onConfirmar: (confirmacao: string) => void;
}) {
  const [aberta, setAberta] = React.useState(false);
  const [digitado, setDigitado] = React.useState("");
  const id = React.useId();

  if (!aberta)
    return (
      <Button
        type="button"
        variant="outline"
        className="text-destructive"
        disabled={desligado}
        onClick={() => setAberta(true)}
      >
        <span>{rotulo}</span>
      </Button>
    );

  return (
    <div
      role="group"
      aria-label={`Confirmar: ${rotulo}`}
      className="min-w-0 space-y-3 border p-3"
    >
      <div className="text-sm leading-6">{explicacao}</div>
      <label htmlFor={id} className="block text-sm leading-6">
        Digite <b className="break-all">{alvo}</b> para confirmar
      </label>
      <Input
        id={id}
        value={digitado}
        autoComplete="off"
        spellCheck={false}
        onChange={(evento) => setDigitado(evento.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          loading={ocupado}
          disabled={desligado || digitado.trim() !== alvo}
          onClick={() => onConfirmar(digitado.trim())}
        >
          <span>{confirmar}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado}
          onClick={() => {
            setAberta(false);
            setDigitado("");
          }}
        >
          <span>Cancelar</span>
        </Button>
      </div>
    </div>
  );
}

/** Uma linha "nome: valor" das fichas de servidor e site. */
export function Dado({
  nome,
  children,
}: {
  nome: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs leading-5">{nome}</dt>
      <dd className="text-sm leading-6 break-words">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /servidor
// ---------------------------------------------------------------------------

function CartaoDoServidor({
  servidor,
  agora,
}: {
  servidor: ServidorDTO;
  agora: string;
}) {
  const ip = servidor.ipDoDns ?? servidor.registro?.ipVisto ?? null;
  const mostrarMedidas =
    servidor.estado === "ativo" || servidor.leitura !== null;
  return (
    <Bloco
      rotulo="Servidor"
      titulo={servidor.nome}
      acoes={<Selo rotulo={rotuloDoServidor(servidor, agora)} />}
    >
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2">
        <Dado nome="IP">{ip ?? "—"}</Dado>
        <Dado nome="Hostname">{servidor.registro?.hostname ?? "—"}</Dado>
        <Dado nome="Sistema">{servidor.registro?.so ?? "—"}</Dado>
        <Dado nome="Sites">
          {servidor.totalSites === 1
            ? "1 site"
            : `${servidor.totalSites} sites`}
        </Dado>
      </dl>
      {mostrarMedidas && (
        <MedidasDoServidor
          compacto
          leitura={servidor.leitura}
          erroLeitura={servidor.erroLeitura}
          sinal={servidor.sinal}
          agora={agora}
        />
      )}
      <Button asChild size="sm" variant="outline">
        <Link href={`/servidor/${servidor.id}`}>
          <span>Abrir</span>
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </Bloco>
  );
}

export function ServidoresPainel({ inicial }: { inicial: EstadoDaTela }) {
  const { estado, falha } = useEstadoVps(inicial);
  const faltaAlgo = estado.pendencias.some((p) => !p.ok);

  return (
    <div className="min-w-0 space-y-4">
      <AvisoDeAtualizacao falha={falha} destino="/servidor" />
      {faltaAlgo && <PreRequisitos pendencias={estado.pendencias} />}
      {estado.servidores.length === 0 ? (
        <Vazio>
          Nenhum servidor conectado ainda.{" "}
          <Link
            href="/servidor/novo"
            className="font-semibold underline underline-offset-4"
          >
            Adicionar servidor
          </Link>
        </Vazio>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              {estado.servidores.length === 1
                ? "1 servidor neste painel."
                : `${estado.servidores.length} servidores neste painel.`}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/servidor/novo">
                <Plus aria-hidden />
                <span>Adicionar servidor</span>
              </Link>
            </Button>
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {estado.servidores.map((servidor) => (
              <CartaoDoServidor
                key={servidor.id}
                servidor={servidor}
                agora={estado.agora}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
