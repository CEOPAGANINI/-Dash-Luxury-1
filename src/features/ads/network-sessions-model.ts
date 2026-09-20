/*
  As páginas de uma rede de tráfego. Cada uma é um endereço próprio
  (/campanhas/meta/classes, /campanhas/meta/tabela…) e o menu da borda
  direita troca entre elas.
*/

export interface SessaoDaRede {
  id: SessaoDaRedeId;
  short: string;
  label: string;
}

export type SessaoDaRedeId =
  | "classes"
  | "tabela"
  | "gerenciador"
  | "metricas"
  | "calculadora";

export const SESSOES_DA_REDE: SessaoDaRede[] = [
  { id: "classes", short: "Por classe", label: "Quadro por classe de trabalho" },
  { id: "tabela", short: "Tabela", label: "Tabela com estado e freio em blocos" },
  { id: "gerenciador", short: "Gerenciador", label: "Gerenciador em colunas de estado" },
  { id: "metricas", short: "Métricas", label: "Tabela de métricas do gerenciador" },
  { id: "calculadora", short: "Calculadora", label: "Calculadora e diagnóstico" },
];

export const SESSAO_PADRAO: SessaoDaRedeId = "classes";

export function isSessaoDaRede(v: string): v is SessaoDaRedeId {
  return SESSOES_DA_REDE.some((s) => s.id === v);
}
