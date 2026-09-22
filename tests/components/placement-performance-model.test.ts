import { describe, expect, it } from "vitest";
import {
  buildPlacementPerformance,
  normalizePlacement,
  PLACEMENT_DEFINITIONS,
} from "@/features/ads/placement-performance-model";
import type { VendaPorPosicao } from "@/features/ads/creative-placements";

function placement(
  id: VendaPorPosicao["id"],
  plataforma: VendaPorPosicao["plataforma"],
  metrics: Partial<VendaPorPosicao["metrics"]> = {},
): VendaPorPosicao {
  return {
    id,
    plataforma,
    metrics: {
      spendCents: 0,
      revenueCents: 0,
      purchases: 0,
      impressions: 0,
      clicks: 0,
      ...metrics,
    },
  };
}

describe("placement performance normalization", () => {
  it("maps internal and Meta names without merging platforms", () => {
    expect(normalizePlacement("Instagram", " feed ")).toBe("instagram-feed");
    expect(normalizePlacement("facebook", "feed")).toBe("facebook-feed");
    expect(normalizePlacement("instagram", "story")).toBe("instagram-stories");
    for (const position of [
      "explorar",
      "explore",
      "instagram_explore",
      "instagram_explore_home",
    ]) {
      expect(normalizePlacement("instagram", position)).toBe(
        "instagram-explore",
      );
    }
  });

  it("rejects all placements outside the five accepted platform and position pairs", () => {
    for (const position of [
      "reels",
      "video",
      "marketplace",
      "messenger",
      "search",
      "instagram_profile_feed",
      "outra",
      "explore",
    ]) {
      expect(normalizePlacement("facebook", position)).toBeNull();
    }
    for (const platform of [
      "audience_network",
      "messenger",
      "whatsapp",
      "threads",
      "unknown",
      null,
    ]) {
      expect(normalizePlacement(platform, "feed")).toBeNull();
    }
  });

  it("reads Meta numeric strings and checkout events without double-counting event aliases", () => {
    const model = buildPlacementPerformance([
      {
        publisher_platform: "instagram",
        platform_position: "instagram_explore",
        spend: "120.50",
        impressions: "10000",
        clicks: "250",
        actions: [
          { action_type: "purchase", value: "5" },
          { action_type: "omni_purchase", value: "5" },
          { action_type: "initiate_checkout", value: "18" },
        ],
        action_values: [{ action_type: "purchase", value: "482" }],
      },
    ]);
    const explore = model.cards[2];
    expect(explore.metrics).toEqual({
      spendCents: 12050,
      revenueCents: 48200,
      purchases: 5,
      impressions: 10000,
      clicks: 250,
      checkouts: 18,
    });
    expect(explore.derived).toEqual({
      roas: 4,
      ctr: 0.025,
      cpcCents: 48.2,
      cpaCents: 2410,
      // 12050 centavos por 10.000 impressões.
      cpmCents: 1205,
    });
    expect(explore.percentage).toBe(100);
  });
});

