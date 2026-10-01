import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Cliente do banco (lazy singleton).
 * Em serverless (Vercel), usar o pooler do Supabase (porta 6543) em
 * DATABASE_URL, sem prepared statements nomeados e sem pipelining. O
 * postgres.js envia consultas sobrepostas por conexão: o pooler transacional
 * pode travar ou misturar respostas. O pg serializa cada conexão por padrão.
 * DIRECT_URL (porta 5432) é usada apenas pelo drizzle-kit para migrations.
 */
let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Configure o Supabase para acessar o banco (ver docs/DEPLOY.md).",
    );
  }
  const client = new Pool({
    connectionString: url,
    max: 3,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    idleTimeoutMillis: 20_000,
    maxLifetimeSeconds: 300,
    allowExitOnIdle: true,
  });
  // Never log the driver error: it can contain credentials or query values.
  client.on("error", () => console.error("[database] idle_connection_error"));
  return drizzle(client, { schema });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export type Database = ReturnType<typeof getDb>;
