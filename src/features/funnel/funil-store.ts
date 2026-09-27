/*
  Cofre de funis (Fase 1): guarda no navegador os funis do quadro e os
  fluxos do redirecionador, com nome, para reabrir depois — e para trazer
  um funil salvo para o quadro do redirecionador. Fica no localStorage
  até ligarmos o banco (Fase 2); a interface é a mesma quando trocar.
*/

import type { FunnelData } from "./funnel-model";

const K_FUNIS = "dash:funis";
const K_REDIR = "dash:redirecionadores";

export interface FunilSalvo {
  id: string;
  nome: string;
  atualizadoEm: string;
  data: FunnelData;
}

/** O retrato do quadro do redirecionador (o que precisa para reabrir). */
export interface RedirSalvo {
  id: string;
  nome: string;
  atualizadoEm: string;
  /** Estado bruto do quadro (páginas/regras, blocos, posições, ligações). */
  estado: unknown;
}

function ler<T>(k: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(k);
    return bruto ? (JSON.parse(bruto) as T[]) : [];
  } catch {
    return [];
  }
}
function gravar<T>(k: string, itens: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(k, JSON.stringify(itens));
  } catch {
    /* sem storage: fica só na memória desta sessão */
  }
}
function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ── Funis do quadro ─────────────────────────────────────────────────── */
export function listarFunis(): FunilSalvo[] {
  return ler<FunilSalvo>(K_FUNIS).sort((a, b) =>
    b.atualizadoEm.localeCompare(a.atualizadoEm),
  );
}
/** Salva (ou atualiza, se o id já existe) e devolve o registro. */
export function salvarFunil(data: FunnelData, nome?: string): FunilSalvo {
  const lista = ler<FunilSalvo>(K_FUNIS);
  const n = (nome ?? data.nome).trim() || "Funil sem nome";
  const idx = lista.findIndex((f) => f.id === data.id);
  const reg: FunilSalvo = {
    id: data.id,
    nome: n,
    atualizadoEm: new Date().toISOString(),
    data: { ...data, nome: n },
  };
  if (idx >= 0) lista[idx] = reg;
  else lista.push(reg);
  gravar(K_FUNIS, lista);
  return reg;
}
export function removerFunil(id: string) {
  gravar(K_FUNIS, ler<FunilSalvo>(K_FUNIS).filter((f) => f.id !== id));
}
/** Cópia com id novo e "(cópia)" no nome. */
export function duplicarFunil(id: string): FunilSalvo | null {
  const f = ler<FunilSalvo>(K_FUNIS).find((x) => x.id === id);
  if (!f) return null;
  const nid = novoId("funil");
  return salvarFunil({ ...f.data, id: nid }, `${f.nome} (cópia)`);
}
export function novoIdDeFunil(): string {
  return novoId("funil");
}

/* ── Fluxos do redirecionador ────────────────────────────────────────── */
export function listarRedirs(): RedirSalvo[] {
  return ler<RedirSalvo>(K_REDIR).sort((a, b) =>
    b.atualizadoEm.localeCompare(a.atualizadoEm),
  );
}
export function salvarRedir(
  nome: string,
  estado: unknown,
  id?: string,
): RedirSalvo {
  const lista = ler<RedirSalvo>(K_REDIR);
  const reg: RedirSalvo = {
    id: id ?? novoId("redir"),
    nome: nome.trim() || "Redirecionador sem nome",
    atualizadoEm: new Date().toISOString(),
    estado,
  };
  const idx = lista.findIndex((r) => r.id === reg.id);
  if (idx >= 0) lista[idx] = reg;
  else lista.push(reg);
  gravar(K_REDIR, lista);
  return reg;
}
export function removerRedir(id: string) {
  gravar(K_REDIR, ler<RedirSalvo>(K_REDIR).filter((r) => r.id !== id));
}

/** Data curta para as listas (ex.: "27/09 14:03"). */
export function quando(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
