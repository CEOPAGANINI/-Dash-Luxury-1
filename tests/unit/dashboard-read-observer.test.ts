// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeDashboardRead } from "@/features/unified-dashboard/read-observer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("safe analytics timing", () => {
  it("reports stages and duration without logging returned data or raw errors", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fixture = { privateField: "private-fixture-must-not-be-logged" };
    await expect(
      observeDashboardRead("catalog", async () => fixture),
    ).resolves.toBe(fixture);
    const error = new Error("private-error-must-not-be-logged");
    await expect(
      observeDashboardRead("media", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain(fixture.privateField);
    expect(output).not.toContain(error.message);
    const payloads = log.mock.calls.map((call) => JSON.parse(String(call[1])));
    expect(
      payloads.every(
        (payload) =>
          Object.keys(payload).sort().join(",") === "durationMs,phase,stage",
      ),
    ).toBe(true);
    expect(output).toContain("durationMs");
    expect(output).toContain("failed");
  });

  it("does not emit operational logs outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await observeDashboardRead("context", async () => 1);
    expect(log).not.toHaveBeenCalled();
  });
});
