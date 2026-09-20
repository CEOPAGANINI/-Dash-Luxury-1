import {
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

export const landingPages = pgTable(
  "landing_pages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: publishStatus("status").default("draft").notNull(),
    template: text("template"),
    /** Conteúdo do editor por blocos (JSON) */
    content: jsonb("content").default({ blocks: [] }).notNull(),
    seo: jsonb("seo").default({}).notNull(),
    productId: uuid("product_id"),
    checkoutId: uuid("checkout_id"),
    domainId: uuid("domain_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("landing_pages_ws_slug_idx").on(t.workspaceId, t.slug),
    index("landing_pages_workspace_idx").on(t.workspaceId),
  ],
);

export const landingPageVersions = pgTable(
  "landing_page_versions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    landingPageId: uuid("landing_page_id")
      .notNull()
      .references(() => landingPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    createdBy: uuid("created_by"),
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("landing_page_versions_unique_idx").on(
      t.landingPageId,
      t.version,
    ),
  ],
);
