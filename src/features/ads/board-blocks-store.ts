"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import { PILARES, isPilar, pilarLabel, type PilarId } from "./campaign-classes";

/*
  Os blocos do quadro por classe são do usuário: além dos quinze blocos
  de fábrica (um por pilar), ele cria blocos novos, apaga qualquer bloco
  (os de fábrica podem voltar) e dá a cada um a largura e a altura que
  quiser, em células da grade. Uma campanha solta num bloco criado pelo
  usuário fica ligada a esse bloco (a classe dela não muda); solta num
  bloco de fábrica, recebe a classe do bloco, como sempre.

  Tudo fica só neste navegador, como as tags e as anotações.
*/

export const BLOCOS_KEY = "dash-luxury:blocos:v1";

/* A grade: cinco colunas; três fileiras por padrão, mais quando os blocos
   precisarem. Um bloco tem de 1 a 5 células de largura e de 1 a 3 de altura. */
export const GRADE = { colunas: 5, fileiras: 3, colunasFixas: 2 } as const;
export const LARGURA_MAXIMA = GRADE.colunas;
export const ALTURA_MAXIMA = GRADE.fileiras;
export const MAXIMO_DE_BLOCOS = 40;

export type Tamanho = { largura: number; altura: number };
export const TAMANHO_PADRAO: Tamanho = { largura: 1, altura: 1 };

const ID_BLOCO = /^[a-z0-9-]{1,40}$/;
const CHAVE_CAMPANHA = /^(demo|banco):(meta|google|youtube):[a-zA-Z0-9-]{1,100}$/;

const tamanhoSchema = z.object({
  largura: z.number().int().min(1).max(LARGURA_MAXIMA),
  altura: z.number().int().min(1).max(ALTURA_MAXIMA),
});
const definicaoSchema = tamanhoSchema.extend({
  /** Só os blocos criados pelo usuário têm nome; os de fábrica usam o do pilar. */
  nome: z.string().trim().min(1).max(40).optional(),
});
export type DefinicaoDoBloco = z.infer<typeof definicaoSchema>;

const schema = z.object({
  version: z.literal(1),
  blocos: z.record(z.string().regex(ID_BLOCO), definicaoSchema).refine((v) => Object.keys(v).length <= MAXIMO_DE_BLOCOS + PILARES.length),
  removidos: z.array(z.string().regex(ID_BLOCO)).max(PILARES.length),
  campanhas: z.record(z.string().regex(CHAVE_CAMPANHA), z.string().regex(ID_BLOCO)).refine((v) => Object.keys(v).length <= 2000),
});

export type Estado = {
  blocos: Record<string, DefinicaoDoBloco>;
  removidos: string[];
  campanhas: Record<string, string>;
};
type Snapshot = Estado & { notice: string };
const VAZIO: Estado = { blocos: {}, removidos: [], campanhas: {} };
const EMPTY: Snapshot = { ...VAZIO, notice: "" };
let snapshot: Snapshot = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Um bloco criado pelo usuário (não é um pilar de fábrica). */
export function isBlocoPersonalizado(id: string): boolean {
  return id.startsWith("bloco-");
}

export function restoreBoardBlocks(raw: string): Estado | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    if (!r.success) return null;
    // Só um pilar de fábrica pode estar "removido"; um bloco criado some de vez.
    const removidos = r.data.removidos.filter((id) => isPilar(id));
    const blocos: Record<string, DefinicaoDoBloco> = {};
    for (const [id, def] of Object.entries(r.data.blocos)) {
      if (isPilar(id) || (isBlocoPersonalizado(id) && def.nome)) blocos[id] = def;
    }
    // Uma campanha só aponta para bloco criado que ainda existe.
    const campanhas = Object.fromEntries(Object.entries(r.data.campanhas).filter(([, bloco]) => isBlocoPersonalizado(bloco) && bloco in blocos));
    return { blocos, removidos, campanhas };
  } catch {
    return null;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(BLOCOS_KEY);
    const restored = raw ? restoreBoardBlocks(raw) : VAZIO;
    snapshot = restored ? { ...restored, notice: "" } : { ...VAZIO, notice: "Os blocos salvos não puderam ser lidos." };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: os blocos valem só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === BLOCOS_KEY || event.key === null) {
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
    localStorage.setItem(BLOCOS_KEY, JSON.stringify({ version: 1, ...estado }));
  } catch {
    notice = "Armazenamento indisponível: os blocos valem só nesta sessão.";
  }
  snapshot = { ...estado, notice };
  notify();
}

