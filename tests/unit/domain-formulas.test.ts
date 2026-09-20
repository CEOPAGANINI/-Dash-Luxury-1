import { describe, expect, it } from "vitest";

import {
  calculateContribution,
  calculateMer,
  calculateNcCac,
  calculatePaybackPurchases,
} from "@/domain/finance";
import {
  calculateRoas,
  calculateRoi,
  estimateMarginalRoas,
  estimateSaturation,
  recommendBudgetAction,
} from "@/domain/marketing";
import { estimateLtv90 } from "@/domain/customers";

describe("fórmulas financeiras centrais", () => {
  it("fecha receita líquida, custos e contribuição", () => {
    const result = calculateContribution({
      approvedRevenue: 100_000,
      mediaSpend: 30_000,
      gatewayFees: 5_000,
      productCost: 7_000,
      refunds: 2_000,
      chargebacks: 1_000,
      taxes: 4_000,
    });

    expect(result.netRevenue).toBe(97_000);
    expect(result.totalVariableCosts).toBe(46_000);
    expect(result.contributionProfit).toBe(51_000);
    expect(result.contributionMargin).toBeCloseTo(0.51);
  });

  it("mantém MER, ROAS e ROI como conceitos separados", () => {
    expect(calculateMer(100_000, 25_000)).toBe(4);
    expect(calculateRoas(80_000, 25_000)).toBe(3.2);
    expect(calculateRoi(20_000, 25_000)).toBe(0.8);
  });

  it("calcula NC-CAC e payback sem divisão insegura", () => {
    expect(calculateNcCac(20_000, 100)).toBe(200);
    expect(calculatePaybackPurchases(200, 80)).toBe(2.5);
    expect(calculateNcCac(20_000, 0)).toBe(0);
  });
});

describe("decisão de mídia", () => {
  it("reduz escala quando há saturação", () => {
    const saturation = estimateSaturation({
      spendShare: 0.6,
      revenueShare: 0.35,
      frequency: 4.2,
    });
    const marginalRoas = estimateMarginalRoas(1.4, 0.8, saturation);
    expect(
      recommendBudgetAction({ confidence: 0.9, marginalRoas, saturation }),
    ).toBe("Reduzir");
  });

  it("estima LTV sem misturar com receita inicial", () => {
    expect(estimateLtv90(200, 0.25)).toBeGreaterThan(200);
  });
});
