"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { productReviews, products } from "@/database/schema";
import { exigirWorkspaceRole } from "@/lib/workspace";
import { reviewSchema } from "@/validations/review";

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function saveReviewAction(
  _prev: ReviewActionResult | null,
  formData: FormData,
): Promise<ReviewActionResult> {
  const parsed = reviewSchema.safeParse({
    productId: formData.get("productId"),
    authorName: formData.get("authorName"),
    location: formData.get("location") ?? "",
    rating: formData.get("rating"),
    title: formData.get("title") ?? "",
    body: formData.get("body"),
    photoUrl: formData.get("photoUrl") ?? "",
    helpfulCount: formData.get("helpfulCount") || 0,
    reviewedAt: formData.get("reviewedAt") ?? "",
    isVerifiedPurchase: formData.get("isVerifiedPurchase") === "on",
    isPublished: formData.get("isPublished") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = (await exigirWorkspaceRole(["marketing", "support"]))
      .workspaceId;
    const d = parsed.data;
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, d.productId),
          eq(products.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!product)
      return { ok: false, error: "Produto não encontrado nesta operação." };

    await db.insert(productReviews).values({
      workspaceId,
      productId: d.productId,
      authorName: d.authorName,
      location: d.location || null,
      rating: d.rating,
      title: d.title || null,
      body: d.body,
      photoUrl: d.photoUrl || null,
      helpfulCount: d.helpfulCount ?? 0,
      isVerifiedPurchase: d.isVerifiedPurchase ?? false,
      isPublished: d.isPublished ?? true,
      reviewedAt: d.reviewedAt ? new Date(d.reviewedAt) : new Date(),
    });

    revalidatePath("/provas-sociais");
    return { ok: true, message: "Avaliação guardada e publicada na página." };
  } catch {
    return { ok: false, error: "Não foi possível guardar a avaliação." };
  }
}

export async function toggleReviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = (await exigirWorkspaceRole(["marketing", "support"]))
    .workspaceId;

  await db
    .update(productReviews)
    .set({ isPublished: next, updatedAt: new Date() })
    .where(
      and(
        eq(productReviews.id, id),
        eq(productReviews.workspaceId, workspaceId),
      ),
    );

  revalidatePath("/provas-sociais");
}

export async function deleteReviewAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = (await exigirWorkspaceRole(["marketing", "support"]))
    .workspaceId;

  await db
    .update(productReviews)
    .set({ deletedAt: new Date(), isPublished: false })
    .where(
      and(
        eq(productReviews.id, id),
        eq(productReviews.workspaceId, workspaceId),
      ),
    );

  revalidatePath("/provas-sociais");
}
