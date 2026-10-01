import { and, eq, sql } from "drizzle-orm";

import { getDb, type Database } from "@/database/client";
import {
  inventoryMovements,
  orders,
  payments,
  paymentWebhooks,
  products,
} from "@/database/schema";
import type { WebhookEvent } from "@/payment-providers/types";
import {
  ORDER_STATUS_BY_PAYMENT,
  paymentTransition,
  type CheckoutPaymentMetadata,
} from "./payment-lifecycle";

export type PaymentTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export async function updatePaymentState(
  tx: PaymentTransaction,
  payment: typeof payments.$inferSelect,
  incoming: NonNullable<WebhookEvent["status"]>,
  refundedAmountCents?: number,
) {
  const transition = paymentTransition(payment.status, incoming);
  const previousMetadata = payment.metadata as CheckoutPaymentMetadata;
  if (incoming === "refunded" && refundedAmountCents === undefined)
    refundedAmountCents = payment.amountCents;
  if (
    refundedAmountCents !== undefined &&
    (!Number.isInteger(refundedAmountCents) ||
      refundedAmountCents < 0 ||
      refundedAmountCents > payment.amountCents)
  )
    throw new Error("invalid_refund_amount");
  const refundChanged =
    refundedAmountCents !== undefined &&
    Number.isInteger(refundedAmountCents) &&
    refundedAmountCents > (previousMetadata.refundedAmountCents ?? 0);
  if (!transition && !refundChanged) return false;
  const next = transition ?? payment.status;
  const now = new Date();
  const metadata = { ...(payment.metadata as CheckoutPaymentMetadata) };
  if (refundChanged) metadata.refundedAmountCents = refundedAmountCents;
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, payment.orderId))
    .for("update");
  if (!order) throw new Error("payment_order_missing");

  // A late approval after an expiry must consume the stock released earlier.
  if (
    metadata.inventory?.state === "released" &&
    ["approved", "partially_refunded"].includes(next)
  ) {
    const reservation = metadata.inventory;
    await tx
      .update(products)
      .set({
        stockQuantity: sql`${products.stockQuantity} - ${reservation.quantity}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(products.id, reservation.productId),
          eq(products.workspaceId, payment.workspaceId),
        ),
      );
    await tx.insert(inventoryMovements).values({
      workspaceId: payment.workspaceId,
      productId: reservation.productId,
      quantity: -reservation.quantity,
      reason: "late_payment_confirmed",
      referenceId: order.id,
    });
    metadata.inventory = { ...reservation, state: "consumed" };
  }

  if (metadata.inventory?.state === "reserved") {
    if (["approved", "partially_refunded"].includes(next)) {
      metadata.inventory = { ...metadata.inventory, state: "consumed" };
    } else if (["refused", "expired", "cancelled"].includes(next)) {
      const reservation = metadata.inventory;
      await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${reservation.quantity}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(products.id, reservation.productId),
            eq(products.workspaceId, payment.workspaceId),
          ),
        );
      await tx.insert(inventoryMovements).values({
        workspaceId: payment.workspaceId,
        productId: reservation.productId,
        quantity: reservation.quantity,
        reason: "reservation_released",
        referenceId: order.id,
      });
      metadata.inventory = { ...reservation, state: "released" };
    }
  }

  const paid = ["approved", "partially_refunded"].includes(next);
  await tx
    .update(payments)
    .set({
      status: next,
      metadata,
      netCents:
        paid || next === "refunded"
          ? Math.max(
              0,
              payment.amountCents -
                payment.feeCents -
                (metadata.refundedAmountCents ?? 0),
            )
          : payment.netCents,
      approvedAt: paid ? (payment.approvedAt ?? now) : payment.approvedAt,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id));
  // Operational fulfillment states must survive a duplicate paid event.
  const status =
    ["preparing", "shipped", "delivered"].includes(order.status) && paid
      ? order.status
      : ORDER_STATUS_BY_PAYMENT[next];
  await tx
    .update(orders)
    .set({
      status,
      paidAt: paid ? (order.paidAt ?? now) : order.paidAt,
      updatedAt: now,
    })
    .where(eq(orders.id, order.id));
  return true;
}

/** Receipt, state transitions and stock changes commit atomically. Unresolved receipts remain retryable. */
export async function processBroskiEvent(
  event: WebhookEvent,
  workspaceId: string,
  database = getDb(),
) {
  return database.transaction(async (tx) => {
    const eventKey = `broski:${event.externalEventId}`;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${eventKey}, 0))`,
    );
    await tx
      .insert(paymentWebhooks)
      .values({
        workspaceId,
        providerKey: "broski",
        externalEventId: event.externalEventId,
        eventType: event.type,
        signatureValid: true,
        payload: {
          type: event.type,
          paymentExternalId: event.paymentExternalId,
        },
      })
      .onConflictDoNothing();
    const [receipt] = await tx
      .select()
      .from(paymentWebhooks)
      .where(
        and(
          eq(paymentWebhooks.providerKey, "broski"),
          eq(paymentWebhooks.externalEventId, event.externalEventId),
        ),
      )
      .for("update");
    if (!receipt || receipt.workspaceId !== workspaceId)
      throw new Error("webhook_account_mismatch");
    if (receipt.processedAt)
      return {
        processed: true,
        duplicate: true,
        paymentId: receipt.paymentId,
        changed: false,
      };
    // Payouts/other authenticated informational events must not retry forever or alter an order.
    if (!event.paymentExternalId && !event.orderReference && !event.status) {
      await tx
        .update(paymentWebhooks)
        .set({ processedAt: new Date(), processingError: null })
        .where(eq(paymentWebhooks.id, receipt.id));
      return {
        processed: true,
        duplicate: false,
        paymentId: null,
        changed: false,
      };
    }

    const candidates = event.paymentExternalId
      ? await tx
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.externalId, event.paymentExternalId),
              eq(payments.workspaceId, workspaceId),
            ),
          )
          .for("update")
      : [];
    let payment = candidates[0];
    if (!payment && event.orderReference) {
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.reference, event.orderReference),
            eq(orders.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (order)
        [payment] = await tx
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.orderId, order.id),
              eq(payments.workspaceId, workspaceId),
            ),
          )
          .for("update");
    }
    if (!payment) {
      await tx
        .update(paymentWebhooks)
        .set({
          processingError: "payment_not_found_retry_required",
          updatedAt: new Date(),
        })
        .where(eq(paymentWebhooks.id, receipt.id));
      return {
        processed: false,
        duplicate: false,
        paymentId: null,
        changed: false,
      };
    }
    if (
      event.amountCents !== undefined &&
      event.status === "approved" &&
      event.amountCents !== payment.amountCents
    )
      throw new Error("payment_amount_mismatch");
    if (event.paymentExternalId && !payment.externalId)
      await tx
        .update(payments)
        .set({ externalId: event.paymentExternalId })
        .where(eq(payments.id, payment.id));
    const changed = event.status
      ? await updatePaymentState(
          tx,
          payment,
          event.status,
          event.refundedAmountCents,
        )
      : false;
    await tx
      .update(paymentWebhooks)
      .set({
        processedAt: new Date(),
        paymentId: payment.id,
        processingError: null,
      })
      .where(eq(paymentWebhooks.id, receipt.id));
    return {
      processed: true,
      duplicate: false,
      paymentId: payment.id,
      changed,
    };
  });
}
