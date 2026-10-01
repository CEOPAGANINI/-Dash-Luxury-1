-- Authenticated server endpoints enforce workspace role and user ownership.
CREATE TABLE IF NOT EXISTS "funnel_vaults" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "revision" uuid NOT NULL,
  "envelope" jsonb NOT NULL CHECK (octet_length("envelope"::text) <= 4000000),
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id")
);
CREATE TABLE IF NOT EXISTS "funnel_vault_history" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "revision" uuid NOT NULL,
  "envelope" jsonb NOT NULL CHECK (octet_length("envelope"::text) <= 4000000),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id", "revision")
);
CREATE INDEX IF NOT EXISTS "funnel_vault_history_recent_idx" ON "funnel_vault_history" ("workspace_id", "user_id", "created_at" DESC);
CREATE TABLE IF NOT EXISTS "funnel_packages" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "funnel_id" text NOT NULL,
  "node_id" text NOT NULL,
  "product_id" text DEFAULT '' NOT NULL,
  "filename" text NOT NULL,
  "sha256" text NOT NULL,
  "size_bytes" integer NOT NULL CHECK ("size_bytes" BETWEEN 1 AND 3000000),
  "content" bytea NOT NULL CHECK (octet_length("content") = "size_bytes"),
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id", "funnel_id", "node_id", "product_id")
);
ALTER TABLE "funnel_vaults" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "funnel_vault_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "funnel_packages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "funnel_vaults", "funnel_vault_history", "funnel_packages" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "funnel_vaults", "funnel_vault_history", "funnel_packages" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "funnel_vaults", "funnel_vault_history", "funnel_packages" FROM authenticated;
  END IF;
END $$;
