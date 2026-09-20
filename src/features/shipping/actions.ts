"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { shippingMethods } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { shippingMethodSchema } from "@/validations/shipping";

export interface ShippingActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function saveShippingMethodAction(
  _prev: ShippingActionResult | null,
  formData: FormData,
): Promise<ShippingActionResult> {
  const parsed = shippingMethodSchema.safeParse({
    name: formData.get("name"),
    deliveryEstimate: formData.get("deliveryEstimate"),
    priceCents: formData.get("priceCents"),
    freeAboveCents: formData.get("freeAboveCents") ?? "",
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const d = parsed.data;

    const [{ maxPos }] = await db
      .select({
        maxPos: sql<number>`coalesce(max(${shippingMethods.position}), -1)::int`,
      })
      .from(shippingMethods)
      .where(eq(shippingMethods.workspaceId, workspaceId));

    await db.insert(shippingMethods).values({
      workspaceId,
      name: d.name,
      deliveryEstimate: d.deliveryEstimate,
      priceCents: d.priceCents,
      freeAboveCents: d.freeAboveCents,
      isActive: d.isActive ?? true,
      position: maxPos + 1,
    });

    revalidatePath("/editor/fretes");
    return { ok: true, message: "Frete criado." };
  } catch (error) {
    console.error("[shipping] erro ao guardar:", error);
    return { ok: false, error: "Não foi possível guardar o frete." };
  }
}

export async function toggleShippingMethodAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(shippingMethods)
    .set({ isActive: next, updatedAt: new Date() })
    .where(
      and(
        eq(shippingMethods.id, id),
        eq(shippingMethods.workspaceId, workspaceId),
      ),
    );

  revalidatePath("/editor/fretes");
}

export async function deleteShippingMethodAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(shippingMethods)
    .set({ deletedAt: new Date(), isActive: false })
    .where(
      and(
        eq(shippingMethods.id, id),
        eq(shippingMethods.workspaceId, workspaceId),
      ),
    );

  revalidatePath("/editor/fretes");
}

const MOVE = { up: -1, down: 1 } as const;

export async function reorderShippingMethodAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const direction = String(
    formData.get("direction") ?? "",
  ) as keyof typeof MOVE;
  if (!id || !MOVE[direction] || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const all = await db
    .select({ id: shippingMethods.id, position: shippingMethods.position })
    .from(shippingMethods)
    .where(eq(shippingMethods.workspaceId, workspaceId))
    .orderBy(shippingMethods.position);

  const idx = all.findIndex((m) => m.id === id);
  const swapIdx = idx + MOVE[direction];
  if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) return;

  const a = all[idx];
  const b = all[swapIdx];

  await db
    .update(shippingMethods)
    .set({ position: b.position })
    .where(eq(shippingMethods.id, a.id));
  await db
    .update(shippingMethods)
    .set({ position: a.position })
    .where(eq(shippingMethods.id, b.id));

  revalidatePath("/editor/fretes");
}
