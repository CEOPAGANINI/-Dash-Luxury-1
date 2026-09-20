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
import {
  environment,
  ledgerDirection,
  ledgerEntryType,
  paymentStatus,
  payoutStatus,
} from "./enums";
import { workspaces } from "./workspaces";
import { orders } from "./orders";

/**
 * Catálogo de provedores suportados pela plataforma (stripe, mercado_pago,
 * pagarme, asaas, custom). Populado por seed.
 */
export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: id(),
    /** Identificador do adapter, ex.: "stripe" */
    key: text("key").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    /** Formas de pagamento realmente suportadas pelo adapter */
    supportedMethods: jsonb("supported_methods").default([]).notNull(),
    supportedCurrencies: jsonb("supported_currencies").default([]).notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("payment_providers_key_idx").on(t.key)],
);

/**
 * Conta de gateway conectada por um workspace (credenciais criptografadas).
 */
export const paymentProviderAccounts = pgTable(
  "payment_provider_accounts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => paymentProviders.id),
    label: text("label").notNull(),
    environment: environment("environment").default("sandbox").notNull(),
    /** Credenciais criptografadas com ENCRYPTION_KEY — nunca em texto puro */
    encryptedCredentials: text("encrypted_credentials"),
    enabledMethods: jsonb("enabled_methods").default([]).notNull(),
    /** Taxas configuradas manualmente para cálculo de líquido */
    feeConfig: jsonb("fee_config").default({}).notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    lastConnectionTestAt: timestamp("last_connection_test_at", {
      withTimezone: true,
    }),
    lastConnectionOk: boolean("last_connection_ok"),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("payment_provider_accounts_ws_idx").on(t.workspaceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    providerAccountId: uuid("provider_account_id").references(
      () => paymentProviderAccounts.id,
      { onDelete: "set null" },
    ),
    /** ID do pagamento no gateway */
    externalId: text("external_id"),
    status: paymentStatus("status").default("created").notNull(),
    method: text("method").notNull(), // card | pix | boleto | mbway | multibanco | sepa...
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    feeCents: bigint("fee_cents", { mode: "number" }).default(0).notNull(),
    netCents: bigint("net_cents", { mode: "number" }),
    currency: text("currency").default("BRL").notNull(),
    /** Chave de idempotência para evitar cobranças duplicadas */
    idempotencyKey: text("idempotency_key"),
    /** Últimos 4 dígitos / bandeira — nunca número completo nem CVV */
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    pixQrCode: text("pix_qr_code"),
    boletoUrl: text("boleto_url"),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").default({}).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_workspace_idx").on(t.workspaceId),
    index("payments_status_idx").on(t.workspaceId, t.status),
    uniqueIndex("payments_idempotency_idx").on(t.idempotencyKey),
    index("payments_external_idx").on(t.externalId),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    status: paymentStatus("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    /** Resposta resumida do gateway, com dados sensíveis mascarados */
    responseSummary: jsonb("response_summary").default({}).notNull(),
    ...timestamps,
  },
  (t) => [index("payment_attempts_payment_idx").on(t.paymentId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").default("BRL").notNull(),
    reason: text("reason"),
    status: text("status").default("pending").notNull(), // pending | completed | failed
    requestedBy: uuid("requested_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("refunds_payment_idx").on(t.paymentId)],
);

export const chargebacks = pgTable(
  "chargebacks",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").default("BRL").notNull(),
    reason: text("reason"),
    status: text("status").default("open").notNull(), // open | won | lost
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("chargebacks_payment_idx").on(t.paymentId)],
);

/**
 * Webhooks recebidos dos gateways — com verificação de assinatura e
 * deduplicação por event id externo.
 */
export const paymentWebhooks = pgTable(
  "payment_webhooks",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    providerAccountId: uuid("provider_account_id").references(
      () => paymentProviderAccounts.id,
      { onDelete: "set null" },
    ),
    providerKey: text("provider_key").notNull(),
    /** ID do evento no gateway — usado para deduplicar */
    externalEventId: text("external_event_id"),
    eventType: text("event_type").notNull(),
    signatureValid: boolean("signature_valid"),
    /** Payload com dados sensíveis mascarados */
    payload: jsonb("payload").default({}).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    paymentId: uuid("payment_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payment_webhooks_dedup_idx").on(
      t.providerKey,
      t.externalEventId,
    ),
    index("payment_webhooks_ws_idx").on(t.workspaceId),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerAccountId: uuid("provider_account_id").references(
      () => paymentProviderAccounts.id,
      { onDelete: "set null" },
    ),
    externalId: text("external_id"),
    status: payoutStatus("status").default("upcoming").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").default("BRL").notNull(),
    /** api = buscado do gateway; internal = calculado internamente */
    source: text("source").default("internal").notNull(),
    bankAccountLabel: text("bank_account_label"),
    expectedArrivalAt: timestamp("expected_arrival_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (t) => [index("payouts_workspace_idx").on(t.workspaceId)],
);

/**
 * Livro-caixa (Financeiro — Entradas e Saídas).
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: ledgerEntryType("type").notNull(),
    direction: ledgerDirection("direction").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").default("BRL").notNull(),
    status: text("status").default("confirmed").notNull(), // pending | confirmed | cancelled
    orderId: uuid("order_id"),
    paymentId: uuid("payment_id"),
    payoutId: uuid("payout_id"),
    gatewayKey: text("gateway_key"),
    attachmentPath: text("attachment_path"),
    createdBy: uuid("created_by"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("ledger_entries_workspace_idx").on(t.workspaceId),
    index("ledger_entries_occurred_idx").on(t.workspaceId, t.occurredAt),
  ],
);
