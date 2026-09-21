import { METRICAS_ZERADAS, somarMetricas, type AdMetrics } from "./types";

/*
  Onde o criativo vendeu: feed, explorar, stories, reels…

  O Meta entrega os números partidos por plataforma (Facebook ou
  Instagram) e por posição dentro dela. É essa partição que diz se um
  criativo é de stories ou de feed — dois criativos com o mesmo total de
  vendas contam histórias diferentes quando um vende tudo no explorar e o
  outro tudo no feed.

  Este módulo é só a conta e os nomes: sem banco e sem navegador, lido
  pelo servidor e pela tela. Sem partição sincronizada, a tela não mostra
  nada — nunca inventa de onde veio a venda.
*/

export const POSICOES = [
  { id: "feed", rotulo: "Feed", curto: "Feed" },
  { id: "explorar", rotulo: "Explorar", curto: "Explorar" },
  { id: "stories", rotulo: "Stories", curto: "Stories" },
  { id: "reels", rotulo: "Reels", curto: "Reels" },
  { id: "marketplace", rotulo: "Marketplace", curto: "Market." },
  { id: "video", rotulo: "Feed de vídeo", curto: "Vídeo" },
  { id: "mensagens", rotulo: "Mensagens", curto: "Mensag." },
  { id: "outra", rotulo: "Outras posições", curto: "Outras" },
] as const;
export type PosicaoId = (typeof POSICOES)[number]["id"];

export const POSICOES_IDS: PosicaoId[] = POSICOES.map((p) => p.id);

/**
 * Uma posição de anúncio com as métricas dela — as mesmas do anúncio,
 * só que partidas: investimento, impressões, cliques, compras e receita.
 * É daqui que saem ROAS, CPA, CTR, CPC e CPM de cada posição.
 */
export interface VendaPorPosicao {
  id: PosicaoId;
  /** A mesma posição existe nas duas plataformas. */
  plataforma: "facebook" | "instagram";
  metrics: AdMetrics;
}

