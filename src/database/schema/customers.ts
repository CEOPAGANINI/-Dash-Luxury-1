import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, softDelete } from "./_helpers";
import { workspaces } from "./workspaces";

export const customers = pgTable(
  "customers",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    /** Documento (CPF/NIF) — armazenado, mas mascarado na UI para suporte */
    document: text("document"),
    country: text("country"),
    tags: jsonb("tags").default([]).notNull(),
    notes: text("notes"),
    isBlocked: boolean("is_blocked").default(false).notNull(),
    /** Bloqueio de comunicação (marketing) */
    marketingOptOut: boolean("marketing_opt_out").default(false).notNull(),
    firstPurchaseAt: timestamp("first_purchase_at", { withTimezone: true }),
    lastPurchaseAt: timestamp("last_purchase_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customers_ws_email_idx").on(t.workspaceId, t.email),
    index("customers_workspace_idx").on(t.workspaceId),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    country: text("country").notNull(),
    state: text("state"),
    city: text("city"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    postalCode: text("postal_code"),
    isDefault: boolean("is_default").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);

export const customerConsents = pgTable(
  "customer_consents",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** marketing_email | cart_recovery | cookies | terms */
    type: text("type").notNull(),
    granted: boolean("granted").notNull(),
    source: text("source"), // checkout | store | import
    ipMasked: text("ip_masked"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("customer_consents_customer_idx").on(t.customerId)],
);
