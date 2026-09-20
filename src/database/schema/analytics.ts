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
import { workspaces } from "./workspaces";

/**
 * Sessões de visitantes (Live View / dashboard de tráfego).
 * IP sempre mascarado; sem dados sensíveis.
 */
export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** ID anônimo gerado no client (cookie primeira-parte) */
    anonymousId: text("anonymous_id").notNull(),
    firstPage: text("first_page"),
    currentPage: text("current_page"),
    referrer: text("referrer"),
    utm: jsonb("utm").default({}).notNull(),
    deviceType: text("device_type"),
    browser: text("browser"),
    os: text("os"),
    countryCode: text("country_code"),
    city: text("city"),
    /** IP mascarado (ex.: 187.55.x.x) — nunca IP completo */
    ipMasked: text("ip_masked"),
    pageViews: integer("page_views").default(0).notNull(),
    durationSeconds: integer("duration_seconds").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("visitor_sessions_ws_idx").on(t.workspaceId),
    uniqueIndex("visitor_sessions_anon_idx").on(t.workspaceId, t.anonymousId),
    index("visitor_sessions_active_idx").on(t.workspaceId, t.isActive),
  ],
);

/**
 * Eventos de analytics (feed do Live View, funil, conversões).
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => visitorSessions.id, {
      onDelete: "cascade",
    }),
    /** page_view | view_content | add_to_cart | initiate_checkout | ... */
    eventName: text("event_name").notNull(),
    /** ID único do evento para deduplicação browser/servidor */
    eventId: text("event_id"),
    page: text("page"),
    productId: uuid("product_id"),
    checkoutId: uuid("checkout_id"),
    landingPageId: uuid("landing_page_id"),
    orderId: uuid("order_id"),
    valueCents: bigint("value_cents", { mode: "number" }),
    currency: text("currency"),
    properties: jsonb("properties").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("analytics_events_ws_idx").on(t.workspaceId, t.occurredAt),
    index("analytics_events_session_idx").on(t.sessionId),
    uniqueIndex("analytics_events_event_id_idx").on(t.eventId),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    channel: text("channel"), // meta | google | tiktok | email | organic | other
    budgetCents: bigint("budget_cents", { mode: "number" }),
    currency: text("currency").default("BRL").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    productIds: jsonb("product_ids").default([]).notNull(),
    landingPageIds: jsonb("landing_page_ids").default([]).notNull(),
    checkoutIds: jsonb("checkout_ids").default([]).notNull(),
    /** Custos importados manualmente/CSV por dia: [{date, costCents}] */
    manualCosts: jsonb("manual_costs").default([]).notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("campaigns_workspace_idx").on(t.workspaceId)],
);

export const campaignLinks = pgTable(
  "campaign_links",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name"),
    destinationUrl: text("destination_url").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    fullUrl: text("full_url").notNull(),
    clicks: integer("clicks").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("campaign_links_campaign_idx").on(t.campaignId)],
);
