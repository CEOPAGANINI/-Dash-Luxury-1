import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  CapacidadesVps,
  ConferenciaPublica,
  DetalheDns,
  PaginasDoFunil,
  VpsOverviewSemUsuarios,
} from "@/features/vps/modelo";

import { id, softDelete, timestamps } from "./_helpers";
import { workspaces } from "./workspaces";

/*
  O Servidor do Funil (VPS do dono).

  O painel nunca abre conexão com a VPS e não guarda segredo reversível:
  só sha256 do token do agente e do código de instalação, os parâmetros
  das tarefas (com a assinatura) e o ZIP de vida curta. As chaves de
  assinatura são derivadas de VPS_CHAVE_MESTRA + servidor + geração.

  Status em texto, como no gerenciador de anúncios: sem migração para cada
  valor novo. A migração é à mão (0006_vps.sql, fora do journal) e é a
  mesma constante SQL_VPS de src/features/vps/schema-sql.ts; um teste
  compara as duas e confere as colunas contra este arquivo.

  Colunas int8 (`seq`, `job_seq`, `agent_last_seq`, `uncompressed_bytes`)
  só são lidas pelo query builder: o postgres-js de produção devolve int8
  como string no SQL cru, e o `mode: "number"` daqui aplica Number().
*/

/** PGlite devolve Uint8Array, postgres-js devolve Buffer: normaliza. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});
const ws = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const tz = (n: string) => timestamp(n, { withTimezone: true });

export const vpsServers = pgTable(
  "vps_servers",
  {
    id: id(),
    workspaceId: ws(),
    name: text("name").notNull(),
    /** aguardando_agente | aguardando_confirmacao | ativo | revogado */
    status: text("status").default("aguardando_agente").notNull(),
    /** sha256 hex do código de instalação (uso único). */
    enrollCodeHash: text("enroll_code_hash"),
    enrollExpiresAt: tz("enroll_expires_at"),
    /** sha256 hex do token que NASCE na VPS. */
    agentTokenHash: text("agent_token_hash"),
    /** Entra na derivação das chaves; +1 revoga as chaves antigas. */
    keyGeneration: integer("key_generation").default(0).notNull(),
    agentLastSeq: bigint("agent_last_seq", { mode: "number" })
      .default(0)
      .notNull(),
    jobSeq: bigint("job_seq", { mode: "number" }).default(0).notNull(),
    registeredAt: tz("registered_at"),
    confirmedAt: tz("confirmed_at"),
    confirmedBy: text("confirmed_by"),
    lastPulseAt: tz("last_pulse_at"),
    lastSeenIp: text("last_seen_ip"),
    publicIpv4: jsonb("public_ipv4").$type<string[]>().default([]).notNull(),
    publicIpv6: jsonb("public_ipv6").$type<string[]>().default([]).notNull(),
    /**
     * Pastas /var/www/dash-funil/<slug> que o agente relatou no último
     * pulso. A VPS pode ter pastas de OUTRO servidor do painel (um servidor
     * removido continua servindo os sites, e a mesma VPS pode ser
     * registrada de novo): um site novo nunca recebe um desses slugs.
     */
    reportedSlugs: jsonb("reported_slugs")
      .$type<string[]>()
      .default([])
      .notNull(),
    /** IPv4 público informado pelo dono (vence os relatados). */
    ipOverride: text("ip_override"),
    hostname: text("hostname"),
    osName: text("os_name"),
    agentVersion: text("agent_version"),
    /** nginx, python, certbot, desvioRelogioMs */
    capabilities: jsonb("capabilities")
      .$type<CapacidadesVps>()
      .default({})
      .notNull(),
    /** Travas locais da VPS, como o agente informa; o painel não desfaz. */
    locks: jsonb("locks")
      .$type<{ pausado?: boolean; somenteLeitura?: boolean }>()
      .default({})
      .notNull(),
    lastOverview: jsonb("last_overview").$type<VpsOverviewSemUsuarios>(),
    lastOverviewAt: tz("last_overview_at"),
    lastOverviewError: text("last_overview_error"),
    fastPulseUntil: tz("fast_pulse_until"),
    viewerSeenAt: tz("viewer_seen_at"),
    lastError: text("last_error"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("vps_servers_ws_idx").on(t.workspaceId),
    uniqueIndex("vps_servers_token_idx")
      .on(t.agentTokenHash)
      .where(sql`agent_token_hash IS NOT NULL`),
    uniqueIndex("vps_servers_enroll_idx")
      .on(t.enrollCodeHash)
      .where(sql`enroll_code_hash IS NOT NULL`),
  ],
);

