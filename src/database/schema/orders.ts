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

import { id, timestamps } from "./_helpers";
import { orderStatus } from "./enums";
import { workspaces } from "./workspaces";
import { customers } from "./customers";
import { checkouts } from "./checkouts";
import { carts } from "./carts";
import { products, productVariants } from "./catalog";

export const orders = pgTable(
  "orders",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Referência curta e legível, ex.: VD-1042 */
    reference: text("reference").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    checkoutId: uuid("checkout_id").references(() => checkouts.id, {
      onDelete: "set null",
    }),
    cartId: uuid("cart_id").references(() => carts.id, {
      onDelete: "set null",
    }),
    paymentLinkId: uuid("payment_link_id"),
    campaignId: uuid("campaign_id"),
    status: orderStatus("status").default("created").notNull(),
    currency: text("currency").default("BRL").notNull(),
    subtotalCents: bigint("subtotal_cents", { mode: "number" })
      .default(0)
      .notNull(),
    discountCents: bigint("discount_cents", { mode: "number" })
      .default(0)
      .notNull(),
    shippingCents: bigint("shipping_cents", { mode: "number" })
      .default(0)
      .notNull(),
    taxCents: bigint("tax_cents", { mode: "number" }).default(0).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).default(0).notNull(),
    couponId: uuid("coupon_id"),
    shippingMethod: text("shipping_method"),
    shippingAddress: jsonb("shipping_address"),
    billingAddress: jsonb("billing_address"),
    /** UTMs e click ids capturados na sessão */
    utm: jsonb("utm").default({}).notNull(),
    origin: text("origin"), // store | checkout | payment_link | landing_page
    deviceType: text("device_type"),
    countryCode: text("country_code"),
    internalNotes: text("internal_notes"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_ws_reference_idx").on(t.workspaceId, t.reference),
    index("orders_workspace_idx").on(t.workspaceId),
    index("orders_status_idx").on(t.workspaceId, t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    /** Snapshot do nome no momento da compra */
    productName: text("product_name").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    isOrderBump: boolean("is_order_bump").default(false).notNull(),
    /** Entrega digital */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    downloadCount: integer("download_count").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    reason: text("reason"),
    changedBy: uuid("changed_by"), // profile id ou null (sistema/webhook)
    metadata: jsonb("metadata").default({}).notNull(),
    ...timestamps,
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId)],
);
