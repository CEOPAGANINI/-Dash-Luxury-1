import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, emailSuppressions, orders } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { SEGMENTS, type SegmentKey } from "@/features/emails/types";

// Reexporta para quem já importava daqui — o conteúdo client-safe vive
// em `./types` (sem tocar no cliente do banco).
export {
  SEGMENTS,
  type SegmentKey,
  type SegmentDefinition,
} from "@/features/emails/types";

const STATUS_BY_SEGMENT: Record<string, string[]> = {
  paid: ["paid", "shipped", "delivered"],
  pending: ["created", "awaiting_payment", "processing"],
  refused: ["refused", "expired", "cancelled"],
};

export interface Recipient {
  id: string;
  email: string;
  name: string;
  orderCount: number;
  totalSpentCents: number;
}

/**
 * Destinatários de um segmento.
 *
 * Sempre exclui quem pediu para não receber comunicações (`marketingOptOut`)
 * e quem está na lista de supressão — exigência do RGPD e das regras
 * antispam.
 */
export async function getSegmentRecipients(
  segment: SegmentKey,
): Promise<Recipient[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const suppressed = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.workspaceId, workspaceId));
  const blocked = new Set(suppressed.map((s) => s.email.toLowerCase()));

  const statuses = STATUS_BY_SEGMENT[segment];

  const rows = await db
    .select({
      id: customers.id,
      email: customers.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
      orderCount: sql<number>`count(${orders.id})::int`,
      totalSpentCents: sql<number>`coalesce(sum(case when ${orders.status} in ('paid','shipped','delivered') then ${orders.totalCents} else 0 end), 0)::int`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(customers.workspaceId, workspaceId),
        isNull(customers.deletedAt),
        eq(customers.marketingOptOut, false),
        eq(customers.isBlocked, false),
        statuses ? inArray(orders.status, statuses as never) : undefined,
      ),
    )
    .groupBy(
      customers.id,
      customers.email,
      customers.firstName,
      customers.lastName,
    );

  const filtered =
    segment === "no_orders" ? rows.filter((r) => r.orderCount === 0) : rows;

  return filtered
    .filter((r) => !blocked.has(r.email.toLowerCase()))
    .map((r) => ({
      id: r.id,
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
      orderCount: r.orderCount,
      totalSpentCents: r.totalSpentCents,
    }));
}

/** Contagem de cada segmento, para exibir no painel. */
export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENTS.map(async (s) => {
      const list = await getSegmentRecipients(s.key);
      return [s.key, list.length] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}
