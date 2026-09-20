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

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

interface UserInfo {
  email?: string;
}

interface AccessibleCustomers {
  resourceNames?: string[];
}

/** "1234567890" → "123-456-7890", como o Google Ads mostra no topo da conta. */
function formatCustomerId(bruto: string) {
  const digitos = bruto.replace(/\D/g, "");
  return digitos.length === 10
    ? `${digitos.slice(0, 3)}-${digitos.slice(3, 6)}-${digitos.slice(6)}`
    : bruto;
}

/**
 * Volta do OAuth do Google: troca o código por access + refresh token,
 * descobre a conta e guarda. O refresh token é o que vale — é ele que
 * renova o acesso sozinho depois.
 *
 * As contas do Google Ads só podem ser listadas com um developer token
 * (GOOGLE_ADS_DEVELOPER_TOKEN). Sem ele, o identificador guardado é o
 * e-mail da conta Google, e a lista de contas fica para a sincronização.
 */
export async function GET(request: Request) {
  const bloqueio = await oauthPrecondition();
  if (bloqueio) return bloqueio;

  const origin = appOrigin(request);
  const url = new URL(request.url);

  if (url.searchParams.get("error")) {
    return backToIntegrations(origin, "google", "cancelado");
  }
  if (!(await consumeState("google", url.searchParams.get("state")))) {
    return backToIntegrations(origin, "google", "state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return missingCredentials(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  }

  const code = url.searchParams.get("code");
  if (!code) return backToIntegrations(origin, "google", "erro");

  try {
    const token = await fetchJson<TokenResponse>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${origin}/api/oauth/google/callback`,
          grant_type: "authorization_code",
        }),
      },
    );
    if (!token.refresh_token) {
      /* Sem refresh token o acesso morre em uma hora: não vale guardar. */
      throw new Error("o Google não devolveu refresh token");
    }

    const usuario = await fetchJson<UserInfo>(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { authorization: `Bearer ${token.access_token}` } },
    ).catch(() => ({}) as UserInfo);

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    let customerIds: string[] = [];
    if (developerToken) {
      const contas = await fetchJson<AccessibleCustomers>(
        "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
        {
          headers: {
            authorization: `Bearer ${token.access_token}`,
            "developer-token": developerToken,
          },
        },
      ).catch(() => ({}) as AccessibleCustomers);
      customerIds = (contas.resourceNames ?? []).map((r) =>
        formatCustomerId(r.replace("customers/", "")),
      );
    }

    await upsertConnection({
      id: "google",
      identifier: customerIds[0] ?? usuario.email ?? "conta Google",
      tokenMask: maskSecret(token.refresh_token),
      via: "oauth",
      secrets: {
        refreshToken: token.refresh_token,
        ...(developerToken ? { developerToken } : {}),
      },
      publicConfig: {
        email: usuario.email ?? null,
        customerIds,
        hasDeveloperToken: Boolean(developerToken),
      },
    });
  } catch (error) {
    console.error("[oauth google] falha:", error);
    return backToIntegrations(origin, "google", "erro");
  }

  return backToIntegrations(origin, "google", "ok");
}
