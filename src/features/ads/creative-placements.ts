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
  /** O que veio de cada uma — é daqui que sai a origem do público. */
  porPlataforma: Record<Plataforma, AdMetrics>;
}

export type Plataforma = VendaPorPosicao["plataforma"];

export function somarPorPosicao(lista: readonly VendaPorPosicao[]): PosicaoSomada[] {
  const porId = new Map<PosicaoId, PosicaoSomada>();
  for (const v of lista) {
    if (!isPosicao(v.id)) continue;
    const atual =
      porId.get(v.id) ??
      {
        id: v.id,
        metrics: { ...METRICAS_ZERADAS },
        plataformas: [],
        porPlataforma: { facebook: { ...METRICAS_ZERADAS }, instagram: { ...METRICAS_ZERADAS } },
      };
    atual.metrics = somarMetricas([atual.metrics, v.metrics]);
    atual.porPlataforma[v.plataforma] = somarMetricas([atual.porPlataforma[v.plataforma], v.metrics]);
    if (!atual.plataformas.includes(v.plataforma)) atual.plataformas.push(v.plataforma);
    porId.set(v.id, atual);
  }
  return [...porId.values()];
}

/*
  A origem do público: de onde vieram as pessoas que viram o anúncio.

  A conta é feita sobre as impressões, não sobre as vendas — a pergunta
  é "de onde veio o público", e público é quem viu. Sem impressões de
  nenhum lado não há resposta, e a função diz isso em vez de inventar
  um meio a meio.
*/
export interface OrigemDoPublico {
  instagram: { impressoes: number; fatia: number; percentagem: number };
  facebook: { impressoes: number; fatia: number; percentagem: number };
  total: number;
  /** Quem trouxe mais gente; null quando não há público nenhum. */
  maior: Plataforma | null;
}

export function origemDoPublico(porPlataforma: Record<Plataforma, AdMetrics>): OrigemDoPublico {
  const ig = Math.max(0, Math.round(porPlataforma.instagram.impressions));
  const fb = Math.max(0, Math.round(porPlataforma.facebook.impressions));
  const total = ig + fb;
  const fatia = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 1000 : 0);
  const [pIg, pFb] = percentagensQueFecham([ig, fb]);
  return {
    instagram: { impressoes: ig, fatia: fatia(ig), percentagem: pIg },
    facebook: { impressoes: fb, fatia: fatia(fb), percentagem: pFb },
    total,
    maior: total === 0 ? null : ig >= fb ? "instagram" : "facebook",
  };
}

/*
  Percentagens inteiras que somam 100.

  Arredondar cada uma por si dá 77% + 24% = 101%, e quem lê repara.
  Este é o método do maior resto: arredonda tudo para baixo e distribui
  os pontos que sobraram pelos que ficaram mais perto de subir.
*/
export function percentagensQueFecham(valores: readonly number[]): number[] {
  const limpos = valores.map((v) => Math.max(0, v));
  const total = limpos.reduce((s, v) => s + v, 0);
  if (total <= 0) return limpos.map(() => 0);
  const exatas = limpos.map((v) => (v / total) * 100);
  const chao = exatas.map((e) => Math.floor(e));
  let sobra = 100 - chao.reduce((s, v) => s + v, 0);
  const ordem = exatas
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    chao[i] += 1;
    sobra -= 1;
  }
  return chao;
}

