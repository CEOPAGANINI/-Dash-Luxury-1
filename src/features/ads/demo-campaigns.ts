import {
  somarMetricas,
  type AdMetrics,
  type AdNetwork,
  type AdRow,
  type AdSetRow,
  type AdStatus,
  type CampaignRow,
} from "./types";

/*
  Campanhas de exemplo, com números fictícios.

  Doze campanhas nas três redes, cada uma contando uma história diferente
  — a que escala, a que perde dinheiro, a que traz clique e não vende, a
  pausada que rendia, a ativa sem entrega. Assim o gerenciador e a
  calculadora mostram todos os tipos de achado antes da primeira
  sincronização real.

  Os anúncios têm as métricas; conjunto e campanha são a soma. Nada aqui
  é real, e a tela diz isso em cada linha ("demo").
*/

interface AnuncioSemente {
  nome: string;
  status?: AdStatus;
  titulo?: string;
  texto?: string;
  m: [gastoReais: number, impressoes: number, cliques: number, compras: number, receitaReais: number];
}

interface ConjuntoSemente {
  nome: string;
  status?: AdStatus;
  orcamentoDia?: number;
  anuncios: AnuncioSemente[];
}

interface CampanhaSemente {
  id: string;
  rede: AdNetwork;
  nome: string;
  objetivo: string;
  status?: AdStatus;
  orcamentoDia: number;
  conjuntos: ConjuntoSemente[];
}

const SEMENTES: CampanhaSemente[] = [
  {
    id: "a1", rede: "meta", nome: "Escala Produto A", objetivo: "Vendas", orcamentoDia: 1200,
    conjuntos: [
      { nome: "Interesses amplos — 25 a 45", orcamentoDia: 700, anuncios: [
        { nome: "Vídeo UGC — depoimento Carla", titulo: "O que mudou depois de 30 dias", texto: "Depoimento real, sem roteiro.", m: [3100, 230000, 5600, 52, 6300] },
        { nome: "Carrossel — antes e depois", titulo: "3 resultados em 3 semanas", texto: "Deslize para ver.", m: [1900, 150000, 3300, 27, 3300] },
      ] },
      { nome: "Lookalike 1% compradores", orcamentoDia: 500, anuncios: [
        { nome: "Vídeo UGC — depoimento Carla", titulo: "O que mudou depois de 30 dias", m: [2300, 160000, 4100, 35, 4200] },
        { nome: "Estático — oferta 20% off", status: "paused", titulo: "Só até domingo", m: [1200, 80000, 1880, 12, 1500] },
      ] },
    ],
  },
  {
    id: "a2", rede: "meta", nome: "Teste Criativos — Setembro", objetivo: "Teste", orcamentoDia: 600,
    conjuntos: [
      { nome: "Amplo — criativos novos", orcamentoDia: 600, anuncios: [
        { nome: "Vídeo — gancho pergunta", titulo: "Você também erra isso?", m: [1400, 140000, 2500, 14, 1700] },
        { nome: "Vídeo — gancho número", titulo: "7 em cada 10 fazem errado", m: [1500, 150000, 2900, 16, 1900] },
        { nome: "Estático — meme", titulo: "Quando você descobre…", m: [1300, 120000, 2390, 9, 1200] },
      ] },
    ],
  },
  {
    id: "a3", rede: "meta", nome: "Remarketing 14 dias", objetivo: "Remarketing", orcamentoDia: 300,
    conjuntos: [
      { nome: "Visitou e não comprou — 14d", orcamentoDia: 200, anuncios: [
        { nome: "Lembrete — carrinho", titulo: "Ficou algo no carrinho", texto: "Frete grátis hoje.", m: [1300, 110000, 3400, 41, 3900] },
        { nome: "Prova social — avaliações", titulo: "4,9 de 5 em 2.300 avaliações", m: [800, 70000, 2000, 21, 2000] },
      ] },
    ],
  },
  {
    id: "a4", rede: "meta", nome: "Lançamento Produto B", objetivo: "Vendas", orcamentoDia: 900,
    conjuntos: [
      { nome: "Interesses — nicho B", orcamentoDia: 500, anuncios: [
        { nome: "Vídeo — apresentação", titulo: "Chegou o Produto B", m: [2900, 260000, 2600, 3, 450] },
        { nome: "Carrossel — 5 usos", titulo: "5 jeitos de usar", m: [1700, 150000, 1500, 2, 300] },
      ] },
      { nome: "Lookalike compradores A", orcamentoDia: 400, anuncios: [
        { nome: "Vídeo — apresentação", titulo: "Chegou o Produto B", m: [2400, 210000, 2300, 4, 600] },
      ] },
    ],
  },
  {
    id: "a5", rede: "meta", nome: "Black Friday — aquecimento", objetivo: "Engajamento", status: "paused", orcamentoDia: 250,
    conjuntos: [
      { nome: "Base — engajou 90d", status: "paused", orcamentoDia: 250, anuncios: [
        { nome: "Vídeo — bastidores", status: "paused", titulo: "O que vem por aí", m: [1100, 190000, 5200, 38, 4300] },
      ] },
    ],
  },
  {
    id: "a6", rede: "meta", nome: "Captação de leads — e-book", objetivo: "Leads", orcamentoDia: 150,
    conjuntos: [
      { nome: "Amplo — interesse no tema", orcamentoDia: 150, anuncios: [
        { nome: "Estático — capa do e-book", titulo: "Baixe grátis o guia", m: [0, 0, 0, 0, 0] },
      ] },
    ],
  },
  {
    id: "g1", rede: "google", nome: "Pesquisa — Marca", objetivo: "Vendas", orcamentoDia: 550,
    conjuntos: [
      { nome: "Termos de marca — exata", orcamentoDia: 350, anuncios: [
        { nome: "RSA — marca oficial", titulo: "Site oficial · Frete grátis", m: [2200, 52000, 4100, 56, 6800] },
      ] },
      { nome: "Marca + concorrentes", orcamentoDia: 200, anuncios: [
        { nome: "RSA — compare", titulo: "Compare antes de comprar", m: [1600, 43000, 2100, 22, 2600] },
      ] },
    ],
  },
  {
    id: "g2", rede: "google", nome: "Performance Max — catálogo", objetivo: "Vendas", orcamentoDia: 950,
    conjuntos: [
      { nome: "Grupo de recursos — best-sellers", orcamentoDia: 950, anuncios: [
        { nome: "Recurso — imagens catálogo", titulo: "Best-sellers", m: [4100, 980000, 12400, 61, 6000] },
        { nome: "Recurso — vídeo 15s", titulo: "Novidades da semana", m: [2600, 520000, 8600, 43, 4200] },
      ] },
    ],
  },
  {
    id: "g3", rede: "google", nome: "Pesquisa — Genérica", objetivo: "Vendas", orcamentoDia: 400,
    conjuntos: [
      { nome: "Termos genéricos — ampla", orcamentoDia: 400, anuncios: [
        { nome: "RSA — categoria", titulo: "Melhor preço em …", m: [2800, 210000, 3900, 11, 1300] },
      ] },
    ],
  },
  {
    id: "y1", rede: "youtube", nome: "VSL — Prospecção", objetivo: "Vendas", orcamentoDia: 600,
    conjuntos: [
      { nome: "In-stream — interesses", orcamentoDia: 400, anuncios: [
        { nome: "VSL 4 min — corte A", titulo: "O erro que custa caro", m: [2700, 1400000, 6100, 36, 4500] },
      ] },
      { nome: "In-stream — canais concorrentes", orcamentoDia: 200, anuncios: [
        { nome: "VSL 4 min — corte B", titulo: "Antes que seja tarde", m: [1400, 700000, 3400, 19, 2400] },
      ] },
    ],
  },
  {
    id: "y2", rede: "youtube", nome: "Shorts — Reconhecimento", objetivo: "Reconhecimento", orcamentoDia: 200,
    conjuntos: [
      { nome: "Shorts — amplo", orcamentoDia: 200, anuncios: [
        { nome: "Short 15s — bastidores", titulo: "Como é feito", m: [1300, 1900000, 2100, 2, 250] },
      ] },
    ],
  },
  {
    id: "y3", rede: "youtube", nome: "Remarketing — assistiu 50%", objetivo: "Remarketing", status: "archived", orcamentoDia: 120,
    conjuntos: [
      { nome: "Assistiu 50% da VSL", status: "archived", orcamentoDia: 120, anuncios: [
        { nome: "Bumper 6s — lembrete", status: "archived", titulo: "Ainda dá tempo", m: [0, 0, 0, 0, 0] },
      ] },
    ],
  },
];

