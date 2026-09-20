CREATE TABLE IF NOT EXISTS "daily_business_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "metric_date" date NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "processed_volume_cents" bigint DEFAULT 0 NOT NULL,
  "approved_revenue_cents" bigint DEFAULT 0 NOT NULL,
  "pending_revenue_cents" bigint DEFAULT 0 NOT NULL,
  "declined_revenue_cents" bigint DEFAULT 0 NOT NULL,
  "settled_cash_cents" bigint DEFAULT 0 NOT NULL,
  "refunds_cents" bigint DEFAULT 0 NOT NULL,
  "chargebacks_cents" bigint DEFAULT 0 NOT NULL,
  "discounts_cents" bigint DEFAULT 0 NOT NULL,
  "gateway_fees_cents" bigint DEFAULT 0 NOT NULL,
  "taxes_cents" bigint DEFAULT 0 NOT NULL,
  "media_spend_cents" bigint DEFAULT 0 NOT NULL,
  "product_cost_cents" bigint DEFAULT 0 NOT NULL,
  "other_variable_costs_cents" bigint DEFAULT 0 NOT NULL,
  "contribution_profit_cents" bigint DEFAULT 0 NOT NULL,
  "orders" integer DEFAULT 0 NOT NULL,
  "new_customers" integer DEFAULT 0 NOT NULL,
  "recurring_customers" integer DEFAULT 0 NOT NULL,
  "approved_payments" integer DEFAULT 0 NOT NULL,
  "declined_payments" integer DEFAULT 0 NOT NULL,
  "completeness" numeric(5,4) DEFAULT '0' NOT NULL,
  "data_status" text DEFAULT 'provisional' NOT NULL,
  "source_updated_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_business_metrics_ws_date_currency_uidx"
  ON "daily_business_metrics" ("workspace_id", "metric_date", "currency");
CREATE INDEX IF NOT EXISTS "daily_business_metrics_ws_date_idx"
  ON "daily_business_metrics" ("workspace_id", "metric_date");

CREATE TABLE IF NOT EXISTS "analytics_source_syncs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "status" text DEFAULT 'unavailable' NOT NULL,
  "completeness" numeric(5,4) DEFAULT '0' NOT NULL,
  "latency_minutes" integer,
  "last_successful_sync" timestamptz,
  "last_attempt_at" timestamptz,
  "message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_source_syncs_ws_source_uidx"
  ON "analytics_source_syncs" ("workspace_id", "source");
CREATE INDEX IF NOT EXISTS "analytics_source_syncs_ws_status_idx"
  ON "analytics_source_syncs" ("workspace_id", "status");

ALTER TABLE "daily_business_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_source_syncs" ENABLE ROW LEVEL SECURITY;
