"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import { gatewayDeTabela, percentualDeTabela } from "./gateway-fees";

/*
  Qual gateway o painel usa para a taxa e de onde o número veio.

  "extrato" — medido nos pagamentos aprovados (o melhor);
  "tabela"  — a tabela pública do gateway escolhido, enquanto não há
              extrato (continua sem digitar porcentagem);
  "manual"  — o usuário assumiu o volante e digitou.

  Fica só neste navegador. A taxa em si continua a viver em fees-store,
  que é quem o cálculo do lucro lê; aqui guarda-se a escolha e a origem.
*/

export const GATEWAY_ESCOLHIDO_KEY = "dash-luxury:gateway:v1";

export type OrigemDaTaxa = "extrato" | "tabela" | "manual";

const schema = z.object({
  version: z.literal(1),
  /** O id do gateway da tabela, ou null quando a taxa vem do extrato. */
  gateway: z.string().min(1).max(60).nullable(),
  origem: z.enum(["extrato", "tabela", "manual"]),
});
export type EscolhaDeGateway = z.infer<typeof schema>;

export const ESCOLHA_PADRAO: EscolhaDeGateway = { version: 1, gateway: null, origem: "extrato" };

export function restoreGatewayChoice(raw: string): EscolhaDeGateway | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) return null;
    // Um gateway que não existe mais na tabela perde a ligação, sem quebrar.
    if (r.data.gateway && !gatewayDeTabela(r.data.gateway)) return { ...r.data, gateway: null, origem: "extrato" };
    return r.data;
  } catch {
    return null;
  }
}

/** A taxa que a escolha implica, quando ela vem da tabela pública. */
export function taxaDaEscolha(escolha: EscolhaDeGateway, ticketCents: number): number | null {
  if (escolha.origem !== "tabela" || !escolha.gateway) return null;
  const g = gatewayDeTabela(escolha.gateway);
  return g ? percentualDeTabela(g, ticketCents) : null;
}

type Snapshot = { escolha: EscolhaDeGateway; notice: string };
const EMPTY: Snapshot = { escolha: ESCOLHA_PADRAO, notice: "" };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  try {
    const raw = localStorage.getItem(GATEWAY_ESCOLHIDO_KEY);
    const restored = raw ? restoreGatewayChoice(raw) : null;
    snapshot = {
      escolha: restored ?? ESCOLHA_PADRAO,
      notice: raw && !restored ? "A escolha de gateway salva não pôde ser lida." : "",
    };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: a escolha vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === GATEWAY_ESCOLHIDO_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    load();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

/** O gateway escolhido e a origem da taxa. */
export function useGatewayChoice() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    escolha: state.escolha,
    notice: state.notice,
    guardar: (nova: Partial<Omit<EscolhaDeGateway, "version">>) => {
      const escolha: EscolhaDeGateway = { ...state.escolha, ...nova, version: 1 };
      let notice = "";
      try {
        localStorage.setItem(GATEWAY_ESCOLHIDO_KEY, JSON.stringify(escolha));
      } catch {
        notice = "Armazenamento indisponível: a escolha vale só nesta sessão.";
      }
      snapshot = { escolha, notice };
      notify();
    },
  };
}
