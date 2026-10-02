// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SQL is exercised against an isolated PostgreSQL fixture, never the live bank.
vi.mock("@/database/client", () => ({
  getDb: vi.fn(),
  isDatabaseConfigured: () => false,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

import { SECURITY_METADATA_SQL } from "@/features/security-center/service";
import {
  evaluateDatabaseChecks,
  parseDatabaseSecurityMetadata,
} from "@/features/security-center/checks";

let database: PGlite;
beforeEach(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE inherited_api;
    GRANT inherited_api TO anon;
    CREATE TABLE public.security_fixture (id text);
    ALTER TABLE public.security_fixture ENABLE ROW LEVEL SECURITY;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (name text PRIMARY KEY, public boolean NOT NULL);
    INSERT INTO storage.buckets VALUES
      ('dash', false), ('product-files', false), ('attachments', false),
      ('avatars', false), ('product-images', true);
  `);
}, 30_000);
afterEach(async () => {
  await database.close();
});

async function metadata() {
  const result = await database.query(SECURITY_METADATA_SQL);
  const value = parseDatabaseSecurityMetadata(result.rows[0]);
  expect(value).not.toBeNull();
  return value!;
}

describe("effective PostgreSQL permissions", () => {
  it("confirms a protected baseline without exposing table names", async () => {
    const value = await metadata();
    expect(value).toMatchObject({
      apiRoles: 2,
      publicTables: 1,
      tablesWithoutRls: 0,
      tablesWithApiOwnerBypass: 0,
      dangerousTableGrants: 0,
      dangerousColumnGrants: 0,
      futureTableGrants: 0,
      privateBuckets: 4,
      publicProductBuckets: 1,
      exposedDefiners: 0,
    });
    expect(
      evaluateDatabaseChecks(value, new Date().toISOString()).every(
        (check) => check.status === "active",
      ),
    ).toBe(true);
    expect(JSON.stringify(value)).not.toContain("security_fixture");
  });

  it("detects inherited administrative rights and PUBLIC table grants", async () => {
    await database.exec(
      "GRANT TRUNCATE ON public.security_fixture TO inherited_api;",
    );
    expect((await metadata()).dangerousTableGrants).toBeGreaterThan(0);
    await database.exec(
      "REVOKE TRUNCATE ON public.security_fixture FROM inherited_api; GRANT TRIGGER ON public.security_fixture TO PUBLIC;",
    );
    expect((await metadata()).dangerousTableGrants).toBeGreaterThan(0);
  });

  it("detects column-level REFERENCES which is absent from table grants", async () => {
    await database.exec(
      "GRANT REFERENCES (id) ON public.security_fixture TO inherited_api;",
    );
    const value = await metadata();
    expect(value.dangerousTableGrants).toBe(0);
    expect(value.dangerousColumnGrants).toBeGreaterThan(0);
    expect(
      evaluateDatabaseChecks(value, new Date().toISOString()).find(
        (check) => check.id === "database-admin-grants",
      )?.status,
    ).toBe("warning");
  });

  it("detects global PUBLIC defaults and defaults inherited from any creator role", async () => {
    await database.exec(
      "ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO PUBLIC;",
    );
    expect((await metadata()).futureTableGrants).toBeGreaterThan(0);
    await database.exec(
      "ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM PUBLIC; CREATE ROLE another_creator; ALTER DEFAULT PRIVILEGES FOR ROLE another_creator IN SCHEMA public GRANT DELETE ON TABLES TO inherited_api;",
    );
    expect((await metadata()).futureTableGrants).toBeGreaterThan(0);
  });

  it("does not treat unchanged function/sequence defaults as table exposure", async () => {
    await database.exec(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated;",
    );
    expect((await metadata()).futureTableGrants).toBe(0);
  });

  it("detects public and inherited execution on SECURITY DEFINER functions", async () => {
    await database.exec(
      "CREATE FUNCTION public.privileged_fixture() RETURNS int LANGUAGE SQL SECURITY DEFINER AS 'SELECT 1';",
    );
    expect((await metadata()).exposedDefiners).toBe(1);
    await database.exec(
      "REVOKE EXECUTE ON FUNCTION public.privileged_fixture() FROM PUBLIC;",
    );
    expect((await metadata()).exposedDefiners).toBe(0);
    await database.exec(
      "GRANT EXECUTE ON FUNCTION public.privileged_fixture() TO inherited_api;",
    );
    expect((await metadata()).exposedDefiners).toBe(1);
  });

  it("detects RLS bypass and a newly public private bucket", async () => {
    await database.exec(
      "ALTER ROLE anon BYPASSRLS; UPDATE storage.buckets SET public = true WHERE name = 'attachments';",
    );
    const value = await metadata();
    expect(value.unsafeApiRoles).toBe(1);
    expect(value.privateBuckets).toBe(3);
    expect(value.unexpectedPublicBuckets).toBe(1);
    const checks = evaluateDatabaseChecks(value, new Date().toISOString());
    expect(checks.find((check) => check.id === "database-rls")?.status).toBe(
      "warning",
    );
    expect(
      checks.find((check) => check.id === "database-storage")?.status,
    ).toBe("warning");
  });

  it("requires FORCE RLS when an API role owns the table or inherits its owner", async () => {
    await database.exec(
      "ALTER TABLE public.security_fixture OWNER TO inherited_api;",
    );
    const bypass = await metadata();
    expect(bypass.tablesWithoutRls).toBe(0);
    expect(bypass.tablesWithApiOwnerBypass).toBe(1);
    expect(
      evaluateDatabaseChecks(bypass, new Date().toISOString()).find(
        (check) => check.id === "database-rls",
      )?.status,
    ).toBe("warning");
    await database.exec(
      "ALTER TABLE public.security_fixture FORCE ROW LEVEL SECURITY;",
    );
    const forced = await metadata();
    expect(forced.tablesWithApiOwnerBypass).toBe(0);
    expect(
      evaluateDatabaseChecks(forced, new Date().toISOString()).find(
        (check) => check.id === "database-rls",
      )?.status,
    ).toBe("active");
  });
});
