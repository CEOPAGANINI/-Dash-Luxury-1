import { desc, eq } from "drizzle-orm";

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
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.workspaceId, workspaceId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);

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
  const paid = rows.filter((r) => r.status === "paid");
  const awaiting = rows.filter(
    (r) => r.status === "awaiting_payment" || r.status === "created",
  );
  return {
    totalOrders: rows.length,
    paidOrders: paid.length,
    awaitingOrders: awaiting.length,
    paidRevenueCents: paid.reduce((s, r) => s + r.totalCents, 0),
    awaitingRevenueCents: awaiting.reduce((s, r) => s + r.totalCents, 0),
  };
}
