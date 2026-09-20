import { bigint, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_helpers";
import { workspaces, profiles } from "./workspaces";

/**
 * Auditoria de ações administrativas (quem fez o quê, quando).
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    /** ex.: product.created, order.refunded, integration.connected */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    /** Diferenças/contexto com dados sensíveis mascarados */
    changes: jsonb("changes").default({}).notNull(),
    ipMasked: text("ip_masked"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    index("audit_logs_ws_idx").on(t.workspaceId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

/**
 * Arquivos enviados (Supabase Storage) com verificação de MIME e limite
 * de tamanho aplicados no upload.
 */
export const files = pgTable(
  "files",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    bucket: text("bucket").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** product_image | product_file | attachment | avatar | ... */
    purpose: text("purpose"),
    metadata: jsonb("metadata").default({}).notNull(),
    ...timestamps,
  },
  (t) => [index("files_ws_idx").on(t.workspaceId)],
);
