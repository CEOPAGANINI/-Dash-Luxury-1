import type { ProfitGuardrails } from "@/features/guardrails/rules";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import {
  derivadas,
  STATUS_LABEL,
  type CampaignRow,
  type AdMetrics,
} from "./types";

const money = (cents: number) => formatCurrency(cents / 100, 2);
export const divide = (numerator: number, denominator: number) =>
  denominator > 0 && Number.isFinite(numerator / denominator)
    ? numerator / denominator
    : null;

/** Only observed quantities and configured thresholds; no market benchmarks or inferred causes. */
export function campaignInsights(
  campaign: CampaignRow,
  rules: ProfitGuardrails,
) {
  const m = campaign.metrics;
  const d = derivadas(m);
  const conversion = divide(m.purchases, m.clicks);
  const ticketCents = divide(m.revenueCents, m.purchases);
  const resultCents = m.revenueCents - m.spendCents;
  const findings: { title: string; evidence: string; next: string }[] = [];
  findings.push({
    title: `Veiculação: ${STATUS_LABEL[campaign.status].toLowerCase()}`,
    evidence: `O período disponível registra ${money(m.spendCents)} em mídia e ${formatInteger(m.purchases)} compras atribuídas. Pausar não apaga o histórico.`,
    next: "O estado atual não informa em quais dias houve entrega. Consulte a plataforma para conferir o histórico de veiculação.",
  });
  findings.push({
    title:
      d.roas === null
        ? "Sem investimento para calcular o retorno"
        : d.roas < 1
          ? "A receita atribuída não cobriu a mídia"
          : d.roas < rules.roasMinimo
            ? "Retorno abaixo do mínimo configurado"
            : "Retorno no mínimo configurado ou acima",
    evidence:
      d.roas === null
        ? "ROAS e CPA não devem ser interpretados como desempenho saudável sem investimento registrado."
        : `Receita ${money(m.revenueCents)} menos mídia ${money(m.spendCents)} = ${money(resultCents)}. ROAS ${formatRatio(d.roas)}; mínimo configurado ${formatRatio(rules.roasMinimo)}.`,
    next: "Este saldo não é lucro líquido: produto, taxas e impostos não estão disponíveis. Não é possível recomendar escala só com estes dados.",
  });
  findings.push({
    title:
      m.clicks === 0
        ? "Nenhum clique registrado"
        : m.purchases === 0
          ? "Cliques registrados, sem compras atribuídas"
          : "Conversão observada da campanha",
    evidence: `${formatInteger(m.impressions)} impressões, ${formatInteger(m.clicks)} cliques e ${formatInteger(m.purchases)} compras. CTR ${d.ctr === null ? "indisponível" : formatPercent(d.ctr, 2)}; compras por clique ${conversion === null ? "indisponível" : formatPercent(conversion, 2)}.`,
    next: "Confira a mensuração e a janela de atribuição. Esses totais não identificam sozinhos um problema de criativo, público ou checkout.",
  });
  return { derived: d, conversion, ticketCents, resultCents, findings };
}

export function campaignFunnel(m: AdMetrics) {
  const counts = [m.impressions, m.clicks, m.purchases];
  const largest = Math.max(...counts, 0);
  return {
    nonSequential: m.clicks > m.impressions || m.purchases > m.clicks,
    stages: ["Impressões", "Cliques", "Compras atribuídas"].map(
      (label, index) => ({
        label,
        count: counts[index],
        width: largest > 0 ? (counts[index] / largest) * 100 : 0,
        rate: index === 0 ? null : divide(counts[index], counts[index - 1]),
      }),
    ),
  };
}

export interface CampaignScenario {
  investment: string;
  cpc: string;
  ctr: string;
  conversion: string;
  ticket: string;
}

const inputValue = (value: number | null, digits = 4) =>
  value === null ? "" : String(Number(value.toFixed(digits)));
export function scenarioFromMetrics(m: AdMetrics): CampaignScenario {
  return {
    investment: inputValue(m.spendCents / 100, 2),
    cpc: inputValue(
      m.clicks > 0 && m.spendCents > 0 ? m.spendCents / m.clicks / 100 : null,
    ),
    ctr: inputValue(
      m.impressions > 0 && m.clicks > 0 && m.clicks <= m.impressions
        ? (m.clicks / m.impressions) * 100
        : null,
    ),
    conversion: inputValue(
      m.clicks > 0 && m.purchases <= m.clicks
        ? (m.purchases / m.clicks) * 100
        : null,
    ),
    ticket: inputValue(
      m.purchases > 0 ? m.revenueCents / m.purchases / 100 : null,
      2,
    ),
  };
}

export const SCENARIO_FIELDS = [
  {
    key: "investment",
    label: "Investimento simulado (R$)",
    min: 0,
    max: 1_000_000,
  },
  { key: "cpc", label: "CPC previsto (R$)", min: 0.0001, max: 1_000_000 },
  { key: "ctr", label: "CTR previsto (%)", min: 0.0001, max: 100 },
  { key: "conversion", label: "Compras por clique (%)", min: 0, max: 100 },
  {
    key: "ticket",
    label: "Ticket médio previsto (R$)",
    min: 0,
    max: 1_000_000,
  },
] as const;

/** Expected counts are continuous, not promises of integer sales. Never writes campaign state. */
export function calculateCampaignScenario(input: CampaignScenario) {
  const errors: Partial<Record<keyof CampaignScenario, string>> = {};
  for (const field of SCENARIO_FIELDS) {
    const n = Number(input[field.key]);
    if (
      !input[field.key].trim() ||
      !Number.isFinite(n) ||
      n < field.min ||
      n > field.max
    ) {
      errors[field.key] =
        `Informe um valor entre ${field.min.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} e ${field.max.toLocaleString("pt-BR")}.`;
    }
  }
  if (Object.keys(errors).length) return { errors, projection: null };
  const investment = Number(input.investment);
  const clicks = investment / Number(input.cpc);
  const impressions = clicks / (Number(input.ctr) / 100);
  const purchases = (clicks * Number(input.conversion)) / 100;
  const revenue = purchases * Number(input.ticket);
  return {
    errors,
    projection: {
      investment,
      impressions,
      clicks,
      purchases,
      revenue,
      roas: divide(revenue, investment),
      cpa: divide(investment, purchases),
      result: revenue - investment,
    },
  };
}
