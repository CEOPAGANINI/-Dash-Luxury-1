// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as unknown,
  sessionError: false,
  configured: true,
  databaseConfigured: true,
  result: { rows: [] as Record<string, unknown>[] },
  transaction: vi.fn(),
  execute: vi.fn(),
  database: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => {
    if (state.sessionError) throw new Error("secret password query URL");
    return state.session;
  },
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => state.configured,
}));
vi.mock("@/database/client", () => ({
  isDatabaseConfigured: () => state.databaseConfigured,
  getDb: state.database,
}));

import {
  getLiveSecuritySnapshot,
  requireSecurityOperator,
} from "@/features/security-center/service";

const user = {
  id: "principal",
  email: "operator@example.test",
  name: "Operador",
  emailConfirmado: true,
};
const healthy = {
  serverVersion: 170006,
  apiRoles: 2,
  unsafeApiRoles: 0,
  publicTables: 83,
  tablesWithoutRls: 0,
  tablesWithApiOwnerBypass: 0,
  dangerousTableGrants: 0,
  dangerousColumnGrants: 0,
  futureTableGrants: 0,
  privateBuckets: 4,
  publicProductBuckets: 1,
  unexpectedPublicBuckets: 0,
  exposedDefiners: 0,
};

beforeEach(() => {
  vi.stubEnv("DASHBOARD_DONOS", "operator@example.test");
  vi.stubEnv(
    "VERCEL_GIT_COMMIT_SHA",
    "613837d7507db502d4f7e39b1ebf99f493d13833",
  );
  state.session = { user: { ...user }, demoMode: false };
  state.sessionError = false;
  state.configured = true;
  state.databaseConfigured = true;
  state.result = { rows: [{ ...healthy }] };
  state.execute.mockReset().mockImplementation(async () => state.result);
  state.transaction
    .mockReset()
    .mockImplementation(async (callback) =>
      callback({ execute: state.execute }),
    );
  state.database
    .mockReset()
    .mockReturnValue({ transaction: state.transaction });
});
afterEach(() => vi.unstubAllEnvs());

describe("principal-only metadata access", () => {
  it("rejects absent and demo sessions before any database work", async () => {
    for (const session of [null, { user, demoMode: true }]) {
      state.session = session;
      await expect(getLiveSecuritySnapshot()).rejects.toMatchObject({
        status: 401,
      });
    }
    expect(state.database).not.toHaveBeenCalled();
  });
  it("rejects ordinary workspace owners, unconfirmed email and empty allowlists", async () => {
    state.session = {
      user: { ...user, email: "tenant-owner@example.test", id: "tenant-owner" },
      demoMode: false,
    };
    await expect(getLiveSecuritySnapshot()).rejects.toMatchObject({
      status: 403,
    });
    state.session = {
      user: { ...user, emailConfirmado: false },
      demoMode: false,
    };
    await expect(getLiveSecuritySnapshot()).rejects.toMatchObject({
      status: 403,
    });
    state.session = { user, demoMode: false };
    vi.stubEnv("DASHBOARD_DONOS", "");
    await expect(getLiveSecuritySnapshot()).rejects.toMatchObject({
      status: 403,
    });
    expect(state.database).not.toHaveBeenCalled();
  });
  it("permits the existing verified principal policy including VPS_DONOS fallback", async () => {
    await expect(requireSecurityOperator()).resolves.toMatchObject({ user });
    vi.stubEnv("DASHBOARD_DONOS", undefined);
    vi.stubEnv("VPS_DONOS", "operator@example.test");
    await expect(requireSecurityOperator()).resolves.toMatchObject({ user });
  });
  it("does not disclose an authentication exception", async () => {
    state.sessionError = true;
    const error = await requireSecurityOperator().catch((value) => value);
    expect(error.status).toBe(503);
    expect(error.message).not.toContain("secret");
  });
});

describe("snapshot metadata collection", () => {
  it("uses a read-only transaction and scoped query timeout; returns aggregate checks only", async () => {
    const snapshot = await getLiveSecuritySnapshot();
    expect(state.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
    expect(state.execute).toHaveBeenCalledTimes(2);
    expect(snapshot.version).toBe("613837d");
    expect(snapshot.checks).toHaveLength(7);
    expect(snapshot.checks.every((check) => check.status === "active")).toBe(
      true,
    );
    expect(JSON.stringify(snapshot)).not.toContain("operator@example.test");
    expect(JSON.stringify(snapshot)).not.toContain("DATABASE_URL");
  });
  it("returns unknown database status when credentials are absent, without opening a connection", async () => {
    state.databaseConfigured = false;
    const snapshot = await getLiveSecuritySnapshot();
    expect(
      snapshot.checks
        .filter((check) => check.category === "database")
        .every(
          (check) => check.status === "unknown" && check.checkedAt === null,
        ),
    ).toBe(true);
    expect(state.database).not.toHaveBeenCalled();
  });
  it("fails closed on query errors or incomplete results and hides the raw driver error", async () => {
    state.transaction.mockRejectedValueOnce(
      new Error("postgres://user:password@secret.invalid/private_table"),
    );
    const failed = await getLiveSecuritySnapshot();
    expect(
      failed.checks
        .filter((check) => check.category === "database")
        .every((check) => check.status === "unknown"),
    ).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("secret.invalid");
    state.result = { rows: [{}] };
    const incomplete = await getLiveSecuritySnapshot();
    expect(
      incomplete.checks
        .filter((check) => check.category === "database")
        .every((check) => check.status === "unknown"),
    ).toBe(true);
  });
  it("warns when configured real authentication is unavailable; version rejects arbitrary values", async () => {
    state.configured = false;
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "<private account data>");
    const snapshot = await getLiveSecuritySnapshot();
    expect(
      snapshot.checks.find((check) => check.id === "auth-production")?.status,
    ).toBe("warning");
    expect(snapshot.version).toBe("security-center-v1");
  });
});
