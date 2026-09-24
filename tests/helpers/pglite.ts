import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/database/schema";
import { profiles, workspaces } from "@/database/schema";

/*
  Banco Postgres de verdade, em memória (PGlite), para os testes de
  integração da VPS.

  O PGlite, no padrão, devolve int8 como number — o postgres-js de
  produção devolve como STRING (só converte os OIDs 21/23/26/700/701). Um
  teste que passa no PGlite padrão pode esconder `"seq": "42"` indo para o
  agente. Por isso os parsers de int8 (20) e numeric (1700) aqui são a
  identidade: o SQL cru volta string, como em produção, e o query builder
  com bigint({ mode: "number" }) continua devolvendo number nos dois.
*/

const PASTA_MIGRACOES = path.resolve(
  __dirname,
  "../../src/database/migrations",
);

/** Fora do journal do drizzle (0000–0003), na ordem do docs/DEPLOY.md. */
const MIGRACOES_A_MAO = [
  "0004_executive_analytics_mart.sql",
  "0005_ads_manager.sql",
  "0001_enable_rls.sql",
] as const;

export const MIGRACAO_VPS = "0006_vps.sql";

export function criarPglite(): PGlite {
  return new PGlite({
    parsers: { 20: (valor: string) => valor, 1700: (valor: string) => valor },
  });
}

export type BancoDeTeste = Awaited<ReturnType<typeof criarBancoDeTeste>>;

/**
 * Cria o banco, roda as migrações do journal e as à mão. Com
 * `vps: false`, a 0006 fica de fora (para testar o ensureVpsSchema).
 */
export async function criarBancoDeTeste(opcoes: { vps?: boolean } = {}) {
  const pg = criarPglite();
  const db = drizzle({ client: pg, schema });
  await migrate(db, { migrationsFolder: PASTA_MIGRACOES });
  for (const arquivo of MIGRACOES_A_MAO) await pg.exec(lerMigracao(arquivo));
  if (opcoes.vps !== false) await pg.exec(lerMigracao(MIGRACAO_VPS));
  return { pg, db };
}

export function lerMigracao(arquivo: string): string {
  return readFileSync(path.join(PASTA_MIGRACOES, arquivo), "utf8");
}

/** Um perfil e um workspace (as tabelas vps_* exigem workspace_id). */
export async function criarWorkspaceDeTeste(
  db: BancoDeTeste["db"],
  nome = "Loja de teste",
): Promise<{ workspaceId: string; perfilId: string }> {
  const [perfil] = await db
    .insert(profiles)
    .values({
      id: crypto.randomUUID(),
      email: `dono-${crypto.randomUUID().slice(0, 8)}@e2e-teste.com.br`,
    })
    .returning({ id: profiles.id });
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: nome,
      slug: `ws-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: perfil.id,
    })
    .returning({ id: workspaces.id });
  return { workspaceId: ws.id, perfilId: perfil.id };
}
