import { clamp, safeDivide } from "@/domain/shared/math";

export type BudgetAction = "Escalar" | "Manter" | "Reduzir" | "Validar";

/** Receita atribuída à mídia dividida pelo investimento em mídia. */
export function calculateRoas(
  attributedRevenue: number,
  mediaSpend: number,
): number {
  return safeDivide(attributedRevenue, mediaSpend);
}

/** Lucro obtido dividido pelo investimento total. */
export function calculateRoi(profit: number, totalInvestment: number): number {
  return safeDivide(profit, totalInvestment);
}

export interface SaturationInput {
  spendShare: number;
  revenueShare: number;
  frequency: number;
}

/** Índice operacional de saturação entre 0,28 e 1,15. */
export function estimateSaturation(input: SaturationInput): number {
  return clamp(
    0.42 +
      input.spendShare * 0.54 +
      Math.max(0, input.spendShare - input.revenueShare) * 1.4 +
      input.frequency * 0.045,
    0.28,
    1.15,
  );
}

export function estimateMarginalRoas(
  roas: number,
  incrementalFactor: number,
  saturation: number,
): number {
  return roas * incrementalFactor * Math.max(0.46, 1.12 - saturation * 0.42);
}

export function recommendBudgetAction(input: {
  confidence: number;
  marginalRoas: number;
  saturation: number;
}): BudgetAction {
  if (input.confidence < 0.8) return "Validar";
  if (input.marginalRoas >= 1.55 && input.saturation < 0.78) return "Escalar";
  if (input.marginalRoas < 1.05 || input.saturation > 0.98) return "Reduzir";
  return "Manter";
}
