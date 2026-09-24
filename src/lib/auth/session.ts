import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /**
   * true quando o Supabase diz que o e-mail foi confirmado
   * (`email_confirmed_at`). Quem libera algo pelo e-mail (VPS_DONOS) exige
   * isto: e-mail não confirmado é só um texto que qualquer um cadastra. O
   * usuário demo fica sem o campo, e ausente conta como não confirmado.
   */
  emailConfirmado?: boolean;
}

export const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "demo@infinity.app",
  name: "Usuário Demo",
};

export interface AppSession {
  user: SessionUser;
  /** true quando o Supabase não está configurado e a sessão é fictícia */
  demoMode: boolean;
}

/**
 * Resolve a sessão atual no servidor.
 * - Supabase configurado: exige usuário autenticado (retorna null se não houver).
 * - Supabase ausente: retorna sessão de demonstração explícita (demoMode=true).
 */
export async function getSession(): Promise<AppSession | null> {
  if (!isSupabaseConfigured()) {
    return { user: DEMO_USER, demoMode: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      name:
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split("@")[0] ??
        "Usuário",
      emailConfirmado: Boolean(user.email_confirmed_at),
    },
    demoMode: false,
  };
}

/**
 * Quando ESTA sessão se autenticou, pelo `amr` do JWT: a maior `timestamp`
 * (segundos) entre as entradas `{ method, timestamp }`, ignorando
 * `anonymous`. Falha fechado: `amr` ausente, vazio ou no formato `string[]`
 * (RFC 8176, usado por hooks customizados, sem hora) dá null.
 *
 * Não usamos `last_sign_in_at`: ele é do USUÁRIO, não da sessão. Um cookie
 * roubado herdaria o login feito pelo dono em outro aparelho.
 */
export function momentoDoAmr(amr: unknown): Date | null {
  if (!Array.isArray(amr)) return null;
  let maior: number | null = null;
  for (const entrada of amr) {
    if (!entrada || typeof entrada !== "object") continue;
    const { method, timestamp } = entrada as {
      method?: unknown;
      timestamp?: unknown;
    };
    if (typeof method !== "string" || method === "anonymous") continue;
    if (
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0
    )
      continue;
    if (maior === null || timestamp > maior) maior = timestamp;
  }
  return maior === null ? null : new Date(maior * 1000);
}

/**
 * Hora da autenticação da sessão atual (para as ações que exigem login
 * recente). `getClaims()` verifica o JWT antes de devolver as claims; só as
 * guardas com `recente` chamam isto. Qualquer falha devolve null, e a guarda
 * trata null como "login antigo".
 */
export async function momentoDaAutenticacao(): Promise<Date | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    return momentoDoAmr(data.claims.amr);
  } catch {
    return null;
  }
}
