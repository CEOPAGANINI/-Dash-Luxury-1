// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, principalId: "" }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({
  getPublicWorkspaceId: async () => state.principalId,
  getOrCreateDefaultWorkspace: async () => {
    throw new Error("Public tracking must not authenticate a panel session");
  },
}));

import {
  analyticsEvents,
  checkouts,
  visitorSessions,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import {
  InvalidTrackTarget,
  recordTrackEvent,
} from "@/features/analytics/track";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let banco: BancoDeTeste;
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
  state.principalId = (await criarWorkspaceDeTeste(banco.db)).workspaceId;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});
const ctx = { userAgent: null, ip: null, country: null, city: null };

describe("rastreio público multi-account", () => {
  it("resolve workspace pelo checkout publicado, sem aceitar workspace fornecido pelo visitante", async () => {
    const other = await criarWorkspaceDeTeste(banco.db);
    const [checkout] = await banco.db
      .insert(checkouts)
      .values({
        workspaceId: other.workspaceId,
        name: "Checkout",
        slug: "track-checkout",
        status: "published",
      })
      .returning({ id: checkouts.id });
    await recordTrackEvent(
      {
        anonymousId: "same-browser",
        event: "page_view",
        checkoutId: checkout.id,
      },
      ctx,
    );
    await recordTrackEvent(
      { anonymousId: "same-browser", event: "page_view" },
      ctx,
    );
    const sessions = await banco.db
      .select({ workspaceId: visitorSessions.workspaceId })
      .from(visitorSessions)
      .where(eq(visitorSessions.anonymousId, "same-browser"));
    expect(new Set(sessions.map((s) => s.workspaceId))).toEqual(
      new Set([other.workspaceId, state.principalId]),
    );
    const [event] = await banco.db
      .select({
        workspaceId: analyticsEvents.workspaceId,
        checkoutId: analyticsEvents.checkoutId,
      })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.checkoutId, checkout.id));
    expect(event.workspaceId).toBe(other.workspaceId);
    const [draft] = await banco.db
      .insert(checkouts)
      .values({
        workspaceId: other.workspaceId,
        name: "Rascunho",
        slug: "track-draft",
      })
      .returning({ id: checkouts.id });
    await expect(
      recordTrackEvent(
        {
          anonymousId: "draft-browser",
          event: "page_view",
          checkoutId: draft.id,
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(InvalidTrackTarget);
  });

  it("domínio de VPS resolve seu proprietário e rejeita checkout de outro workspace", async () => {
    const other = await criarWorkspaceDeTeste(banco.db);
    const [server] = await banco.db
      .insert(vpsServers)
      .values({
        workspaceId: other.workspaceId,
        name: "VPS",
        createdBy: "fixture",
      })
      .returning({ id: vpsServers.id });
    const [site] = await banco.db
      .insert(vpsSites)
      .values({
        workspaceId: other.workspaceId,
        serverId: server.id,
        name: "Site",
        slug: "track-site",
        checkoutOrigin: "https://app.test",
        createdBy: "fixture",
      })
      .returning({ id: vpsSites.id });
    await banco.db.insert(vpsSiteDomains).values({
      workspaceId: other.workspaceId,
      siteId: site.id,
      hostname: "account.example.com",
      dnsStatus: "ok",
    });
    await recordTrackEvent(
      { anonymousId: "vps-browser", event: "page_view" },
      { ...ctx, siteOrigin: "https://account.example.com" },
    );
    const [session] = await banco.db
      .select({ workspaceId: visitorSessions.workspaceId })
      .from(visitorSessions)
      .where(eq(visitorSessions.anonymousId, "vps-browser"));
    expect(session.workspaceId).toBe(other.workspaceId);
    const [wrongCheckout] = await banco.db
      .insert(checkouts)
      .values({
        workspaceId: state.principalId,
        name: "Outra conta",
        slug: "wrong-track",
        status: "published",
      })
      .returning({ id: checkouts.id });
    await expect(
      recordTrackEvent(
        {
          anonymousId: "wrong-browser",
          event: "page_view",
          checkoutId: wrongCheckout.id,
        },
        { ...ctx, siteOrigin: "https://account.example.com" },
      ),
    ).rejects.toBeInstanceOf(InvalidTrackTarget);
  });
});
