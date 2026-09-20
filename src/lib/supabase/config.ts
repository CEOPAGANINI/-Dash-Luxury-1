/**
 * Verificação central de configuração do Supabase.
 *
 * Enquanto as credenciais não existirem, a aplicação roda em
 * "modo demonstração": o painel abre com banner permanente e o login
 * real fica indisponível (com instruções claras de configuração).
 * Nada finge estar conectado.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
