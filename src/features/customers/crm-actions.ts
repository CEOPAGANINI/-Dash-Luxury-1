"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { customers } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

/** Anotações livres sobre o cliente — o que o atendimento precisa lembrar. */
export async function updateCustomerNotesAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000);
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(customers)
    .set({ notes: notes || null, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.workspaceId, workspaceId)));

  revalidatePath(`/clientes/${id}`);
}

/**
 * Etiquetas separadas por vírgula. Cada uma vira minúscula e sem espaço
 * nas pontas, para "VIP" e " vip " não virarem duas etiquetas.
 */
export async function updateCustomerTagsAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const tags = Array.from(
    new Set(
      String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ).slice(0, 20);

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(customers)
    .set({ tags, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.workspaceId, workspaceId)));

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
}
