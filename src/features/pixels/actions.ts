"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { pixels } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";
import { pixelSchema } from "@/validations/pixel";

export interface PixelActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function savePixelAction(
  _prev: PixelActionResult | null,
  formData: FormData,
): Promise<PixelActionResult> {
  const parsed = pixelSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    pixelId: formData.get("pixelId"),
    token: formData.get("token") ?? "",
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "Banco de dados não configurado — não é possível salvar o pixel.",
    };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const data = parsed.data;

    await db.insert(pixels).values({
      workspaceId,
      name: data.name,
      type: data.type,
      pixelId: data.pixelId,
      encryptedToken: data.token ? encryptSecret(data.token) : null,
      isActive: data.isActive ?? true,
      enabledEvents: [
        "PageView",
        "ViewContent",
        "InitiateCheckout",
        "Purchase",
      ],
    });

    revalidatePath("/pixel");
    return { ok: true, message: "Pixel salvo e ativo nas suas páginas." };
  } catch (error) {
    console.error("[pixel] erro ao salvar:", error);
    return { ok: false, error: "Não foi possível salvar o pixel." };
  }
}

export async function togglePixelAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(pixels)
    .set({ isActive: next, updatedAt: new Date() })
    .where(and(eq(pixels.id, id), eq(pixels.workspaceId, workspaceId)));

  revalidatePath("/pixel");
}

export async function deletePixelAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(pixels)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(pixels.id, id), eq(pixels.workspaceId, workspaceId)));

  revalidatePath("/pixel");
}
