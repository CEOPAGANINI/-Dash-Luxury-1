import {
  formatCompactCurrency,
  formatInteger,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { derivadas, type AdMetrics } from "./types";

export function CampaignMetrics({
  metrics,
  compact = false,
}: {
  metrics: AdMetrics;
  compact?: boolean;
}) {
  const d = derivadas(metrics);
  const items = [
    ["Investimento", formatCompactCurrency(metrics.spendCents / 100)],
    ["Receita", formatCompactCurrency(metrics.revenueCents / 100)],
    ["Compras", formatInteger(metrics.purchases)],
    ["ROAS", d.roas === null ? "—" : formatRatio(d.roas)],
  ];
  return (
    <dl
      className={
        compact
          ? "campaign-metrics campaign-metrics-compact"
          : "campaign-metrics"
      }
      aria-label="Indicadores de campanhas"
    >
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
