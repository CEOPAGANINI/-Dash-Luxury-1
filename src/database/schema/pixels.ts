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
import { environment, pixelType } from "./enums";
import { workspaces } from "./workspaces";

export const pixels = pgTable(
  "pixels",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: pixelType("type").notNull(),
    /** ID público do pixel (ex.: Meta Pixel ID) */
    pixelId: text("pixel_id"),
    /** Token privado criptografado (ex.: CAPI) — nunca exposto no frontend */
    encryptedToken: text("encrypted_token"),
    environment: environment("environment").default("production").notNull(),
    /** Eventos habilitados individualmente */
    enabledEvents: jsonb("enabled_events").default([]).notNull(),
    domains: jsonb("domains").default([]).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("pixels_workspace_idx").on(t.workspaceId)],
);

/**
 * Vínculo de um pixel a produtos, checkouts ou landing pages.
 */
export const pixelBindings = pgTable(
  "pixel_bindings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id")
      .notNull()
      .references(() => pixels.id, { onDelete: "cascade" }),
    /** product | checkout | landing_page | store */
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pixel_bindings_unique_idx").on(
      t.pixelId,
      t.targetType,
      t.targetId,
    ),
  ],
);

/**
 * Log de eventos enviados a cada pixel (com resposta da integração).
 */
export const pixelEvents = pgTable(
  "pixel_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id")
      .notNull()
      .references(() => pixels.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    /** event_id para deduplicação browser/servidor */
    eventId: text("event_id").notNull(),
    /** browser | server */
    channel: text("channel").notNull(),
    orderId: uuid("order_id"),
    status: text("status").default("pending").notNull(), // pending | sent | failed
    /** Resposta da plataforma, mascarada */
    response: jsonb("response").default({}).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index("pixel_events_pixel_idx").on(t.pixelId),
    uniqueIndex("pixel_events_dedup_idx").on(t.pixelId, t.eventId, t.channel),
  ],
);
