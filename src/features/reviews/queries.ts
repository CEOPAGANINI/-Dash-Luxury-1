import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { productReviews, products } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface ReviewRow {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  location: string | null;
  rating: number;
  title: string | null;
  body: string;
  photoUrl: string | null;
  helpfulCount: number;
  isVerifiedPurchase: boolean;
  isPublished: boolean;
  reviewedAt: Date;
}

export interface ProductOption {
  id: string;
  name: string;
  slug: string;
}

/** Avaliações do workspace (painel). */
export async function listReviews(): Promise<ReviewRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: productReviews.id,
      productId: productReviews.productId,
      productName: products.name,
      authorName: productReviews.authorName,
      location: productReviews.location,
      rating: productReviews.rating,
      title: productReviews.title,
      body: productReviews.body,
      photoUrl: productReviews.photoUrl,
      helpfulCount: productReviews.helpfulCount,
      isVerifiedPurchase: productReviews.isVerifiedPurchase,
      isPublished: productReviews.isPublished,
      reviewedAt: productReviews.reviewedAt,
    })
    .from(productReviews)
    .innerJoin(products, eq(productReviews.productId, products.id))
    .where(
      and(
        eq(productReviews.workspaceId, workspaceId),
        isNull(productReviews.deletedAt),
      ),
    )
    .orderBy(desc(productReviews.reviewedAt));

  return rows;
}

/** Produtos disponíveis para associar uma avaliação. */
export async function listProductOptions(): Promise<ProductOption[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  return db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products)
    .where(
      and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt)),
    )
    .orderBy(asc(products.name));
}

export interface PublicReview {
  name: string;
  location: string;
  date: string;
  stars: number;
  title: string;
  text: string;
  helpful: number;
  verifiedPurchase: boolean;
  photo?: string;
}

/** Avaliações publicadas de um produto, para a landing page pública. */
export async function getPublishedReviews(
  productSlug: string,
): Promise<PublicReview[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const db = getDb();
    const rows = await db
      .select({
        authorName: productReviews.authorName,
        location: productReviews.location,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        photoUrl: productReviews.photoUrl,
        helpfulCount: productReviews.helpfulCount,
        isVerifiedPurchase: productReviews.isVerifiedPurchase,
        reviewedAt: productReviews.reviewedAt,
      })
      .from(productReviews)
      .innerJoin(products, eq(productReviews.productId, products.id))
      .where(
        and(
          eq(products.slug, productSlug),
          eq(productReviews.isPublished, true),
          isNull(productReviews.deletedAt),
        ),
      )
      .orderBy(asc(productReviews.position), desc(productReviews.reviewedAt));

    return rows.map((r) => ({
      name: r.authorName,
      location: r.location ?? "",
      date: r.reviewedAt.toISOString().slice(0, 10),
      stars: r.rating,
      title: r.title ?? "",
      text: r.body,
      helpful: r.helpfulCount,
      verifiedPurchase: r.isVerifiedPurchase,
      photo: r.photoUrl ?? undefined,
    }));
  } catch (error) {
    console.error("[reviews] erro ao buscar avaliações públicas:", error);
    return [];
  }
}
