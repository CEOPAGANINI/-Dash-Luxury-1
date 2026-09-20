import { and, asc, eq, gte, lte } from "drizzle-orm";

import type {
  DataFreshnessStatus,
  ExecutiveAnalyticsDataSet,
  ExecutiveAnalyticsQuery,
} from "@/data/contracts/executive-dashboard";
import type { ExecutiveAnalyticsRepository } from "@/data/repositories/executive-analytics-repository";
import { getDb } from "@/database/client";
import { analyticsSourceSyncs, dailyBusinessMetrics } from "@/database/schema";

const SOURCE_LABELS: Record<DataFreshnessStatus["source"], string> = {
  checkout: "Checkout",
  media: "Plataformas de mídia",
  crm: "CRM e clientes",
  costs: "Custos variáveis",
};

function toSource(value: string): DataFreshnessStatus["source"] | null {
  if (
    value === "checkout" ||
    value === "media" ||
    value === "crm" ||
    value === "costs"
  ) {
    return value;
  }
  return null;
}

function toFreshnessStatus(value: string): DataFreshnessStatus["status"] {
  if (value === "healthy" || value === "delayed" || value === "estimated")
    return value;
  return "unavailable";
}

/** Implementação real para a Fase 5. Toda a consulta fica fora dos componentes React. */
export class DrizzleExecutiveAnalyticsRepository implements ExecutiveAnalyticsRepository {
  async getExecutiveData(
    query: ExecutiveAnalyticsQuery,
  ): Promise<ExecutiveAnalyticsDataSet> {
    const db = getDb();

    const [metricRows, syncRows] = await Promise.all([
      db
        .select()
        .from(dailyBusinessMetrics)
        .where(
          and(
            eq(dailyBusinessMetrics.workspaceId, query.workspaceId),
            gte(dailyBusinessMetrics.metricDate, query.startDate),
            lte(dailyBusinessMetrics.metricDate, query.endDate),
          ),
        )
        .orderBy(asc(dailyBusinessMetrics.metricDate)),
      db
        .select()
        .from(analyticsSourceSyncs)
        .where(eq(analyticsSourceSyncs.workspaceId, query.workspaceId)),
    ]);

    const freshness = syncRows.flatMap<DataFreshnessStatus>((row) => {
      const source = toSource(row.source);
      if (!source) return [];
      return [
        {
          source,
          label: SOURCE_LABELS[source],
          completeness: Number(row.completeness),
          lastSuccessfulSync: row.lastSuccessfulSync?.toISOString() ?? null,
          latencyMinutes: row.latencyMinutes,
          status: toFreshnessStatus(row.status),
          note: row.message ?? "Sem observações adicionais.",
        },
      ];
    });

    return {
      revenueDays: metricRows.map((row) => ({
        date: row.metricDate,
        day: `${row.metricDate.slice(8, 10)}/${row.metricDate.slice(5, 7)}`,
        aprovada: row.approvedRevenueCents / 100,
        pendente: row.pendingRevenueCents / 100,
        recusada: row.declinedRevenueCents / 100,
        pedidos: row.orders,
        tempoAprovacaoSeg: 0,
      })),
      freshness,
      generatedAt: new Date().toISOString(),
      demoMode: false,
    };
  }
}
