"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/*
  As anotações de cada cartão do quadro por classe, no jeito do Trello:
  etiquetas coloridas e um texto livre. Ficam só neste navegador (como
  as classes) e nunca vão para a rede de anúncios.
*/

export const CARD_NOTES_KEY = "dash-luxury:card-notes:v1";

/* As etiquetas usam as mesmas cores do neon da campanha. Ids antigos
   (laranja, roxo, azul, ciano, cinza) continuam válidos ao ler o que
   já foi guardado, mostrados na cor mais próxima. */
export const CORES_ETIQUETA = [
  { id: "branco", label: "Branco", cor: "#f4f4f5" },
  { id: "verde", label: "Verde", cor: "#3dff6a" },
  { id: "amarelo", label: "Amarelo", cor: "#ffd60a" },
  { id: "vermelho", label: "Vermelho", cor: "#ff3b3b" },
] as const;
const CORES_ETIQUETA_ANTIGAS: Record<string, CorEtiqueta> = {
  laranja: "amarelo",
  roxo: "vermelho",
  azul: "verde",
  ciano: "verde",
  cinza: "branco",
};

export type CorEtiqueta = (typeof CORES_ETIQUETA)[number]["id"];

export function isCorEtiqueta(value: unknown): value is CorEtiqueta {
  return CORES_ETIQUETA.some((c) => c.id === value) || (typeof value === "string" && value in CORES_ETIQUETA_ANTIGAS);
}

export function corDaEtiqueta(id: CorEtiqueta): string {
  const atual = (CORES_ETIQUETA_ANTIGAS as Record<string, CorEtiqueta>)[id] ?? id;
  return CORES_ETIQUETA.find((c) => c.id === atual)?.cor ?? "#f4f4f5";
}

/* O neon da faixa de cada campanha: branco, verde, amarelo ou vermelho,
   pintando a faixa inteira. Sem escolha, a faixa fica escura. As
   etiquetas usam exatamente estas cores. */
export const CORES_NEON = [
  { id: "branco", label: "Branco", cor: "#f4f4f5" },
  { id: "verde", label: "Verde", cor: "#3dff6a" },
  { id: "amarelo", label: "Amarelo", cor: "#ffd60a" },
  { id: "vermelho", label: "Vermelho", cor: "#ff3b3b" },
] as const;

export type CorNeon = (typeof CORES_NEON)[number]["id"];
export const NEON_PADRAO: CorNeon = "branco";

export function isCorNeon(value: unknown): value is CorNeon {
  return CORES_NEON.some((c) => c.id === value);
}

export function corDoNeon(id: CorNeon | undefined): string {
  return CORES_NEON.find((c) => c.id === (id ?? NEON_PADRAO))?.cor ?? "#f4f4f5";
}

const etiquetaSchema = z.object({
  texto: z.string().trim().min(1).max(40),
  cor: z.custom<CorEtiqueta>(isCorEtiqueta),
});
const notasSchema = z.object({
  etiquetas: z.array(etiquetaSchema).max(8).default([]),
  texto: z.string().max(600).default(""),
  /** Sem valor guardado, a faixa fica escura, sem cor. */
  neon: z.custom<CorNeon>(isCorNeon).optional(),
});
export type Etiqueta = z.infer<typeof etiquetaSchema>;
export type NotasDoCartao = z.infer<typeof notasSchema>;

const schema = z.object({
  version: z.literal(1),
  notas: z
    .record(z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/), notasSchema)
    .refine((v) => Object.keys(v).length <= 2000),
});

type Notas = Record<string, NotasDoCartao>;
type Snapshot = { notas: Notas; notice: string };
const EMPTY: Snapshot = { notas: {}, notice: "" };
let snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function restoreCardNotes(raw: string): Notas | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data.notas : null;
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(CARD_NOTES_KEY);
    const restored = raw ? restoreCardNotes(raw) : {};
    snapshot = { notas: restored ?? {}, notice: restored === null ? "As anotações salvas não puderam ser lidas." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: as anotações valem só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === CARD_NOTES_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  if (!initialized) {
    initialized = true;
    load();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function commit(notas: Notas) {
  let notice = "";
  try {
    localStorage.setItem(CARD_NOTES_KEY, JSON.stringify({ version: 1, notas }));
  } catch {
    notice = "Armazenamento indisponível: a anotação vale só nesta sessão.";
  }
  snapshot = { notas, notice };
  notify();
}

const VAZIO: NotasDoCartao = { etiquetas: [], texto: "" };

/** As anotações de um cartão e como gravá-las. */
export function useCardNotes(campaignId: string) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  const notas = state.notas[campaignId] ?? VAZIO;
  return {
    notas,
    notice: state.notice,
    salvar: (novas: NotasDoCartao) => {
      const limpas = notasSchema.safeParse(novas);
      if (!limpas.success) return false;
      const proximo = { ...snapshot.notas };
      // O neon só existe quando o usuário escolheu (o branco também conta).
      const neon = limpas.data.neon;
      if (limpas.data.etiquetas.length === 0 && !limpas.data.texto.trim() && !neon) delete proximo[campaignId];
      else proximo[campaignId] = { etiquetas: limpas.data.etiquetas, texto: limpas.data.texto.trim(), ...(neon ? { neon } : {}) };
      commit(proximo);
      return true;
    },
  };
}
