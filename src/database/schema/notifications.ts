import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { notificationChannel } from "./enums";
import { workspaces, profiles } from "./workspaces";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** new_sale | payment_approved | payment_refused | cart_abandoned | ... */
    eventType: text("event_type").notNull(),
    channel: notificationChannel("channel").notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    /** Filtros opcionais: produto, gateway, valor mínimo, horário, frequência */
    filters: jsonb("filters").default({}).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notification_prefs_unique_idx").on(
      t.workspaceId,
      t.profileId,
      t.eventType,
      t.channel,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => profiles.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    valueCents: bigint("value_cents", { mode: "number" }),
    channel: notificationChannel("channel").default("in_app").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}).notNull(),
    ...timestamps,
  },
  (t) => [
    index("notifications_profile_idx").on(t.profileId, t.readAt),
    index("notifications_ws_idx").on(t.workspaceId, t.createdAt),
  ],
);
