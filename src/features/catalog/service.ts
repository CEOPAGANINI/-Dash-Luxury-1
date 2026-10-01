import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  categories,
  inventoryMovements,
  productCategories,
  products,
  productVariants,
  stores,
} from "@/database/schema";
import type { BancoVps as CatalogDb } from "@/features/vps/schema-sql";

import {
  categoryInputSchema,
  inventoryInputSchema,
  productInputSchema,
  type CategoryInput,
  type InventoryInput,
  type ProductInput,
} from "./validation";

export class CatalogError extends Error {}
const missing = () =>
  new CatalogError("Registro não encontrado nesta operação.");
const stale = () =>
  new CatalogError(
    "Este registro mudou em outra tela. Recarregue antes de salvar.",
  );
const nextDate = (date: Date) =>
  new Date(Math.max(Date.now(), date.getTime() + 1));

async function checkStore(
  db: CatalogDb,
  workspaceId: string,
  storeId: string | null,
) {
  if (!storeId) return;
  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.id, storeId),
        eq(stores.workspaceId, workspaceId),
        isNull(stores.deletedAt),
      ),
    )
    .limit(1);
  if (!store)
    throw new CatalogError("A loja selecionada não pertence a esta operação.");
}

async function attachCategories(
  db: CatalogDb,
  workspaceId: string,
  productId: string,
  categoryIds: string[],
) {
  const ids = [...new Set(categoryIds)];
  if (ids.length) {
    const found = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, workspaceId),
          inArray(categories.id, ids),
          isNull(categories.deletedAt),
        ),
      );
    if (found.length !== ids.length)
      throw new CatalogError(
        "Uma categoria foi removida ou não pertence a esta operação.",
      );
  }
  await db
    .delete(productCategories)
    .where(
      and(
        eq(productCategories.workspaceId, workspaceId),
        eq(productCategories.productId, productId),
      ),
    );
  if (ids.length)
    await db
      .insert(productCategories)
      .values(
        ids.map((categoryId) => ({ workspaceId, productId, categoryId })),
      );
}

function productValues(input: ProductInput) {
  const { categoryIds: _categoryIds, ...values } = input;
  void _categoryIds;
  return {
    ...values,
    sku: input.sku || null,
    description: input.description || null,
    shortDescription: input.shortDescription || null,
    mainImageUrl: input.mainImageUrl || null,
    deliveryUrl: input.deliveryUrl || null,
  };
}

/** Prices and stock changes are atomic with category assignment; no remote writes. */
export async function saveCatalogProduct(
  db: CatalogDb,
  workspaceId: string,
  raw: ProductInput,
  existing?: { id: string; version: string },
): Promise<string> {
  const input = productInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    await checkStore(tx, workspaceId, input.storeId);
    const [duplicate] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.slug, input.slug),
          existing ? ne(products.id, existing.id) : undefined,
        ),
      )
      .limit(1);
    if (duplicate)
      throw new CatalogError(
        "Esse endereço já está reservado por outro produto, inclusive arquivado. Escolha outro.",
      );
    let id: string;
    if (existing) {
      const [current] = await tx
        .select({ id: products.id, updatedAt: products.updatedAt })
        .from(products)
        .where(
          and(
            eq(products.id, existing.id),
            eq(products.workspaceId, workspaceId),
            isNull(products.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!current) throw missing();
      if (current.updatedAt.toISOString() !== existing.version) throw stale();
      await tx
        .update(products)
        .set({
          ...productValues(input),
          updatedAt: nextDate(current.updatedAt),
        })
        .where(
          and(
            eq(products.id, current.id),
            eq(products.workspaceId, workspaceId),
          ),
        );
      id = current.id;
    } else {
      const [created] = await tx
        .insert(products)
        .values({ workspaceId, ...productValues(input) })
        .returning({ id: products.id });
      id = created.id;
    }
    await attachCategories(tx, workspaceId, id, input.categoryIds);
    return id;
  });
}

