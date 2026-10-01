// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registeredMigrations } from "@/features/settings/registered-migrations";

describe("owner-only registered schema preparation", () => {
  it("uses exactly the reviewed source migrations, never arbitrary SQL", () => {
    expect(registeredMigrations.map((item) => item.name)).toEqual([
      "0007_funnel_storage.sql",
      "0008_rate_limits.sql",
    ]);
    for (const item of registeredMigrations) {
      expect(item.sql).toBe(
        readFileSync(resolve("src/database/migrations", item.name), "utf8"),
      );
      expect(item.sql).not.toMatch(/\bDROP\s+(TABLE|DATABASE)|\bTRUNCATE\b/i);
      expect(item.sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    }
  });
});
