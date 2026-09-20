"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/*
  O histórico do ROAS de cada bloco do quadro: uma amostra a cada cinco
  minutos (a leitura mais nova de cada fatia de cinco minutos), até 24
  horas por bloco. Alimenta o gráfico ao vivo do painel do bloco. Fica
  só neste navegador; a chave de cada bloco leva a rede (o mesmo bloco
  soma campanhas diferentes em cada página).
*/

export const ROAS_HISTORICO_KEY = "dash-luxury:roas-historico:v1";
export const INTERVALO_AMOSTRA_MS = 5 * 60_000;
export const AMOSTRAS_MAXIMAS = 288;

const amostraSchema = z.object({ t: z.number().int().nonnegative(), roas: z.number().nonnegative().finite() });
export type Amostra = z.infer<typeof amostraSchema>;
const schema = z.object({
  version: z.literal(1),
  blocos: z.record(z.string().regex(/^[a-z]+:[a-z0-9-]{1,40}$/), z.array(amostraSchema).max(AMOSTRAS_MAXIMAS)).refine((v) => Object.keys(v).length <= 400),
});

type Historicos = Record<string, Amostra[]>;
type Snapshot = { blocos: Historicos; notice: string };
const EMPTY: Snapshot = { blocos: {}, notice: "" };
let snapshot: Snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** A chave do histórico: a rede da página e o id do bloco. */
export function chaveDoHistorico(escopo: string, bloco: string): string {
  return `${escopo}:${bloco}`;
}

/** A fatia de cinco minutos a que um instante pertence. */
export function fatiaDe(t: number): number {
  return Math.floor(t / INTERVALO_AMOSTRA_MS);
}

/* Junta uma leitura ao histórico: na mesma fatia de cinco minutos da
   última amostra, substitui-a (fica a leitura mais nova); numa fatia
   nova, acrescenta. Nunca guarda mais do que AMOSTRAS_MAXIMAS. */
export function registrarAmostra(lista: readonly Amostra[], roas: number, agora: number): Amostra[] {
  const ultima = lista[lista.length - 1];
  const nova = { t: agora, roas };
  if (ultima && fatiaDe(ultima.t) === fatiaDe(agora)) return [...lista.slice(0, -1), nova];
  const proxima = [...lista, nova];
  return proxima.length > AMOSTRAS_MAXIMAS ? proxima.slice(proxima.length - AMOSTRAS_MAXIMAS) : proxima;
}

export function restoreRoasHistory(raw: string): Historicos | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) return null;
    const blocos: Historicos = {};
    for (const [chave, lista] of Object.entries(r.data.blocos)) {
      // Em ordem de tempo, sem repetir fatia.
      const ordenada = [...lista].sort((a, b) => a.t - b.t);
      blocos[chave] = ordenada.filter((a, i) => i === 0 || fatiaDe(a.t) !== fatiaDe(ordenada[i - 1].t));
    }
    return blocos;
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(ROAS_HISTORICO_KEY);
    const restored = raw ? restoreRoasHistory(raw) : {};
    snapshot = { blocos: restored ?? {}, notice: restored === null ? "O histórico salvo não pôde ser lido." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: o histórico vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === ROAS_HISTORICO_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // O primeiro assinante relê o que está guardado: o quadro pode ter sido
  // desmontado e montado de novo com outro histórico no armazenamento.
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

function commit(blocos: Historicos) {
  let notice = "";
  try {
    localStorage.setItem(ROAS_HISTORICO_KEY, JSON.stringify({ version: 1, blocos }));
  } catch {
    notice = "Armazenamento indisponível: o histórico vale só nesta sessão.";
  }
  snapshot = { blocos, notice };
  notify();
}

/** Guarda a leitura de agora do ROAS de um bloco (fora de um componente). */
export function registrarRoasDoBloco(chave: string, roas: number, agora: number = Date.now()) {
  if (!initialized) {
    initialized = true;
    load();
  }
  if (!Number.isFinite(roas) || roas < 0) return;
  const atual = snapshot.blocos[chave] ?? [];
  const nova = registrarAmostra(atual, roas, agora);
  // Sem mudança (mesma fatia, mesmo valor), não grava.
  const ultima = atual[atual.length - 1];
  if (ultima && nova.length === atual.length && ultima.roas === roas && fatiaDe(ultima.t) === fatiaDe(agora)) return;
  commit({ ...snapshot.blocos, [chave]: nova });
}

/** O histórico de ROAS de cada bloco, ao vivo. */
export function useRoasHistory() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    notice: state.notice,
    historicoDe: (chave: string): Amostra[] => state.blocos[chave] ?? [],
  };
}
