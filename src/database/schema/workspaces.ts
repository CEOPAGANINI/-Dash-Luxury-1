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
import { workspaceRole } from "./enums";

/**
 * Perfis — espelham auth.users do Supabase (o id vem do Supabase Auth).
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  ...timestamps,
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    plan: text("plan").default("free").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    settings: jsonb("settings").default({}).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("workspaces_slug_idx").on(t.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: workspaceRole("role").default("viewer").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_members_unique_idx").on(t.workspaceId, t.profileId),
    index("workspace_members_profile_idx").on(t.profileId),
  ],
);
