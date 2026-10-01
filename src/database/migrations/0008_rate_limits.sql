-- Aplicada durante o deploy, nunca criada por uma requisição pública.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key varchar(64) PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON rate_limit_buckets (expires_at);
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

