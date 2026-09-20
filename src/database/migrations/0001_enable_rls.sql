-- Row Level Security em todas as tabelas do schema public.
--
-- PROBLEMA CORRIGIDO: sem RLS, a chave pública do Supabase (anon key, que é
-- embutida no JavaScript do site e portanto visível a qualquer visitante)
-- permitia ler TODAS as tabelas via PostgREST — incluindo e-mails, telefones
-- e endereços de clientes, pedidos e pagamentos. Violação direta do RGPD.
--
-- COMO A CORREÇÃO FUNCIONA: com RLS ativo e nenhuma policy criada, o acesso
-- via anon/authenticated é negado por padrão. A aplicação continua a funcionar
-- normalmente porque conecta como o papel `postgres` (rolbypassrls = true),
-- que ignora RLS — todo o acesso a dados passa pelo servidor (Drizzle), nunca
-- pelo navegador.
--
-- Policies granulares por workspace serão adicionadas quando o acesso direto
-- do cliente ao Supabase for necessário (ex.: Realtime no Painel ao Vivo).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
