import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  inserts: [] as { table: { name: string }; value: Record<string, unknown> }[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));
vi.mock("@/database/client", () => ({
  isDatabaseConfigured: () => true,
  getDb: () => ({
    insert: (table: { name: string }) => ({
      values: (value: Record<string, unknown>) => {
        storage.inserts.push({ table, value });
        return {
          onConflictDoUpdate: (options: { set: Record<string, unknown> }) => {
            storage.updates.push(options.set);
            return { returning: async () => [{ id: "visitor-session" }] };
          },
        };
      },
    }),
  }),
}));
vi.mock("@/database/schema", () => ({
  analyticsEvents: { name: "events" },
  visitorSessions: {
    name: "sessions",
    workspaceId: "workspaceId",
    anonymousId: "anonymousId",
    pageViews: "pageViews",
    createdAt: "createdAt",
  },
  checkouts: {},
  vpsSiteDomains: {},
  vpsSites: {},
}));
vi.mock("@/lib/workspace", () => ({
  getPublicWorkspaceId: async () => "public-workspace",
  getOrCreateDefaultWorkspace: async () => "private-workspace",
}));

import { recordTrackEvent } from "../../src/features/analytics/track";

const context = { userAgent: null, ip: "192.0.2.1", country: null, city: null };

describe("privacy at the analytics database boundary", () => {
  beforeEach(() => {
    storage.inserts.length = 0;
    storage.updates.length = 0;
  });

  it("sanitizes session and event writes even when called without the public endpoint", async () => {
    await recordTrackEvent(
      {
        anonymousId: "visitor",
        event: "page_view",
        page: "https://usuario:segredo@vendas.example/oferta?token=privado#oculto",
        referrer:
          "https://ref.example/painel/funil?email=cliente@example.com#interno",
        utm: {
          utm_source: "meta",
          utm_campaign: "lancamento",
          fbclid: "click-id",
          token: "segredo",
          email: "cliente@example.com",
        },
      },
      context,
    );
    expect(storage.inserts).toHaveLength(2);
    expect(storage.inserts[0].value).toMatchObject({
      firstPage: "https://vendas.example/oferta",
      currentPage: "https://vendas.example/oferta",
      referrer: "https://ref.example",
      utm: {
        utm_source: "meta",
        utm_campaign: "lancamento",
        fbclid: "click-id",
      },
    });
    expect(storage.updates[0].currentPage).toBe(
      "https://vendas.example/oferta",
    );
    expect(storage.inserts[1].value.page).toBe("https://vendas.example/oferta");
    const written = JSON.stringify(storage.inserts);
    expect(written).not.toMatch(
      /segredo|privado|oculto|cliente@example|painel\/funil/,
    );
  });

  it("sanitizes heartbeat updates without creating an analytics event", async () => {
    await recordTrackEvent(
      {
        anonymousId: "visitor",
        event: "heartbeat",
        page: "/checkout/oferta?token=privado#oculto",
      },
      context,
    );
    expect(storage.inserts).toHaveLength(1);
    expect(storage.inserts[0].value.currentPage).toBe("/checkout/oferta");
    expect(storage.updates[0].currentPage).toBe("/checkout/oferta");
  });
});
