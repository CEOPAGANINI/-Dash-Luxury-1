# Infinity — Central de vendas online

Plataforma completa de gestão de vendas: checkout, loja, landing pages,
pagamentos, analytics em tempo real, pixels, e-mails e financeiro.

> Nome provisório configurável em `src/lib/brand.ts`.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4
- Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) · Drizzle ORM
- shadcn/ui · Recharts · React Hook Form · Zod · TanStack Table
- Resend · Upstash Redis · Vercel

## Começando

```bash
npm install
cp .env.example .env.local   # preencha as credenciais (ver docs/DEPLOY.md)
npm run dev
```

Sem credenciais do Supabase, o painel abre em **modo demonstração**
(banner explícito, dados fictícios rotulados). Nada finge estar conectado.

## Scripts

| Comando               | Descrição                   |
| --------------------- | --------------------------- |
| `npm run dev`         | Servidor de desenvolvimento |
| `npm run build`       | Build de produção           |
| `npm run lint`        | ESLint                      |
| `npm run typecheck`   | Verificação TypeScript      |
| `npm run test`        | Testes (Vitest)             |
| `npm run db:generate` | Gerar migrations (Drizzle)  |
| `npm run db:migrate`  | Aplicar migrations          |

## Documentação

- [docs/PROGRESS.md](docs/PROGRESS.md) — status do desenvolvimento por fase
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitetura e princípios
- [docs/DATABASE.md](docs/DATABASE.md) — schema e migrations
- [docs/DEPLOY.md](docs/DEPLOY.md) — deploy Vercel + Supabase
- [docs/STRUCTURE.md](docs/STRUCTURE.md) — mapa das pastas e regras de organização

## Arquitetura executiva V2

A dashboard possui camadas separadas de domínio, serviços, repositórios e formatação. Consulte [`docs/ARCHITECTURE-HARDENING-V2.md`](docs/ARCHITECTURE-HARDENING-V2.md).

Comandos principais:

```bash
npm run typecheck:domain
npm run test:architecture
```
