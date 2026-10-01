import {
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import type { FunnelEnvelope } from "@/features/funnel/funil-store";

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Access through authenticated editor endpoints only; no public Data API grants. */
export const funnelVaults = pgTable(
  "funnel_vaults",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    revision: uuid("revision").notNull(),
    envelope: jsonb("envelope").$type<FunnelEnvelope>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const funnelVaultHistory = pgTable(
  "funnel_vault_history",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    revision: uuid("revision").notNull(),
    envelope: jsonb("envelope").$type<FunnelEnvelope>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.revision] })],
);

export const funnelPackages = pgTable(
  "funnel_packages",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    funnelId: text("funnel_id").notNull(),
    nodeId: text("node_id").notNull(),
    productId: text("product_id").default("").notNull(),
    filename: text("filename").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytes("content").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.userId, t.funnelId, t.nodeId, t.productId],
    }),
  ],
);
