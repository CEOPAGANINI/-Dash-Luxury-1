import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orderItems, orders, payments } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  productName: string | null;
  quantity: number | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
}

export interface OrdersSummary {
  totalOrders: number;
  paidOrders: number;
  awaitingOrders: number;
  paidRevenueCents: number;
  awaitingRevenueCents: number;
  paidByCurrency: Record<string, number>;
  awaitingByCurrency: Record<string, number>;
}

/**
 * Lista os pedidos do workspace, com cliente, primeiro item e pagamento.
 * Retorna lista vazia quando o banco não está configurado — nunca dados
 * fictícios.
 */
export async function listOrders(limit = 100): Promise<OrderRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const count = Number.isFinite(limit)
    ? Math.max(1, Math.min(200, Math.trunc(limit)))
    : 100;
  const ids = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.workspaceId, workspaceId))
    .orderBy(desc(orders.createdAt))
    .limit(count);
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      customerName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      paymentMethod: payments.method,
      paymentStatus: payments.status,
    })
    .from(orders)
    .leftJoin(
      customers,
      and(
        eq(orders.customerId, customers.id),
        eq(customers.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      orderItems,
      and(
        eq(orderItems.orderId, orders.id),
        eq(orderItems.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      payments,
      and(
        eq(payments.orderId, orders.id),
        eq(payments.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        inArray(
          orders.id,
          ids.map((item) => item.id),
        ),
      ),
    )
    .orderBy(
      desc(orders.createdAt),
      desc(payments.createdAt),
      orderItems.createdAt,
      orderItems.id,
    );

  // O join com itens/pagamentos pode duplicar o pedido: mantém a 1ª linha.
  const seen = new Set<string>();
  const result: OrderRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    result.push({
      id: r.id,
      reference: r.reference,
      status: r.status,
      totalCents: Number(r.totalCents),
      currency: r.currency,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      customerName:
        [r.customerName, r.customerLastName].filter(Boolean).join(" ") || null,
      customerEmail: r.customerEmail,
      productName: r.productName,
      quantity: r.quantity,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
    });
  }
  return result;
}

export function summarizeOrders(rows: OrderRow[]): OrdersSummary {
  const paid = rows.filter((r) =>
    ["paid", "preparing", "shipped", "delivered"].includes(r.status),
  );
  const awaiting = rows.filter((r) =>
    ["awaiting_payment", "created", "processing"].includes(r.status),
  );
  const group = (items: OrderRow[]) => {
    const totals: Record<string, number> = {};
    for (const row of items)
      totals[row.currency] = (totals[row.currency] ?? 0) + row.totalCents;
    return totals;
  };
  const paidByCurrency = group(paid);
  const awaitingByCurrency = group(awaiting);
  const singleCurrencyTotal = (totals: Record<string, number>) =>
    Object.keys(totals).length === 1 ? Object.values(totals)[0] : 0;
  return {
    totalOrders: rows.length,
    paidOrders: paid.length,
    awaitingOrders: awaiting.length,
    paidRevenueCents: singleCurrencyTotal(paidByCurrency),
    awaitingRevenueCents: singleCurrencyTotal(awaitingByCurrency),
    paidByCurrency,
    awaitingByCurrency,
  };
}
