import { NextResponse } from "next/server";

import {
  appOrigin,
  issueState,
  missingCredentials,
  oauthPrecondition,
} from "@/features/integrations/oauth";

export const dynamic = "force-dynamic";

/** Google Ads (que inclui o YouTube Ads) e o e-mail, para identificar a conta. */
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "openid",
  "email",
];

/**
 * Começo do OAuth do Google: manda a pessoa autorizar na conta Google.
 *
 * Precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (console.cloud.google.com
 * → APIs e serviços → Credenciais → ID do cliente OAuth, tipo "Aplicativo da
 * Web"). O redirect_uri daqui tem que estar nos URIs autorizados.
 *
 * `access_type=offline` + `prompt=consent` garantem um refresh token — sem
 * ele o acesso morre em uma hora.
 */
export async function GET(request: Request) {
  const bloqueio = await oauthPrecondition();
  if (bloqueio) return bloqueio;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return missingCredentials(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  }

  const state = await issueState("google");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set(
    "redirect_uri",
    `${appOrigin(request)}/api/oauth/google/callback`,
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