export const ROTULO_DA_PLATAFORMA: Record<VendaPorPosicao["plataforma"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

export function rotuloDaPosicao(id: PosicaoId): string {
  return POSICOES.find((p) => p.id === id)?.rotulo ?? id;
}

export function rotuloCurtoDaPosicao(id: PosicaoId): string {
  return POSICOES.find((p) => p.id === id)?.curto ?? id;
}

export function isPosicao(v: unknown): v is PosicaoId {
  return typeof v === "string" && (POSICOES_IDS as string[]).includes(v);
}

/* Junta as duas plataformas na mesma posição: quem olha para o criativo
   quer saber "quanto vendeu no stories", não "quanto vendeu no stories
   do Instagram e quanto no do Facebook" — isso fica no detalhe. */
export interface PosicaoSomada {
  id: PosicaoId;
  metrics: AdMetrics;
  /** As plataformas que contribuíram, para o detalhe. */
  plataformas: VendaPorPosicao["plataforma"][];
}

export function somarPorPosicao(lista: readonly VendaPorPosicao[]): PosicaoSomada[] {
  const porId = new Map<PosicaoId, PosicaoSomada>();
  for (const v of lista) {
    if (!isPosicao(v.id)) continue;
    const atual = porId.get(v.id) ?? { id: v.id, metrics: { ...METRICAS_ZERADAS }, plataformas: [] };
    atual.metrics = somarMetricas([atual.metrics, v.metrics]);
    if (!atual.plataformas.includes(v.plataforma)) atual.plataformas.push(v.plataforma);
    porId.set(v.id, atual);
  }
  return [...porId.values()];
}

/** As posições que venderam, da que mais vendeu para a que menos vendeu. */
export function posicoesQueVenderam(lista: readonly VendaPorPosicao[]): PosicaoSomada[] {
  return somarPorPosicao(lista)
    .filter((p) => p.metrics.purchases > 0 || p.metrics.spendCents > 0)
    .sort(
      (a, b) =>
        b.metrics.purchases - a.metrics.purchases ||
        b.metrics.spendCents - a.metrics.spendCents ||
        POSICOES_IDS.indexOf(a.id) - POSICOES_IDS.indexOf(b.id),
    );
}

/** Quantas vendas a partição conhece, no total. */
export function vendasDasPosicoes(lista: readonly VendaPorPosicao[]): number {
  return somarPorPosicao(lista).reduce((s, p) => s + p.metrics.purchases, 0);
}

/*
  O que falta para o total do criativo: quando a plataforma devolve menos
  vendas partidas do que o total do anúncio (acontece: atribuição por
  janelas diferentes), a diferença aparece como "sem posição" em vez de
  desaparecer da conta.
*/
export function vendasSemPosicao(lista: readonly VendaPorPosicao[], metricas: AdMetrics): number {
  return Math.max(0, Math.round(metricas.purchases) - vendasDasPosicoes(lista));
}

/** A fatia de vendas de uma posição, de 0 a 1. */
export function fatiaDaPosicao(purchases: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((purchases / total) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */

/* Um número estável entre 0 e 1 a partir de um texto. */
function semente(chave: string): number {
  let h = 2166136261;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** As posições que a demonstração usa, por tipo de criativo. */
const FEITIO_DO_CRIATIVO: { pista: RegExp; posicoes: PosicaoId[] }[] = [
  { pista: /stor|vertical|9:16/i, posicoes: ["stories", "reels", "feed"] },
  { pista: /reel|short/i, posicoes: ["reels", "stories", "explorar"] },
  { pista: /carrossel|carousel/i, posicoes: ["feed", "explorar", "marketplace"] },
  { pista: /est[aá]tico|imagem|meme/i, posicoes: ["feed", "explorar", "stories"] },
  { pista: /v[ií]deo/i, posicoes: ["reels", "feed", "video"] },
];

/*
  A partição de demonstração: reparte as vendas do anúncio pelas posições
  que fazem sentido para o feitio dele (um vertical vende em stories e
  reels; um carrossel, no feed e no explorar), sempre igual para o mesmo
  anúncio. Só vale no modo demonstração — com dados reais entra a
  partição que a plataforma devolveu.
*/
export function posicoesDemonstrativas(id: string, nome: string, metricas: AdMetrics): VendaPorPosicao[] {
  const total = Math.max(0, Math.round(metricas.purchases));
  if (total <= 0) return [];
  const escolhidas = FEITIO_DO_CRIATIVO.find((f) => f.pista.test(nome))?.posicoes ?? ["feed", "stories", "explorar"];
  const pesos = escolhidas.map((p, i) => 0.2 + semente(`${id}|${p}|${i}`) * (i === 0 ? 1.6 : 0.9));
  const somaDosPesos = pesos.reduce((s, p) => s + p, 0);
  const plataformaDe = (p: PosicaoId): VendaPorPosicao["plataforma"] =>
    p === "stories" || p === "reels" || p === "explorar" ? "instagram" : "facebook";
  const repartidas: VendaPorPosicao[] = escolhidas.map((p, i) => {
    const fatia = pesos[i] / somaDosPesos;
    // Cada posição tem o seu ritmo: o stories gasta mais por impressão,
    // o explorar clica mais. Dá CTR e CPM diferentes por posição.
    const tempero = 0.7 + semente(`${id}|ritmo|${p}`) * 0.7;
    return {
      id: p,
      plataforma: plataformaDe(p),
      metrics: {
        spendCents: Math.round(metricas.spendCents * fatia),
        revenueCents: Math.round(metricas.revenueCents * fatia),
        impressions: Math.round(metricas.impressions * fatia * tempero),
        clicks: Math.round(metricas.clicks * fatia * (2 - tempero)),
        purchases: Math.floor(total * fatia),
      },
    };
  });
  // O que o arredondamento comeu vai para a posição que mais vendeu.
  const sobra = total - repartidas.reduce((s, p) => s + p.metrics.purchases, 0);
  if (sobra > 0) {
    const maior = repartidas.reduce((a, b) => (b.metrics.purchases > a.metrics.purchases ? b : a), repartidas[0]);
    maior.metrics.purchases += sobra;
  }
  return repartidas.filter((p) => p.metrics.purchases > 0 || p.metrics.spendCents > 0);
}
