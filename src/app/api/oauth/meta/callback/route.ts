import { upsertConnection } from "@/features/integrations/connections-store";
import { maskSecret } from "@/features/integrations/connection-meta";
import {
  appOrigin,
  backToIntegrations,
  consumeState,
  fetchJson,
  missingCredentials,
  oauthPrecondition,
} from "@/features/integrations/oauth";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

interface AdAccountsResponse {
  data?: { account_id: string; name?: string }[];
}

/**
 * Volta do OAuth do Meta: troca o código pelo token, alonga o token (o
 * curto vale horas; o longo, ~60 dias), descobre as contas de anúncio e
 * guarda tudo — o token criptografado, as contas em claro.
 */
export async function GET(request: Request) {
  const bloqueio = await oauthPrecondition();
  if (bloqueio) return bloqueio;

  const origin = appOrigin(request);
  const url = new URL(request.url);

  if (url.searchParams.get("error")) {
    return backToIntegrations(origin, "meta", "cancelado");
  }
  if (!(await consumeState("meta", url.searchParams.get("state")))) {
    return backToIntegrations(origin, "meta", "state");
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return missingCredentials(["META_APP_ID", "META_APP_SECRET"]);
  }

  const code = url.searchParams.get("code");
  if (!code) return backToIntegrations(origin, "meta", "erro");

  try {
    const curto = await fetchJson<TokenResponse>(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: `${origin}/api/oauth/meta/callback`,
          code,
        }),
    );

    const longo = await fetchJson<TokenResponse>(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: curto.access_token,
        }),
    ).catch(() => curto);

    const contas = await fetchJson<AdAccountsResponse>(
      `${GRAPH}/me/adaccounts?` +
        new URLSearchParams({
          fields: "account_id,name",
          limit: "25",
          access_token: longo.access_token,
        }),
    );
    const lista = (contas.data ?? []).map((c) => ({
      id: `act_${c.account_id}`,
      name: c.name ?? "",
    }));

    await upsertConnection({
      id: "meta",
      identifier: lista[0]?.id ?? "sem conta de anúncios",
      tokenMask: maskSecret(longo.access_token),
      via: "oauth",
      secrets: { token: longo.access_token },
      publicConfig: {
        adAccounts: lista,
        tokenExpiresAt: longo.expires_in
          ? new Date(Date.now() + longo.expires_in * 1000).toISOString()
          : null,
      },
    });
  } catch (error) {
    console.error("[oauth meta] falha:", error);
    return backToIntegrations(origin, "meta", "erro");
  }

  return backToIntegrations(origin, "meta", "ok");
}
