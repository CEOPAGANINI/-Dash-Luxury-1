import { describe, expect, it } from "vitest";
import {
  calculateCampaignScenario,
  campaignFunnel,
  campaignInsights,
  scenarioFromMetrics,
} from "@/features/ads/campaign-insights-model";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { METRICAS_ZERADAS } from "@/features/ads/types";

const input = {
  investment: "1000",
  cpc: "2",
  ctr: "5",
  conversion: "4",
  ticket: "100",
};
describe("per-campaign metrics, factual diagnosis and hypothetical funnel", () => {
  it("calculates a coherent scenario without mutating inputs", () => {
    const before = structuredClone(input);
    expect(calculateCampaignScenario(input).projection).toEqual({
      investment: 1000,
      impressions: 10000,
      clicks: 500,
      purchases: 20,
      revenue: 2000,
      roas: 2,
      cpa: 50,
      result: 1000,
    });
    expect(input).toEqual(before);
  });
  it.each(["", "-1", "Infinity", "NaN", "1000001"])(
    "rejects invalid investment %s without stale projections",
    (value) => {
      const result = calculateCampaignScenario({ ...input, investment: value });
      expect(result.projection).toBeNull();
      expect(result.errors.investment).toBeTruthy();
    },
  );
  it("rejects impossible percentages and zero click cost", () => {
    expect(
      calculateCampaignScenario({
        ...input,
        ctr: "101",
        conversion: "101",
        cpc: "0",
      }).projection,
    ).toBeNull();
  });
  it("keeps zero investment and zero conversions distinct from undefined ratios", () => {
    const zero = calculateCampaignScenario({
      ...input,
      investment: "0",
    }).projection!;
    expect(zero.revenue).toBe(0);
    expect(zero.roas).toBeNull();
    expect(zero.cpa).toBeNull();
    const none = calculateCampaignScenario({
      ...input,
      conversion: "0",
    }).projection!;
    expect(none.result).toBe(-1000);
    expect(none.roas).toBe(0);
    expect(none.cpa).toBeNull();
  });
  it("leaves missing assumptions blank and empty funnel bars at zero", () => {
    expect(scenarioFromMetrics(METRICAS_ZERADAS)).toEqual({
      investment: "0",
      cpc: "",
      ctr: "",
      conversion: "",
      ticket: "",
    });
    expect(
      campaignFunnel(METRICAS_ZERADAS).stages.every(
        (s) => s.width === 0 && s.rate === null,
      ),
    ).toBe(true);
  });
  it("does not disguise non-sequential attribution with invented intermediate stages", () => {
    const result = campaignFunnel({
      ...METRICAS_ZERADAS,
      impressions: 10,
      clicks: 20,
      purchases: 30,
    });
    expect(result.nonSequential).toBe(true);
    expect(result.stages.map((s) => s.count)).toEqual([10, 20, 30]);
    expect(result.stages.every((s) => s.width <= 100)).toBe(true);
    expect(result.stages[2].rate).toBe(1.5);
  });
  it("uses this campaign's figures and configured ROAS, not market benchmarks", () => {
    const c = demoCampaignRows()[0];
    const reading = campaignInsights(c, {
      ...GUARDRAILS_PADRAO,
      roasMinimo: 3,
    });
    expect(reading.derived.roas).toBe(
      c.metrics.revenueCents / c.metrics.spendCents,
    );
    expect(reading.findings[1].title).toBe(
      "Retorno abaixo do mínimo configurado",
    );
    expect(reading.findings[1].evidence).toContain("3,00x");
    expect(reading.findings[1].next).toContain("não é lucro líquido");
    expect(reading.findings[2].next).toContain("não identificam sozinhos");
  });
  it("does not describe a ROAS above one as a media loss, or zero history as healthy", () => {
    const c = demoCampaignRows()[0];
    expect(
      campaignInsights(c, { ...GUARDRAILS_PADRAO, roasMinimo: 5 }).findings[1]
        .title,
    ).not.toContain("não cobriu");
    expect(
      campaignInsights({ ...c, metrics: METRICAS_ZERADAS }, GUARDRAILS_PADRAO)
        .findings[1].title,
    ).toBe("Sem investimento para calcular o retorno");
  });
});
