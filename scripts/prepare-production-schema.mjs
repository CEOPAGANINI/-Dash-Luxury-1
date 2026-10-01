import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import pg from "pg";

const projectId = "prj_sughoBVaJoeQClw8ULoHNECAzuYt";
const databaseRef = "dzjvmbfgytbhhpkcaxei";
const migrations = ["0007_funnel_storage.sql", "0008_rate_limits.sql"];

/** The connection is transferred only through stdin, never arguments or files. */
async function prepareFromStdin() {
  let db;
  try {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 8192) throw new Error("input_limit");
    }
    const { databaseUrl } = JSON.parse(input);
    input = "";
    const target = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      !(
        target.hostname === `db.${databaseRef}.supabase.co` ||
        (target.hostname.endsWith(".pooler.supabase.com") &&
          decodeURIComponent(target.username) === `postgres.${databaseRef}`)
      )
    ) {
      throw new Error("target_mismatch");
    }
    db = postgres(databaseUrl, {
      prepare: false,
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
      onnotice: () => {},
    });
    await db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('dashboard:registered-migrations'))`;
      for (const name of migrations) {
        const sql = await readFile(
          new URL(`../src/database/migrations/${name}`, import.meta.url),
          "utf8",
        );
        await tx.unsafe(sql);
      }
      const rows =
        await tx`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('funnel_vaults','funnel_vault_history','funnel_packages','rate_limit_buckets')`;
      if (rows.length !== 4 || rows.some((row) => !row.relrowsecurity))
        throw new Error("verification_failed");
    });
    console.info(
      "[schema] Funil, histórico, pacotes e limite persistente verificados; RLS ativa.",
    );
    // Exercise the actual runtime driver/pool before publishing, without reading
    // user data or persisting anything. pg defaults to sequential per-client I/O.
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 3,
      connectionTimeoutMillis: 10_000,
      query_timeout: 20_000,
      idleTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
    pool.on("error", () => {});
    try {
      const checks = await Promise.all(
        Array.from({ length: 8 }, () => pool.query("select 1 as connected")),
      );
      if (checks.some((result) => result.rows[0]?.connected !== 1))
        throw new Error("runtime_driver_check_failed");
      const connection = await pool.connect();
      try {
        await connection.query("begin");
        await connection.query("select 1");
        await connection.query("rollback");
      } finally {
        connection.release();
      }
      console.info(
        "[database] Driver de produção verificado: consultas paralelas e transação sem pipelining.",
      );
    } finally {
      await pool.end();
    }
  } catch {
    // Driver errors may include connection credentials. Never print the error object.
    console.error(
      "[schema] Preparação não concluída. Verifique acesso ao banco e ao projeto; detalhes privados omitidos.",
    );
    process.exitCode = 1;
  } finally {
    if (db) await db.end({ timeout: 3 }).catch(() => {});
  }
}

async function productionOnly() {
  if (
    process.env.VERCEL_ENV !== "production" ||
    (process.env.VERCEL_PROJECT_ID &&
      process.env.VERCEL_PROJECT_ID !== projectId)
  ) {
    console.info(
      "[schema] Preparação automática ignorada fora da produção dashboardatual.",
    );
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "[schema] DATABASE_URL ausente. Nenhum segredo foi gravado ou exposto.",
    );
    process.exitCode = 1;
    return;
  }
  const child = spawn(
    process.execPath,
    [new URL(import.meta.url).pathname, "--stdin"],
    {
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  const status = new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify({ databaseUrl }));
  process.exitCode = await status;
}

if (process.argv[2] === "--stdin") await prepareFromStdin();
else await productionOnly();
