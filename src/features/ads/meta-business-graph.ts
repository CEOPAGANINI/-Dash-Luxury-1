/** Read-only Meta inventory. Kept independent of credentials and database. */
export interface MetaEntity {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  account_status?: number;
  currency?: string;
  campaign_id?: string;
  adset_id?: string;
  title?: string;
  body?: string;
  last_fired_time?: string;
  subtype?: string;
  creative?: { id?: string; name?: string; title?: string; body?: string };
  insights?: { data?: MetaInsight[] };
}
export interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}
export type MetaResource =
  | "campaigns"
  | "adsets"
  | "ads"
  | "adcreatives"
  | "adspixels"
  | "customaudiences"
  | "insights";
export const META_RESOURCES: MetaResource[] = [
  "campaigns",
  "adsets",
  "ads",
  "adcreatives",
  "adspixels",
  "customaudiences",
  "insights",
];
export const META_PERIODS = [
  "today",
  "yesterday",
  "last_7d",
  "last_30d",
  "this_month",
] as const;
export type TrafficPeriod = (typeof META_PERIODS)[number];
export interface MetaInventory {
  profile: MetaEntity;
  businesses: MetaEntity[];
  fetchedAt: string;
}
export interface MetaBusinessInventory {
  accounts: MetaEntity[];
  pages: MetaEntity[];
  people: MetaEntity[];
  warnings: string[];
  fetchedAt: string;
}
export class MetaInventoryError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
const ROOT = "https://graph.facebook.com/v21.0";
const unique = (rows: MetaEntity[]) => [
  ...new Map(rows.map((row) => [row.id, row])).values(),
];
export async function metaRead<T>(url: string, token: string): Promise<T> {
  const target = new URL(url);
  if (
    target.origin !== "https://graph.facebook.com" ||
    target.username ||
    target.password
  )
    throw new MetaInventoryError("Destino de paginação inválido.");
  target.searchParams.delete("access_token");
  const response = await fetch(target, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as T & { error?: { code?: number } };
  if (!response.ok || body.error)
    throw new MetaInventoryError(
      `O Meta recusou a consulta (HTTP ${response.status}${body.error?.code ? `, código ${body.error.code}` : ""}). Revise a conexão e as permissões.`,
    );
  return body;
}
export async function metaList<T>(url: string, token: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 20; page++) {
    const body = await metaRead<{ data?: T[]; paging?: { next?: string } }>(
      url,
      token,
    );
    if (!Array.isArray(body.data))
      throw new MetaInventoryError("Resposta de listagem inválida do Meta.");
    rows.push(...body.data);
    if (!body.paging?.next) return rows;
    url = body.paging.next;
  }
  throw new MetaInventoryError(
    "A listagem excedeu 20 páginas. Os dados estão indisponíveis; não exibimos uma lista incompleta.",
  );
}
function edge(
  id: string,
  resource: string,
  fields: string,
  extra: Record<string, string> = {},
) {
  return `${ROOT}/${id}/${resource}?${new URLSearchParams({ fields, limit: "100", ...extra })}`;
}
export async function metaBusinesses(token: string): Promise<MetaInventory> {
  const [profile, businesses] = await Promise.all([
    metaRead<MetaEntity>(`${ROOT}/me?fields=id,name`, token),
    metaList<MetaEntity>(edge("me", "businesses", "id,name"), token),
  ]);
  return {
    profile,
    businesses: unique(businesses),
    fetchedAt: new Date().toISOString(),
  };
}
export async function metaBusinessAccounts(businessId: string, token: string) {
  if (!/^\d+$/.test(businessId))
    throw new MetaInventoryError("BM inválida.", 400);
  // Both edges are required: failure never silently hides half the accounts.
  const rows = await Promise.all(
    ["owned_ad_accounts", "client_ad_accounts"].map((resource) =>
      metaList<MetaEntity>(
        edge(businessId, resource, "id,name,account_status,currency"),
        token,
      ),
    ),
  );
  return unique(rows.flat());
}
export async function metaBusinessInventory(
  businessId: string,
  token: string,
): Promise<MetaBusinessInventory> {
  const [accounts, ...optional] = await Promise.all([
    metaBusinessAccounts(businessId, token),
    ...["owned_pages", "client_pages", "business_users"].map((resource) =>
      metaList<MetaEntity>(edge(businessId, resource, "id,name"), token)
        .then((data) => ({ resource, data, error: "" }))
        .catch(() => ({
          resource,
          data: [] as MetaEntity[],
          error: `Sem acesso a ${resource === "business_users" ? "pessoas da BM" : "páginas da BM"}. Revise as permissões da conexão.`,
        })),
    ),
  ]);
  return {
    accounts,
    pages: unique(
      optional
        .filter((r) => r.resource !== "business_users")
        .flatMap((r) => r.data),
    ),
    people: optional.find((r) => r.resource === "business_users")?.data ?? [],
    warnings: [...new Set(optional.map((r) => r.error).filter(Boolean))],
    fetchedAt: new Date().toISOString(),
  };
}
export function requireBusiness(businesses: MetaEntity[], id: string) {
  if (!businesses.some((row) => row.id === id))
    throw new MetaInventoryError(
      "Esta BM não está acessível na conexão atual.",
      403,
    );
}
export function requireAccount(accounts: MetaEntity[], id: string) {
  if (!accounts.some((row) => row.id === id))
    throw new MetaInventoryError(
      "Esta conta não pertence à BM selecionada ou não está acessível.",
      403,
    );
}
export async function metaAccountResource(
  accountId: string,
  resource: MetaResource,
  period: TrafficPeriod,
  token: string,
) {
  if (
    !/^act_\d+$/.test(accountId) ||
    !META_RESOURCES.includes(resource) ||
    !META_PERIODS.includes(period)
  )
    throw new MetaInventoryError("Consulta inválida.", 400);
  const metrics = `insights.date_preset(${period}){spend,impressions,clicks,actions,action_values}`;
  const fields: Record<MetaResource, string> = {
    campaigns: `id,name,status,effective_status,${metrics}`,
    adsets: `id,name,campaign_id,status,effective_status,${metrics}`,
    ads: `id,name,campaign_id,adset_id,status,effective_status,creative{id,name,title,body},${metrics}`,
    adcreatives: "id,name,title,body",
    adspixels: "id,name,last_fired_time",
    customaudiences: "id,name,subtype",
    insights:
      "spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values",
  };
  return metaList<MetaEntity & MetaInsight>(
    edge(
      accountId,
      resource,
      fields[resource],
      resource === "insights" ? { date_preset: period, level: "account" } : {},
    ),
    token,
  );
}