/** O tamanho de um bloco, em células (1×1 quando nada foi escolhido). */
export function tamanhoDoBloco(blocos: Record<string, DefinicaoDoBloco>, id: string): Tamanho {
  const def = blocos[id];
  return def ? { largura: def.largura, altura: def.altura } : TAMANHO_PADRAO;
}

/** O rótulo de um bloco: o nome do pilar, ou o nome dado ao bloco criado. */
export function rotuloDoBloco(blocos: Record<string, DefinicaoDoBloco>, id: string): string {
  if (isPilar(id)) return pilarLabel(id);
  return blocos[id]?.nome ?? "Bloco";
}

/** Os ids de todos os blocos que existem: os pilares não removidos e os criados. */
export function blocosExistentes(estado: Estado): string[] {
  const pilares = PILARES.map((p) => p.id as string).filter((id) => !estado.removidos.includes(id));
  const criados = Object.keys(estado.blocos).filter(isBlocoPersonalizado).sort(
    (a, b) => Number(a.slice("bloco-".length)) - Number(b.slice("bloco-".length)),
  );
  return [...pilares, ...criados];
}

/** A chave de uma campanha no cofre: modo, rede e id. */
export function chaveDaCampanha(modo: "demo" | "banco", network: "meta" | "google" | "youtube", id: string): string {
  return `${modo}:${network}:${id}`;
}

/** Os blocos do quadro (tamanhos, criados, removidos, campanhas) e como mudá-los. */
export function useBoardBlocks() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    blocos: state.blocos,
    removidos: state.removidos,
    campanhas: state.campanhas,
    notice: state.notice,
    /** Cria um bloco novo (1×1) e devolve o id; no limite, devolve null. */
    criar: (): string | null => {
      const criados = Object.keys(snapshot.blocos).filter(isBlocoPersonalizado);
      if (criados.length >= MAXIMO_DE_BLOCOS) return null;
      const n = criados.reduce((maior, id) => Math.max(maior, Number(id.slice("bloco-".length)) || 0), 0) + 1;
      const id = `bloco-${n}`;
      commit({ ...snapshot, blocos: { ...snapshot.blocos, [id]: { ...TAMANHO_PADRAO, nome: `Bloco ${n}` } } });
      return id;
    },
    /** Apaga um bloco: um pilar de fábrica fica escondido (pode voltar); um bloco criado some, e as campanhas dele voltam para a classe delas. */
    apagar: (id: string) => {
      const blocos = { ...snapshot.blocos };
      delete blocos[id];
      const campanhas = Object.fromEntries(Object.entries(snapshot.campanhas).filter(([, bloco]) => bloco !== id));
      const removidos = isPilar(id) && !snapshot.removidos.includes(id) ? [...snapshot.removidos, id] : snapshot.removidos;
      commit({ blocos, removidos, campanhas });
    },
    /** Traz de volta um pilar de fábrica apagado. */
    restaurar: (id: PilarId) => {
      commit({ ...snapshot, removidos: snapshot.removidos.filter((x) => x !== id) });
    },
    /** Dá ao bloco esta largura e altura (em células, dentro dos limites). */
    redimensionar: (id: string, tamanho: Tamanho) => {
      const largura = Math.max(1, Math.min(LARGURA_MAXIMA, Math.round(tamanho.largura)));
      const altura = Math.max(1, Math.min(ALTURA_MAXIMA, Math.round(tamanho.altura)));
      const atual = snapshot.blocos[id];
      if (!atual && !isPilar(id)) return;
      commit({ ...snapshot, blocos: { ...snapshot.blocos, [id]: { ...(atual ?? {}), largura, altura } } });
    },
    /** Liga a campanha a um bloco criado, ou (null) devolve-a à classe dela. */
    colocar: (chave: string, bloco: string | null) => {
      if (!CHAVE_CAMPANHA.test(chave)) return;
      const campanhas = { ...snapshot.campanhas };
      if (bloco && isBlocoPersonalizado(bloco) && bloco in snapshot.blocos) campanhas[chave] = bloco;
      else delete campanhas[chave];
      commit({ ...snapshot, campanhas });
    },
  };
}
