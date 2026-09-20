import { sql } from "drizzle-orm";

import { getDb } from "@/database/client";

/*
  As tabelas do gerenciador, criadas pelo próprio painel.

  A migração 0005 existe em src/database/migrations, mas depende de alguém
  colar o SQL no Supabase — e a primeira vez que o gerenciador rodou em
  produção, ninguém tinha colado: o botão "Carregar exemplos" caiu num
  erro de servidor. Aqui o painel garante as tabelas sozinho, uma vez por
  instância, com o mesmo SQL (tudo IF NOT EXISTS, então rodar de novo não
  faz nada).
*/

const SQL_ADS = `
CREATE TABLE IF NOT EXISTS "ad_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "network" text NOT NULL,
  "external_id" text,
  "name" text NOT NULL,
  "objective" text,
  "status" text DEFAULT 'paused' NOT NULL,
  "daily_budget_cents" bigint,
  "lifetime_budget_cents" bigint,
  "source" text DEFAULT 'manual' NOT NULL,
  "spend_cents" bigint DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "purchases" integer DEFAULT 0 NOT NULL,
  "revenue_cents" bigint DEFAULT 0 NOT NULL,
  "synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ad_campaigns_ws_idx" ON "ad_campaigns" ("workspace_id", "network");
CREATE UNIQUE INDEX IF NOT EXISTS "ad_campaigns_external_idx" ON "ad_campaigns" ("workspace_id", "network", "external_id");
CREATE TABLE IF NOT EXISTS "ad_sets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "ad_campaigns"("id") ON DELETE CASCADE,
  "external_id" text,
  "name" text NOT NULL,
  "status" text DEFAULT 'paused' NOT NULL,
  "daily_budget_cents" bigint,
  "targeting" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "spend_cents" bigint DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "purchases" integer DEFAULT 0 NOT NULL,
  "revenue_cents" bigint DEFAULT 0 NOT NULL,
  "synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ad_sets_campaign_idx" ON "ad_sets" ("campaign_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ad_sets_external_idx" ON "ad_sets" ("workspace_id", "external_id");
CREATE TABLE IF NOT EXISTS "ads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "ad_set_id" uuid NOT NULL REFERENCES "ad_sets"("id") ON DELETE CASCADE,
  "external_id" text,
  "name" text NOT NULL,
  "status" text DEFAULT 'paused' NOT NULL,
  "creative" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "spend_cents" bigint DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "purchases" integer DEFAULT 0 NOT NULL,
  "revenue_cents" bigint DEFAULT 0 NOT NULL,
  "synced_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "ads_ad_set_idx" ON "ads" ("ad_set_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ads_external_idx" ON "ads" ("workspace_id", "external_id");
CREATE TABLE IF NOT EXISTS "ad_change_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "field" text NOT NULL,
  "before" text,
  "after" text,
  "decision" jsonb,
  "applied_remote" boolean DEFAULT false NOT NULL,
  "error" text,
  "actor" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ad_change_log_ws_idx" ON "ad_change_log" ("workspace_id", "created_at");
ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "campaign_class" text;
ALTER TABLE "ad_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_change_log" ENABLE ROW LEVEL SECURITY;
`;

let garantido: Promise<void> | null = null;

/**
 * Garante que as tabelas do gerenciador existem. Roda uma vez por
 * instância do servidor; se falhar, a próxima chamada tenta de novo.
 */
export function ensureAdsSchema(): Promise<void> {
  if (!garantido) {
    garantido = (async () => {
      const db = getDb();
      const comandos = SQL_ADS.split(";")
        .map((c) => c.trim())
        .filter(Boolean);
      for (const comando of comandos) {
        await db.execute(sql.raw(comando));
      }
    })().catch((error) => {
      garantido = null;
      throw error;
    });
  }
  return garantido;
}

/** Uma frase para a tela quando o banco recusa algo do gerenciador. */
export function mensagemDeErro(error: unknown): string {
  const detalhe = error instanceof Error ? error.message : String(error);
  if (/does not exist/i.test(detalhe)) {
    return `As tabelas do gerenciador não existem no banco e não foi possível criá-las daqui. Rode src/database/migrations/0005_ads_manager.sql no SQL Editor do Supabase. Detalhe: ${detalhe}`;
  }
  if (/permission denied/i.test(detalhe)) {
    return `O usuário do banco não tem permissão para isto. Detalhe: ${detalhe}`;
  }
  return `O banco recusou a operação: ${detalhe}`;
}
