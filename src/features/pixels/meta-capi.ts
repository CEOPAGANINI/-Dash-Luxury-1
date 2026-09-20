import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/database/client";
import { pixelEvents, pixels } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";

const GRAPH_VERSION = "v21.0";

/** A Meta exige os dados do cliente com hash SHA-256 em minúsculas. */
function hashed(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface PurchaseEventInput {
  workspaceId: string;
  orderId: string;
  /** Identificador estável do evento — deduplica browser x servidor */
  eventId: string;
  valueCents: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  productName?: string | null;
}

/**
 * Envia o evento Purchase pela Conversions API da Meta.
 *
 * Chamado apenas a partir do webhook de pagamento aprovado — nunca do
 * navegador. Se não houver pixel do tipo meta_capi configurado, não faz nada
 * (e não é erro).
 */
export async function sendPurchaseToMetaCapi(
  input: PurchaseEventInput,
): Promise<void> {
  const db = getDb();

  const rows = await db
    .select()
    .from(pixels)
    .where(
      and(
        eq(pixels.workspaceId, input.workspaceId),
        eq(pixels.type, "meta_capi"),
        eq(pixels.isActive, true),
        isNull(pixels.deletedAt),
      ),
    );

  for (const pixel of rows) {
    if (!pixel.pixelId || !pixel.encryptedToken) continue;

    // Deduplicação: o mesmo evento nunca é enviado duas vezes.
    const inserted = await db
      .insert(pixelEvents)
      .values({
        workspaceId: input.workspaceId,
        pixelId: pixel.id,
        eventName: "Purchase",
        eventId: input.eventId,
        channel: "server",
        orderId: input.orderId,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: pixelEvents.id });

    if (inserted.length === 0) continue;

    try {
      const token = decryptSecret(pixel.encryptedToken);
      const userData: Record<string, string[]> = {};
      if (input.email) userData.em = [hashed(input.email)];
      if (input.phone) {
        userData.ph = [hashed(input.phone.replace(/\D/g, ""))];
      }

      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${pixel.pixelId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            data: [
              {
                event_name: "Purchase",
                event_time: Math.floor(Date.now() / 1000),
                event_id: input.eventId,
                action_source: "website",
                user_data: userData,
                custom_data: {
                  currency: input.currency,
                  value: (input.valueCents / 100).toFixed(2),
                  ...(input.productName
                    ? { content_name: input.productName }
                    : {}),
                },
              },
            ],
          }),
        },
      );

      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      await db
        .update(pixelEvents)
        .set({
          status: response.ok ? "sent" : "failed",
          sentAt: new Date(),
          response: body,
          error: response.ok ? null : JSON.stringify(body).slice(0, 500),
        })
        .where(eq(pixelEvents.id, inserted[0].id));

      if (response.ok) {
        await db
          .update(pixels)
          .set({ lastActivityAt: new Date() })
          .where(eq(pixels.id, pixel.id));
      }
    } catch (error) {
      await db
        .update(pixelEvents)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "erro desconhecido",
        })
        .where(eq(pixelEvents.id, inserted[0].id));
    }
  }
}
