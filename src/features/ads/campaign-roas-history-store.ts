"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import type { Amostra } from "./roas-history-store";

/*
  O histórico do ROAS de cada campanha: uma amostra por minuto (a leitura
  mais nova de cada minuto), até seis horas por campanha. Alimenta o
  gráfico ao vivo do card do megafone. É separado do histórico dos blocos
  (aquele é a soma de um bloco, a cada cinco minutos). Fica só neste
  navegador; a chave leva a rede da página, porque a mesma campanha pode
  aparecer em páginas diferentes.
*/

export const CAMPANHAS_ROAS_KEY = "dash-luxury:roas-campanhas:v1";
export const INTERVALO_MINUTO_MS = 60_000;
export const AMOSTRAS_POR_CAMPANHA = 360;
const CAMPANHAS_MAXIMAS = 300;

const amostraSchema = z.object({ t: z.number().int().nonnegative(), roas: z.number().nonnegative().finite() });
const schema = z.object({
  version: z.literal(1),
  campanhas: z
    .record(z.string().min(1).max(120), z.array(amostraSchema).max(AMOSTRAS_POR_CAMPANHA))
    .refine((v) => Object.keys(v).length <= CAMPANHAS_MAXIMAS),
});

type Historicos = Record<string, Amostra[]>;
type Snapshot = { campanhas: Historicos; notice: string };
const EMPTY: Snapshot = { campanhas: {}, notice: "" };
let snapshot: Snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** A chave do histórico: a rede da página e o id da campanha. */
export function chaveDaCampanhaNoHistorico(escopo: string, campanha: string): string {
  return `${escopo}:${campanha}`;
}

/** O minuto a que um instante pertence. */
export function minutoDe(t: number): number {
  return Math.floor(t / INTERVALO_MINUTO_MS);
}

/* Junta uma leitura ao histórico: no mesmo minuto da última amostra,
   substitui-a (fica a leitura mais nova); num minuto novo, acrescenta.
   Nunca guarda mais do que AMOSTRAS_POR_CAMPANHA. */
export function registrarAmostraPorMinuto(lista: readonly Amostra[], roas: number, agora: number): Amostra[] {
  const ultima = lista[lista.length - 1];
  const nova = { t: agora, roas };
  if (ultima && minutoDe(ultima.t) === minutoDe(agora)) return [...lista.slice(0, -1), nova];
  const proxima = [...lista, nova];
  return proxima.length > AMOSTRAS_POR_CAMPANHA ? proxima.slice(proxima.length - AMOSTRAS_POR_CAMPANHA) : proxima;
}

export function restoreCampaignRoasHistory(raw: string): Historicos | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) return null;
    const campanhas: Historicos = {};
    for (const [chave, lista] of Object.entries(r.data.campanhas)) {
      // Em ordem de tempo, com a leitura mais nova de cada minuto (a mesma
      // regra da gravação).
      const ordenada = [...lista].sort((a, b) => a.t - b.t);
      campanhas[chave] = ordenada.filter((a, i) => i === ordenada.length - 1 || minutoDe(a.t) !== minutoDe(ordenada[i + 1].t));
    }
    return campanhas;
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(CAMPANHAS_ROAS_KEY);
    const restored = raw ? restoreCampaignRoasHistory(raw) : {};
    snapshot = { campanhas: restored ?? {}, notice: restored === null ? "O histórico das campanhas não pôde ser lido." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: o histórico vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === CAMPANHAS_ROAS_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    initialized = true;
    load();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function commit(campanhas: Historicos) {
  let notice = "";
  try {
    localStorage.setItem(CAMPANHAS_ROAS_KEY, JSON.stringify({ version: 1, campanhas }));
  } catch {
    notice = "Armazenamento indisponível: o histórico vale só nesta sessão.";
  }
  snapshot = { campanhas, notice };
  notify();
}

/** Guarda a leitura de agora do ROAS de uma campanha (fora de um componente). */
export function registrarRoasDaCampanha(chave: string, roas: number, agora: number = Date.now()) {
  if (!initialized) {
    initialized = true;
    load();
  }
  if (!Number.isFinite(roas) || roas < 0) return;
  const atual = snapshot.campanhas[chave] ?? [];
  const nova = registrarAmostraPorMinuto(atual, roas, agora);
  // Sem mudança (mesmo minuto, mesmo valor), não grava.
  const ultima = atual[atual.length - 1];
  if (ultima && nova.length === atual.length && ultima.roas === roas && minutoDe(ultima.t) === minutoDe(agora)) return;
  commit({ ...snapshot.campanhas, [chave]: nova });
}

/** O histórico de ROAS de cada campanha, ao vivo. */
export function useCampaignRoasHistory() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    notice: state.notice,
    historicoDe: (chave: string): Amostra[] => state.campanhas[chave] ?? [],
  };
}
