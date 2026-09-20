import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orders } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  orderCount: number;
  paidCount: number;
  /** Soma dos pedidos efetivamente pagos (LTV) */
  totalSpentCents: number;
  averageTicketCents: number;
  lastOrderAt: Date | null;
  firstOrderAt: Date | null;
  marketingOptOut: boolean;
  isBlocked: boolean;
  createdAt: Date;
}

export interface CustomersSummary {
  total: number;
  buyers: number;
  revenueCents: number;
  averageTicketCents: number;
}

/**
 * Clientes do workspace com métricas agregadas dos pedidos.
 * Apenas pedidos efetivamente pagos entram no valor gasto — pendentes
 * não contam como receita.
 */
export async function listCustomers(limit = 200): Promise<CustomerRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const paidFilter = sql`${orders.status} in ('paid','shipped','delivered')`;

  const rows = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      country: customers.country,
      marketingOptOut: customers.marketingOptOut,
      isBlocked: customers.isBlocked,
      createdAt: customers.createdAt,
      orderCount: sql<number>`count(${orders.id})::int`,
      paidCount: sql<number>`count(${orders.id}) filter (where ${paidFilter})::int`,
      totalSpentCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidFilter}), 0)::int`,
      lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
      firstOrderAt: sql<Date | null>`min(${orders.createdAt})`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(
      and(eq(customers.workspaceId, workspaceId), isNull(customers.deletedAt)),
    )
    .groupBy(
      customers.id,
      customers.firstName,
      customers.lastName,
      customers.email,
      customers.phone,
      customers.country,
      customers.marketingOptOut,
      customers.isBlocked,
      customers.createdAt,
    )
    .orderBy(
      desc(
        sql`coalesce(sum(${orders.totalCents}) filter (where ${paidFilter}), 0)`,
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
    email: r.email,
    phone: r.phone,
    country: r.country,
    orderCount: r.orderCount,
    paidCount: r.paidCount,
    totalSpentCents: r.totalSpentCents,
    averageTicketCents:
      r.paidCount > 0 ? Math.round(r.totalSpentCents / r.paidCount) : 0,
    lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt) : null,
    firstOrderAt: r.firstOrderAt ? new Date(r.firstOrderAt) : null,
    marketingOptOut: r.marketingOptOut,
    isBlocked: r.isBlocked,
    createdAt: r.createdAt,
  }));
}

export function summarizeCustomers(rows: CustomerRow[]): CustomersSummary {
  const buyers = rows.filter((r) => r.paidCount > 0);
  const revenueCents = buyers.reduce((s, r) => s + r.totalSpentCents, 0);
  const paidOrders = buyers.reduce((s, r) => s + r.paidCount, 0);

  return {
    total: rows.length,
    buyers: buyers.length,
    revenueCents,
    averageTicketCents:
      paidOrders > 0 ? Math.round(revenueCents / paidOrders) : 0,
  };
}
