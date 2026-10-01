import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  adCampaigns,
  customers,
  ledgerEntries,
  orders,
  products,
  workspaces,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { emptyDashboardData } from "./empty-data";
import { observeDashboardRead } from "./read-observer";
import type {
  Campaign,
  NetworkId,
  ObservedRevenueDay,
  UnifiedDashboardData,
} from "./types";

type RawDay = {
  date: string;
  approved: string | number;
  pending: string | number;
  refused: string | number;
  orders: string | number;
  paid_orders: string | number;
};
const rowsOf = <T>(result: unknown): T[] =>
  Array.isArray(result) ? (result as T[]) : (result as { rows: T[] }).rows;
const PAID = sql`('paid', 'preparing', 'shipped', 'delivered', 'refunded', 'chargeback')`;

/** Bounded read model; no credentials or payment payloads ever leave the server. */
export async function getUnifiedDashboardData(
  now = new Date(),
): Promise<UnifiedDashboardData> {
  if (!isDatabaseConfigured()) return emptyDashboardData("unavailable", now);
  // Resolve authority before catching source failures: never hide a denied membership.
  const workspaceId = await getOrCreateDefaultWorkspace();
  try {
    return await readUnifiedDashboardData(workspaceId, now);
  } catch {
    return emptyDashboardData("error", now);
  }
}

