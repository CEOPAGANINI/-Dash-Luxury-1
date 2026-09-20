"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers, emailSuppressions } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

/**
 * Liga/desliga o consentimento de marketing de um cliente.
 *
 * Ao bloquear, o e-mail entra também na lista de supressão — garantindo
 * que nenhuma campanha o alcança, mesmo por outro caminho (RGPD).
 */
export async function toggleMarketingConsentAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const optOut = formData.get("optOut") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.workspaceId, workspaceId)))
    .limit(1);

  if (!customer) return;

  await db
    .update(customers)
    .set({ marketingOptOut: optOut, updatedAt: new Date() })
    .where(eq(customers.id, id));

  if (optOut) {
    await db
      .insert(emailSuppressions)
      .values({
        workspaceId,
        email: customer.email,
        reason: "manual",
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.workspaceId, workspaceId),
          eq(emailSuppressions.email, customer.email),
        ),
      );
  }

  revalidatePath("/clientes");
  revalidatePath("/emails");
}
