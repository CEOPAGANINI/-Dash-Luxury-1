/*
  Métricas de uma página do funil — só demonstração (Fase 1). Os números
  saem de um gerador determinístico (a mesma página mostra sempre os
  mesmos números), para a tela funcionar sem a VPS. Na Fase 2 o script de
  métricas da página envia visitas, cliques e rolagem de verdade.
*/

export type Periodo = "7d" | "30d" | "90d";

export const PERIODOS: { id: Periodo; nome: string; dias: number }[] = [
  { id: "7d", nome: "7 dias", dias: 7 },
  { id: "30d", nome: "30 dias", dias: 30 },
  { id: "90d", nome: "90 dias", dias: 90 },
];

export interface DiaMetrica {
  /** Rótulo curto do dia (ex.: "12/03"). */
  dia: string;
  visitas: number;
  cliques: number;
}

export interface Fatia {
  nome: string;
  pct: number;
}

export interface MetricasPagina {
  periodo: Periodo;
  visitas: number;
  unicos: number;
  /** Percentual de visitantes novos (o resto voltou). */
  novosPct: number;
  tempoMedioSeg: number;
  rejeicaoPct: number;
  /** Cliques no(s) botão(ões) de compra. */
  cliquesCompra: number;
  /** Cliques ÷ visitas, em %. */
  ctrPct: number;
  botoes: { nome: string; cliques: number }[];
  tempoAteCliqueSeg: number;
  /** Quantos chegaram a 25/50/75/100% da página. */
  rolagem: { p25: number; p50: number; p75: number; p100: number };
  /** % dos visitantes que viram cada fatia de 10% da página (10 fatias). */
  profundidade: number[];
  profundidadeMediaPct: number;
  /** Em que fatia (0–9) fica o botão de compra. */
  fatiaDoBotao: number;
  porDia: DiaMetrica[];
  porAparelho: Fatia[];
  porOrigem: Fatia[];
  funil: { etapa: string; qtd: number }[];
}

/** Gerador determinístico (mulberry32) semeado por um texto. */
function semente(texto: string): () => number {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIAS_SEMANA_PESO = [0.8, 1.05, 1.1, 1.08, 1.02, 0.85, 0.7]; // dom…sáb

/** As métricas de demonstração de uma página, para um período. */
export function metricasDemo(seed: string, periodo: Periodo = "30d"): MetricasPagina {
  const rnd = semente(`${seed}:${periodo}`);
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? 30;
  const base = 40 + Math.floor(rnd() * 160); // visitas/dia típicas da página
  const ctr = 0.02 + rnd() * 0.05; // 2–7% clicam no botão
  const hoje = new Date();
  const porDia: DiaMetrica[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const peso = DIAS_SEMANA_PESO[d.getDay()];
    const tendencia = 1 + ((dias - 1 - i) / dias) * 0.25; // cresce devagar
    const visitas = Math.max(0, Math.round(base * peso * tendencia * (0.7 + rnd() * 0.6)));
    const cliques = Math.round(visitas * ctr * (0.6 + rnd() * 0.8));
    porDia.push({
      dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      visitas,
      cliques,
    });
  }
  const visitas = porDia.reduce((n, d) => n + d.visitas, 0);
  const cliquesCompra = porDia.reduce((n, d) => n + d.cliques, 0);
  const unicos = Math.round(visitas * (0.72 + rnd() * 0.18));

  // Profundidade: quase todo mundo vê o topo; vai caindo até o fim.
  const queda = 0.7 + rnd() * 0.8; // entre ~17% e ~45% chegam ao fim
  const profundidade: number[] = [];
  for (let i = 0; i < 10; i++) {
    const p = 100 * Math.pow(1 - i / 13, queda) * (0.94 + rnd() * 0.08);
    profundidade.push(Math.max(3, Math.min(100, Math.round(i === 0 ? 100 : p))));
  }
  for (let i = 1; i < 10; i++)
    profundidade[i] = Math.min(profundidade[i], profundidade[i - 1]);
  const pct = (i: number) => profundidade[Math.min(9, i)] / 100;
  const rolagem = {
    p25: Math.round(visitas * pct(2)),
    p50: Math.round(visitas * pct(5)),
    p75: Math.round(visitas * pct(7)),
    p100: Math.round(visitas * pct(9)),
  };
  const profundidadeMediaPct = Math.round(
    profundidade.reduce((n, p) => n + p, 0) / 10,
  );
  const fatiaDoBotao = 5 + Math.floor(rnd() * 3); // o botão fica entre 50% e 80%
  const viuBotao = Math.round(visitas * pct(fatiaDoBotao));

  const b1 = Math.round(cliquesCompra * (0.55 + rnd() * 0.3));
  const botoes = [
    { nome: "Comprar agora (topo)", cliques: b1 },
    { nome: "Quero garantir (oferta)", cliques: cliquesCompra - b1 },
  ];

  const ap1 = 55 + Math.floor(rnd() * 25);
  const ap2 = Math.floor((100 - ap1) * (0.7 + rnd() * 0.2));
  const porAparelho: Fatia[] = [
    { nome: "Celular", pct: ap1 },
    { nome: "Computador", pct: ap2 },
    { nome: "Tablet", pct: 100 - ap1 - ap2 },
  ];
  const o1 = 30 + Math.floor(rnd() * 25);
  const o2 = Math.floor((100 - o1) * 0.4);
  const o3 = Math.floor((100 - o1 - o2) * 0.5);
  const porOrigem: Fatia[] = [
    { nome: "Facebook / Instagram", pct: o1 },
    { nome: "Google", pct: o2 },
    { nome: "TikTok", pct: o3 },
    { nome: "Direto / outros", pct: 100 - o1 - o2 - o3 },
  ];

  return {
    periodo,
    visitas,
    unicos,
    novosPct: 60 + Math.floor(rnd() * 30),
    tempoMedioSeg: 45 + Math.floor(rnd() * 150),
    rejeicaoPct: 25 + Math.floor(rnd() * 40),
    cliquesCompra,
    ctrPct: visitas ? Math.round((cliquesCompra / visitas) * 1000) / 10 : 0,
    botoes,
    tempoAteCliqueSeg: 20 + Math.floor(rnd() * 90),
    rolagem,
    profundidade,
    profundidadeMediaPct,
    fatiaDoBotao,
    porDia,
    porAparelho,
    porOrigem,
    funil: [
      { etapa: "Visitaram a página", qtd: visitas },
      { etapa: "Rolaram até a metade", qtd: rolagem.p50 },
      { etapa: "Viram o botão de compra", qtd: viuBotao },
      { etapa: "Clicaram no botão", qtd: cliquesCompra },
      { etapa: "Chegaram à próxima etapa", qtd: Math.round(cliquesCompra * (0.8 + rnd() * 0.15)) },
    ],
  };
}

/** "1.240" — número curto em pt-BR. */
export function num(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** "1m 32s". */
export function segundos(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

/** "3,4%". */
export function pctTxt(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
