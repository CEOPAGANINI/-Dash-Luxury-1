import type {
  DataFreshnessStatus,
  ExecutiveAnalyticsDataSet,
  ExecutiveAnalyticsQuery,
} from "@/data/contracts/executive-dashboard";
import type { ExecutiveAnalyticsRepository } from "@/data/repositories/executive-analytics-repository";
import type { DemoRevenueDay } from "@/lib/demo-data";

const DEMO_FRESHNESS: DataFreshnessStatus[] = [
  {
    source: "checkout",
    label: "Checkout",
    completeness: 1,
    lastSuccessfulSync: null,
    latencyMinutes: 0,
    status: "healthy",
    note: "Dados demonstrativos completos.",
  },
  {
    source: "media",
    label: "Plataformas de mídia",
    completeness: 0.96,
    lastSuccessfulSync: null,
    latencyMinutes: 5,
    status: "delayed",
    note: "Latência demonstrativa inferior a cinco minutos.",
  },
  {
    source: "crm",
    label: "CRM e clientes",
    completeness: 0.88,
    lastSuccessfulSync: null,
    latencyMinutes: null,
    status: "estimated",
    note: "Novos clientes, recorrência e LTV são estimados no modo demo.",
  },
  {
    source: "costs",
    label: "Custos variáveis",
    completeness: 0.82,
    lastSuccessfulSync: null,
    latencyMinutes: null,
    status: "estimated",
    note: "Taxas, produto, reembolso e chargeback usam premissas demonstrativas.",
  },
];

export class DemoExecutiveAnalyticsRepository implements ExecutiveAnalyticsRepository {
  constructor(private readonly days: readonly DemoRevenueDay[]) {}

  async getExecutiveData(
    query: ExecutiveAnalyticsQuery,
  ): Promise<ExecutiveAnalyticsDataSet> {
    const revenueDays = this.days.filter(
      (day) => day.date >= query.startDate && day.date <= query.endDate,
    );

    return {
      revenueDays: [...revenueDays],
      freshness: DEMO_FRESHNESS.map((source) => ({ ...source })),
      generatedAt: new Date().toISOString(),
      demoMode: true,
    };
  }
}
