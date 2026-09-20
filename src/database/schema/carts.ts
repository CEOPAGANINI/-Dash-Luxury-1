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
import { cartStatus } from "./enums";
import { workspaces } from "./workspaces";
import { checkouts } from "./checkouts";
import { customers } from "./customers";
import { products, productVariants } from "./catalog";

export const carts = pgTable(
  "carts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    checkoutId: uuid("checkout_id").references(() => checkouts.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id"),
    status: cartStatus("status").default("active").notNull(),
    email: text("email"),
    phone: text("phone"),
    currency: text("currency").default("BRL").notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).default(0).notNull(),
    utm: jsonb("utm").default({}).notNull(),
    recoveredAt: timestamp("recovered_at", { withTimezone: true }),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("carts_workspace_idx").on(t.workspaceId),
    index("carts_status_idx").on(t.workspaceId, t.status),
    index("carts_session_idx").on(t.sessionId),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    isOrderBump: boolean("is_order_bump").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId)],
);

/**
 * Sessão de preenchimento do checkout (recuperação de estado, etapa atual).
 */
export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    checkoutId: uuid("checkout_id").references(() => checkouts.id, {
      onDelete: "set null",
    }),
    cartId: uuid("cart_id").references(() => carts.id, {
      onDelete: "set null",
    }),
    visitorSessionId: text("visitor_session_id"),
    /** contact | address | shipping | payment | confirmation */
    currentStep: text("current_step").default("contact").notNull(),
    formData: jsonb("form_data").default({}).notNull(),
    selectedPaymentMethod: text("selected_payment_method"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("checkout_sessions_checkout_idx").on(t.checkoutId),
    uniqueIndex("checkout_sessions_cart_idx").on(t.cartId),
  ],
);
