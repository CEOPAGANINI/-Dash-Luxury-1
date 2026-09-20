/**
 * Seed idempotente: cadastra a cadeira gaming ALPHA GAMER Nébula como
 * produto real na tabela `products` (workspace padrão), com o conteúdo
 * rico da landing page em `landing_content`.
 *
 * Uso: DATABASE_URL=... npx tsx src/database/seeds/alpha-gamer-nebula.ts
 * (ou `node --experimental-strip-types` em Node 22+)
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/database/schema";
import { alphaGamerNebula } from "@/features/landing/technebula-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  try {
    await run(db);
  } finally {
    await client.end();
  }
}

async function run(db: ReturnType<typeof drizzle>) {
  const DEFAULT_WORKSPACE_SLUG = "infinity-principal";

  const [workspace] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, DEFAULT_WORKSPACE_SLUG))
    .limit(1);

  if (!workspace) {
    throw new Error(
      `Workspace "${DEFAULT_WORKSPACE_SLUG}" não existe ainda — faça um checkout de teste (ou login) antes de rodar o seed, para o workspace padrão ser criado.`,
    );
  }

  const landingContent = {
    brand: alphaGamerNebula.brand,
    shortPitch: alphaGamerNebula.shortPitch,
    compareAtPriceCents: alphaGamerNebula.compareAtPriceCents,
    mainImage: alphaGamerNebula.mainImage,
    gallery: alphaGamerNebula.gallery,
    rating: alphaGamerNebula.rating,
    stockTotal: alphaGamerNebula.stockTotal,
    freeShippingFromCents: alphaGamerNebula.freeShippingFromCents,
    deliveryEstimate: alphaGamerNebula.deliveryEstimate,
    returnDays: alphaGamerNebula.returnDays,
    description: alphaGamerNebula.description,
    highlights: alphaGamerNebula.highlights,
    specs: alphaGamerNebula.specs,
    reviews: alphaGamerNebula.reviews,
  };

  const [existing] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.slug, alphaGamerNebula.slug))
    .limit(1);

  if (existing) {
    await db
      .update(schema.products)
      .set({
        name: alphaGamerNebula.name,
        shortDescription: alphaGamerNebula.shortPitch,
        mainImageUrl: alphaGamerNebula.mainImage,
        type: "physical",
        status: "active",
        priceCents: alphaGamerNebula.priceCents,
        currency: alphaGamerNebula.currency,
        trackInventory: true,
        stockQuantity: alphaGamerNebula.stockRemaining ?? 0,
        landingContent,
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, existing.id));
    console.log(`Produto atualizado: ${existing.id}`);
  } else {
    const [created] = await db
      .insert(schema.products)
      .values({
        workspaceId: workspace.id,
        name: alphaGamerNebula.name,
        slug: alphaGamerNebula.slug,
        shortDescription: alphaGamerNebula.shortPitch,
        mainImageUrl: alphaGamerNebula.mainImage,
        type: "physical",
        status: "active",
        priceCents: alphaGamerNebula.priceCents,
        currency: alphaGamerNebula.currency,
        trackInventory: true,
        stockQuantity: alphaGamerNebula.stockRemaining ?? 0,
        landingContent,
      })
      .returning({ id: schema.products.id });
    console.log(`Produto criado: ${created.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
