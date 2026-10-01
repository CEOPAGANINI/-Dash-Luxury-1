// @vitest-environment node
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
const script = "scripts/prepare-production-schema.mjs";
describe("production schema preparation secret handling", () => {
  it("does not touch the database outside the canonical production", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        VERCEL_ENV: "preview",
        DATABASE_URL: "never-echo-this-fixture",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(
      "never-echo-this-fixture",
    );
    expect(result.stdout).toContain("ignorada");
  });
  it("rejects another database without logging the connection supplied via stdin", () => {
    const connection =
      "postgresql://user:DO_NOT_ECHO_FIXTURE@wrong.invalid/database";
    const result = spawnSync(process.execPath, [script, "--stdin"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      input: JSON.stringify({ databaseUrl: connection }),
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain("DO_NOT_ECHO_FIXTURE");
    expect(result.stderr).toContain("detalhes privados omitidos");
  });
});
