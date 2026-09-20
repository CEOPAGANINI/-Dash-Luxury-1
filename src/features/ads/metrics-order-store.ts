"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/*
  A ordem das métricas no painel do bloco: o usuário arrasta os
  quadradinhos como arrasta os blocos do quadro, e a ordem vale para o
  painel de todos os blocos. Fica só neste navegador.
*/

export const ORDEM_METRICAS_KEY = "dash-luxury:ordem-metricas:v1";

export const METRICAS = [
  { id: "investimento", rotulo: "Investimento" },
  { id: "receita", rotulo: "Receita" },
  { id: "roas", rotulo: "ROAS" },
  { id: "lucro", rotulo: "Lucro" },
  { id: "margem", rotulo: "Margem" },
  { id: "compras", rotulo: "Compras" },
  { id: "cpa", rotulo: "CPA" },
  { id: "impressoes", rotulo: "Impressões" },
  { id: "cliques", rotulo: "Cliques" },
  { id: "ctr", rotulo: "CTR" },
  { id: "cpc", rotulo: "CPC" },
  { id: "cpm", rotulo: "CPM" },
] as const;
export type MetricaId = (typeof METRICAS)[number]["id"];
export const ORDEM_PADRAO: MetricaId[] = METRICAS.map((m) => m.id);

export function isMetrica(v: unknown): v is MetricaId {
  return METRICAS.some((m) => m.id === v);
}

const schema = z.object({ version: z.literal(1), ordem: z.array(z.string()).max(40) });

/** Uma ordem completa: a guardada, sem repetidos nem ids estranhos, e o que faltar no fim. */
export function completarOrdem(lista: readonly unknown[]): MetricaId[] {
  const vistas = new Set<MetricaId>();
  const ordem: MetricaId[] = [];
  for (const id of [...lista, ...ORDEM_PADRAO]) {
    if (isMetrica(id) && !vistas.has(id)) {
      vistas.add(id);
      ordem.push(id);
    }
  }
  return ordem;
}

export function restoreMetricsOrder(raw: string): MetricaId[] | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? completarOrdem(r.data.ordem) : null;
  } catch {
    return null;
  }
}

/* Mover uma métrica para o lugar de outra, como os blocos: indo para a
   frente entra depois do destino; voltando, entra antes. */
export function moverNaOrdem<T>(atual: readonly T[], origem: T, destino: T): T[] {
  if (origem === destino) return [...atual];
  const i = atual.indexOf(origem);
  const j = atual.indexOf(destino);
  if (i < 0 || j < 0) return [...atual];
  const sem = atual.filter((x) => x !== origem);
  const alvo = sem.indexOf(destino);
  const posicao = i < j ? alvo + 1 : alvo;
  return [...sem.slice(0, posicao), origem, ...sem.slice(posicao)];
}

type Snapshot = { ordem: MetricaId[]; notice: string };
const EMPTY: Snapshot = { ordem: ORDEM_PADRAO, notice: "" };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  try {
    const raw = localStorage.getItem(ORDEM_METRICAS_KEY);
    const restored = raw ? restoreMetricsOrder(raw) : null;
    snapshot = { ordem: restored ?? ORDEM_PADRAO, notice: raw && !restored ? "A ordem das métricas salva não pôde ser lida." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: a ordem vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === ORDEM_METRICAS_KEY || event.key === null) {
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

/** A ordem das métricas do painel e como guardá-la. */
export function useMetricsOrder() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    ordem: state.ordem,
    notice: state.notice,
    guardar: (nova: readonly MetricaId[]) => {
      const ordem = completarOrdem(nova);
      let notice = "";
      try {
        localStorage.setItem(ORDEM_METRICAS_KEY, JSON.stringify({ version: 1, ordem }));
      } catch {
        notice = "Armazenamento indisponível: a ordem vale só nesta sessão.";
      }
      snapshot = { ordem, notice };
      notify();
    },
  };
}
