import { NextResponse } from "next/server";

import {
  appOrigin,
  issueState,
  missingCredentials,
  oauthPrecondition,
} from "@/features/integrations/oauth";

export const dynamic = "force-dynamic";

const META_GRAPH_VERSION = "v21.0";
/** Ler contas e campanhas, e editar campanhas pelo gerenciador. */
const META_SCOPES = ["ads_read", "ads_management", "business_management"];

/**
 * Começo do OAuth do Meta: manda a pessoa autorizar no Facebook.
 *
 * Precisa de META_APP_ID e META_APP_SECRET (developers.facebook.com → seu
 * app → Configurações → Básico). O redirect_uri daqui tem que estar na
 * lista de URIs válidos do Login do Facebook do app.
 */
export async function GET(request: Request) {
  const bloqueio = await oauthPrecondition();
  if (bloqueio) return bloqueio;

  const appId = process.env.META_APP_ID;
  if (!appId || !process.env.META_APP_SECRET) {
    return missingCredentials(["META_APP_ID", "META_APP_SECRET"]);
  }

  const state = await issueState("meta");
  const url = new URL(
    `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
  );
  url.searchParams.set("client_id", appId);
  url.searchParams.set(
    "redirect_uri",
    `${appOrigin(request)}/api/oauth/meta/callback`,
  );
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url);
}
