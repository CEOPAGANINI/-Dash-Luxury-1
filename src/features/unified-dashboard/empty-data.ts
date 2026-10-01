import type { UnifiedDashboardData } from "./types";

export function emptyDashboardData(
  status: "unavailable" | "error" = "unavailable",
  now = new Date(),
): UnifiedDashboardData {
  const asOf = now.toISOString();
  return {
    operations: {
      alpha: {
        id: "alpha",
        name: "Operação",
        product: "Catálogo",
        offer: "Sem seleção",
        owner: "Workspace",
        status: "Sem dados",
        confidence: 0,
        kpis: {
          cash: 0,
          netRevenue: 0,
          contributionProfit: 0,
          margin: 0,
          mer: 0,
          ncCac: 0,
          orders: 0,
          approval: 0,
          ticket: 0,
        },
        networks: [],
        campaigns: [],
        funnels: {
          operation: {
            id: "operation",
            name: "Funil da operação",
            type: "Sem rastreamento consolidado",
            stages: [],
            demographics: [],
            video: [],
          },
        },
      },
    },
    products: [],
    orders: [],
    customers: [],
    transactions: [],
    notifications: [],
    source: {
      status,
      asOf,
      startDate: asOf.slice(0, 10),
      revenueDays: [],
      mediaSyncedAt: null,
      note:
        status === "error"
          ? "Não foi possível consultar os dados. Tente novamente; valores ausentes não representam zero."
          : "Conecte a fonte de dados para consultar a operação. Nenhum dado demonstrativo é usado como resultado real.",
      unavailableMetrics: [
        "cash",
        "contributionProfit",
        "margin",
        "ncCac",
        "mer",
        "netRevenue",
      ],
    },
  };
}
