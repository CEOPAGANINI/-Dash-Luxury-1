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

import { id, timestamps, softDelete } from "./_helpers";
import { workspaces } from "./workspaces";

/*
  O gerenciador de anúncios.

  Três níveis, como no Gerenciador do Meta: campanha → conjunto → anúncio.
  Cada linha guarda o id da plataforma (external_id) quando veio de lá, e
  as métricas dos últimos 7 dias da última sincronização. Quem edita aqui
  edita primeiro na plataforma; só quando ela aceita é que a linha muda —
  e cada mudança fica no diário (ad_change_log), com a decisão do freio de
  mão que a liberou.

  Status e rede são texto, não enum: evita migração para cada valor novo
  que a plataforma inventar.
*/

/** As métricas que os três níveis compartilham. */
const metricas = {
  spendCents: bigint("spend_cents", { mode: "number" }).default(0).notNull(),
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  purchases: integer("purchases").default(0).notNull(),
  revenueCents: bigint("revenue_cents", { mode: "number" })
    .default(0)
    .notNull(),
  /** Quando as métricas foram lidas da plataforma pela última vez. */
  syncedAt: timestamp("synced_at", { withTimezone: true }),
};

export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** meta | google | youtube */
    network: text("network").notNull(),
    /** Id na plataforma; nulo quando a campanha nasceu aqui e ainda não subiu. */
    externalId: text("external_id"),
    name: text("name").notNull(),
    objective: text("objective"),
    /** active | paused | archived */
    status: text("status").default("paused").notNull(),
    dailyBudgetCents: bigint("daily_budget_cents", { mode: "number" }),
    lifetimeBudgetCents: bigint("lifetime_budget_cents", { mode: "number" }),
    /** manual | meta */
    source: text("source").default("manual").notNull(),
    /** A classe de trabalho (teste de criativos, escala…); só organização. */
    campaignClass: text("campaign_class"),
    ...metricas,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("ad_campaigns_ws_idx").on(t.workspaceId, t.network),
    uniqueIndex("ad_campaigns_external_idx").on(
      t.workspaceId,
      t.network,
      t.externalId,
    ),
  ],
);

export const adSets = pgTable(
  "ad_sets",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => adCampaigns.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    status: text("status").default("paused").notNull(),
    dailyBudgetCents: bigint("daily_budget_cents", { mode: "number" }),
    /** Público, posicionamentos e otimização, como a plataforma devolve. */
    targeting: jsonb("targeting").default({}).notNull(),
    ...metricas,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("ad_sets_campaign_idx").on(t.campaignId),
    uniqueIndex("ad_sets_external_idx").on(t.workspaceId, t.externalId),
  ],
);

export const ads = pgTable(
  "ads",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    adSetId: uuid("ad_set_id")
      .notNull()
      .references(() => adSets.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    status: text("status").default("paused").notNull(),
    /** Título, texto e miniatura do criativo, para a tela mostrar. */
    creative: jsonb("creative").default({}).notNull(),
    ...metricas,
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("ads_ad_set_idx").on(t.adSetId),
    uniqueIndex("ads_external_idx").on(t.workspaceId, t.externalId),
  ],
);

/**
 * O diário de mudanças. Toda edição — humana ou, no futuro, de agente —
 * passa por aqui com o antes, o depois e a decisão do freio de mão.
 */
export const adChangeLog = pgTable(
  "ad_change_log",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** campaign | ad_set | ad */
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    /** name | status | daily_budget | created */
    field: text("field").notNull(),
    before: text("before"),
    after: text("after"),
    /** A decisão do freio de mão, quando a mudança mexe em dinheiro. */
    decision: jsonb("decision"),
    /** Verdadeiro quando a plataforma aceitou a mudança. */
    appliedRemote: boolean("applied_remote").default(false).notNull(),
    error: text("error"),
    /** Quem pediu: o e-mail da sessão ou "agente". */
    actor: text("actor"),
    ...timestamps,
  },
  (t) => [index("ad_change_log_ws_idx").on(t.workspaceId, t.createdAt)],
);
