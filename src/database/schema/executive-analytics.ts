import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { workspaces } from "./workspaces";

/**
 * Fato financeiro diário usado pela dashboard executiva.
 * Valores monetários permanecem em centavos para evitar erro de ponto flutuante.
 */
export const dailyBusinessMetrics = pgTable(
  "daily_business_metrics",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metricDate: date("metric_date").notNull(),
    currency: text("currency").default("BRL").notNull(),

    processedVolumeCents: bigint("processed_volume_cents", { mode: "number" })
      .default(0)
      .notNull(),
    approvedRevenueCents: bigint("approved_revenue_cents", { mode: "number" })
      .default(0)
      .notNull(),
    pendingRevenueCents: bigint("pending_revenue_cents", { mode: "number" })
      .default(0)
      .notNull(),
    declinedRevenueCents: bigint("declined_revenue_cents", { mode: "number" })
      .default(0)
      .notNull(),
    settledCashCents: bigint("settled_cash_cents", { mode: "number" })
      .default(0)
      .notNull(),
    refundsCents: bigint("refunds_cents", { mode: "number" })
      .default(0)
      .notNull(),
    chargebacksCents: bigint("chargebacks_cents", { mode: "number" })
      .default(0)
      .notNull(),
    discountsCents: bigint("discounts_cents", { mode: "number" })
      .default(0)
      .notNull(),
    gatewayFeesCents: bigint("gateway_fees_cents", { mode: "number" })
      .default(0)
      .notNull(),
    taxesCents: bigint("taxes_cents", { mode: "number" }).default(0).notNull(),
    mediaSpendCents: bigint("media_spend_cents", { mode: "number" })
      .default(0)
      .notNull(),
    productCostCents: bigint("product_cost_cents", { mode: "number" })
      .default(0)
      .notNull(),
    otherVariableCostsCents: bigint("other_variable_costs_cents", {
      mode: "number",
    })
      .default(0)
      .notNull(),
    contributionProfitCents: bigint("contribution_profit_cents", {
      mode: "number",
    })
      .default(0)
      .notNull(),

    orders: integer("orders").default(0).notNull(),
    newCustomers: integer("new_customers").default(0).notNull(),
    recurringCustomers: integer("recurring_customers").default(0).notNull(),
    approvedPayments: integer("approved_payments").default(0).notNull(),
    declinedPayments: integer("declined_payments").default(0).notNull(),

    /** 0 a 1. A UI deve exibir a confiança junto da métrica. */
    completeness: numeric("completeness", { precision: 5, scale: 4 })
      .default("0")
      .notNull(),
    dataStatus: text("data_status").default("provisional").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("daily_business_metrics_ws_date_currency_uidx").on(
      table.workspaceId,
      table.metricDate,
      table.currency,
    ),
    index("daily_business_metrics_ws_date_idx").on(
      table.workspaceId,
      table.metricDate,
    ),
  ],
);

/** Estado de sincronização das fontes que alimentam o painel. */
export const analyticsSourceSyncs = pgTable(
  "analytics_source_syncs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    status: text("status").default("unavailable").notNull(),
    completeness: numeric("completeness", { precision: 5, scale: 4 })
      .default("0")
      .notNull(),
    latencyMinutes: integer("latency_minutes"),
    lastSuccessfulSync: timestamp("last_successful_sync", {
      withTimezone: true,
    }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    message: text("message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("analytics_source_syncs_ws_source_uidx").on(
      table.workspaceId,
      table.source,
    ),
    index("analytics_source_syncs_ws_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);
