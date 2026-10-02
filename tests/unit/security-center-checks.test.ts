import { describe, expect, it } from "vitest";

import {
  evaluateDatabaseChecks,
  parseDatabaseSecurityMetadata,
  validateHeaderChecks,
  unknownHeaderChecks,
  type DatabaseSecurityMetadata,
} from "@/features/security-center/checks";
import {
  expireLiveChecks,
  isLiveCheckFresh,
  type SecurityCheck,
} from "@/features/security-center/model";

const checkedAt = "2026-10-02T18:00:00.000Z";
const healthy: DatabaseSecurityMetadata = {
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

describe("security metadata validation", () => {
  it("requires complete integer metadata; absent fields cannot become healthy zeros", () => {
    expect(parseDatabaseSecurityMetadata(healthy)).toEqual(healthy);
    expect(
      parseDatabaseSecurityMetadata({ ...healthy, publicTables: "83" }),
    ).toEqual(healthy);
    for (const invalid of [
      null,
      {},
      { ...healthy, apiRoles: undefined },
      { ...healthy, privateBuckets: null },
      { ...healthy, exposedDefiners: -1 },
      { ...healthy, futureTableGrants: NaN },
      { ...healthy, publicTables: "" },
    ])
      expect(parseDatabaseSecurityMetadata(invalid)).toBeNull();
  });

  it("marks healthy metadata active with a verification date", () => {
    const checks = evaluateDatabaseChecks(healthy, checkedAt);
    expect(checks).toHaveLength(5);
    expect(
      checks.every(
        (check) => check.status === "active" && check.checkedAt === checkedAt,
      ),
    ).toBe(true);
  });

  it("empty tables and absent API roles never generate misleading RLS greens", () => {
    expect(
      evaluateDatabaseChecks({ ...healthy, publicTables: 0 }, checkedAt)[0]
        .status,
    ).toBe("warning");
    expect(
      evaluateDatabaseChecks({ ...healthy, apiRoles: 1 }, checkedAt).every(
        (check) => check.status === "unknown",
      ),
    ).toBe(true);
    expect(
      evaluateDatabaseChecks(
        { ...healthy, serverVersion: 150000 },
        checkedAt,
      ).every((check) => check.status === "unknown"),
    ).toBe(true);
  });

  it("detects RLS bypass, dangerous column grants, future access and unexpected storage exposure", () => {
    const checks = evaluateDatabaseChecks(
      {
        ...healthy,
        unsafeApiRoles: 1,
        dangerousColumnGrants: 1,
        futureTableGrants: 1,
        unexpectedPublicBuckets: 1,
        exposedDefiners: 1,
      },
      checkedAt,
    );
    expect(checks.every((check) => check.status === "warning")).toBe(true);
  });
});

describe("browser-observed response headers", () => {
  const safeHeaders = () =>
    new Headers({
      "cache-control":
        "private, no-cache, no-store, max-age=0, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });

  it("validates edge-observed headers and does not return their raw contents", () => {
    const checks = validateHeaderChecks(safeHeaders(), checkedAt);
    expect(checks.every((check) => check.status === "active")).toBe(true);
    expect(checks.every((check) => check.checkedAt === checkedAt)).toBe(true);
    expect(JSON.stringify(checks)).not.toContain("default-src");
  });

  it("starts all browser header checks unknown before a real response is observed", () => {
    const checks = unknownHeaderChecks();
    expect(checks).toHaveLength(5);
    expect(
      checks.every(
        (check) => check.status === "unknown" && check.checkedAt === null,
      ),
    ).toBe(true);
  });

  it("flags missing protections, cache conflicts and a disclosed framework", () => {
    const headers = new Headers({
      "cache-control": "private, no-store, public, s-maxage=60",
      "x-powered-by": "Next.js",
    });
    expect(
      validateHeaderChecks(headers).every(
        (check) => check.status === "warning",
      ),
    ).toBe(true);
    const frames = safeHeaders();
    frames.set("content-security-policy", "frame-ancestors 'self'");
    expect(
      validateHeaderChecks(frames).find((check) => check.id === "headers-frame")
        ?.status,
    ).toBe("warning");
  });
});

describe("live status freshness", () => {
  const check: SecurityCheck = {
    id: "test",
    title: "Teste",
    description: "Teste",
    detail: "Confirmado",
    status: "active",
    source: "live",
    category: "database",
    checkedAt,
  };
  it("expires a green status after connection loss without rewriting audit history", () => {
    const now = Date.parse(checkedAt);
    expect(isLiveCheckFresh(check, now + 119_000)).toBe(true);
    expect(expireLiveChecks([check], now + 121_000)[0].status).toBe("unknown");
    const audit = { ...check, source: "audit" as const };
    expect(expireLiveChecks([audit], now + 999_000)[0]).toEqual(audit);
  });
  it("rejects missing, malformed and implausible future verification times", () => {
    const now = Date.parse(checkedAt);
    for (const date of [null, "bad-date", new Date(now + 31_000).toISOString()])
      expect(isLiveCheckFresh({ ...check, checkedAt: date }, now)).toBe(false);
  });
});
