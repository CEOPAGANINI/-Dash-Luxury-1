# Deploy — Infinity

Guia para colocar a plataforma em produção (Vercel + Supabase).

## 1. Criar projeto Supabase

1. Acesse https://supabase.com e crie um projeto.
2. Anote: `Project URL`, `anon key`, `service_role key` (Settings → API).
3. Em Settings → Database, copie as connection strings:
   - **Transaction pooler** (porta 6543) → `DATABASE_URL` (adicione `?pgbouncer=true`)
   - **Direct connection** (porta 5432) → `DIRECT_URL`

## 2. Configurar variáveis locais

```bash
cp .env.example .env.local
```

Preencha ao menos:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
DIRECT_URL=...
ENCRYPTION_KEY=...   # 32 bytes base64: openssl rand -base64 32
```

## 3. Executar migrations

```bash
npm run db:generate
npm run db:migrate
```

As migrations escritas à mão (`src/database/migrations/0004_executive_analytics_mart.sql`, `0005_ads_manager.sql` — o gerenciador de anúncios — e `0006_vps.sql` — o Servidor do Funil) não entram no `db:migrate`: cole o conteúdo de cada uma no SQL Editor do Supabase e execute uma vez, nessa ordem. São idempotentes (`IF NOT EXISTS`). A `0006_vps.sql` cria as 7 tabelas `vps_*` com RLS ligado; se ela não rodar, o painel tenta criar as tabelas sozinho na primeira leitura (`ensureVpsSchema`) e, se não conseguir, a tela Servidor pede para rodar a `0006_vps.sql`. Não rode `npm run db:generate` para a VPS: o snapshot antigo recriaria as tabelas de anúncios. Variáveis e roteiro do piloto: [docs/VPS.md](VPS.md).

## 4. Configurar autenticação (Supabase)

1. Authentication → Providers → Email: habilitado.
2. Authentication → URL Configuration:
   - Site URL: `https://seu-dominio.com`
   - Redirect URLs: `https://seu-dominio.com/auth/**`
3. Recomendado: manter "Confirm email" ativado.

## 5. Storage

Criar buckets (privados): `product-files`, `product-images` (público), `attachments`, `avatars`.

## 6. Realtime e RLS

- Habilitar Realtime nas tabelas `analytics_events`, `visitor_sessions`, `orders`, `payments` (usado pelo Live View — Fase 5).
- Aplicar as políticas de RLS (migration própria; ver docs/DATABASE.md).

## 7. Projeto na Vercel

1. Suba o repositório para o GitHub.
2. Importe na Vercel (framework: Next.js — detectado automaticamente).
3. Adicione TODAS as variáveis do `.env.example` com os valores reais.
4. Deploy.

## 8. Pós-deploy

- Configurar domínio próprio na Vercel.
- Configurar webhooks dos gateways apontando para `https://seu-dominio.com/api/webhooks/<gateway>` (rotas criadas na Fase 4).
- Configurar Resend (domínio verificado + `RESEND_API_KEY`).
- Validar: login, criação de produto, checkout sandbox (fases correspondentes).

## Checklist de validação de produção

- [ ] `npm run typecheck` sem erros
- [ ] `npm run lint` sem erros
- [ ] `npm run test` verde
- [ ] `npm run build` concluído
- [ ] Login real funcionando (Supabase configurado)
- [ ] Banner de modo demonstração AUSENTE em produção
