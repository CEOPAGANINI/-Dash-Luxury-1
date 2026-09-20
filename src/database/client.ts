import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Cliente do banco (lazy singleton).
 * Em serverless (Vercel), usar o pooler do Supabase (porta 6543) em
 * DATABASE_URL com `prepare: false`. DIRECT_URL (porta 5432) é usada apenas
 * pelo drizzle-kit para migrations.
 */
let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Configure o Supabase para acessar o banco (ver docs/DEPLOY.md).",
    );
  }
  const client = postgres(url, { prepare: false });
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
