import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
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
    },
    demoMode: false,
  };
}
