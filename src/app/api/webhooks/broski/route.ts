import { after, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, orders, payments } from "@/database/schema";
import { getPublicWorkspaceId } from "@/lib/workspace";
import { createBroskiProvider } from "@/payment-providers/broski";
import { resolveBroskiCredentials } from "@/payment-providers/broski/credentials";
import { processBroskiEvent } from "@/features/checkout/payment-processing";
import { sendPurchaseToMetaCapi } from "@/features/pixels/meta-capi";
import {
  createNotification,
  type NotificationEvent,
} from "@/features/notifications/create";
import {
  sendPushcutNotification,
  shouldPushEvent,
} from "@/features/notifications/pushcut";

const notices: Record<string, { eventType: NotificationEvent; title: string }> =
  {
    approved: { eventType: "payment_approved", title: "Pagamento confirmado" },
    refused: { eventType: "payment_refused", title: "Pagamento recusado" },
    expired: { eventType: "payment_refused", title: "Pagamento expirado" },
    refunded: { eventType: "refund", title: "Reembolso processado" },
    chargeback: { eventType: "chargeback", title: "Chargeback aberto" },
  };

export async function POST(request: Request) {
  if (!isDatabaseConfigured())
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 256_000)
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > 256_000)
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  try {
    // Parsing only locates an existing payment/account. No event is trusted or persisted before HMAC.
    const event = await createBroskiProvider({
      environment: "production",
      apiKey: "",
    }).parseWebhook(rawBody);
    if (!event.externalEventId || !event.type)
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    const db = getDb();
    const store = new URL(request.url).searchParams.get("loja");
    if (store && !/^[0-9a-f-]{36}$/i.test(store))
      return NextResponse.json({ error: "invalid_account" }, { status: 400 });
    const [payment] = event.paymentExternalId
      ? await db
          .select({ workspaceId: payments.workspaceId })
          .from(payments)
          .where(
            and(
              eq(payments.externalId, event.paymentExternalId),
              ...(store ? [eq(payments.workspaceId, store)] : []),
            ),
          )
          .limit(1)
      : [];
    const [order] =
      !payment && event.orderReference
        ? await db
            .select({ workspaceId: orders.workspaceId })
            .from(orders)
            .where(eq(orders.reference, event.orderReference))
            .limit(1)
        : [];
    const workspaceId =
      store ??
      payment?.workspaceId ??
      order?.workspaceId ??
      (await getPublicWorkspaceId());
    const credentials = await resolveBroskiCredentials(workspaceId);
    if (!credentials)
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    if (
      !(await createBroskiProvider(credentials).verifyWebhookSignature(
        request,
        rawBody,
      ))
    )
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    const result = await processBroskiEvent(event, workspaceId);
    if (!result.processed)
      return NextResponse.json(
        { received: true, processed: false, retry: true },
        { status: 409 },
      );

    if (result.changed && result.paymentId) {
      after(async () => {
        try {
          const [row] = await db
            .select({
              orderId: orders.id,
              workspaceId: orders.workspaceId,
              reference: orders.reference,
              totalCents: orders.totalCents,
              currency: orders.currency,
              customerId: orders.customerId,
            })
            .from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .where(
              and(
                eq(payments.id, result.paymentId!),
                eq(payments.workspaceId, workspaceId),
              ),
            )
            .limit(1);
          if (!row) return;
          const [customer] = row.customerId
            ? await db
                .select({ email: customers.email, phone: customers.phone })
                .from(customers)
                .where(eq(customers.id, row.customerId))
                .limit(1)
            : [];
          if (event.status === "approved")
            await sendPurchaseToMetaCapi({
              workspaceId,
              orderId: row.orderId,
              eventId: `purchase_${row.orderId}`,
              valueCents: row.totalCents,
              currency: row.currency,
              email: customer?.email,
              phone: customer?.phone,
            });
          const notice = event.status ? notices[event.status] : undefined;
          if (notice) {
            await createNotification({
              workspaceId,
              ...notice,
              body: `Pedido ${row.reference}`,
              href: "/pedidos",
              valueCents: row.totalCents,
              metadata: { orderId: row.orderId, reference: row.reference },
            });
            if (await shouldPushEvent(notice.eventType, workspaceId))
              await sendPushcutNotification(
                notice.title,
                `Pedido ${row.reference}`,
                { workspaceId },
              );
          }
        } catch {
          // Financial state is already committed; telemetry failures must never trigger a second charge.
          console.error("[webhook/broski] notification_delivery_failed");
        }
      });
    }
    return NextResponse.json({
      received: true,
      processed: true,
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    console.error("[webhook/broski] processing_failed_retry_required");
    return NextResponse.json(
      { error: "processing_failed", retry: true },
      { status: 503 },
    );
  }
}
