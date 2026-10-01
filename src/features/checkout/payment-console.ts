import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/database/client";
import { orders, payments, paymentWebhooks } from "@/database/schema";
import { exigirWorkspaceRole } from "@/lib/workspace";
import type { CheckoutPaymentMetadata } from "./payment-lifecycle";

/** An authenticated operational view; no credentials, customer PII or raw webhook body. */
export async function getPaymentConsole() {
  const { workspaceId, role } = await exigirWorkspaceRole([
    "owner",
    "admin",
    "finance",
    "marketing",
    "support",
    "analyst",
    "viewer",
  ]);
  const canReconcile = ["owner", "admin", "finance"].includes(role);
  if (!isDatabaseConfigured())
    return {
      configured: false,
      canReconcile,
      rows: [],
      receipts: [],
      totals: { pending: 0, unknown: 0, paid: 0 },
    };
  const db = getDb();
  const [summary] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${payments.status} in ('created','pending','processing'))::int`,
      unknown: sql<number>`count(*) filter (where ${payments.failureReason} = 'gateway_result_unknown' and ${payments.status} in ('created','pending','processing'))::int`,
      paid: sql<number>`count(*) filter (where ${payments.status} in ('approved','partially_refunded'))::int`,
    })
    .from(payments)
    .where(eq(payments.workspaceId, workspaceId));
  const raw = await db
    .select({
      id: payments.id,
      reference: orders.reference,
      status: payments.status,
      method: payments.method,
      amountCents: payments.amountCents,
      netCents: payments.netCents,
      currency: payments.currency,
      externalId: payments.externalId,
      failureReason: payments.failureReason,
      metadata: payments.metadata,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(payments.workspaceId, workspaceId),
        eq(orders.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(50);
  const receipts = await db
    .select({
      id: paymentWebhooks.id,
      type: paymentWebhooks.eventType,
      signatureValid: paymentWebhooks.signatureValid,
      processedAt: paymentWebhooks.processedAt,
      receivedAt: paymentWebhooks.createdAt,
      processingError: paymentWebhooks.processingError,
    })
    .from(paymentWebhooks)
    .where(eq(paymentWebhooks.workspaceId, workspaceId))
    .orderBy(desc(paymentWebhooks.createdAt))
    .limit(20);
  return {
    configured: true,
    canReconcile,
    totals: summary,
    rows: raw.map(({ metadata: unsafeMetadata, failureReason, ...row }) => {
      const metadata = unsafeMetadata as CheckoutPaymentMetadata;
      return {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        unknown:
          failureReason === "gateway_result_unknown" &&
          ["created", "pending", "processing"].includes(row.status),
        inventory: metadata.inventory?.state ?? null,
        refundedAmountCents: metadata.refundedAmountCents ?? 0,
      };
    }),
    receipts: receipts.map(({ processingError, ...row }) => ({
      ...row,
      processedAt: row.processedAt?.toISOString() ?? null,
      receivedAt: row.receivedAt.toISOString(),
      needsRetry: Boolean(processingError && !row.processedAt),
    })),
  };
}
