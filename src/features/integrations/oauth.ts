import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/database/client";
import { getSession } from "@/lib/auth/session";

/*
  O que as duas plataformas têm em comum no OAuth.

  O fluxo é o mesmo nos dois: a pessoa clica em "Conectar", vai para a
  plataforma, autoriza, e volta para cá com um código que trocamos pela
  credencial. O `state` é um número aleatório guardado num cookie antes de
  ir — quando volta, tem que bater. Sem isso, qualquer site poderia mandar
  a pessoa para o nosso callback com um código dele e ligar a conta errada.
*/

const STATE_TTL_SEGUNDOS = 10 * 60;

/** O endereço público da aplicação, para montar o redirect_uri. */
export function appOrigin(request: Request): string {
  const fixo = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fixo) return fixo;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

/** Sem sessão ou sem banco, o OAuth não tem onde guardar o resultado. */
export async function oauthPrecondition(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error: "database_not_configured",
        hint: "Configure DATABASE_URL na Vercel: sem banco a conexão não tem onde ficar salva.",
      },
      { status: 503 },
    );
  }
  return null;
}

export function missingCredentials(nomes: string[]) {
  return NextResponse.json(
    {
      error: "oauth_not_configured",
      hint: `Faltam as variáveis ${nomes.join(" e ")} na Vercel. Crie o app na plataforma, copie as chaves para lá e volte.`,
    },
    { status: 503 },
  );
}

export async function issueState(provider: "meta" | "google"): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEGUNDOS,
  });
  return state;
}

/** Confere o state e apaga o cookie — cada state vale uma vez. */
export async function consumeState(
  provider: "meta" | "google",
  received: string | null,
): Promise<boolean> {
  const jar = await cookies();
  const esperado = jar.get(`oauth_state_${provider}`)?.value;
  jar.delete(`oauth_state_${provider}`);
  return Boolean(received && esperado && received === esperado);
}

/** Para onde a pessoa volta na página de Integrações, com o resultado. */
export function backToIntegrations(
  origin: string,
  provider: "meta" | "google",
  resultado: "ok" | "cancelado" | "state" | "erro",
): NextResponse {
  const url = new URL("/integracoes", origin);
  url.searchParams.set("oauth", provider);
  url.searchParams.set("resultado", resultado);
  url.hash = `conexao-${provider}`;
  return NextResponse.redirect(url);
}

/** Um POST/GET de troca de token, com o erro legível quando a plataforma recusa. */
export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
    error_description?: string;
  };
  if (!response.ok) {
    const detalhe =
      typeof body.error === "string"
        ? body.error
        : (body.error as { message?: string } | undefined)?.message;
    throw new Error(
      `${response.status} ${detalhe ?? body.error_description ?? "resposta inválida"}`,
    );
  }
  return body;
}