describe("placement performance totals", () => {
  it("always returns five ordered cards and totals only their sales", () => {
    const model = buildPlacementPerformance([
      placement("feed", "instagram", { purchases: 5 }),
      placement("stories", "instagram", { purchases: 3 }),
      placement("explorar", "instagram", { purchases: 1 }),
      placement("feed", "facebook", { purchases: 4 }),
      placement("stories", "facebook", { purchases: 2 }),
      placement("reels", "instagram", { purchases: 1000, spendCents: 10000 }),
      placement("marketplace", "facebook", { purchases: 1000 }),
    ]);
    expect(model.cards.map((card) => card.label)).toEqual([
      "Feed Instagram",
      "Stories Instagram",
      "Explorar Instagram",
      "Feed Facebook",
      "Stories Facebook",
    ]);
    expect(model.cards.map((card) => card.color)).toEqual([
      "#EC1B72",
      "#F36AB8",
      "#E78AF2",
      "#1877F2",
      "#72A7FF",
    ]);
    expect(model.totalSales).toBe(15);
    expect(model.metrics.spendCents).toBe(0);
    expect(model.cards.map((card) => card.percentage)).toEqual([
      33, 20, 7, 27, 13,
    ]);
    expect(model.cards.reduce((sum, card) => sum + card.percentage, 0)).toBe(
      100,
    );
    expect(model.cards.reduce((sum, card) => sum + card.share, 0)).toBeCloseTo(
      1,
    );
  });

  it("sums duplicate placement rows and derives weighted ratios from their totals", () => {
    const model = buildPlacementPerformance([
      {
        ...placement("feed", "instagram", {
          purchases: 2,
          spendCents: 10000,
          revenueCents: 20000,
          impressions: 1000,
          clicks: 20,
          checkouts: 4,
        }),
        derived: { roas: 2, cpaCents: 5000 },
      },
      {
        ...placement("feed", "instagram", {
          purchases: 8,
          spendCents: 30000,
          revenueCents: 120000,
          impressions: 3000,
          clicks: 180,
          checkouts: 15,
        }),
        derived: { roas: 4, cpaCents: 3750 },
      },
      placement("feed", "facebook", {
        purchases: 1,
        spendCents: 1000,
        revenueCents: 2000,
      }),
    ]);
    expect(model.cards[0].metrics).toEqual({
      purchases: 10,
      spendCents: 40000,
      revenueCents: 140000,
      impressions: 4000,
      clicks: 200,
      checkouts: 19,
    });
    expect(model.cards[0].derived).toEqual({
      roas: 3.5,
      ctr: 0.05,
      cpcCents: 200,
      cpaCents: 4000,
      // 40000 centavos por 4.000 impressões.
      cpmCents: 10000,
    });
    expect(model.cards[3].metrics.purchases).toBe(1);
    expect(model.totalSales).toBe(11);
  });

  it("keeps supplied API ratios for one record, converting raw percentages and currency", () => {
    const { cards } = buildPlacementPerformance([
      {
        publisher_platform: "facebook",
        platform_position: "stories",
        spend: "200",
        revenue: "1000",
        purchases: "5",
        impressions: "10000",
        clicks: "100",
        roas: "4.9",
        ctr: "1.25",
        cpc: "1.8",
        cpa: "39.5",
      },
    ]);
    expect(cards[4].derived).toEqual({
      roas: 4.9,
      ctr: 0.0125,
      cpcCents: 180,
      cpaCents: 3950,
      // 20000 centavos por 10.000 impressões.
      cpmCents: 2000,
    });
  });

  it("uses stable largest remainders so rounded percentages close at exactly 100", () => {
    const model = buildPlacementPerformance([
      placement("feed", "instagram", { purchases: 1 }),
      placement("stories", "instagram", { purchases: 1 }),
      placement("feed", "facebook", { purchases: 1 }),
    ]);
    expect(model.cards.map((card) => card.percentage)).toEqual([
      34, 33, 0, 33, 0,
    ]);
  });

  it("represents absent positions as zeros without inventing known checkout data", () => {
    const empty = buildPlacementPerformance();
    expect(empty.cards).toHaveLength(PLACEMENT_DEFINITIONS.length);
    expect(empty.hasData).toBe(false);
    expect(empty.totalSales).toBe(0);
    for (const card of empty.cards) {
      expect(card.metrics.checkouts).toBe(0);
      expect(card.metrics.purchases).toBe(0);
      expect(card.percentage).toBe(0);
      expect(card.share).toBe(0);
      expect(card.derived.roas).toBeNull();
    }
    const unknownCheckout = buildPlacementPerformance([
      placement("feed", "instagram", { purchases: 1 }),
    ]);
    expect(unknownCheckout.cards[0].metrics.checkouts).toBeUndefined();
  });

  it("handles malformed and nonfinite inputs without leaking NaN or Infinity into cards", () => {
    const model = buildPlacementPerformance([
      null,
      undefined,
      [],
      "bad row",
      {
        plataforma: "instagram",
        id: "feed",
        metrics: {
          purchases: NaN,
          spendCents: -100,
          revenueCents: Infinity,
          impressions: "",
          clicks: "invalid",
          checkouts: -1,
        },
        derived: { roas: Infinity, ctr: NaN, cpaCents: -10 },
      },
    ]);
    expect(model.metrics).toEqual({
      spendCents: 0,
      revenueCents: 0,
      purchases: 0,
      impressions: 0,
      clicks: 0,
    });
    expect(model.cards[0].derived).toEqual({
      roas: null,
      ctr: null,
      cpcCents: null,
      cpaCents: null,
      cpmCents: null,
    });
    expect(model.cards.every((card) => card.percentage === 0)).toBe(true);
    expect(JSON.stringify(model)).not.toContain("NaN");
  });
});
