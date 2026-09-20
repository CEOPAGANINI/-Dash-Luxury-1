import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orderItems, orders } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export type CartState = "abandoned" | "recovered" | "expired";

export interface AbandonedCartRow {
  orderId: string;
  reference: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  productName: string | null;
  quantity: number | null;
  totalCents: number;
  currency: string;
  status: string;
  state: CartState;
  createdAt: Date;
  /** Horas desde a criação — ajuda a decidir quando contactar */
  hoursSince: number;
}

export interface CartsSummary {
  abandonedCount: number;
  abandonedValueCents: number;
  recoveredCount: number;
  recoveryRate: number;
}

/** Pedidos que ficaram por pagar. */
const PENDING_STATUSES = ["created", "awaiting_payment", "processing"];
const LOST_STATUSES = ["expired", "cancelled", "refused"];

/**
 * "Carrinhos" reais desta operação: pedidos criados no checkout que nunca
 * chegaram a pagamento confirmado.
 *
 * Aqui não há carrinho de compras clássico — o cliente vai direto da landing
 * ao checkout —, por isso o abandono relevante é o pedido gerado e não pago
 * (sobretudo Multibanco, cuja referência pode ficar dias por liquidar).
 */
export async function listAbandonedCarts(
  limit = 100,
): Promise<AbandonedCartRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      status: orders.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
      customerFirst: customers.firstName,
      customerLast: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.workspaceId, workspaceId),
        sql`${orders.status} not in ('paid','shipped','delivered','refunded','chargeback')`,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  const seen = new Set<string>();
  const result: AbandonedCartRow[] = [];

  for (const r of rows) {
    if (seen.has(r.orderId)) continue;
    seen.add(r.orderId);

    const hoursSince = Math.floor(
      (Date.now() - new Date(r.createdAt).getTime()) / 3_600_000,
    );

    result.push({
      orderId: r.orderId,
      reference: r.reference,
      customerName:
        [r.customerFirst, r.customerLast].filter(Boolean).join(" ") || null,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      productName: r.productName,
      quantity: r.quantity,
      totalCents: Number(r.totalCents),
      currency: r.currency,
      status: r.status,
      state: LOST_STATUSES.includes(r.status) ? "expired" : "abandoned",
      createdAt: r.createdAt,
      hoursSince,
    });
  }

  return result;
}

/**
 * Resumo: quanto está parado por pagar e qual a taxa de recuperação
 * (pedidos pagos ÷ total de pedidos criados).
 */
export async function getCartsSummary(
  abandoned: AbandonedCartRow[],
): Promise<CartsSummary> {
  const pending = abandoned.filter((c) => c.state === "abandoned");
  const abandonedValueCents = pending.reduce((s, c) => s + c.totalCents, 0);

  if (!isDatabaseConfigured()) {
    return {
      abandonedCount: pending.length,
      abandonedValueCents,
      recoveredCount: 0,
      recoveryRate: 0,
    };
  }

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${orders.status} in ('paid','shipped','delivered'))::int`,
    })
    .from(orders)
    .where(eq(orders.workspaceId, workspaceId));

  const total = totals?.total ?? 0;
  const paid = totals?.paid ?? 0;

  return {
    abandonedCount: pending.length,
    abandonedValueCents,
    recoveredCount: paid,
    recoveryRate: total > 0 ? paid / total : 0,
  };
}

export { PENDING_STATUSES, LOST_STATUSES };
