"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/*
  Tags dos blocos do quadro por classe: o usuário cria as tags que quiser
  (nome e cor) e põe uma em cada bloco; o título do bloco passa a ser a
  tag. Fica só neste navegador, como as anotações dos cartões.
*/

export const BLOCK_TAGS_KEY = "dash-luxury:block-tags:v1";

/* Quinze cores, todas neon: a tag pinta a faixa inteira do cabeçalho do bloco. */
export const CORES_TAG = [
  { id: "branco", label: "Branco", cor: "#f4f4f5" },
  { id: "cinza", label: "Prata", cor: "#c7cbd1" },
  { id: "vermelho", label: "Vermelho", cor: "#ff3b3b" },
  { id: "laranja", label: "Laranja", cor: "#ff8a1f" },
  { id: "dourado", label: "Dourado", cor: "#f2b705" },
  { id: "amarelo", label: "Amarelo", cor: "#ffd60a" },
  { id: "lima", label: "Lima", cor: "#b6ff2e" },
  { id: "verde", label: "Verde", cor: "#3dff6a" },
  { id: "menta", label: "Menta", cor: "#2dffc4" },
  { id: "ciano", label: "Ciano", cor: "#22e9ff" },
  { id: "azul", label: "Azul", cor: "#2f8cff" },
  { id: "indigo", label: "Índigo", cor: "#6c5cff" },
  { id: "roxo", label: "Roxo", cor: "#a855f7" },
  { id: "magenta", label: "Magenta", cor: "#ff2fd6" },
  { id: "rosa", label: "Rosa", cor: "#ff5c8a" },
] as const;

export type CorTag = (typeof CORES_TAG)[number]["id"];

export function isCorTag(value: unknown): value is CorTag {
  return CORES_TAG.some((c) => c.id === value);
}

export function corDaTag(id: CorTag): string {
  return CORES_TAG.find((c) => c.id === id)?.cor ?? "#f5f5f5";
}

const tagSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  nome: z.string().trim().min(1).max(24),
  cor: z.custom<CorTag>(isCorTag),
});
export type TagDoBloco = z.infer<typeof tagSchema>;

const schema = z.object({
  version: z.literal(1),
  tags: z.array(tagSchema).max(40),
  porPilar: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.string().regex(/^[a-z0-9-]{1,40}$/)),
});

type Estado = { tags: TagDoBloco[]; porPilar: Record<string, string> };
type Snapshot = Estado & { notice: string };
const EMPTY: Snapshot = { tags: [], porPilar: {}, notice: "" };
let snapshot: Snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function restoreBlockTags(raw: string): Estado | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) return null;
    const ids = new Set(r.data.tags.map((t) => t.id));
    // Um bloco só aponta para tag que existe.
    const porPilar = Object.fromEntries(Object.entries(r.data.porPilar).filter(([, id]) => ids.has(id)));
    return { tags: r.data.tags, porPilar };
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(BLOCK_TAGS_KEY);
    const restored = raw ? restoreBlockTags(raw) : { tags: [], porPilar: {} };
    snapshot = restored
      ? { ...restored, notice: "" }
      : { tags: [], porPilar: {}, notice: "As tags salvas não puderam ser lidas." };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: as tags valem só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === BLOCK_TAGS_KEY || event.key === null) {
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

function commit(estado: Estado) {
  let notice = "";
  try {
    localStorage.setItem(BLOCK_TAGS_KEY, JSON.stringify({ version: 1, ...estado }));
  } catch {
    notice = "Armazenamento indisponível: a tag vale só nesta sessão.";
  }
  snapshot = { ...estado, notice };
  notify();
}

/** Um id curto e único a partir do nome. */
function novoId(nome: string, existentes: TagDoBloco[]): string {
  const base =
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "tag";
  let id = base;
  let n = 2;
  while (existentes.some((t) => t.id === id)) id = `${base}-${n++}`;
  return id;
}

/** As tags criadas, a tag de cada bloco e como mudar tudo isso. */
export function useBlockTags() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    tags: state.tags,
    porPilar: state.porPilar,
    notice: state.notice,
    tagDoBloco: (pilar: string): TagDoBloco | null => {
      const id = state.porPilar[pilar];
      return (id && state.tags.find((t) => t.id === id)) || null;
    },
    /** Cria a tag e devolve o id; nome vazio ou repetido devolve null. */
    criar: (nome: string, cor: CorTag): string | null => {
      const limpo = nome.trim().slice(0, 24);
      if (!limpo || snapshot.tags.length >= 40) return null;
      if (snapshot.tags.some((t) => t.nome.toLowerCase() === limpo.toLowerCase())) return null;
      const id = novoId(limpo, snapshot.tags);
      commit({ tags: [...snapshot.tags, { id, nome: limpo, cor }], porPilar: snapshot.porPilar });
      return id;
    },
    remover: (id: string) => {
      const porPilar = Object.fromEntries(Object.entries(snapshot.porPilar).filter(([, t]) => t !== id));
      commit({ tags: snapshot.tags.filter((t) => t.id !== id), porPilar });
    },
    atribuir: (pilar: string, tagId: string | null) => {
      const porPilar = { ...snapshot.porPilar };
      if (tagId && snapshot.tags.some((t) => t.id === tagId)) porPilar[pilar] = tagId;
      else delete porPilar[pilar];
      commit({ tags: snapshot.tags, porPilar });
    },
  };
}
