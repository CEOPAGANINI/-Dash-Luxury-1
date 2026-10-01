import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";
/** One-time PKCE exchange. Never log the code or accept an external destination. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next") === "/auth/redefinir-senha"
      ? "/auth/redefinir-senha"
      : "/dashboard";
  let valid = false;
  if (code && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      valid = !(await supabase.auth.exchangeCodeForSession(code)).error;
    } catch {
      /* Generic failure only. */
    }
  }
  const response = NextResponse.redirect(
    new URL(valid ? next : "/recuperar-senha?link=invalido", getAppUrl()),
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
