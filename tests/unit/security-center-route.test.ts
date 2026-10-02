// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as unknown,
  error: false,
  db: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => {
    if (state.error) throw new Error("private auth provider failure");
    return state.session;
  },
}));
vi.mock("@/database/client", () => ({
  getDb: state.db,
  isDatabaseConfigured: () => false,
}));
vi.mock("@/features/security-center/audit", () => ({
  auditedSecurityChecks: [
    { id: "audit-fixture", source: "audit", status: "pending" },
  ],
}));

import { GET } from "@/app/api/painel/seguranca/route";

const user = {
  id: "principal",
  email: "operator@example.test",
  name: "Operador",
  emailConfirmado: true,
};
beforeEach(() => {
  vi.stubEnv("DASHBOARD_DONOS", "operator@example.test");
  state.session = { user, demoMode: false };
  state.error = false;
  state.db.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/painel/seguranca", () => {
  it("requires a real principal and protects every error response", async () => {
    for (const [session, expected] of [
      [null, 401],
      [{ user, demoMode: true }, 401],
      [
        {
          user: {
            ...user,
            email: "ordinary-owner@example.test",
            id: "ordinary-owner",
          },
          demoMode: false,
        },
        403,
      ],
    ] as const) {
      state.session = session;
      const response = await GET();
      expect(response.status).toBe(expected);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect((await response.json()).checks).toBeUndefined();
    }
    expect(state.db).not.toHaveBeenCalled();
  });

  it("returns audit evidence beside live checks, without treating absent DB as healthy", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.checks.some((check: { id: string }) => check.id === "audit-fixture"),
    ).toBe(true);
    expect(
      body.checks
        .filter((check: { category: string }) => check.category === "database")
        .every((check: { status: string }) => check.status === "unknown"),
    ).toBe(true);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("returns a generic 503 on session lookup failure without provider details", async () => {
    state.error = true;
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("provider failure");
  });
});
