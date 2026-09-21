import { describe, expect, it } from "vitest";

import {
  type VendaPorPosicao,
  fatiaDaPosicao,
  origemDoCriativo,
  origemDoPublico,
  percentagensQueFecham,
  posicoesDemonstrativas,
  posicoesQueVenderam,
  rotuloCurtoDaPosicao,
  rotuloDaPosicao,
  somarPorPosicao,
  vendasDasPosicoes,
  vendasSemPosicao,
} from "@/features/ads/creative-placements";
import { derivadas } from "@/features/ads/types";

const venda = (
  id: VendaPorPosicao["id"],
  plataforma: VendaPorPosicao["plataforma"],
  m: Partial<VendaPorPosicao["metrics"]>,
): VendaPorPosicao => ({
  id,
  plataforma,
  metrics: { spendCents: 0, revenueCents: 0, impressions: 0, clicks: 0, purchases: 0, ...m },
});

describe("as vendas de um criativo por posição", () => {
  it("junta a mesma posição das duas plataformas, guardando quem contribuiu", () => {
    const somadas = somarPorPosicao([
      venda("stories", "instagram", { purchases: 12, spendCents: 100_00, revenueCents: 400_00, impressions: 900, clicks: 30 }),
      venda("stories", "facebook", { purchases: 8, spendCents: 50_00, revenueCents: 150_00, impressions: 600, clicks: 10 }),
      venda("feed", "facebook", { purchases: 3, spendCents: 30_00, revenueCents: 60_00, impressions: 400, clicks: 8 }),
    ]);
    const stories = somadas.find((p) => p.id === "stories")!;
    expect(stories.metrics).toEqual({ purchases: 20, spendCents: 150_00, revenueCents: 550_00, impressions: 1500, clicks: 40 });
    expect(stories.plataformas).toEqual(["instagram", "facebook"]);
    expect(somadas.find((p) => p.id === "feed")!.plataformas).toEqual(["facebook"]);
  });

  it("ordena da posição que mais vendeu para a que menos vendeu", () => {
    const ordem = posicoesQueVenderam([
      venda("feed", "facebook", { purchases: 3, spendCents: 30_00 }),
      venda("explorar", "instagram", { purchases: 10, spendCents: 80_00 }),
      venda("stories", "instagram", { purchases: 20, spendCents: 120_00 }),
      venda("reels", "instagram", { purchases: 0, spendCents: 0 }),
    ]).map((p) => p.id);
    // O reels não vendeu nem gastou: não aparece.
    expect(ordem).toEqual(["stories", "explorar", "feed"]);
  });

  it("cada posição tem as métricas dela, não as do criativo inteiro", () => {
    const [stories] = posicoesQueVenderam([
      venda("stories", "instagram", { purchases: 4, spendCents: 200_00, revenueCents: 800_00, impressions: 10_000, clicks: 200 }),
    ]);
    const d = derivadas(stories.metrics);
    expect(d.roas).toBeCloseTo(4, 5);
    expect(d.cpaCents).toBe(50_00);
    expect(d.ctr).toBeCloseTo(0.02, 5);
    expect(d.cpcCents).toBe(100);
    expect(d.cpmCents).toBe(2000);
  });

  it("o que a plataforma não partiu aparece como sem posição, em vez de sumir", () => {
    const lista = [venda("feed", "facebook", { purchases: 3 }), venda("stories", "instagram", { purchases: 5 })];
    const metricas = { spendCents: 0, revenueCents: 0, impressions: 0, clicks: 0, purchases: 11 };
    expect(vendasDasPosicoes(lista)).toBe(8);
    expect(vendasSemPosicao(lista, metricas)).toBe(3);
    // Quando a partição já diz tudo (ou diz de mais), não sobra nada.
    expect(vendasSemPosicao(lista, { ...metricas, purchases: 8 })).toBe(0);
    expect(vendasSemPosicao(lista, { ...metricas, purchases: 2 })).toBe(0);
  });

  it("a fatia de cada posição vai de 0 a 1 e aguenta o total zerado", () => {
    expect(fatiaDaPosicao(5, 20)).toBe(0.25);
    expect(fatiaDaPosicao(0, 0)).toBe(0);
  });

  it("os nomes das posições têm versão curta para o cartão estreito", () => {
    expect(rotuloDaPosicao("marketplace")).toBe("Marketplace");
    expect(rotuloCurtoDaPosicao("marketplace")).toBe("Market.");
    expect(rotuloDaPosicao("stories")).toBe("Stories");
  });
});