export async function readUnifiedDashboardData(
  workspaceId: string,
  now = new Date(),
): Promise<UnifiedDashboardData> {
  const db = getDb();
  const start = new Date(now.getTime() - 366 * 86_400_000);
  const [workspace] = await observeDashboardRead("context", () =>
    db
      .select({ name: workspaces.name, settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  );
  const operationSettings = (
    workspace?.settings as
      { operation?: { currency?: unknown; timezone?: unknown } } | undefined
  )?.operation;
  const currency = operationSettings?.currency === "EUR" ? "EUR" : "BRL";
  const allowedZones = [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Fortaleza",
    "Europe/Lisbon",
    "UTC",
  ];
  const timeZone =
    typeof operationSettings?.timezone === "string" &&
    allowedZones.includes(operationSettings.timezone)
      ? operationSettings.timezone
      : "America/Sao_Paulo";
  const [
    dailyResult,
    paymentResult,
    catalog,
    recentOrders,
    clientRows,
    ledger,
    media,
  ] = await Promise.all([
    observeDashboardRead("daily-orders", () =>
      db.execute(sql`
      SELECT to_char(created_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS date,
        coalesce(sum(total_cents) FILTER (WHERE status IN ${PAID}), 0) AS approved,
        coalesce(sum(total_cents) FILTER (WHERE status IN ('created','awaiting_payment','processing')), 0) AS pending,
        coalesce(sum(total_cents) FILTER (WHERE status = 'refused'), 0) AS refused,
        count(*) AS orders, count(*) FILTER (WHERE status IN ${PAID}) AS paid_orders
      FROM orders WHERE workspace_id = ${workspaceId}::uuid AND currency = ${currency}
        AND created_at >= ${start.toISOString()}::timestamptz AND created_at <= ${now.toISOString()}::timestamptz
      GROUP BY 1 ORDER BY 1
    `),
    ),
    observeDashboardRead("daily-payments", () =>
      db.execute(sql`
      SELECT to_char(created_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS date,
        status::text AS status, count(*) AS count, coalesce(sum(amount_cents), 0) AS amount
      FROM payments WHERE workspace_id = ${workspaceId}::uuid AND currency = ${currency}
        AND created_at >= ${start.toISOString()}::timestamptz AND created_at <= ${now.toISOString()}::timestamptz
      GROUP BY 1, 2 ORDER BY 1
    `),
    ),
    observeDashboardRead("catalog", () =>
      db
        .select({
          id: products.id,
          name: products.name,
          type: products.type,
          price: products.priceCents,
          stock: products.stockQuantity,
          tracked: products.trackInventory,
          status: products.status,
        })
        .from(products)
        .where(
          and(
            eq(products.workspaceId, workspaceId),
            isNull(products.deletedAt),
            eq(products.currency, currency),
          ),
        )
        .orderBy(desc(products.createdAt))
        .limit(100),
    ),
    observeDashboardRead("recent-orders", () =>
      db
        .select({
          ref: orders.reference,
          customer: customers.firstName,
          total: orders.totalCents,
          status: orders.status,
          date: orders.createdAt,
        })
        .from(orders)
        .leftJoin(
          customers,
          and(
            eq(customers.id, orders.customerId),
            eq(customers.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(orders.workspaceId, workspaceId),
            eq(orders.currency, currency),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(100),
    ),
    observeDashboardRead("clients", () =>
      db
        .select({
          id: customers.id,
          name: customers.firstName,
          surname: customers.lastName,
          email: customers.email,
          optOut: customers.marketingOptOut,
          last: customers.lastPurchaseAt,
        })
        .from(customers)
        .where(
          and(
            eq(customers.workspaceId, workspaceId),
            isNull(customers.deletedAt),
          ),
        )
        .orderBy(desc(customers.createdAt))
        .limit(100),
    ),
    observeDashboardRead("ledger", () =>
      db
        .select({
          date: ledgerEntries.occurredAt,
          description: ledgerEntries.description,
          category: ledgerEntries.category,
          direction: ledgerEntries.direction,
          value: ledgerEntries.amountCents,
        })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.workspaceId, workspaceId),
            eq(ledgerEntries.currency, currency),
            eq(ledgerEntries.status, "confirmed"),
          ),
        )
        .orderBy(desc(ledgerEntries.occurredAt))
        .limit(100),
    ),
    observeDashboardRead("media", () =>
      db
        .select({
          id: adCampaigns.id,
          name: adCampaigns.name,
          network: adCampaigns.network,
          objective: adCampaigns.objective,
          spend: adCampaigns.spendCents,
          revenue: adCampaigns.revenueCents,
          purchases: adCampaigns.purchases,
          impressions: adCampaigns.impressions,
          clicks: adCampaigns.clicks,
          status: adCampaigns.status,
          syncedAt: adCampaigns.syncedAt,
        })
        .from(adCampaigns)
        .where(
          and(
            eq(adCampaigns.workspaceId, workspaceId),
            isNull(adCampaigns.deletedAt),
            ne(adCampaigns.source, "demo"),
            or(
              isNull(adCampaigns.objective),
              ne(adCampaigns.objective, "Exemplo"),
            ),
          ),
        )
        .orderBy(desc(adCampaigns.syncedAt))
        .limit(500),
    ),
  ]);
  const data = emptyDashboardData("unavailable", now);
  const revenueDays: ObservedRevenueDay[] = rowsOf<RawDay>(dailyResult).map(
    (r) => ({
      date: r.date,
      approved: Number(r.approved) / 100,
      pending: Number(r.pending) / 100,
      refused: Number(r.refused) / 100,
      orders: Number(r.orders),
      paidOrders: Number(r.paid_orders),
    }),
  );
  const recent = revenueDays.filter(
    (day) =>
      day.date >=
      new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10),
  );
  const approved = recent.reduce((sum, d) => sum + d.approved, 0);
  const paidOrders = recent.reduce((sum, d) => sum + d.paidOrders, 0);
  const orderCount = recent.reduce((sum, d) => sum + d.orders, 0);
  const operation = data.operations.alpha;
  operation.name = workspace?.name ?? "Operação";
  operation.status = "Dados registrados";
  operation.kpis.orders = orderCount;
  operation.kpis.ticket = paidOrders ? approved / paidOrders : 0;
  operation.kpis.approval = orderCount ? paidOrders / orderCount : 0;
  operation.campaigns = media.flatMap<Campaign>((row) => {
    if (!["meta", "google", "youtube"].includes(row.network) || !row.syncedAt)
      return [];
    return [
      {
        id: row.id,
        name: row.name,
        network: row.network as Exclude<NetworkId, "all">,
        objective: row.objective ?? "Não informado",
        spend: row.spend / 100,
        platformRevenue: row.revenue / 100,
        checkoutRevenue: 0,
        profit: 0,
        purchases: row.purchases,
        newCustomers: 0,
        impressions: row.impressions,
        clicks: row.clicks,
        hook: null,
        hold: null,
        frequency: 0,
        status: row.status,
      },
    ];
  });
  const customerTotals = clientRows.length
    ? rowsOf<{ id: string; orders: string; revenue: string }>(
        await observeDashboardRead("client-totals", () =>
          db.execute(sql`
    SELECT customer_id AS id, count(*) AS orders, coalesce(sum(total_cents) FILTER (WHERE status IN ${PAID}), 0) AS revenue
    FROM orders WHERE workspace_id = ${workspaceId}::uuid AND currency=${currency}
      AND customer_id IN (${sql.join(
        clientRows.map((c) => sql`${c.id}::uuid`),
        sql`,`,
      )}) GROUP BY customer_id
  `),
        ),
      )
    : [];
  const totalsByClient = new Map(customerTotals.map((c) => [c.id, c]));
  data.products = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    price: p.price / 100,
    stock: p.tracked ? String(p.stock) : "Não controlado",
    status: p.status,
  }));
  data.orders = recentOrders.map((o) => ({
    ref: o.ref,
    customer: o.customer ?? "Visitante",
    product: "Consultar pedido",
    total: o.total / 100,
    status: o.status,
    gateway: "Consultar pagamento",
    date: o.date.toISOString(),
  }));
  data.customers = clientRows.map((c) => ({
    name: [c.name, c.surname].filter(Boolean).join(" ") || "Cliente",
    email: c.email,
    orders: Number(totalsByClient.get(c.id)?.orders ?? 0),
    revenue: Number(totalsByClient.get(c.id)?.revenue ?? 0) / 100,
    consent: false,
    last: c.last?.toISOString() ?? "Sem compra",
  }));
  data.transactions = ledger.map((l) => ({
    date: l.date.toISOString(),
    description: l.description,
    category: l.category ?? "Sem categoria",
    type: l.direction === "in" ? "entrada" : "saida",
    value: l.value / 100,
  }));
  data.source = {
    status: "ready",
    asOf: now.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    currency,
    timeZone,
    revenueDays,
    paymentDays: rowsOf<{
      date: string;
      status: string;
      count: string | number;
      amount: string | number;
    }>(paymentResult).map((r) => ({
      date: r.date,
      status: r.status,
      count: Number(r.count),
      amount: Number(r.amount) / 100,
    })),
    mediaSyncedAt:
      media.find((m) => m.syncedAt)?.syncedAt?.toISOString() ?? null,
    note: `${currency} · ${timeZone} · pedidos por data de criação e estado atual. Outras moedas não são somadas a estes totais. Receita bruta de pedidos pagos não é saldo disponível nem lucro. Catálogo, clientes e livro-caixa são registros reais (listas limitadas aos 100 mais recentes). Métricas da mídia são snapshots do período da última sincronização, sem atribuição ao checkout.`,
    unavailableMetrics: [
      "cash",
      "contributionProfit",
      "margin",
      "ncCac",
      "mer",
      "netRevenue",
    ],
  };
  return data;
}
