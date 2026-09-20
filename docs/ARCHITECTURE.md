# Arquitetura — Infinity

## Visão geral

Plataforma SaaS multi-workspace de vendas online construída sobre:

- **Next.js 16 (App Router)** — frontend + backend (Server Components, Server Actions, Route Handlers)
- **Supabase** — PostgreSQL, Auth, Storage, Realtime, RLS
- **Drizzle ORM** — acesso ao banco e migrations versionadas
- **Vercel** — deploy serverless

## Particularidades do Next.js 16

- `params`, `searchParams`, `cookies()`, `headers()` são **assíncronos** (obrigatório `await`).
- Proteção de rotas em `src/proxy.ts` (substitui `middleware.ts`; runtime nodejs).
- Turbopack é o bundler padrão em dev e build.
- `next lint` não existe mais — usamos `eslint src` direto.
- Helpers de tipo globais `PageProps<'/rota'>`, `LayoutProps`, `RouteContext` (gerados por `next typegen`).

## Estrutura de pastas

```
src/
  app/                # Rotas (App Router)
    (auth)/           # Login, cadastro, recuperação de senha
    (painel)/         # Painel administrativo (protegido)
    loja/             # Loja pública (Fase 2)
  components/
    ui/               # Design system (estilo shadcn/ui)
    layout/           # Sidebar, header, banners
  features/           # Lógica por domínio (auth, dashboard, ...)
  lib/                # Utilitários, sessão, navegação, Supabase clients
  database/
    schema/           # Schema Drizzle dividido por domínio
    migrations/       # Migrations geradas (drizzle-kit)
  payment-providers/  # Interface PaymentProvider + adapters (Fase 4)
  integrations/       # Adapters de integrações (UTMify etc. — Fase 7)
  analytics/          # Tracking próprio (Fase 5)
  emails/             # Templates e envio (Fase 9)
  validations/        # Schemas Zod
  types/              # Tipos compartilhados
  proxy.ts            # Proteção de rotas (Next 16)
docs/                 # Documentação
tests/                # Vitest (unit/integration) + Playwright (Fase 10)
```

## Princípios

1. **Adapters em todas as integrações** — `PaymentProvider`, `EmailProvider`, `TrackingProvider`. O código de negócio nunca importa SDK de gateway diretamente.
2. **Multi-tenant desde o início** — toda entidade de negócio tem `workspace_id`; RLS no Supabase garante isolamento.
3. **Dinheiro em centavos** (`bigint`) + coluna `currency`. Formatação apenas na borda da UI (`src/lib/format.ts`).
4. **Honestidade de status** — integrações sem credenciais aparecem como "Desconectado"; modo demonstração é explícito (banner); dados fictícios nunca se misturam com reais.
5. **Idempotência** — pagamentos e webhooks usam chaves de idempotência e deduplicação por event id externo.
6. **Segurança** — credenciais criptografadas (`ENCRYPTION_KEY`), tokens privados nunca no frontend, IP mascarado em analytics, cartão nunca armazenado (tokenização do gateway).

## Modo demonstração

Quando `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` não existem:

- `getSession()` retorna uma sessão demo (`demoMode: true`);
- o painel exibe banner permanente "Modo demonstração";
- as telas usam dados de `src/lib/demo-data.ts`, rotulados como fictícios;
- login/cadastro mostram claramente que o Supabase não está configurado.

Com credenciais presentes, o fluxo real assume automaticamente (login obrigatório via proxy, dados do banco).
