import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  categories,
  inventoryMovements,
  productCategories,
  products,
  productVariants,
  stores,
} from "@/database/schema";
import { getWorkspaceAccess } from "@/lib/workspace";
import { roleAllows } from "@/lib/workspace-policy";

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  type: "physical" | "digital" | "service" | "subscription";
  status: "draft" | "active" | "archived";
  currency: string;
  priceCents: number;
  promoPriceCents: number | null;
  costCents: number | null;
  storeId: string | null;
  description: string;
  shortDescription: string;
  mainImageUrl: string;
  deliveryUrl: string;
  trackInventory: boolean;
  stockQuantity: number;
  minStockAlert: number | null;
  version: string;
  categoryIds: string[];
  variants: { id: string; name: string; stock: number; version: string }[];
}
export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  storeId: string | null;
  imageUrl: string;
  version: string;
}
export interface CatalogData {
  status: "ready" | "unavailable" | "error";
  canManage: boolean;
  products: CatalogProduct[];
  categories: CatalogCategory[];
  stores: { id: string; name: string }[];
  movements: {
    id: string;
    product: string;
    variant: string | null;
    quantity: number;
    reason: string;
    note: string | null;
    date: string;
  }[];
}

/** Bounded lists, scoped by authenticated membership, with no demo fallback. */
export async function getCatalogData(): Promise<CatalogData> {
  const empty: CatalogData = {
    status: "unavailable",
    canManage: false,
    products: [],
    categories: [],
    stores: [],
    movements: [],
  };
  if (!isDatabaseConfigured()) return empty;
  const access = await getWorkspaceAccess();
  const workspaceId = access.workspaceId;
  try {
    const db = getDb();
    const [productRows, categoryRows, storeRows, movementRows] =
      await Promise.all([
        db
          .select({
            id: products.id,
            name: products.name,
            slug: products.slug,
            sku: products.sku,
            type: products.type,
            status: products.status,
            currency: products.currency,
            priceCents: products.priceCents,
            promoPriceCents: products.promoPriceCents,
            costCents: products.costCents,
            storeId: products.storeId,
            description: products.description,
            shortDescription: products.shortDescription,
            mainImageUrl: products.mainImageUrl,
            deliveryUrl: products.deliveryUrl,
            trackInventory: products.trackInventory,
            stockQuantity: products.stockQuantity,
            minStockAlert: products.minStockAlert,
            updatedAt: products.updatedAt,
          })
          .from(products)
          .where(
            and(
              eq(products.workspaceId, workspaceId),
              isNull(products.deletedAt),
            ),
          )
          .orderBy(desc(products.updatedAt))
          .limit(200),
        db
          .select({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
            description: categories.description,
            storeId: categories.storeId,
            imageUrl: categories.imageUrl,
            updatedAt: categories.updatedAt,
          })
          .from(categories)
          .where(
            and(
              eq(categories.workspaceId, workspaceId),
              isNull(categories.deletedAt),
            ),
          )
          .orderBy(categories.name)
          .limit(200),
        db
          .select({ id: stores.id, name: stores.name })
          .from(stores)
          .where(
            and(eq(stores.workspaceId, workspaceId), isNull(stores.deletedAt)),
          )
          .orderBy(stores.name)
          .limit(100),
        db
          .select({
            id: inventoryMovements.id,
            product: products.name,
            variant: productVariants.name,
            quantity: inventoryMovements.quantity,
            reason: inventoryMovements.reason,
            note: inventoryMovements.note,
            date: inventoryMovements.createdAt,
          })
          .from(inventoryMovements)
          .innerJoin(
            products,
            and(
              eq(products.id, inventoryMovements.productId),
              eq(products.workspaceId, workspaceId),
            ),
          )
          .leftJoin(
            productVariants,
            and(
              eq(productVariants.id, inventoryMovements.variantId),
              eq(productVariants.workspaceId, workspaceId),
            ),
          )
          .where(eq(inventoryMovements.workspaceId, workspaceId))
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(50),
      ]);
    const ids = productRows.map((p) => p.id);
    const [links, variantRows] = ids.length
      ? await Promise.all([
          db
            .select({
              productId: productCategories.productId,
              categoryId: productCategories.categoryId,
            })
            .from(productCategories)
            .where(
              and(
                eq(productCategories.workspaceId, workspaceId),
                inArray(productCategories.productId, ids),
              ),
            ),
          db
            .select({
              id: productVariants.id,
              productId: productVariants.productId,
              name: productVariants.name,
              stock: productVariants.stockQuantity,
              version: productVariants.updatedAt,
            })
            .from(productVariants)
            .where(
              and(
                eq(productVariants.workspaceId, workspaceId),
                inArray(productVariants.productId, ids),
                eq(productVariants.isActive, true),
              ),
            )
            .limit(1000),
        ])
      : [[], []];
    const linksByProduct = new Map<string, string[]>();
    for (const link of links) {
      const list = linksByProduct.get(link.productId) ?? [];
      list.push(link.categoryId);
      linksByProduct.set(link.productId, list);
    }
    const variantsByProduct = new Map<string, CatalogProduct["variants"]>();
    for (const variant of variantRows) {
      const list = variantsByProduct.get(variant.productId) ?? [];
      list.push({
        id: variant.id,
        name: variant.name,
        stock: variant.stock,
        version: variant.version.toISOString(),
      });
      variantsByProduct.set(variant.productId, list);
    }
    return {
      status: "ready",
      canManage: roleAllows(access.role, ["marketing", "finance"]),
      stores: storeRows,
      products: productRows.map((p) => ({
        ...p,
        sku: p.sku ?? "",
        description: p.description ?? "",
        shortDescription: p.shortDescription ?? "",
        mainImageUrl: p.mainImageUrl ?? "",
        deliveryUrl: p.deliveryUrl ?? "",
        version: p.updatedAt.toISOString(),
        categoryIds: linksByProduct.get(p.id) ?? [],
        variants: variantsByProduct.get(p.id) ?? [],
      })),
      categories: categoryRows.map((c) => ({
        ...c,
        description: c.description ?? "",
        imageUrl: c.imageUrl ?? "",
        version: c.updatedAt.toISOString(),
      })),
      movements: movementRows.map((m) => ({
        ...m,
        date: m.date.toISOString(),
      })),
    };
  } catch {
    return { ...empty, status: "error" };
  }
}
