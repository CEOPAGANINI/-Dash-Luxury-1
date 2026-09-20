import { safeDivide } from "@/domain/shared/math";

export interface ContributionInput {
  approvedRevenue: number;
  mediaSpend: number;
  gatewayFees: number;
  productCost: number;
  refunds: number;
  chargebacks: number;
  discounts?: number;
  taxes?: number;
  otherVariableCosts?: number;
}

export interface ContributionResult {
  netRevenue: number;
  totalVariableCosts: number;
  contributionProfit: number;
  contributionMargin: number;
}

/**
 * Calcula a ponte financeira sem misturar receita, caixa e lucro.
 * Todos os valores devem usar a mesma unidade monetária.
 */
export function calculateContribution(
  input: ContributionInput,
): ContributionResult {
  const discounts = input.discounts ?? 0;
  const taxes = input.taxes ?? 0;
  const otherVariableCosts = input.otherVariableCosts ?? 0;
  const netRevenue =
    input.approvedRevenue - input.refunds - input.chargebacks - discounts;
  const totalVariableCosts =
    input.mediaSpend +
    input.gatewayFees +
    input.productCost +
    taxes +
    otherVariableCosts;
  const contributionProfit = netRevenue - totalVariableCosts;

  return {
    netRevenue,
    totalVariableCosts,
    contributionProfit,
    contributionMargin: safeDivide(contributionProfit, input.approvedRevenue),
  };
}

/** MER usa uma base explicitamente definida pela empresa. */
export function calculateMer(revenueBase: number, mediaSpend: number): number {
  return safeDivide(revenueBase, mediaSpend);
}

/** Custo de aquisição de novos clientes. */
export function calculateNcCac(
  mediaSpend: number,
  newCustomers: number,
): number {
  return safeDivide(mediaSpend, newCustomers);
}

/** Quantidade de compras necessárias para amortizar o NC-CAC. */
export function calculatePaybackPurchases(
  ncCac: number,
  contributionPerPurchaseBeforeMedia: number,
): number {
  return contributionPerPurchaseBeforeMedia > 0
    ? ncCac / contributionPerPurchaseBeforeMedia
    : Number.POSITIVE_INFINITY;
}
