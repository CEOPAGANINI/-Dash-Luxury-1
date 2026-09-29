/*
  Previsão do funil (Parte 5): a partir das visitas que entram e da
  conversão de cada bloco, calcula quantas pessoas passam por cada etapa,
  vendas, receita, custo e lucro — em três cenários. É uma calculadora:
  os números são os que o dono digita (ou padrões de mercado), não
  medições reais.
*/

import type { FunnelEdge, FunnelNode, FunnelNodeType } from "./funnel-model";

export type Cenario = "pessimista" | "realista" | "otimista";

export const CENARIOS: { id: Cenario; nome: string; fator: number; cor: string }[] = [
  { id: "pessimista", nome: "Pessimista", fator: 0.7, cor: "#f87171" },
  { id: "realista", nome: "Realista", fator: 1, cor: "#38bdf8" },
  { id: "otimista", nome: "Otimista", fator: 1.3, cor: "#00e559" },
];

/** O que o dono digita num bloco. */
export interface PrevisaoNo {
  /** % das pessoas que seguem para a próxima etapa (ou compram). */
  conversao?: number;
  /** Preço do que se vende neste bloco (checkout, upsell, downsell). */
  preco?: number;
  /** Visitas por mês que entram por aqui (só nos blocos de origem). */
  visitas?: number;
}

/** Configuração geral da previsão (salva com o funil). */
export interface PrevisaoCfg {
  cenario: Cenario;
  /** Custo por visita (R$), para o custo do tráfego. */
  cpc: number;
}

export const PREVISAO_PADRAO: PrevisaoCfg = { cenario: "realista", cpc: 1.2 };

/** Conversão típica por tipo de bloco (%), a faixa do semáforo e se vende. */
export const PADRAO_TIPO: Partial<
  Record<FunnelNodeType, { conv: number; faixa?: [number, number]; vende?: boolean; preco?: number }>
> = {
  page_v3: { conv: 30, faixa: [15, 35] },
  optin: { conv: 30, faixa: [20, 40] },
  vsl: { conv: 8, faixa: [3, 10] },
  sales: { conv: 4, faixa: [2, 5] },
  checkout: { conv: 55, faixa: [40, 70], vende: true, preco: 197 },
  upsell: { conv: 20, faixa: [10, 30], vende: true, preco: 97 },
  downsell: { conv: 15, faixa: [8, 25], vende: true, preco: 47 },
  thanks: { conv: 100 },
  quiz: { conv: 45, faixa: [30, 60] },
  webinar: { conv: 25, faixa: [15, 35] },
  members: { conv: 100 },
  redirect: { conv: 100 },
  campaign: { conv: 35, faixa: [20, 45] },
  group_campaign: { conv: 40, faixa: [25, 50] },
  lead_list: { conv: 100 },
  link_whats: { conv: 60, faixa: [40, 75] },
  shortcut_url: { conv: 100 },
  link_split: { conv: 100 },
  link_test_ab: { conv: 100 },
  link_countries: { conv: 100 },
  pipeline: { conv: 100 },
  ad: { conv: 100 },
  brand: { conv: 100 },
};

/** Visitas/mês padrão de uma origem sem número digitado. */
export const VISITAS_PADRAO = 10000;

export type Semaforo = "verde" | "amarelo" | "vermelho" | "neutro";

export interface ResultadoNo {
  entram: number;
  saem: number;
  /** Conversão usada (já com o fator do cenário). */
  conversao: number;
  vendas: number;
  receita: number;
  semaforo: Semaforo;
  /** É um bloco de origem (visitas digitadas). */
  origem: boolean;
}

export interface Totais {
  visitas: number;
  leads: number;
  vendas: number;
  receita: number;
  custo: number;
  lucro: number;
  roi: number;
  custoPorLead: number;
  custoPorVenda: number;
}

const ANOTACOES = new Set<FunnelNodeType>(["note", "text", "shape", "frame", "comment"]);

/** Calcula a previsão de todo o quadro no cenário escolhido. */
export function calcularPrevisao(
  nodes: FunnelNode[],
  edges: FunnelEdge[],
  cfg: PrevisaoCfg,
): { porNo: Record<string, ResultadoNo>; total: Totais; ordem: string[] } {
  const fator = CENARIOS.find((c) => c.id === cfg.cenario)?.fator ?? 1;
  const uteis = nodes.filter((n) => !ANOTACOES.has(n.type));
  const ids = new Set(uteis.map((n) => n.id));
  const ligacoes = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const entradas: Record<string, number> = {};
  const saidas: Record<string, string[]> = {};
  for (const n of uteis) {
    entradas[n.id] = 0;
    saidas[n.id] = [];
  }
  for (const e of ligacoes) {
    entradas[e.target]++;
    saidas[e.source].push(e.target);
  }
  // Ordem topológica (Kahn); num ciclo, os que sobram entram no fim.
  const fila = uteis.filter((n) => entradas[n.id] === 0).map((n) => n.id);
  const ordem: string[] = [];
  const grau = { ...entradas };
  while (fila.length) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const t of saidas[id]) if (--grau[t] === 0) fila.push(t);
  }
  for (const n of uteis) if (!ordem.includes(n.id)) ordem.push(n.id);

  const entram: Record<string, number> = {};
  for (const n of uteis) entram[n.id] = 0;
  const porNo: Record<string, ResultadoNo> = {};
  let visitas = 0;
  let leads = 0;
  let vendas = 0;
  let receita = 0;
  for (const id of ordem) {
    const n = uteis.find((x) => x.id === id)!;
    const pad = PADRAO_TIPO[n.type] ?? { conv: 100 };
    const origem = entradas[id] === 0;
    if (origem) {
      entram[id] = n.previsao?.visitas ?? VISITAS_PADRAO;
      visitas += entram[id];
    }
    const base = n.previsao?.conversao ?? pad.conv;
    const conv = pad.conv === 100 && n.previsao?.conversao == null ? 100 : Math.min(100, base * fator);
    const saem = (entram[id] * conv) / 100;
    const vende = Boolean(pad.vende);
    const preco = n.previsao?.preco ?? pad.preco ?? 0;
    const v = vende ? saem : 0;
    const r = v * preco;
    vendas += v;
    receita += r;
    if (n.type === "optin" || n.type === "quiz" || n.type === "webinar") leads += saem;
    let semaforo: Semaforo = "neutro";
    if (pad.faixa) {
      const [ruim, bom] = pad.faixa;
      semaforo = conv >= bom ? "verde" : conv >= ruim ? "amarelo" : "vermelho";
    }
    porNo[id] = { entram: entram[id], saem, conversao: conv, vendas: v, receita: r, semaforo, origem };
    const dest = saidas[id];
    if (dest.length) for (const t of dest) entram[t] += saem / dest.length;
  }
  const custo = visitas * cfg.cpc;
  const lucro = receita - custo;
  return {
    porNo,
    ordem,
    total: {
      visitas,
      leads,
      vendas,
      receita,
      custo,
      lucro,
      roi: custo > 0 ? lucro / custo : 0,
      custoPorLead: leads > 0 ? custo / leads : 0,
      custoPorVenda: vendas > 0 ? custo / vendas : 0,
    },
  };
}

/** "R$ 1.234" */
export function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "1.234" (arredondado). */
export function inteiro(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}
