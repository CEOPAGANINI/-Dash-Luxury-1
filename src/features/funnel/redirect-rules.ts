/*
  Ajudantes do bloco Redirecionador do quadro do funil: rótulos curtos das
  regras (cabem no bloco e no meio da linha), o nome do destino e uma
  regra nova em branco. Tudo puro — nada redireciona de verdade (Fase 1).
*/

import {
  nomeDoDispositivo,
  nomeDoPais,
} from "@/features/access-filter/access-filter-model";
import {
  nomeDaOrigem,
  nomeDaRede,
  nomeDoSistema,
  type MatchKind,
  type RedirectRule,
} from "@/features/offer-router/offer-router-model";
import type { FunnelNode, RegraRedir } from "./funnel-model";

/** Os tipos de regra, com o glifo que os identifica no bloco. */
export const TIPOS_REGRA: { id: MatchKind; nome: string; glifo: string }[] = [
  { id: "regiao", nome: "Por região", glifo: "🌍" },
  { id: "dispositivo", nome: "Por aparelho", glifo: "📱" },
  { id: "sistema", nome: "Por sistema", glifo: "💻" },
  { id: "rede", nome: "Por rede", glifo: "📶" },
  { id: "origem", nome: "Por origem", glifo: "📣" },
  { id: "fatia", nome: "Por fatia %", glifo: "🎲" },
];

export const GLIFO_REGRA: Record<MatchKind, string> = Object.fromEntries(
  TIPOS_REGRA.map((t) => [t.id, t.glifo]),
) as Record<MatchKind, string>;

/** "Brasil, Portugal +3" — no máximo dois nomes e a conta do resto. */
function lista(nomes: string[], vazio: string): string {
  if (nomes.length === 0) return vazio;
  const [a, b, ...resto] = nomes;
  return (
    [a, b].filter(Boolean).join(", ") + (resto.length ? ` +${resto.length}` : "")
  );
}

/** Rótulo curto de quem a regra pega (para o bloco e para a linha). */
export function rotuloDaRegra(r: RedirectRule): string {
  if (r.tipo === "regiao") return lista(r.paises.map(nomeDoPais), "região?");
  if (r.tipo === "dispositivo")
    return lista(r.dispositivos.map(nomeDoDispositivo), "aparelho?");
  if (r.tipo === "sistema")
    return lista((r.sistemas ?? []).map(nomeDoSistema), "sistema?");
  if (r.tipo === "rede") return lista((r.redes ?? []).map(nomeDaRede), "rede?");
  if (r.tipo === "origem")
    return lista((r.origens ?? []).map(nomeDaOrigem), "origem?");
  return `${r.percentual}% do tráfego`;
}

/** Nome do destino: o bloco do quadro, o endereço digitado, ou nada ainda. */
export function nomeDoDestino(
  r: RegraRedir,
  nomes: Record<string, string>,
): string {
  if (r.destinoNoId) return nomes[r.destinoNoId] ?? "(bloco removido)";
  return r.destino.trim() || "(defina o destino)";
}

/** A regra tem um destino utilizável? */
export function regraComDestino(r: RegraRedir): boolean {
  return Boolean(r.destinoNoId || r.destino.trim());
}

/** Uma regra nova em branco, do tipo escolhido. */
export function regraRedirNova(id: string, tipo: MatchKind): RegraRedir {
  return {
    id,
    tipo,
    paises: [],
    dispositivos: [],
    percentual: 50,
    destino: "",
    ativo: true,
  };
}

/** Índice id → título dos nós, para mostrar o nome do destino. */
export function nomesDosNos(nodes: FunnelNode[]): Record<string, string> {
  return Object.fromEntries(nodes.map((n) => [n.id, n.title]));
}
