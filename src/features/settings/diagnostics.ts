import { eq, sql } from "drizzle-orm";
import { getDb } from "@/database/client";
import { integrations } from "@/database/schema";
import { getWorkspaceAccess } from "@/lib/workspace";
import { catalogoDeServicos } from "./servicos";

export async function getDiagnostics() {
  const access = await getWorkspaceAccess();
  const started = Date.now();
  let reachable = false;
  let schemaReady = false;
  let vaults = false;
  let tracking = false;
  let detailsAvailable = false;
  let sourcesAvailable = false;
  let counts = { products: 0, orders: 0, checkouts: 0, servers: 0, sites: 0 };
  let sources: {
    key: string;
    name: string;
    status: string;
    testedAt: string | null;
    verification: string;
    metricsPeriod: string;
    lastSyncAt: Date | null;
    lastEventAt: Date | null;
  }[] = [];
  try {
    const db = getDb();
    const tablesResult = await db.execute(
      sql`select to_regclass('public.funnel_vaults') is not null as vaults, to_regclass('public.funnel_packages') is not null as packages, to_regclass('public.rate_limit_buckets') is not null as tracking`,
    );
    const tables = tablesResult.rows[0] as {
      vaults: boolean;
      packages: boolean;
      tracking: boolean;
    };
    reachable = true;
    vaults = Boolean(tables.vaults && tables.packages);
    tracking = Boolean(tables.tracking);
    schemaReady = vaults && tracking;
    const ws = access.workspaceId;
    const totalsResult = await db.execute(
      sql`select (select count(*)::int from products where workspace_id=${ws} and deleted_at is null) as products, (select count(*)::int from orders where workspace_id=${ws}) as orders, (select count(*)::int from checkouts where workspace_id=${ws} and deleted_at is null) as checkouts, (select count(*)::int from vps_servers where workspace_id=${ws} and deleted_at is null) as servers, (select count(*)::int from vps_sites where workspace_id=${ws} and deleted_at is null) as sites`,
    );
    const totals = totalsResult.rows[0] as typeof counts;
    counts = {
      products: Number(totals.products),
      orders: Number(totals.orders),
      checkouts: Number(totals.checkouts),
      servers: Number(totals.servers),
      sites: Number(totals.sites),
    };
    detailsAvailable = true;
    sources = (
      await db
        .select({
          key: integrations.key,
          name: integrations.name,
          status: integrations.status,
          config: integrations.config,
          lastSyncAt: integrations.lastSyncAt,
          lastEventAt: integrations.lastEventAt,
        })
        .from(integrations)
        .where(eq(integrations.workspaceId, ws))
    ).map((row) => {
      const config = row.config as Record<string, unknown>;
      return {
        key: row.key,
        name: row.name,
        status: row.status,
        testedAt: typeof config.testedAt === "string" ? config.testedAt : null,
        verification: String(config.verification ?? "not_tested"),
        metricsPeriod: String(config.metricsPeriod ?? "last_7d"),
        lastSyncAt: row.lastSyncAt,
        lastEventAt: row.lastEventAt,
      };
    });
    sourcesAvailable = true;
  } catch {
    /* No raw DB errors/connection strings are exposed. */
  }
  return {
    access,
    reachable,
    schemaReady,
    vaults,
    tracking,
    detailsAvailable,
    sourcesAvailable,
    counts,
    sources,
    latencyMs: Date.now() - started,
    services: catalogoDeServicos(process.env),
    version:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
      process.env.NEXT_PUBLIC_VERSAO ||
      "local",
    checkedAt: new Date().toISOString(),
  };
}
