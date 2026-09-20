import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { AdMetrics, AdStatus } from "./types";

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
const INSIGHTS =
  "insights.date_preset(last_7d){spend,impressions,clicks,actions,action_values}";

export interface MetaCredentials {
  accountId: string;
  token: string;
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
    const config = (row.config ?? {}) as { identifier?: string };
    if (!secrets.token || !config.identifier?.startsWith("act_")) return null;
    return { accountId: config.identifier, token: secrets.token };
  } catch (error) {
    console.error("[meta] credenciais indisponíveis:", error);
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
  return {
    spendCents: Math.round((Number(linha?.spend) || 0) * 100),
    impressions: Number(linha?.impressions) || 0,
    clicks: Number(linha?.clicks) || 0,
    purchases: Math.round(pegarAcao(linha?.actions)),
    revenueCents: Math.round(pegarAcao(linha?.action_values) * 100),
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

async function graphGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok || body.error) {
    throw new Error(
      `Meta ${response.status}: ${body.error?.message ?? "resposta inválida"}`,
    );
  }
  return body;
}

/** Percorre todas as páginas de uma listagem. */
async function listarTudo<T>(primeiraUrl: string): Promise<T[]> {
  const itens: T[] = [];
  let url: string | undefined = primeiraUrl;
  let paginas = 0;
  while (url && paginas < 20) {
    const pagina: GraphPage<T> = await graphGet<GraphPage<T>>(url);
    itens.push(...pagina.data);
    url = pagina.paging?.next;
    paginas += 1;
  }
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
      access_token: credenciais.token,
    })
  );
}

export async function fetchMetaCampaigns(credenciais: MetaCredentials) {
  return listarTudo<GraphCampaign>(
    urlDeLista(
      credenciais,
      "campaigns",
      `id,name,objective,status,effective_status,daily_budget,lifetime_budget,${INSIGHTS}`,
    ),
  );
}

export async function fetchMetaAdSets(credenciais: MetaCredentials) {
  return listarTudo<GraphAdSet>(
    urlDeLista(
      credenciais,
      "adsets",
      `id,campaign_id,name,status,daily_budget,targeting,${INSIGHTS}`,
    ),
  );
}

export async function fetchMetaAds(credenciais: MetaCredentials) {
  return listarTudo<GraphAd>(
    urlDeLista(
      credenciais,
      "ads",
      `id,adset_id,name,status,creative{title,body,thumbnail_url},${INSIGHTS}`,
    ),
  );
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
  const body = new URLSearchParams({ access_token: token });
  if (mudanca.name !== undefined) body.set("name", mudanca.name);
  if (mudanca.status !== undefined)
    body.set("status", statusParaMeta(mudanca.status));
  if (mudanca.dailyBudgetCents !== undefined)
    body.set("daily_budget", String(Math.round(mudanca.dailyBudgetCents)));

  const response = await fetch(`${GRAPH}/${externalId}`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  const resultado = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!response.ok || resultado.error) {
    throw new Error(resultado.error?.message ?? `Meta ${response.status}`);
  }
}

/** Cria uma campanha pausada na conta. Devolve o id da plataforma. */
export async function createMetaCampaign(
  credenciais: MetaCredentials,
  entrada: { name: string; objective: string; dailyBudgetCents: number },
): Promise<string> {
  const body = new URLSearchParams({
    access_token: credenciais.token,
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
  });
  const resultado = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!response.ok || resultado.error || !resultado.id) {
    throw new Error(resultado.error?.message ?? `Meta ${response.status}`);
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