export const vpsSites = pgTable(
  "vps_sites",
  {
    id: id(),
    workspaceId: ws(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => vpsServers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Pasta /var/www/dash-funil/<slug> e dash-<slug>.conf */
    slug: text("slug").notNull(),
    /** configurando | ativo | erro | removendo */
    status: text("status").default("configurando").notNull(),
    /** Origem da lista permitida (regra ORIGEM). */
    checkoutOrigin: text("checkout_origin").notNull(),
    /** <origem>/checkout/<slug> ou NULL */
    checkoutUrl: text("checkout_url"),
    nginxAppliedAt: tz("nginx_applied_at"),
    nginxError: text("nginx_error"),
    /** sem_ssl | emitindo | ativo | erro */
    tlsStatus: text("tls_status").default("sem_ssl").notNull(),
    tlsExpiresAt: tz("tls_expires_at"),
    tlsCheckedAt: tz("tls_checked_at"),
    tlsError: text("tls_error"),
    /** NULL = o agente nunca informou; false = a VPS não tem este site. */
    reportedPresent: boolean("reported_present"),
    /** O que o agente diz ter em current (uuid da versão ou "vazio"). */
    reportedRelease: text("reported_release"),
    reportedAt: tz("reported_at"),
    publicCheck: jsonb("public_check")
      .$type<ConferenciaPublica>()
      .default({})
      .notNull(),
    publicCheckAt: tz("public_check_at"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("vps_sites_ws_idx").on(t.workspaceId),
    index("vps_sites_server_idx").on(t.serverId),
    uniqueIndex("vps_sites_server_slug_idx")
      .on(t.serverId, t.slug)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const vpsSiteDomains = pgTable(
  "vps_site_domains",
  {
    id: id(),
    workspaceId: ws(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => vpsSites.id, { onDelete: "cascade" }),
    /** Minúsculo, punycode. */
    hostname: text("hostname").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    /** nao_verificado | ok | outro_ip | sem_registro | aaaa_divergente | erro_consulta */
    dnsStatus: text("dns_status").default("nao_verificado").notNull(),
    dnsDetail: jsonb("dns_detail").$type<DetalheDns>().default({}).notNull(),
    dnsCheckedAt: tz("dns_checked_at"),
    ...timestamps,
  },
  (t) => [
    // Global: um domínio, um site.
    uniqueIndex("vps_site_domains_hostname_idx").on(t.hostname),
    index("vps_site_domains_site_idx").on(t.siteId),
  ],
);

export const vpsArtifacts = pgTable(
  "vps_artifacts",
  {
    id: id(),
    workspaceId: ws(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** ≤ 3.000.000; a LINHA é apagada quando a publicação termina. */
    content: bytea("content").notNull(),
    ...timestamps,
  },
  (t) => [index("vps_artifacts_ws_idx").on(t.workspaceId)],
);

export const vpsReleases = pgTable(
  "vps_releases",
  {
    id: id(),
    workspaceId: ws(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => vpsSites.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").references(() => vpsArtifacts.id, {
      onDelete: "set null",
    }),
    /** zip | fotografia (fase 2) */
    source: text("source").default("zip").notNull(),
    fileName: text("file_name"),
    fileCount: integer("file_count").notNull(),
    uncompressedBytes: bigint("uncompressed_bytes", {
      mode: "number",
    }).notNull(),
    zipBytes: integer("zip_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** Base da conferência pública ("No ar"). */
    indexSha256: text("index_sha256").notNull(),
    pages: jsonb("pages").$type<PaginasDoFunil>().default({}).notNull(),
    hasTracking: boolean("has_tracking").default(false).notNull(),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    /** enviando | no_servidor | falhou | removida */
    status: text("status").default("enviando").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    activatedAt: tz("activated_at"),
    error: text("error"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("vps_releases_site_idx").on(t.siteId, t.createdAt),
    uniqueIndex("vps_releases_active_idx")
      .on(t.siteId)
      .where(sql`is_active`),
  ],
);

export const vpsJobs = pgTable(
  "vps_jobs",
  {
    id: id(),
    workspaceId: ws(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => vpsServers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => vpsSites.id, {
      onDelete: "set null",
    }),
    releaseId: uuid("release_id").references(() => vpsReleases.id, {
      onDelete: "set null",
    }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    /** Um dos 6 tipos da lista branca. */
    type: text("type").notNull(),
    /** JSON EXATO que foi assinado (text, não jsonb: jsonb reordena chaves). */
    params: text("params").notNull(),
    signature: text("signature").notNull(),
    /** pendente | entregue | concluida | falhou | expirada | sem_resposta */
    status: text("status").default("pendente").notNull(),
    /** = new Date(expiraEm * 1000): o segundo inteiro EXATO que foi assinado. */
    expiresAt: tz("expires_at").notNull(),
    deliveredAt: tz("delivered_at"),
    finishedAt: tz("finished_at"),
    result: jsonb("result"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vps_jobs_server_seq_idx").on(t.serverId, t.seq),
    index("vps_jobs_fila_idx").on(t.serverId, t.status, t.seq),
    index("vps_jobs_ws_idx").on(t.workspaceId, t.createdAt),
    uniqueIndex("vps_jobs_site_aberta_idx")
      .on(t.siteId)
      .where(sql`site_id IS NOT NULL AND status IN ('pendente', 'entregue')`),
    uniqueIndex("vps_jobs_coleta_aberta_idx")
      .on(t.serverId)
      .where(
        sql`type = 'servidor.coletar' AND status IN ('pendente', 'entregue')`,
      ),
  ],
);

/** Limitador (do painel VPS anterior): 10 ações por minuto por conta. */
export const vpsOperationAttempts = pgTable(
  "vps_operation_attempts",
  {
    id: id(),
    workspaceId: ws(),
    ownerUserId: text("owner_user_id").notNull(),
    action: text("action").notNull(),
    at: tz("at").defaultNow().notNull(),
  },
  (t) => [index("vps_operation_attempts_owner_idx").on(t.ownerUserId, t.at)],
);

export type VpsServidorLinha = typeof vpsServers.$inferSelect;
export type VpsSiteLinha = typeof vpsSites.$inferSelect;
export type VpsDominioLinha = typeof vpsSiteDomains.$inferSelect;
export type VpsReleaseLinha = typeof vpsReleases.$inferSelect;
export type VpsTarefaLinha = typeof vpsJobs.$inferSelect;
