import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { AdMetrics, AdStatus } from "./types";
import type { PosicaoId, VendaPorPosicao } from "./creative-placements";

/*
  O cliente da Marketing API do Meta.

  Só o que o gerenciador precisa: ler campanhas, conjuntos e anúncios com
  as métricas dos últimos 7 dias, e mudar nome, estado e orçamento diário.
  Toda chamada vai com o token da conexão salva em Integrações — o token
  nunca sai do servidor.

  Orçamentos na API do Meta são em unidades mínimas da moeda da conta
  (centavos, no BRL). É o mesmo formato do banco, então nada converte.
*/

const GRAPH = "https://graph.facebook.com/v21.0";
export const META_METRIC_PERIODS = [
  "last_7d",
  "last_30d",
  "today",
  "yesterday",
  "this_month",
] as const;
export type MetaMetricPeriod = (typeof META_METRIC_PERIODS)[number];
export function metaMetricPeriod(value: unknown): MetaMetricPeriod {
  return META_METRIC_PERIODS.includes(value as MetaMetricPeriod)
    ? (value as MetaMetricPeriod)
    : "last_7d";
}
const insightFields = (credentials: MetaCredentials) =>
  `insights.date_preset(${metaMetricPeriod(credentials.metricsPeriod)}){spend,impressions,clicks,actions,action_values}`;

export interface MetaCredentials {
  accountId: string;
  token: string;
  metricsPeriod?: MetaMetricPeriod;
}

/** As credenciais do Meta salvas em Integrações; null se não há conexão. */
export async function getMetaCredentials(): Promise<MetaCredentials | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const [row] = await db
      .select({
        config: integrations.config,
        encryptedCredentials: integrations.encryptedCredentials,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, "meta"),
          eq(integrations.status, "connected"),
        ),
      )
      .limit(1);
    if (!row?.encryptedCredentials) return null;

    const secrets = JSON.parse(decryptSecret(row.encryptedCredentials)) as {
      token?: string;
    };
    const config = (row.config ?? {}) as {
      identifier?: string;
      metricsPeriod?: unknown;
    };
    if (!secrets.token || !/^act_\d+$/.test(config.identifier ?? ""))
      return null;
    return {
      accountId: config.identifier!,
      token: secrets.token,
      metricsPeriod: metaMetricPeriod(config.metricsPeriod),
    };
  } catch {
    return null;
  }
}

interface GraphInsights {
  data?: {
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: { action_type: string; value: string }[];
    action_values?: { action_type: string; value: string }[];
  }[];
}

interface GraphCampaign {
  id: string;
  name: string;
  objective?: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  insights?: GraphInsights;
}

interface GraphAdSet {
  id: string;
  campaign_id: string;
  name: string;
  status: string;
  daily_budget?: string;
  targeting?: Record<string, unknown>;
  insights?: GraphInsights;
}

interface GraphAd {
  id: string;
  adset_id: string;
  name: string;
  status: string;
  creative?: { title?: string; body?: string; thumbnail_url?: string };
  insights?: GraphInsights;
}

interface GraphPage<T> {
  data: T[];
  paging?: { next?: string };
}

/* O Meta conta "compra" de vários jeitos; a ordem é do mais específico ao
   mais genérico, e o primeiro que existir é o que vale — somar os três
   contaria a mesma venda mais de uma vez. */
const TIPOS_COMPRA = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
];

function pegarAcao(
  lista: { action_type: string; value: string }[] | undefined,
): number {
  if (!lista) return 0;
  for (const tipo of TIPOS_COMPRA) {
    const item = lista.find((a) => a.action_type === tipo);
    if (item) return Number(item.value) || 0;
  }
  return 0;
}

export function metricasDeInsights(insights?: GraphInsights): AdMetrics {
  const linha = insights?.data?.[0];
  const checkout = linha?.actions?.find((a) =>
    [
      "omni_initiated_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
      "initiate_checkout",
    ].includes(a.action_type),
  );
  return {
    spendCents: Math.round((Number(linha?.spend) || 0) * 100),
    impressions: Number(linha?.impressions) || 0,
    clicks: Number(linha?.clicks) || 0,
    purchases: Math.round(pegarAcao(linha?.actions)),
    revenueCents: Math.round(pegarAcao(linha?.action_values) * 100),
    ...(checkout
      ? { checkouts: Math.max(0, Math.round(Number(checkout.value) || 0)) }
      : {}),
  };
}

/** ACTIVE/PAUSED/ARCHIVED/DELETED do Meta → o nosso status. */
export function statusDoMeta(status: string): AdStatus {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "active";
  if (s === "ARCHIVED" || s === "DELETED") return "archived";
  return "paused";
}

export function statusParaMeta(status: AdStatus): string {
  return status === "active"
    ? "ACTIVE"
    : status === "archived"
      ? "ARCHIVED"
      : "PAUSED";
}

export class MetaApiError extends Error {
  constructor(status: number, code?: number) {
    super(
      `O Meta recusou a solicitação (HTTP ${status}${Number.isInteger(code) ? `, código ${code}` : ""}). Verifique a conta, as permissões e tente novamente.`,
    );
    this.name = "MetaApiError";
  }
}

async function graphGet<T>(url: string, token: string): Promise<T> {
  const target = new URL(url);
  if (target.origin !== "https://graph.facebook.com")
    throw new Error("Destino de paginação inválido.");
  target.searchParams.delete("access_token");
  const response = await fetch(target, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok || body.error) {
    throw new MetaApiError(response.status, body.error?.code);
  }
  return body;
}

