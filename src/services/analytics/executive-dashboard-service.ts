import {
  acquisitionRows,
  buildExecutiveSnapshot,
  buildExecutiveSnapshotForSelection,
  campaignRows,
  cohortRows,
  creativeRows,
  customerEconomicsComparison,
  executiveRisks,
  financialBridge,
  periodAnchorFromDays,
  trendPoints,
  type AcquisitionRow,
  type CampaignRow,
  type CohortRow,
  type CreativeRow,
  type CustomerEconomics,
  type ExecutivePeriod,
  type ExecutiveRisk,
  type ExecutiveSnapshot,
  type FinancialBridgeStep,
  type TrendPoint,
} from "@/domain/analytics/executive-analytics";
import { funnelStages, type FunnelStage } from "@/domain/finance/demo-finance";
import type { DataFreshnessStatus } from "@/data/contracts/executive-dashboard";
import type { DemoRevenueDay } from "@/lib/demo-data";

export interface ExecutiveDashboardModel {
  snapshot: ExecutiveSnapshot;
  acquisition: AcquisitionRow[];
  campaigns: CampaignRow[];
  creatives: CreativeRow[];
  bridge: FinancialBridgeStep[];
  trend: TrendPoint[];
  cohorts: CohortRow[];
  /** Economia de cliente do período e do anterior, para comparar. */
  clientes: { atual: CustomerEconomics; anterior: CustomerEconomics };
  risks: ExecutiveRisk[];
  funnel: FunnelStage[];
  freshness: DataFreshnessStatus[];
}

const DEFAULT_FRESHNESS: DataFreshnessStatus[] = [
  {
    source: "checkout",
    label: "Checkout",
    completeness: 1,
    lastSuccessfulSync: null,
    latencyMinutes: 0,
    status: "healthy",
    note: "Fonte operacional principal.",
  },
  {
    source: "media",
    label: "Mídia",
    completeness: 0.96,
    lastSuccessfulSync: null,
    latencyMinutes: 5,
    status: "delayed",
    note: "Pode apresentar pequena latência.",
  },
  {
    source: "crm",
    label: "CRM / clientes",
    completeness: 0.88,
    lastSuccessfulSync: null,
    latencyMinutes: null,
    status: "estimated",
    note: "Coortes demonstrativas.",
  },
  {
    source: "costs",
    label: "Custos variáveis",
    completeness: 0.82,
    lastSuccessfulSync: null,
    latencyMinutes: null,
    status: "estimated",
    note: "Premissas demonstrativas.",
  },
];

function zeroNumericMetrics<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "number") {
        value[index] = 0;
      } else {
        zeroNumericMetrics(item);
      }
    });
    return value;
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === "number") {
      record[key] = 0;
    } else {
      zeroNumericMetrics(nested);
    }
  }
  return value;
}

/**
 * Caso de uso único da visão executiva. Calcula todas as leituras derivadas uma
 * única vez e entrega um view model estável para os componentes visuais.
 */
export function buildExecutiveDashboardModel(input: {
  days: DemoRevenueDay[];
  anchorDays?: DemoRevenueDay[];
  anchorDate?: string;
  period: ExecutivePeriod;
  selectedDates?: string[];
  freshness?: DataFreshnessStatus[];
}): ExecutiveDashboardModel {
  const anchorDate =
    input.anchorDate ??
    periodAnchorFromDays(
      input.anchorDays?.length ? input.anchorDays : input.days,
    );
  const freshness = (input.freshness ?? DEFAULT_FRESHNESS).map((item) => ({
    ...item,
  }));
  const sourceWeights: Record<DataFreshnessStatus["source"], number> = {
    checkout: 0.35,
    media: 0.3,
    crm: 0.2,
    costs: 0.15,
  };
  const weightedCompleteness = freshness.reduce(
    (sum, item) => sum + item.completeness * sourceWeights[item.source],
    0,
  );
  const baseSnapshot = input.selectedDates?.length
    ? buildExecutiveSnapshotForSelection(input.days, input.selectedDates)
    : buildExecutiveSnapshot(input.days, anchorDate, input.period);
  const snapshot: ExecutiveSnapshot = {
    ...baseSnapshot,
    dataQuality: Math.min(
      baseSnapshot.dataQuality,
      weightedCompleteness || baseSnapshot.dataQuality,
    ),
  };
  const acquisition = acquisitionRows(snapshot.days);

  const model: ExecutiveDashboardModel = {
    snapshot,
    acquisition,
    campaigns: campaignRows(snapshot, acquisition),
    creatives: creativeRows(snapshot, acquisition),
    bridge: financialBridge(snapshot),
    trend: trendPoints(snapshot),
    cohorts: cohortRows(snapshot),
    clientes: customerEconomicsComparison(snapshot),
    risks: executiveRisks(snapshot, acquisition),
    funnel: funnelStages(snapshot.days),
    freshness,
  };

  const hasBusinessData = input.days.some(
    (day) =>
      day.aprovada !== 0 ||
      day.pendente !== 0 ||
      day.recusada !== 0 ||
      day.pedidos !== 0,
  );

  return hasBusinessData ? model : zeroNumericMetrics(model);
}
