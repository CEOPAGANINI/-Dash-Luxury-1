// @vitest-environment node
import { count, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, workspaceId: "" }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({
  getOrCreateDefaultWorkspace: async () => state.workspaceId,
}));

import { adCampaigns, ads } from "@/database/schema";
import {
  metaMetricPeriod,
  metricasDeInsights,
  placementFromMeta,
} from "@/features/ads/meta-client";
import { syncFromMeta } from "@/features/ads/queries";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let banco: BancoDeTeste;
const insights = {
  data: [
    {
      spend: "10.00",
      impressions: "100",
      clicks: "8",
      actions: [
        { action_type: "omni_purchase", value: "2" },
        { action_type: "purchase", value: "2" },
        { action_type: "omni_initiated_checkout", value: "4" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "40.00" }],
    },
  ],
};
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});
afterEach(() => vi.unstubAllGlobals());

function mockMeta(invalidAd = false) {
  const fetch = vi.fn(async (target: URL | string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    const url = new URL(target);
    expect(url.searchParams.has("access_token")).toBe(false);
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer fixture-token-not-a-secret",
    );
    let data: unknown[] = [];
    if (url.pathname.endsWith("/campaigns"))
      data = [{ id: "101", name: "Campanha real", status: "ACTIVE", insights }];
    if (url.pathname.endsWith("/adsets"))
      data = [
        {
          id: "201",
          campaign_id: "101",
          name: "Conjunto real",
          status: "ACTIVE",
          insights,
        },
      ];
    if (url.pathname.endsWith("/ads"))
      data = [
        {
          id: "301",
          adset_id: "201",
          ...(invalidAd ? {} : { name: "Criativo real" }),
          status: "ACTIVE",
          insights,
        },
      ];
    if (url.pathname.endsWith("/insights"))
      data = [
        {
          ...insights.data[0],
          ad_id: "301",
          publisher_platform: "instagram",
          platform_position: "story",
        },
      ];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("sincronização Meta", () => {
  it("não duplica tipos equivalentes de compra e preserva checkout desconhecido", () => {
    expect(metricasDeInsights(insights)).toMatchObject({
      purchases: 2,
      checkouts: 4,
      spendCents: 1000,
      revenueCents: 4000,
    });
    expect(metricasDeInsights()).not.toHaveProperty("checkouts");
    expect(metaMetricPeriod("invalid")).toBe("last_7d");
    expect(
      placementFromMeta({
        ad_id: "x",
        publisher_platform: "instagram",
        platform_position: "story",
      })?.id,
    ).toBe("stories");
  });

  it("usa período configurado, grava placements e atualiza lote sem duplicar", async () => {
    state.workspaceId = (await criarWorkspaceDeTeste(banco.db)).workspaceId;
    const fetch = mockMeta();
    const credentials = {
      accountId: "act_123",
      token: "fixture-token-not-a-secret",
      metricsPeriod: "last_30d" as const,
    };
    expect(await syncFromMeta(credentials)).toEqual({
      campanhas: 1,
      conjuntos: 1,
      anuncios: 1,
    });
    expect(await syncFromMeta(credentials)).toEqual({
      campanhas: 1,
      conjuntos: 1,
      anuncios: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(8);
    const requests = fetch.mock.calls.map(([target]) => new URL(target));
    expect(
      requests
        .find((url) => url.pathname.endsWith("/insights"))
        ?.searchParams.get("date_preset"),
    ).toBe("last_30d");
    expect(
      requests
        .find((url) => url.pathname.endsWith("/campaigns"))
        ?.searchParams.get("fields"),
    ).toContain("date_preset(last_30d)");
    const [row] = await banco.db
      .select()
      .from(ads)
      .where(eq(ads.workspaceId, state.workspaceId));
    expect(row.creative).toMatchObject({
      metricsPeriod: "last_30d",
      checkouts: 4,
      placements: [
        { id: "stories", plataforma: "instagram", metrics: { purchases: 2 } },
      ],
    });
    const [total] = await banco.db
      .select({ count: count() })
      .from(adCampaigns)
      .where(eq(adCampaigns.workspaceId, state.workspaceId));
    expect(total.count).toBe(1);
  });

  it("uma falha no lote de anúncios reverte também campanhas e conjuntos", async () => {
    state.workspaceId = (await criarWorkspaceDeTeste(banco.db)).workspaceId;
    mockMeta(true);
    await expect(
      syncFromMeta({
        accountId: "act_123",
        token: "fixture-token-not-a-secret",
      }),
    ).rejects.toThrow();
    const [total] = await banco.db
      .select({ count: count() })
      .from(adCampaigns)
      .where(eq(adCampaigns.workspaceId, state.workspaceId));
    expect(total.count).toBe(0);
  });
});