/** Percorre todas as páginas de uma listagem. */
async function listarTudo<T>(primeiraUrl: string, token: string): Promise<T[]> {
  const itens: T[] = [];
  let url: string | undefined = primeiraUrl;
  let paginas = 0;
  while (url && paginas < 20) {
    const pagina: GraphPage<T> = await graphGet<GraphPage<T>>(url, token);
    itens.push(...pagina.data);
    url = pagina.paging?.next;
    paginas += 1;
  }
  if (url)
    throw new Error(
      "A conta excede o limite de páginas desta sincronização. Nenhum snapshot parcial foi salvo.",
    );
  return itens;
}

function urlDeLista(
  credenciais: MetaCredentials,
  edge: string,
  fields: string,
) {
  return (
    `${GRAPH}/${credenciais.accountId}/${edge}?` +
    new URLSearchParams({
      fields,
      limit: "100",
    })
  );
}

export async function fetchMetaCampaigns(credenciais: MetaCredentials) {
  return listarTudo<GraphCampaign>(
    urlDeLista(
      credenciais,
      "campaigns",
      `id,name,objective,status,effective_status,daily_budget,lifetime_budget,${insightFields(credenciais)}`,
    ),
    credenciais.token,
  );
}

export async function fetchMetaAdSets(credenciais: MetaCredentials) {
  return listarTudo<GraphAdSet>(
    urlDeLista(
      credenciais,
      "adsets",
      `id,campaign_id,name,status,daily_budget,targeting,${insightFields(credenciais)}`,
    ),
    credenciais.token,
  );
}

export async function fetchMetaAds(credenciais: MetaCredentials) {
  return listarTudo<GraphAd>(
    urlDeLista(
      credenciais,
      "ads",
      `id,adset_id,name,status,creative{title,body,thumbnail_url},${insightFields(credenciais)}`,
    ),
    credenciais.token,
  );
}

export type GraphPlacement = NonNullable<GraphInsights["data"]>[number] & {
  ad_id: string;
  publisher_platform: string;
  platform_position: string;
};

export async function fetchMetaPlacements(
  credentials: MetaCredentials,
): Promise<GraphPlacement[]> {
  const target = new URL(`${GRAPH}/${credentials.accountId}/insights`);
  target.search = new URLSearchParams({
    level: "ad",
    breakdowns: "publisher_platform,platform_position",
    fields: "ad_id,spend,impressions,clicks,actions,action_values",
    date_preset: metaMetricPeriod(credentials.metricsPeriod),
    limit: "100",
  }).toString();
  return listarTudo<GraphPlacement>(target.toString(), credentials.token);
}

export function placementFromMeta(row: GraphPlacement): VendaPorPosicao | null {
  if (
    row.publisher_platform !== "facebook" &&
    row.publisher_platform !== "instagram"
  )
    return null;
  const positions: Record<string, PosicaoId> = {
    feed: "feed",
    instagram_explore: "explorar",
    explore: "explorar",
    story: "stories",
    stories: "stories",
    reels: "reels",
    facebook_reels: "reels",
    instagram_reels: "reels",
    marketplace: "marketplace",
    video_feeds: "video",
    instream_video: "video",
    messenger_inbox: "mensagens",
  };
  return {
    id: positions[row.platform_position] ?? "outra",
    plataforma: row.publisher_platform,
    metrics: metricasDeInsights({ data: [row] }),
  };
}

export interface MetaUpdate {
  name?: string;
  status?: AdStatus;
  dailyBudgetCents?: number;
}

/** Muda um objeto na plataforma. Lança se o Meta recusar. */
export async function updateMetaObject(
  externalId: string,
  mudanca: MetaUpdate,
  token: string,
): Promise<void> {
  if (!/^\d+$/.test(externalId))
    throw new Error("Identificador do Meta inválido.");
  const body = new URLSearchParams();
  if (mudanca.name !== undefined) body.set("name", mudanca.name);
  if (mudanca.status !== undefined)
    body.set("status", statusParaMeta(mudanca.status));
  if (mudanca.dailyBudgetCents !== undefined)
    body.set("daily_budget", String(Math.round(mudanca.dailyBudgetCents)));

  const response = await fetch(`${GRAPH}/${externalId}`, {
    method: "POST",
    body,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const resultado = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!response.ok || resultado.error) {
    throw new MetaApiError(response.status);
  }
}

/** Cria uma campanha pausada na conta. Devolve o id da plataforma. */
export async function createMetaCampaign(
  credenciais: MetaCredentials,
  entrada: { name: string; objective: string; dailyBudgetCents: number },
): Promise<string> {
  const body = new URLSearchParams({
    name: entrada.name,
    objective: OBJETIVO_META[entrada.objective] ?? "OUTCOME_SALES",
    status: "PAUSED",
    daily_budget: String(Math.round(entrada.dailyBudgetCents)),
    special_ad_categories: "[]",
  });
  const response = await fetch(`${GRAPH}/${credenciais.accountId}/campaigns`, {
    method: "POST",
    body,
    cache: "no-store",
    headers: { Authorization: `Bearer ${credenciais.token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const resultado = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!response.ok || resultado.error || !resultado.id) {
    throw new MetaApiError(response.status);
  }
  return resultado.id;
}

/** Os objetivos da tela → os da API (ODAX). */
const OBJETIVO_META: Record<string, string> = {
  Vendas: "OUTCOME_SALES",
  Leads: "OUTCOME_LEADS",
  Tráfego: "OUTCOME_TRAFFIC",
  Reconhecimento: "OUTCOME_AWARENESS",
  Engajamento: "OUTCOME_ENGAGEMENT",
  Remarketing: "OUTCOME_SALES",
};

/** OUTCOME_SALES → "Vendas", para a tela. */
export function objetivoDoMeta(objective?: string): string | null {
  if (!objective) return null;
  const entrada = Object.entries(OBJETIVO_META).find(
    ([, api]) => api === objective,
  );
  return entrada?.[0] ?? objective;
}
