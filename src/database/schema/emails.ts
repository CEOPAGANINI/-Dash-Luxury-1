import {
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
import { emailCampaignStatus, emailEventType } from "./enums";
import { workspaces } from "./workspaces";
import { customers } from "./customers";

export const emailCampaigns = pgTable(
  "email_campaigns",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    preheader: text("preheader"),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    replyTo: text("reply_to"),
    /** Conteúdo do editor por blocos */
    content: jsonb("content").default({ blocks: [] }).notNull(),
    /** Critérios de segmentação dos destinatários */
    audienceFilter: jsonb("audience_filter").default({}).notNull(),
    status: emailCampaignStatus("status").default("draft").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    stats: jsonb("stats").default({}).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("email_campaigns_ws_idx").on(t.workspaceId)],
);

export const emailRecipients = pgTable(
  "email_recipients",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => emailCampaigns.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    /** ID da mensagem no provedor (Resend) */
    externalId: text("external_id"),
    status: text("status").default("pending").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("email_recipients_unique_idx").on(t.campaignId, t.email),
    index("email_recipients_campaign_idx").on(t.campaignId),
  ],
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").references(() => emailRecipients.id, {
      onDelete: "cascade",
    }),
    campaignId: uuid("campaign_id").references(() => emailCampaigns.id, {
      onDelete: "cascade",
    }),
    type: emailEventType("type").notNull(),
    /** ID do evento no provedor — deduplicação de webhooks */
    externalEventId: text("external_event_id"),
    metadata: jsonb("metadata").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("email_events_campaign_idx").on(t.campaignId),
    uniqueIndex("email_events_dedup_idx").on(t.externalEventId),
  ],
);

/**
 * Lista de supressão — endereços que nunca devem receber e-mails.
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** unsubscribe | bounce | complaint | manual */
    reason: text("reason").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("email_suppressions_unique_idx").on(t.workspaceId, t.email),
  ],
);

/** Contagem de envios recentes por destinatário (controle de frequência) */
export const emailFrequencyCaps = pgTable(
  "email_frequency_caps",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    windowStartAt: timestamp("window_start_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("email_frequency_caps_unique_idx").on(t.workspaceId, t.email),
  ],
);
