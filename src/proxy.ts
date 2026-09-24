import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/auth",
  "/p/",
  "/pay/",
  "/checkout/",
  "/loja",
  "/api/public",
  // Webhooks NUNCA podem exigir sessão: são chamados por servidores
  // externos (Broski, Resend...). A autenticidade é garantida pela
  // verificação de assinatura HMAC dentro de cada rota.
  "/api/webhooks/",
  // Servidor do Funil: a API do agente da VPS (HMAC por pedido dentro da
  // rota) e os arquivos que a VPS baixa (instalador, agente, rastreio.js).
  "/api/agente/",
  "/agente/",
  // Páginas legais: as páginas do funil hospedadas na VPS apontam para elas.
  "/legal/",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return false; // raiz redireciona para o painel
  return PUBLIC_PREFIXES.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

/**
 * Proxy (Next 16, antigo middleware): renova a sessão Supabase e protege
 * as rotas do painel. Sem Supabase configurado, o painel abre em modo
 * demonstração (banner explícito na UI) — nada finge estar conectado.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Agente da VPS: quem autentica é o HMAC dentro da rota (ou nada, nos
  // arquivos estáticos). Sai antes de criar o cliente Supabase para não
  // chamar o Supabase Auth a cada pulso (cerca de 2.880 por dia por
  // servidor parado) e para o agente não depender do Auth estar no ar.
  if (pathname.startsWith("/api/agente/") || pathname.startsWith("/agente/")) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Modo demonstração: sem credenciais não há sessão a renovar.
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Importante: não executar lógica entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/cadastro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo exceto assets estáticos e imagens.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