describe("a partição de demonstração", () => {
  const metricas = { spendCents: 500_00, revenueCents: 1_500_00, impressions: 50_000, clicks: 1_200, purchases: 40 };

  it("reparte todas as vendas do anúncio, sem perder nenhuma", () => {
    const repartidas = posicoesDemonstrativas("a1", "Vídeo vertical 9:16", metricas);
    expect(vendasDasPosicoes(repartidas)).toBe(40);
    expect(vendasSemPosicao(repartidas, metricas)).toBe(0);
  });

  it("escolhe as posições pelo feitio do criativo", () => {
    const vertical = posicoesDemonstrativas("a1", "Stories vertical", metricas).map((p) => p.id);
    const carrossel = posicoesDemonstrativas("a2", "Carrossel de provas", metricas).map((p) => p.id);
    expect(vertical).toContain("stories");
    expect(carrossel).toContain("feed");
    expect(carrossel).not.toContain("stories");
  });

  it("dá a cada posição a sua proporção: CTR e CPM diferentes entre elas", () => {
    const repartidas = posicoesDemonstrativas("a1", "Vídeo vertical 9:16", metricas);
    const ctrs = repartidas.map((p) => derivadas(p.metrics).ctr);
    expect(new Set(ctrs).size).toBeGreaterThan(1);
    const cpms = repartidas.map((p) => derivadas(p.metrics).cpmCents);
    expect(new Set(cpms).size).toBeGreaterThan(1);
  });

  it("é sempre a mesma partição para o mesmo anúncio, e nenhuma sem vendas", () => {
    const a = posicoesDemonstrativas("a1", "Estático meme", metricas);
    const b = posicoesDemonstrativas("a1", "Estático meme", metricas);
    expect(a).toEqual(b);
    // Um anúncio sem compras não inventa posições.
    expect(posicoesDemonstrativas("a1", "Estático meme", { ...metricas, purchases: 0 })).toEqual([]);
  });
});

describe("a origem do público", () => {
  it("reparte pelas impressões, não pelas vendas", () => {
    const o = origemDoPublico({
      instagram: { spendCents: 0, revenueCents: 0, impressions: 47_281, clicks: 0, purchases: 1 },
      facebook: { spendCents: 0, revenueCents: 0, impressions: 14_497, clicks: 0, purchases: 99 },
    });
    expect(o.total).toBe(61_778);
    expect(o.maior).toBe("instagram");
    // As duas fecham em 100: arredondadas à parte davam 77 + 24 = 101.
    expect(o.instagram.percentagem + o.facebook.percentagem).toBe(100);
    expect(o.instagram.percentagem).toBe(77);
    expect(o.facebook.percentagem).toBe(23);
    expect(o.instagram.impressoes).toBe(47_281);
  });

  it("sem público não inventa um meio a meio", () => {
    const vazio = { spendCents: 0, revenueCents: 0, impressions: 0, clicks: 0, purchases: 0 };
    const o = origemDoPublico({ instagram: vazio, facebook: vazio });
    expect(o.total).toBe(0);
    expect(o.maior).toBeNull();
    expect(o.instagram.percentagem).toBe(0);
    expect(o.facebook.percentagem).toBe(0);
  });

  it("a do criativo soma todas as posições", () => {
    const o = origemDoCriativo([
      venda("stories", "instagram", { impressions: 600 }),
      venda("feed", "instagram", { impressions: 400 }),
      venda("feed", "facebook", { impressions: 1_000 }),
    ]);
    expect(o.instagram.impressoes).toBe(1_000);
    expect(o.facebook.impressoes).toBe(1_000);
    expect(o.instagram.percentagem).toBe(50);
    expect(o.maior).toBe("instagram");
  });

  it("as posições guardam o que veio de cada plataforma", () => {
    const [feed] = somarPorPosicao([
      venda("feed", "instagram", { impressions: 300, purchases: 2 }),
      venda("feed", "facebook", { impressions: 700, purchases: 1 }),
    ]);
    expect(feed.metrics.purchases).toBe(3);
    expect(feed.porPlataforma.instagram.impressions).toBe(300);
    expect(feed.porPlataforma.facebook.impressions).toBe(700);
    expect(origemDoPublico(feed.porPlataforma).maior).toBe("facebook");
  });
});

describe("as percentagens que fecham em 100", () => {
  it("distribuem os pontos que sobram pelos maiores restos", () => {
    expect(percentagensQueFecham([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentagensQueFecham([47_281, 14_497])).toEqual([77, 23]);
    expect(percentagensQueFecham([8, 6, 5, 2]).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("aguentam o total zerado e os negativos", () => {
    expect(percentagensQueFecham([])).toEqual([]);
    expect(percentagensQueFecham([0, 0])).toEqual([0, 0]);
    expect(percentagensQueFecham([-5, 5])).toEqual([0, 100]);
  });
});

describe("os checkouts iniciados", () => {
  it("a demonstração dá mais checkouts do que vendas, em cada posição", () => {
    const metricas = { spendCents: 500_00, revenueCents: 1_500_00, impressions: 50_000, clicks: 1_200, purchases: 40 };
    for (const p of posicoesQueVenderam(posicoesDemonstrativas("a1", "Vídeo vertical 9:16", metricas))) {
      expect(typeof p.metrics.checkouts).toBe("number");
      expect(p.metrics.checkouts!).toBeGreaterThanOrEqual(p.metrics.purchases);
    }
  });

  it("a partição de demonstração traz as duas plataformas", () => {
    const metricas = { spendCents: 500_00, revenueCents: 1_500_00, impressions: 50_000, clicks: 1_200, purchases: 40 };
    const lista = posicoesDemonstrativas("a1", "Vídeo vertical 9:16", metricas);
    expect(new Set(lista.map((v) => v.plataforma))).toEqual(new Set(["instagram", "facebook"]));
    // E as impressões partidas somam as do anúncio, sem inventar nem perder.
    const o = origemDoCriativo(lista);
    expect(o.total).toBeGreaterThan(0);
    expect(o.instagram.percentagem + o.facebook.percentagem).toBe(100);
  });
});
