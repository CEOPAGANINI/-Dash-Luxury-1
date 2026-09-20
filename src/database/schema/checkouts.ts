import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, softDelete } from "./_helpers";
import { publishStatus } from "./enums";
import { workspaces } from "./workspaces";
import { products } from "./catalog";

export const checkouts = pgTable(
  "checkouts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: publishStatus("status").default("draft").notNull(),
    mainProductId: uuid("main_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    gatewayAccountId: uuid("gateway_account_id"),
    currency: text("currency").default("BRL").notNull(),
    country: text("country").default("BR").notNull(),
    locale: text("locale").default("pt-BR").notNull(),
    /** single_page | multi_step */
    layoutType: text("layout_type").default("single_page").notNull(),
    /** Campos, aparência, conteúdo, frete, seo etc. do editor */
    config: jsonb("config").default({}).notNull(),
    paymentMethods: jsonb("payment_methods").default([]).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("checkouts_ws_slug_idx").on(t.workspaceId, t.slug),
    index("checkouts_workspace_idx").on(t.workspaceId),
  ],
);

export const checkoutVersions = pgTable(
  "checkout_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    createdBy: uuid("created_by"),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("checkout_versions_unique_idx").on(t.checkoutId, t.version),
  ],
);

export const checkoutProducts = pgTable(
  "checkout_products",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Sobrescreve o preço do produto neste checkout, se definido */
    priceOverrideCents: bigint("price_override_cents", { mode: "number" }),
    position: integer("position").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("checkout_products_unique_idx").on(t.checkoutId, t.productId),
  ],
);

export const orderBumps = pgTable(
  "order_bumps",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id")
      .notNull()
      .references(() => checkouts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    ctaText: text("cta_text"),
    position: integer("position").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("order_bumps_checkout_idx").on(t.checkoutId)],
);

export const paymentLinks = pgTable(
  "payment_links",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    currency: text("currency").default("BRL").notNull(),
    gatewayAccountId: uuid("gateway_account_id"),
    paymentMethods: jsonb("payment_methods").default([]).notNull(),
    couponId: uuid("coupon_id"),
    requiresAddress: boolean("requires_address").default(false).notNull(),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("payment_links_ws_slug_idx").on(t.workspaceId, t.slug),
    index("payment_links_workspace_idx").on(t.workspaceId),
  ],
);
