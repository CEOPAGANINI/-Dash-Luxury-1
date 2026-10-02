import type {
  MetaBusinessInventory,
  MetaEntity,
  MetaInsight,
  MetaInventory,
  MetaResource,
  TrafficPeriod,
} from "@/features/ads/meta-business-graph";
import type { FunnelNode } from "./funnel-model";

export interface DemoTrafficSettings {
  dailyBudget: number;
  minimumRoas: number;
  maximumCpa: number;
  attribution: "7d_click_1d_view" | "1d_click";
  syncMinutes: number;
  alerts: boolean;
  pixel: boolean;
  conversionsApi: boolean;
  utm: boolean;
  campaignStates: Record<string, "ACTIVE" | "PAUSED">;
}
export const DEFAULT_DEMO_SETTINGS: DemoTrafficSettings = {
  dailyBudget: 350,
  minimumRoas: 2,
  maximumCpa: 45,
  attribution: "7d_click_1d_view",
  syncMinutes: 15,
  alerts: true,
  pixel: true,
  conversionsApi: true,
  utm: true,
  campaignStates: {},
};
export const DEMO_STORES: FunnelNode[] = [
  {
    id: "demo-store-suprema",
    type: "store",
    x: 0,
    y: 0,
    title: "Loja Suprema · demonstração",
    loja: {
      plataforma: "shopify",
      dominio: "suprema.example",
      moeda: "BRL",
      produtos: [],
      metaBusinessIds: ["demo-bm-1", "demo-bm-2", "demo-bm-3"],
    },
  },
  {
    id: "demo-store-aurora",
    type: "store",
    x: 0,
    y: 0,
    title: "Loja Aurora · demonstração",
    loja: {
      plataforma: "woocommerce",
      dominio: "aurora.example",
      moeda: "BRL",
      produtos: [],
      metaBusinessIds: ["demo-bm-4", "demo-bm-5"],
    },
  },
];
export const DEMO_BUSINESSES: MetaEntity[] = [
  { id: "demo-bm-1", name: "BM Suprema · principal" },
  { id: "demo-bm-2", name: "BM Suprema · expansão" },
  { id: "demo-bm-3", name: "BM Suprema · remarketing" },
  { id: "demo-bm-4", name: "BM Aurora · principal" },
  { id: "demo-bm-5", name: "BM Aurora · testes" },
];
const stamp = "2026-10-02T12:00:00.000Z";
export function demoBusiness(businessId: string): MetaBusinessInventory {
  const name =
    DEMO_BUSINESSES.find((b) => b.id === businessId)?.name ?? "BM de exemplo";
  const index = Math.max(1, Number(businessId.split("-").pop()) || 1);
  return {
    accounts: [
      {
        id: `demo-account-${index}-1`,
        name: `${name} · vendas`,
        account_status: 1,
        currency: "BRL",
      },
      {
        id: `demo-account-${index}-2`,
        name: `${name} · laboratório`,
        account_status: index === 5 ? 2 : 1,
        currency: "BRL",
      },
    ],
    pages: [
      {
        id: `demo-page-${index}`,
        name: index < 4 ? "Loja Suprema" : "Loja Aurora",
      },
    ],
    people: [
      {
        id: `demo-profile-${index}-1`,
        name: "Marina Exemplo · administradora",
      },
      {
        id: `demo-profile-${index}-2`,
        name: "Rafael Exemplo · gestor de tráfego",
      },
    ],
    warnings: [],
    fetchedAt: stamp,
  };
}
export function demoMetrics(
  spend: number,
  purchases: number,
  ticket = 197,
): MetaInsight {
  const impressions = Math.round(spend * 85),
    clicks = Math.round(impressions * 0.023);
  return {
    spend: spend.toFixed(2),
    impressions: String(impressions),
    clicks: String(clicks),
    actions: [{ action_type: "omni_purchase", value: String(purchases) }],
    action_values: [
      { action_type: "omni_purchase", value: (purchases * ticket).toFixed(2) },
    ],
  };
}
export function sumDemoMetrics(rows: MetaInsight[]): MetaInsight {
  return {
    spend: rows.reduce((sum, r) => sum + Number(r.spend ?? 0), 0).toFixed(2),
    impressions: String(
      rows.reduce((sum, r) => sum + Number(r.impressions ?? 0), 0),
    ),
    clicks: String(rows.reduce((sum, r) => sum + Number(r.clicks ?? 0), 0)),
    actions: [
      {
        action_type: "omni_purchase",
        value: String(
          rows.reduce((sum, r) => sum + Number(r.actions?.[0]?.value ?? 0), 0),
        ),
      },
    ],
    action_values: [
      {
        action_type: "omni_purchase",
        value: rows
          .reduce((sum, r) => sum + Number(r.action_values?.[0]?.value ?? 0), 0)
          .toFixed(2),
      },
    ],
  };
}
export function demoCampaigns(
  accountId: string,
  period: TrafficPeriod,
  settings: DemoTrafficSettings,
): MetaEntity[] {
  const days = {
    today: 1,
    yesterday: 1,
    last_7d: 7,
    last_30d: 30,
    this_month: 2,
  }[period];
  const variation = 1 + ((Number(accountId.split("-").at(-2)) || 1) - 1) * 0.07;
  return [
    "Prospecção · catálogo",
    "Remarketing · carrinho",
    "Teste de criativos · baixo desempenho",
  ].map((name, index) => {
    const restricted = accountId === "demo-account-5-2";
    const spend =
      restricted && period === "today"
        ? 0
        : settings.dailyBudget * days * [0.5, 0.35, 0.15][index];
    const cpa = [28, 18, 75][index] * variation;
    const id = `${accountId}-campaign-${index + 1}`;
    const status =
      settings.campaignStates[id] ?? (index === 2 ? "PAUSED" : "ACTIVE");
    return {
      id,
      name,
      status,
      effective_status: restricted ? "ACCOUNT_DISABLED" : status,
      insights: { data: [demoMetrics(spend, Math.floor(spend / cpa))] },
    };
  });
}
export function demoResources(
  accountId: string,
  resource: MetaResource,
  period: TrafficPeriod,
  settings: DemoTrafficSettings,
): (MetaEntity & MetaInsight)[] {
  const campaigns = demoCampaigns(accountId, period, settings);
  const adsets: MetaEntity[] = campaigns.flatMap((c) =>
    [0, 1].map((i) => ({
      id: `${c.id}-set-${i + 1}`,
      name: i
        ? "Visitantes e compradores semelhantes"
        : "Brasil · amplo · 25 a 54 anos",
      campaign_id: c.id,
      status: c.status,
      effective_status:
        c.effective_status === "ACCOUNT_DISABLED"
          ? "ACCOUNT_DISABLED"
          : c.status === "PAUSED"
            ? "CAMPAIGN_PAUSED"
            : "ACTIVE",
      insights: {
        data: [
          demoMetrics(
            Number(c.insights!.data![0].spend) / 2,
            Math.floor(Number(c.insights!.data![0].actions![0].value) / 2) +
              (i === 0
                ? Number(c.insights!.data![0].actions![0].value) % 2
                : 0),
          ),
        ],
      },
    })),
  );
  const ads = adsets.flatMap((s) =>
    [0, 1].map((i) => {
      const spend = Number(s.insights!.data![0].spend),
        purchases = Number(s.insights!.data![0].actions![0].value);
      return {
        id: `${s.id}-ad-${i + 1}`,
        name: i
          ? "Carrossel · benefícios do produto"
          : "Vídeo UGC · experiência do cliente",
        campaign_id: s.campaign_id,
        adset_id: s.id,
        status: s.status,
        effective_status: s.effective_status,
        creative: {
          id: `${s.id}-creative-${i + 1}`,
          name: i ? "Carrossel 4 cards" : "Vídeo vertical 20s",
          title: "Seu próximo favorito está aqui",
          body: "Conheça a coleção e aproveite o frete grátis. Conteúdo fictício para demonstração.",
        },
        insights: {
          data: [
            demoMetrics(
              spend / 2,
              Math.floor(purchases / 2) + (i === 0 ? purchases % 2 : 0),
            ),
          ],
        },
      };
    }),
  );
  switch (resource) {
    case "campaigns":
      return campaigns;
    case "adsets":
      return adsets;
    case "ads":
      return ads;
    case "adcreatives":
      return ads.map((a) => ({
        id: a.creative.id,
        name: a.creative.name,
        title: a.creative.title,
        body: a.creative.body,
      }));
    case "adspixels":
      return settings.pixel
        ? [
            {
              id: `${accountId}-pixel`,
              name: "Pixel da loja · PageView, ViewContent, AddToCart, InitiateCheckout e Purchase",
              last_fired_time: stamp,
            },
          ]
        : [];
    case "customaudiences":
      return [
        {
          id: `${accountId}-audience-1`,
          name: "Visitantes do site · 30 dias",
          subtype: "WEBSITE",
        },
        {
          id: `${accountId}-audience-2`,
          name: "Carrinhos abandonados · 14 dias",
          subtype: "WEBSITE",
        },
        {
          id: `${accountId}-audience-3`,
          name: "Compradores · 180 dias",
          subtype: "CUSTOM",
        },
        {
          id: `${accountId}-audience-4`,
          name: "Semelhantes aos compradores · Brasil · 1%",
          subtype: "LOOKALIKE",
        },
      ];
    case "insights":
      return [
        {
          id: `${accountId}-insights`,
          ...sumDemoMetrics(campaigns.map((c) => c.insights!.data![0])),
        },
      ];
  }
}
/** Pure fixtures; no request, token or write to the real funnel. */
export function demoTrafficResponse(
  params: Record<string, string>,
  settings: DemoTrafficSettings,
):
  | MetaInventory
  | MetaBusinessInventory
  | { rows: (MetaEntity & MetaInsight)[]; fetchedAt: string } {
  if (!params.businessId)
    return {
      profile: {
        id: "demo-profile-admin",
        name: "Marina Exemplo · perfil demonstrativo",
      },
      businesses: DEMO_BUSINESSES,
      fetchedAt: stamp,
    };
  if (!params.accountId) return demoBusiness(params.businessId);
  return {
    rows: demoResources(
      params.accountId,
      (params.resource as MetaResource) ?? "insights",
      (params.period as TrafficPeriod) ?? "last_7d",
      settings,
    ),
    fetchedAt: stamp,
  };
}
export function demoStoreSummary(
  businessIds: string[],
  period: TrafficPeriod,
  settings: DemoTrafficSettings,
) {
  const accounts = businessIds.flatMap((id) => demoBusiness(id).accounts);
  const campaigns = accounts.flatMap((a) =>
    demoCampaigns(a.id, period, settings),
  );
  return {
    accounts,
    campaigns,
    metrics: sumDemoMetrics(campaigns.map((c) => c.insights!.data![0])),
  };
}