export async function saveCatalogCategory(
  db: CatalogDb,
  workspaceId: string,
  raw: CategoryInput,
  existing?: { id: string; version: string },
): Promise<string> {
  const input = categoryInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    await checkStore(tx, workspaceId, input.storeId);
    const [duplicate] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, workspaceId),
          eq(categories.slug, input.slug),
          existing ? ne(categories.id, existing.id) : undefined,
        ),
      )
      .limit(1);
    if (duplicate)
      throw new CatalogError(
        "Esse endereço já está reservado por outra categoria. Escolha outro.",
      );
    const values = {
      ...input,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
    };
    if (!existing)
      return (
        await tx
          .insert(categories)
          .values({ workspaceId, ...values })
          .returning({ id: categories.id })
      )[0].id;
    const [current] = await tx
      .select({ id: categories.id, updatedAt: categories.updatedAt })
      .from(categories)
      .where(
        and(
          eq(categories.id, existing.id),
          eq(categories.workspaceId, workspaceId),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) throw missing();
    if (current.updatedAt.toISOString() !== existing.version) throw stale();
    await tx
      .update(categories)
      .set({ ...values, updatedAt: nextDate(current.updatedAt) })
      .where(
        and(
          eq(categories.id, current.id),
          eq(categories.workspaceId, workspaceId),
        ),
      );
    return current.id;
  });
}

export async function archiveCatalogEntity(
  db: CatalogDb,
  workspaceId: string,
  type: "product" | "category",
  id: string,
  version: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const table = type === "product" ? products : categories;
    const [current] = await tx
      .select({ id: table.id, updatedAt: table.updatedAt })
      .from(table)
      .where(
        and(
          eq(table.id, id),
          eq(table.workspaceId, workspaceId),
          isNull(table.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) throw missing();
    if (current.updatedAt.toISOString() !== version) throw stale();
    await tx
      .update(table)
      .set({
        deletedAt: new Date(),
        updatedAt: nextDate(current.updatedAt),
        ...(type === "product" ? { status: "archived" as const } : {}),
      })
      .where(and(eq(table.id, id), eq(table.workspaceId, workspaceId)));
  });
}

export async function adjustCatalogStock(
  db: CatalogDb,
  workspaceId: string,
  raw: InventoryInput,
  actorId: string,
): Promise<number> {
  const input = inventoryInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({
        id: products.id,
        stock: products.stockQuantity,
        tracking: products.trackInventory,
        version: products.updatedAt,
      })
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.workspaceId, workspaceId),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!product) throw missing();
    if (!product.tracking)
      throw new CatalogError(
        "Ative o controle de estoque no produto antes de registrar movimentos.",
      );
    let stock = product.stock;
    let version = product.version;
    if (input.variantId) {
      const [variant] = await tx
        .select({
          stock: productVariants.stockQuantity,
          version: productVariants.updatedAt,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, input.variantId),
            eq(productVariants.productId, product.id),
            eq(productVariants.workspaceId, workspaceId),
            eq(productVariants.isActive, true),
          ),
        )
        .limit(1)
        .for("update");
      if (!variant) throw missing();
      stock = variant.stock;
      version = variant.version;
    }
    if (version.toISOString() !== input.version) throw stale();
    const next = stock + input.quantity;
    if (!Number.isSafeInteger(next) || next < 0 || next > 2_000_000_000)
      throw new CatalogError(
        "O ajuste deixaria o estoque negativo ou acima do limite.",
      );
    if (input.variantId)
      await tx
        .update(productVariants)
        .set({ stockQuantity: next, updatedAt: nextDate(version) })
        .where(
          and(
            eq(productVariants.id, input.variantId),
            eq(productVariants.workspaceId, workspaceId),
          ),
        );
    else
      await tx
        .update(products)
        .set({ stockQuantity: next, updatedAt: nextDate(version) })
        .where(
          and(
            eq(products.id, product.id),
            eq(products.workspaceId, workspaceId),
          ),
        );
    await tx
      .insert(inventoryMovements)
      .values({
        workspaceId,
        productId: product.id,
        variantId: input.variantId,
        quantity: input.quantity,
        reason: input.reason,
        note: `${input.note}\nResponsável: ${actorId}`,
      });
    return next;
  });
}