function metricas(m: AnuncioSemente["m"]): AdMetrics {
  const [gasto, impressoes, cliques, compras, receita] = m;
  return {
    spendCents: Math.round(gasto * 100),
    impressions: impressoes,
    clicks: cliques,
    purchases: compras,
    revenueCents: Math.round(receita * 100),
  };
}

/** A árvore de exemplo, no mesmo formato da que vem do banco. */
export function demoCampaignRows(): CampaignRow[] {
  return SEMENTES.map((c) => {
    const adSets: AdSetRow[] = c.conjuntos.map((s, i) => {
      const ads: AdRow[] = s.anuncios.map((a, j) => ({
        id: `demo-${c.id}-s${i}-a${j}`,
        externalId: null,
        name: a.nome,
        status: a.status ?? "active",
        creative: { title: a.titulo, body: a.texto },
        metrics: metricas(a.m),
      }));
      return {
        id: `demo-${c.id}-s${i}`,
        externalId: null,
        name: s.nome,
        status: s.status ?? "active",
        dailyBudgetCents: s.orcamentoDia === undefined ? null : s.orcamentoDia * 100,
        metrics: somarMetricas(ads.map((a) => a.metrics)),
        ads,
      };
    });
    return {
      id: `demo-${c.id}`,
      externalId: null,
      network: c.rede,
      name: c.nome,
      objective: c.objetivo,
      status: c.status ?? "active",
      dailyBudgetCents: c.orcamentoDia * 100,
      source: "demo",
      syncedAt: null,
      metrics: somarMetricas(adSets.map((s) => s.metrics)),
      adSets,
    };
  });
}
