import { getDb, isDatabaseConfigured } from "@/database/client";
import { notifications } from "@/database/schema";

export type NotificationEvent =
  | "payment_approved"
  | "payment_refused"
  | "payment_pending"
  | "order_created"
  | "refund"
  | "chargeback"
  | "webhook_error";

export interface CreateNotificationInput {
  workspaceId: string;
  eventType: NotificationEvent;
  title: string;
  body?: string;
  href?: string;
  valueCents?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Regista uma notificação in-app.
 *
 * Chamado a partir do webhook do gateway — por isso nunca pode lançar:
 * uma falha aqui não pode impedir a resposta 2xx ao Broski nem reverter
 * um pagamento já confirmado.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  try {
    const db = getDb();
    await db.insert(notifications).values({
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      title: input.title,
      body: input.body,
      href: input.href,
      valueCents: input.valueCents,
      channel: "in_app",
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[notifications] falha ao registar:", error);
  }
}
