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

import { id, timestamps } from "./_helpers";
import {
  environment,
  integrationCategory,
  integrationStatus,
  webhookDeliveryStatus,
} from "./enums";
import { workspaces } from "./workspaces";

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Identificador do adapter: utmify | resend | meta_capi | ... */
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: integrationCategory("category").notNull(),
    status: integrationStatus("status").default("disconnected").notNull(),
    environment: environment("environment").default("production").notNull(),
    /** Credenciais criptografadas com ENCRYPTION_KEY */
    encryptedCredentials: text("encrypted_credentials"),
    config: jsonb("config").default({}).notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("integrations_ws_key_idx").on(t.workspaceId, t.key),
    index("integrations_workspace_idx").on(t.workspaceId),
  ],
);

export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(() => integrations.id, {
      onDelete: "cascade",
    }),
    integrationKey: text("integration_key").notNull(),
    /** request | response | error | info */
    level: text("level").default("info").notNull(),
    action: text("action").notNull(),
    message: text("message"),
    /** Dados mascarados — nunca tokens/credenciais em texto puro */
    data: jsonb("data").default({}).notNull(),
    durationMs: integer("duration_ms"),
    ...timestamps,
  },
  (t) => [
    index("integration_logs_ws_idx").on(t.workspaceId, t.createdAt),
    index("integration_logs_integration_idx").on(t.integrationId),
  ],
);

/**
 * Endpoints de webhook de saída configurados pelo usuário.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Segredo para assinatura HMAC dos payloads enviados */
    encryptedSecret: text("encrypted_secret"),
    /** Eventos assinados: order.created, payment.approved, ... */
    events: jsonb("events").default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("webhook_endpoints_ws_idx").on(t.workspaceId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    /** Chave de idempotência do evento */
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    status: webhookDeliveryStatus("status").default("pending").notNull(),
    httpStatus: integer("http_status"),
    responseBody: text("response_body"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    orderId: uuid("order_id"),
    ...timestamps,
  },
  (t) => [
    index("webhook_deliveries_endpoint_idx").on(t.endpointId),
    uniqueIndex("webhook_deliveries_idempotency_idx").on(
      t.endpointId,
      t.idempotencyKey,
    ),
    index("webhook_deliveries_retry_idx").on(t.status, t.nextRetryAt),
  ],
);
