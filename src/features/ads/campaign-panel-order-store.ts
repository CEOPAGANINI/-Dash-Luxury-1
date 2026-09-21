"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import { moverNaOrdem } from "./metrics-order-store";

/*
  A arrumação do painel da campanha (o bloco que abre na seta): a ordem
  das secções — gráfico, lucro, números, fichas e criativos —, a ordem
  dos doze números e a das seis fichas. Tudo o que o usuário arrasta
  fica guardado só neste navegador.
*/

export const ORDEM_PAINEL_KEY = "dash-luxury:ordem-painel-campanha:v1";

export const SECOES_DO_PAINEL = [
  { id: "grafico", rotulo: "Gráfico do ROAS" },
  { id: "lucro", rotulo: "Lucro" },
  { id: "numeros", rotulo: "Números" },
  { id: "fichas", rotulo: "Fichas" },
  { id: "criativos", rotulo: "Criativos" },
] as const;
export type SecaoId = (typeof SECOES_DO_PAINEL)[number]["id"];

export const NUMEROS_DA_CAMPANHA = [
  "investimento", "retorno", "roas", "margem", "compras", "cpa",
  "impressoes", "cliques", "ctr", "cpc", "cpm", "orcamento",
] as const;
export type NumeroId = (typeof NUMEROS_DA_CAMPANHA)[number];

export const FICHAS_DA_CAMPANHA = ["estado", "rede", "objetivo", "conjuntos", "origem", "sincronizada"] as const;
export type FichaId = (typeof FICHAS_DA_CAMPANHA)[number];

/** Quantas colunas uma secção ocupa: meia linha ou a linha toda. */
export type LarguraDaSecao = 1 | 2;

export interface ArrumacaoDoPainel {
  secoes: SecaoId[];
  numeros: NumeroId[];
  fichas: FichaId[];
  /** A largura de cada secção, para pôr coisas lado a lado. */
  larguras: Record<SecaoId, LarguraDaSecao>;
}

export const LARGURAS_PADRAO: Record<SecaoId, LarguraDaSecao> = {
  grafico: 2,
  lucro: 2,
  numeros: 2,
  fichas: 2,
  criativos: 2,
};

export const ARRUMACAO_PADRAO: ArrumacaoDoPainel = {
  secoes: SECOES_DO_PAINEL.map((s) => s.id),
  numeros: [...NUMEROS_DA_CAMPANHA],
  fichas: [...FICHAS_DA_CAMPANHA],
  larguras: { ...LARGURAS_PADRAO },
};

/* As larguras guardadas, saneadas: só 1 ou 2, e o que faltar volta ao
   padrão — uma secção nova nunca nasce sem largura. */
export function completarLarguras(bruta: unknown): Record<SecaoId, LarguraDaSecao> {
  const objeto = typeof bruta === "object" && bruta !== null ? (bruta as Record<string, unknown>) : {};
  const larguras = { ...LARGURAS_PADRAO };
  for (const secao of SECOES_DO_PAINEL) {
    const valor = objeto[secao.id];
    if (valor === 1 || valor === 2) larguras[secao.id] = valor;
  }
  return larguras;
}

/* Uma lista completa: a guardada, sem repetidos nem ids estranhos, e o
   que faltar vai para o fim (assim uma métrica nova nunca desaparece). */
function completar<T extends string>(lista: readonly unknown[], padrao: readonly T[]): T[] {
  const vistas = new Set<T>();
  const ordem: T[] = [];
  for (const id of [...lista, ...padrao]) {
    if (typeof id === "string" && (padrao as readonly string[]).includes(id) && !vistas.has(id as T)) {
      vistas.add(id as T);
      ordem.push(id as T);
    }
  }
  return ordem;
}

/** A arrumação inteira, saneada. */
export function completarArrumacao(bruta: Partial<Record<string, unknown>>): ArrumacaoDoPainel {
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    secoes: completar(lista(bruta.secoes), ARRUMACAO_PADRAO.secoes),
    numeros: completar(lista(bruta.numeros), ARRUMACAO_PADRAO.numeros),
    fichas: completar(lista(bruta.fichas), ARRUMACAO_PADRAO.fichas),
    larguras: completarLarguras(bruta.larguras),
  };
}

const schema = z.object({
  version: z.literal(1),
  secoes: z.array(z.string()).max(20).optional(),
  numeros: z.array(z.string()).max(40).optional(),
  fichas: z.array(z.string()).max(40).optional(),
  larguras: z.record(z.string().max(40), z.number()).optional(),
});

export function restoreCampaignPanelOrder(raw: string): ArrumacaoDoPainel | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? completarArrumacao(r.data) : null;
  } catch {
    return null;
  }
}

export { moverNaOrdem };

type Snapshot = { arrumacao: ArrumacaoDoPainel; notice: string };
const EMPTY: Snapshot = { arrumacao: ARRUMACAO_PADRAO, notice: "" };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  try {
    const raw = localStorage.getItem(ORDEM_PAINEL_KEY);
    const restored = raw ? restoreCampaignPanelOrder(raw) : null;
    snapshot = {
      arrumacao: restored ?? ARRUMACAO_PADRAO,
      notice: raw && !restored ? "A arrumação do painel salva não pôde ser lida." : "",
    };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: a arrumação vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === ORDEM_PAINEL_KEY || event.key === null) {
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

/** A arrumação do painel da campanha e como guardá-la. */
export function useCampaignPanelOrder() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    arrumacao: state.arrumacao,
    notice: state.notice,
    guardar: (nova: Partial<ArrumacaoDoPainel>) => {
      const arrumacao = completarArrumacao({ ...state.arrumacao, ...nova });
      let notice = "";
      try {
        localStorage.setItem(ORDEM_PAINEL_KEY, JSON.stringify({ version: 1, ...arrumacao }));
      } catch {
        notice = "Armazenamento indisponível: a arrumação vale só nesta sessão.";
      }
      snapshot = { arrumacao, notice };
      notify();
    },
  };
}
