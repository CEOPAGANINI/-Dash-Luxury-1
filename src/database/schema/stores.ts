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

export const stores = pgTable(
  "stores",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    primaryColor: text("primary_color"),
    country: text("country").default("BR").notNull(),
    currency: text("currency").default("BRL").notNull(),
    locale: text("locale").default("pt-BR").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("stores_slug_idx").on(t.slug),
    index("stores_workspace_idx").on(t.workspaceId),
  ],
);

export const storeSettings = pgTable(
  "store_settings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    termsOfService: text("terms_of_service"),
    privacyPolicy: text("privacy_policy"),
    shippingPolicy: text("shipping_policy"),
    refundPolicy: text("refund_policy"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    seo: jsonb("seo").default({}).notNull(),
    theme: jsonb("theme").default({}).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("store_settings_store_idx").on(t.storeId)],
);

export const domains = pgTable(
  "domains",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    hostname: text("hostname").notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("domains_hostname_idx").on(t.hostname),
    index("domains_workspace_idx").on(t.workspaceId),
  ],
);
