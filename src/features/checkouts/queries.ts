import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { checkouts, orders, products } from "@/database/schema";
import {
  getOrCreateDefaultWorkspace,
  getPublicWorkspaceId,
} from "@/lib/workspace";
import {
  completarConfig,
  type CheckoutConfig,
} from "@/features/checkout-editor/checkout-config";

export interface CheckoutRow {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  paymentMethods: string[];
  publishedAt: Date | null;
  createdAt: Date;
  /** Métricas reais calculadas a partir dos pedidos */
  orderCount: number;
  paidCount: number;
  revenueCents: number;
}

/** Checkouts do workspace, com métricas reais de pedidos. */
export async function listCheckouts(): Promise<CheckoutRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select({
      id: checkouts.id,
      workspaceId: checkouts.workspaceId,
      name: checkouts.name,
      slug: checkouts.slug,
      status: checkouts.status,
      currency: checkouts.currency,
      productId: checkouts.mainProductId,
      productName: products.name,
      productSlug: products.slug,
      paymentMethods: checkouts.paymentMethods,
      publishedAt: checkouts.publishedAt,
      createdAt: checkouts.createdAt,
      orderCount: sql<number>`count(${orders.id})::int`,
      paidCount: sql<number>`count(${orders.id}) filter (where ${orders.status} in ('paid','preparing','shipped','delivered'))::int`,
      revenueCents:
        sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('paid','preparing','shipped','delivered')), 0)`.mapWith(
          Number,
        ),
    })
    .from(checkouts)
    .leftJoin(products, eq(checkouts.mainProductId, products.id))
    .leftJoin(orders, eq(orders.checkoutId, checkouts.id))
    .where(
      and(eq(checkouts.workspaceId, workspaceId), isNull(checkouts.deletedAt)),
    )
    .groupBy(
      checkouts.id,
      checkouts.workspaceId,
      checkouts.name,
      checkouts.slug,
      checkouts.status,
      checkouts.currency,
      checkouts.mainProductId,
      products.name,
      products.slug,
      checkouts.paymentMethods,
      checkouts.publishedAt,
      checkouts.createdAt,
    )
    .orderBy(desc(checkouts.createdAt));

  return rows.map((r) => ({
    ...r,
    paymentMethods: Array.isArray(r.paymentMethods)
      ? (r.paymentMethods as string[])
      : [],
  }));
}

export interface PublicCheckout {
  id: string;
  slug: string;
  productSlug: string;
  paymentMethods: string[];
  workspaceId: string;
  config: CheckoutConfig;
}

/**
 * Resolve um checkout publicado pelo slug, para a rota pública.
 * Devolve null quando não existe ou não está publicado — nesse caso a
 * rota cai no comportamento antigo (slug do produto).
 */
export async function getPublishedCheckoutBySlug(
  slug: string,
  store?: string,
): Promise<PublicCheckout | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const db = getDb();
    // Store is only a selector; ownership is taken from the published row returned below.
    const workspaceId =
      store && /^[0-9a-f-]{36}$/i.test(store)
        ? store
        : await getPublicWorkspaceId();
    const rows = await db
      .select({
        id: checkouts.id,
        slug: checkouts.slug,
        productSlug: products.slug,
        paymentMethods: checkouts.paymentMethods,
        workspaceId: checkouts.workspaceId,
        config: checkouts.config,
      })
      .from(checkouts)
      .innerJoin(products, eq(checkouts.mainProductId, products.id))
      .where(
        and(
          eq(checkouts.slug, slug),
          eq(checkouts.workspaceId, workspaceId),
          eq(checkouts.status, "published"),
          isNull(checkouts.deletedAt),
          eq(products.workspaceId, workspaceId),
          eq(products.status, "active"),
          isNull(products.deletedAt),
          or(isNull(checkouts.startsAt), lte(checkouts.startsAt, new Date())),
          or(isNull(checkouts.endsAt), gte(checkouts.endsAt, new Date())),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      productSlug: row.productSlug,
      workspaceId: row.workspaceId,
      config: completarConfig(row.config),
      paymentMethods: Array.isArray(row.paymentMethods)
        ? (row.paymentMethods as string[])
        : [],
    };
  } catch {
    console.error("[checkouts] public_resolution_failed");
    return null;
  }
}

/** Prevent an unpublished/deleted checkout URL from falling back to an unrelated product route. */
export async function isConfiguredCheckoutSlug(slug: string) {
  if (!isDatabaseConfigured()) return false;
  const workspaceId = await getPublicWorkspaceId();
  const [row] = await getDb()
    .select({ id: checkouts.id })
    .from(checkouts)
    .where(
      and(eq(checkouts.workspaceId, workspaceId), eq(checkouts.slug, slug)),
    )
    .limit(1);
  return Boolean(row);
}

/** The editor only reads a checkout in the signed-in account's workspace. */
export async function getCheckoutForEditor(id: string) {
  if (!isDatabaseConfigured()) return null;
  const workspaceId = await getOrCreateDefaultWorkspace();
  const [checkout] = await getDb()
    .select({
      id: checkouts.id,
      name: checkouts.name,
      config: checkouts.config,
      paymentMethods: checkouts.paymentMethods,
      status: checkouts.status,
      slug: checkouts.slug,
      productName: products.name,
      workspaceId: checkouts.workspaceId,
      updatedAt: checkouts.updatedAt,
    })
    .from(checkouts)
    .leftJoin(products, eq(products.id, checkouts.mainProductId))
    .where(
      and(
        eq(checkouts.id, id),
        eq(checkouts.workspaceId, workspaceId),
        isNull(checkouts.deletedAt),
      ),
    )
    .limit(1);
  if (!checkout) return null;
  const config = completarConfig({
    ...(checkout.config as object),
    pagamentos: checkout.paymentMethods,
  });
  return {
    ...checkout,
    revision: checkout.updatedAt.toISOString(),
    config: {
      ...config,
      campos: config.campos.map((field) =>
        field.id === "cupom"
          ? { ...field, ativo: false, obrigatorio: false }
          : field,
      ),
    },
  };
}
