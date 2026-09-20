import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { products } from "@/database/schema";
import type { LandingProduct } from "@/features/landing/technebula-data";
import { alphaGamerNebula } from "@/features/landing/technebula-data";

/**
 * Busca um produto publicado pelo slug (tabela `products`, campo
 * `landing_content` com o conteúdo rico da página).
 *
 * Enquanto o produto não estiver cadastrado no banco (ex.: ambiente sem
 * seed rodado), cai para o catálogo estático — a landing nunca fica fora
 * do ar por falta de dado.
 */
export async function getProductBySlug(
  slug: string,
): Promise<LandingProduct | null> {
  if (isDatabaseConfigured()) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(products)
        .where(and(eq(products.slug, slug), isNull(products.deletedAt)))
        .limit(1);

      const row = rows[0];
      if (row && row.status === "active") {
        const content = (row.landingContent ?? {}) as Partial<LandingProduct>;
        return {
          slug: row.slug,
          name: row.name,
          brand: content.brand ?? "",
          shortPitch: row.shortDescription ?? content.shortPitch ?? "",
          priceCents: row.priceCents,
          compareAtPriceCents: content.compareAtPriceCents ?? null,
          currency: row.currency,
          mainImage: row.mainImageUrl ?? content.mainImage ?? "",
          gallery:
            content.gallery ?? (row.mainImageUrl ? [row.mainImageUrl] : []),
          rating: content.rating ?? null,
          stockRemaining: row.trackInventory ? row.stockQuantity : null,
          stockTotal: content.stockTotal ?? row.stockQuantity,
          freeShippingFromCents: content.freeShippingFromCents ?? 0,
          deliveryEstimate: content.deliveryEstimate ?? "2–4 dias úteis",
          returnDays: content.returnDays ?? 14,
          description: content.description ?? [],
          highlights: content.highlights ?? [],
          specs: content.specs ?? [],
          reviews: content.reviews ?? [],
        };
      }
    } catch (error) {
      console.error("[landing] erro ao buscar produto do banco:", error);
    }
  }

  return slug === alphaGamerNebula.slug ? alphaGamerNebula : null;
}
