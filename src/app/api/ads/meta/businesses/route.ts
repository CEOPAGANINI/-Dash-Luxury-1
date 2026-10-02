import { exigirWorkspaceRole, WorkspaceAccessError } from "@/lib/workspace";
import { getMetaCredentials } from "@/features/ads/meta-client";
import {
  metaBusinesses,
  metaBusinessAccounts,
  metaBusinessInventory,
  metaAccountResource,
  requireBusiness,
  requireAccount,
  MetaInventoryError,
  META_PERIODS,
  META_RESOURCES,
  type MetaResource,
  type TrafficPeriod,
} from "@/features/ads/meta-business-graph";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: Request) {
  try {
    await exigirWorkspaceRole(["owner", "admin", "marketing"]);
    const query = new URL(request.url).searchParams;
    const businessId = query.get("businessId");
    const accountId = query.get("accountId");
    const resource = (query.get("resource") ?? "insights") as MetaResource;
    const period = (query.get("period") ?? "last_7d") as TrafficPeriod;
    if (
      (businessId && !/^\d+$/.test(businessId)) ||
      (accountId && (!businessId || !/^act_\d+$/.test(accountId))) ||
      !META_RESOURCES.includes(resource) ||
      !META_PERIODS.includes(period)
    )
      return json({ error: "Consulta inválida." }, 400);
    const credentials = await getMetaCredentials();
    if (!credentials)
      return json(
        {
          error:
            "Conecte o Facebook/Meta em Conexões e APIs para consultar as BMs. Nenhum dado de demonstração será usado.",
        },
        409,
      );
    const inventory = await metaBusinesses(credentials.token);
    if (!businessId) return json(inventory);
    requireBusiness(inventory.businesses, businessId);
    if (!accountId)
      return json(await metaBusinessInventory(businessId, credentials.token));
    const accounts = await metaBusinessAccounts(businessId, credentials.token);
    requireAccount(accounts, accountId);
    return json({
      rows: await metaAccountResource(
        accountId,
        resource,
        period,
        credentials.token,
      ),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const known =
      error instanceof WorkspaceAccessError ||
      error instanceof MetaInventoryError;
    return json(
      {
        error: known
          ? error.message
          : "Não foi possível consultar o Meta. Tente atualizar ou revise a conexão.",
      },
      known ? error.status : 503,
    );
  }
}