/** A origem do público do criativo inteiro, somando todas as posições. */
export function origemDoCriativo(lista: readonly VendaPorPosicao[]): OrigemDoPublico {
  const porPlataforma: Record<Plataforma, AdMetrics> = {
    facebook: { ...METRICAS_ZERADAS },
    instagram: { ...METRICAS_ZERADAS },
  };
  for (const v of lista) {
    if (!isPosicao(v.id)) continue;
    porPlataforma[v.plataforma] = somarMetricas([porPlataforma[v.plataforma], v.metrics]);
  }
  return origemDoPublico(porPlataforma);
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

/*
  A cor de cada posição na barra de distribuição.

  São oito posições, mas oito cores na mesma barra não se distinguem —
  medido, não achado: com as oito, o pior par fica a ΔE 3,2 para quem
  tem daltonismo e a 7,1 mesmo para quem vê todas as cores (o mínimo é
  15). Das setenta combinações de quatro cores da paleta, só duas
  passam nos dois temas; esta é uma delas. Por isso quatro posições —
  as que costumam vender — têm cor própria e as restantes juntam-se
  numa fatia cinzenta. A cor segue a posição, nunca a colocação dela no
  ranking: o feed é azul mesmo quando vende menos que o stories.
*/
export type CorDaPosicao = 1 | 2 | 3 | 4 | null;

export const COR_DA_POSICAO: Record<PosicaoId, CorDaPosicao> = {
  feed: 1,
  stories: 2,
  explorar: 3,
  reels: 4,
  marketplace: null,
  video: null,
  mensagens: null,
  outra: null,
};

export interface FatiaDaDistribuicao {
  /** A posição, o saco das que não têm cor, ou o que não foi partido. */
  id: PosicaoId | "outras" | "sem";
  rotulo: string;
  cor: CorDaPosicao;
  purchases: number;
  /** De 0 a 1. */
  fatia: number;
  /** Inteira, e o conjunto soma sempre 100. */
  percentagem: number;
}

/*
  A distribuição das vendas do criativo pelas posições: uma fatia por
  posição com cor própria, uma fatia cinzenta com as restantes e, se a
  plataforma devolveu menos vendas partidas do que o total do anúncio, o
  que falta como "sem posição" — em vez de sumir da barra.

  O total é o do anúncio, para as percentagens fecharem em 100%.
*/
export function distribuicaoDeVendas(
  lista: readonly VendaPorPosicao[],
  metricas: AdMetrics,
): { total: number; fatias: FatiaDaDistribuicao[] } {
  const total = Math.max(Math.round(metricas.purchases), vendasDasPosicoes(lista));
  const fatias: FatiaDaDistribuicao[] = [];
  let semCor = 0;
  for (const p of posicoesQueVenderam(lista)) {
    if (p.metrics.purchases <= 0) continue;
    const cor = COR_DA_POSICAO[p.id];
    if (cor === null) semCor += p.metrics.purchases;
    else fatias.push({ id: p.id, rotulo: rotuloDaPosicao(p.id), cor, purchases: p.metrics.purchases, fatia: fatiaDaPosicao(p.metrics.purchases, total), percentagem: 0 });
  }
  fatias.sort((a, b) => b.purchases - a.purchases);
  if (semCor > 0) fatias.push({ id: "outras", rotulo: "Outras posições", cor: null, purchases: semCor, fatia: fatiaDaPosicao(semCor, total), percentagem: 0 });
  const sem = vendasSemPosicao(lista, metricas);
  if (sem > 0) fatias.push({ id: "sem", rotulo: "Sem posição", cor: null, purchases: sem, fatia: fatiaDaPosicao(sem, total), percentagem: 0 });
  // As percentagens fecham em 100, em vez de cada uma arredondar por si.
  const inteiras = percentagensQueFecham(fatias.map((f) => f.purchases));
  return { total, fatias: fatias.map((f, i) => ({ ...f, percentagem: inteiras[i] })) };
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
  /* Onde a posição pesa mais: o stories e os reels são terreno do
     Instagram, o marketplace é do Facebook. A outra plataforma leva o
     resto — as duas aparecem, que é o que faz a origem do público
     existir. */
  const pesoDoInstagram = (p: PosicaoId): number =>
    p === "stories" || p === "reels" || p === "explorar" ? 0.72 : p === "marketplace" ? 0.12 : 0.45;
  const repartidas: VendaPorPosicao[] = [];
  escolhidas.forEach((p, i) => {
    const fatia = pesos[i] / somaDosPesos;
    // Cada posição tem o seu ritmo: o stories gasta mais por impressão,
    // o explorar clica mais. Dá CTR e CPM diferentes por posição.
    const tempero = 0.7 + semente(`${id}|ritmo|${p}`) * 0.7;
    const daPosicao = {
      spendCents: Math.round(metricas.spendCents * fatia),
      revenueCents: Math.round(metricas.revenueCents * fatia),
      impressions: Math.round(metricas.impressions * fatia * tempero),
      clicks: Math.round(metricas.clicks * fatia * (2 - tempero)),
      purchases: Math.floor(total * fatia),
      // Quem inicia o checkout é sempre bem mais do que quem compra.
      checkouts: Math.round(Math.floor(total * fatia) * (2.4 + semente(`${id}|checkout|${p}`) * 2.6)),
    };
    // E agora o mesmo, partido entre as duas plataformas.
    const ig = Math.min(0.92, Math.max(0.08, pesoDoInstagram(p) + (semente(`${id}|origem|${p}`) - 0.5) * 0.3));
    const parte = (m: number, q: number) => Math.round(m * q);
    const vendasIg = Math.round(daPosicao.purchases * ig);
    repartidas.push(
      {
        id: p,
        plataforma: "instagram",
        metrics: {
          spendCents: parte(daPosicao.spendCents, ig),
          revenueCents: parte(daPosicao.revenueCents, ig),
          impressions: parte(daPosicao.impressions, ig),
          clicks: parte(daPosicao.clicks, ig),
          purchases: vendasIg,
          checkouts: parte(daPosicao.checkouts, ig),
        },
      },
      {
        id: p,
        plataforma: "facebook",
        metrics: {
          spendCents: daPosicao.spendCents - parte(daPosicao.spendCents, ig),
          revenueCents: daPosicao.revenueCents - parte(daPosicao.revenueCents, ig),
          impressions: daPosicao.impressions - parte(daPosicao.impressions, ig),
          clicks: daPosicao.clicks - parte(daPosicao.clicks, ig),
          purchases: daPosicao.purchases - vendasIg,
          checkouts: daPosicao.checkouts - parte(daPosicao.checkouts, ig),
        },
      },
    );
  });
  // O que o arredondamento comeu vai para a parte que mais vendeu.
  const sobra = total - repartidas.reduce((s, p) => s + p.metrics.purchases, 0);
  if (sobra > 0) {
    const maior = repartidas.reduce((a, b) => (b.metrics.purchases > a.metrics.purchases ? b : a), repartidas[0]);
    maior.metrics.purchases += sobra;
  }
  return repartidas.filter((p) => p.metrics.purchases > 0 || p.metrics.spendCents > 0 || p.metrics.impressions > 0);
}
