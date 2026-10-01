// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  on: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    constructor(config: Record<string, unknown>) {
      state.config = config;
    }
    on = state.on;
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ driver: "pg" })),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  state.on.mockReset();
});
describe("serverless database connection", () => {
  it("uses a lazy singleton with bounded waits and the sequential pg driver", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/postgres");
    const { getDb } = await import("@/database/client");
    expect(getDb()).toBe(getDb());
    expect(state.config).toMatchObject({
      max: 3,
      connectionTimeoutMillis: 10_000,
      query_timeout: 20_000,
      idleTimeoutMillis: 20_000,
    });
    expect(state.config.pipeline).not.toBe(true);
    expect(state.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
  it("does not log raw idle-connection errors", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/postgres");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getDb } = await import("@/database/client");
    getDb();
    state.on.mock.calls[0][1](new Error("PRIVATE_DRIVER_DATA"));
    expect(log).toHaveBeenCalledWith("[database] idle_connection_error");
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_DRIVER_DATA");
    log.mockRestore();
  });
});
