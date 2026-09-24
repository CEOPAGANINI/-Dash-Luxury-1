-- Servidor do funil (VPS). Idempotente. Cole no SQL Editor do Supabase ou deixe o painel criar (ensureVpsSchema).
-- Regra deste arquivo: nenhum ponto e virgula dentro de comentario ou texto.
CREATE TABLE IF NOT EXISTS "vps_servers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" text DEFAULT 'aguardando_agente' NOT NULL,
  "enroll_code_hash" text, "enroll_expires_at" timestamptz,
  "agent_token_hash" text,
  "key_generation" integer DEFAULT 0 NOT NULL,
  "agent_last_seq" bigint DEFAULT 0 NOT NULL,
  "job_seq" bigint DEFAULT 0 NOT NULL,
  "registered_at" timestamptz, "confirmed_at" timestamptz, "confirmed_by" text,
  "last_pulse_at" timestamptz, "last_seen_ip" text,
  "public_ipv4" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "public_ipv6" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reported_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ip_override" text, "hostname" text, "os_name" text, "agent_version" text,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "locks" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_overview" jsonb, "last_overview_at" timestamptz, "last_overview_error" text,
  "fast_pulse_until" timestamptz, "viewer_seen_at" timestamptz, "last_error" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "vps_servers_ws_idx" ON "vps_servers" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vps_servers_token_idx" ON "vps_servers" ("agent_token_hash") WHERE "agent_token_hash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "vps_servers_enroll_idx" ON "vps_servers" ("enroll_code_hash") WHERE "enroll_code_hash" IS NOT NULL;
CREATE TABLE IF NOT EXISTS "vps_sites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "server_id" uuid NOT NULL REFERENCES "vps_servers"("id") ON DELETE CASCADE,
  "name" text NOT NULL, "slug" text NOT NULL,
  "status" text DEFAULT 'configurando' NOT NULL,
  "checkout_origin" text NOT NULL, "checkout_url" text,
  "nginx_applied_at" timestamptz, "nginx_error" text,
  "tls_status" text DEFAULT 'sem_ssl' NOT NULL,
  "tls_expires_at" timestamptz, "tls_checked_at" timestamptz, "tls_error" text,
  "reported_present" boolean,
  "reported_release" text, "reported_at" timestamptz,
  "public_check" jsonb DEFAULT '{}'::jsonb NOT NULL, "public_check_at" timestamptz,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "vps_sites_ws_idx" ON "vps_sites" ("workspace_id");
CREATE INDEX IF NOT EXISTS "vps_sites_server_idx" ON "vps_sites" ("server_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vps_sites_server_slug_idx" ON "vps_sites" ("server_id", "slug") WHERE "deleted_at" IS NULL;
CREATE TABLE IF NOT EXISTS "vps_site_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "site_id" uuid NOT NULL REFERENCES "vps_sites"("id") ON DELETE CASCADE,
  "hostname" text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "dns_status" text DEFAULT 'nao_verificado' NOT NULL,
  "dns_detail" jsonb DEFAULT '{}'::jsonb NOT NULL, "dns_checked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vps_site_domains_hostname_idx" ON "vps_site_domains" ("hostname");
CREATE INDEX IF NOT EXISTS "vps_site_domains_site_idx" ON "vps_site_domains" ("site_id");
CREATE TABLE IF NOT EXISTS "vps_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "sha256" text NOT NULL, "size_bytes" integer NOT NULL, "content" bytea NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vps_artifacts_ws_idx" ON "vps_artifacts" ("workspace_id");
CREATE TABLE IF NOT EXISTS "vps_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "site_id" uuid NOT NULL REFERENCES "vps_sites"("id") ON DELETE CASCADE,
  "artifact_id" uuid REFERENCES "vps_artifacts"("id") ON DELETE SET NULL,
  "source" text DEFAULT 'zip' NOT NULL, "file_name" text,
  "file_count" integer NOT NULL, "uncompressed_bytes" bigint NOT NULL, "zip_bytes" integer NOT NULL,
  "sha256" text NOT NULL, "index_sha256" text NOT NULL,
  "pages" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "has_tracking" boolean DEFAULT false NOT NULL,
  "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'enviando' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL, "activated_at" timestamptz,
  "error" text, "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vps_releases_site_idx" ON "vps_releases" ("site_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "vps_releases_active_idx" ON "vps_releases" ("site_id") WHERE "is_active";
CREATE TABLE IF NOT EXISTS "vps_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "server_id" uuid NOT NULL REFERENCES "vps_servers"("id") ON DELETE CASCADE,
  "site_id" uuid REFERENCES "vps_sites"("id") ON DELETE SET NULL,
  "release_id" uuid REFERENCES "vps_releases"("id") ON DELETE SET NULL,
  "seq" bigint NOT NULL, "type" text NOT NULL,
  "params" text NOT NULL, "signature" text NOT NULL,
  "status" text DEFAULT 'pendente' NOT NULL,
  "expires_at" timestamptz NOT NULL, "delivered_at" timestamptz, "finished_at" timestamptz,
  "result" jsonb, "error" text, "duration_ms" integer,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "vps_jobs_server_seq_idx" ON "vps_jobs" ("server_id", "seq");
CREATE INDEX IF NOT EXISTS "vps_jobs_fila_idx" ON "vps_jobs" ("server_id", "status", "seq");
CREATE INDEX IF NOT EXISTS "vps_jobs_ws_idx" ON "vps_jobs" ("workspace_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "vps_jobs_site_aberta_idx" ON "vps_jobs" ("site_id") WHERE "site_id" IS NOT NULL AND "status" IN ('pendente', 'entregue');
CREATE UNIQUE INDEX IF NOT EXISTS "vps_jobs_coleta_aberta_idx" ON "vps_jobs" ("server_id") WHERE "type" = 'servidor.coletar' AND "status" IN ('pendente', 'entregue');
CREATE TABLE IF NOT EXISTS "vps_operation_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL, "action" text NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vps_operation_attempts_owner_idx" ON "vps_operation_attempts" ("owner_user_id", "at");
ALTER TABLE "vps_servers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_site_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vps_operation_attempts" ENABLE ROW LEVEL SECURITY;
-- Coluna que entrou depois da primeira versao deste arquivo: um banco que ja tinha as tabelas ganha a
-- coluna aqui (e o ensureVpsSchema usa esta coluna como sentinela, junto com a de baixo).
ALTER TABLE "vps_servers" ADD COLUMN IF NOT EXISTS "reported_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;
-- Banco que recebeu o SQL da antiga VPS por SSH (docs/sql/vps-panel.sql, arquivado no ramo chatgpt-trabalho): a
-- vps_operation_attempts de la nao tem workspace_id, e o CREATE TABLE IF NOT EXISTS acima a pula. A tabela e so o
-- limitador de acoes (guarda um dia), entao as linhas sem workspace podem sair. O indice de la repete o de cima.
ALTER TABLE "vps_operation_attempts" ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE;
DELETE FROM "vps_operation_attempts" WHERE "workspace_id" IS NULL;
ALTER TABLE "vps_operation_attempts" ALTER COLUMN "workspace_id" SET NOT NULL;
DROP INDEX IF EXISTS "vps_operation_attempts_owner_at_idx";
