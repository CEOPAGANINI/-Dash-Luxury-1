# Dash Luxury — dashboard principal

Aplicação principal para operação de lojas, produtos, pedidos, tráfego, campanhas, conexões e APIs, domínios, servidores e agente IA. O nome exibido está em `src/lib/brand.ts`; `infinity-dashboard` é um identificador técnico legado do pacote.

**Código ativo:** [CEOPAGANINI/dash-luxury-dashboard](https://github.com/CEOPAGANINI/dash-luxury-dashboard), privado. **Dashboard:** [dashboardatual.vercel.app](https://dashboardatual.vercel.app). O agente IA e o roteador de ofertas pertencem a esta aplicação.

## Comece aqui, pessoas e IAs

1. Leia [AGENTS.md](AGENTS.md) para as instruções de colaboração e a regra da versão atual do Next.js.
2. Use [PROJECT_MAP.md](PROJECT_MAP.md) para localizar rotas, funcionalidades e componentes.
3. Confira [project-registry.json](project-registry.json) e [Registro de projetos](docs/PROJECT_REGISTRY.md) para identificar GitHub, Vercel e Supabase pelos IDs.
4. Leia [Infraestrutura](docs/INFRASTRUCTURE.md) antes de alterar deploy ou conexões.

Os repositórios `dash-luxury-reserva-vazia`, `dash-luxury-reserva-documentacao` e `dash-luxury-reserva-publica` são reservas, sem a aplicação do painel. `vitality-landing-page` contém outro produto. Novas funcionalidades do dashboard devem ser feitas neste repositório principal.

## Stack

- Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS 4.
- Supabase/PostgreSQL, Auth e Drizzle ORM; acesso PostgreSQL de runtime com `pg.Pool`.
- shadcn/ui, Recharts, React Hook Form, Zod e TanStack Table.
- Vercel e integrações opcionais conforme a funcionalidade e configuração.
- Design system ativo **CommandLayer**: temas preto/branco, Inter + JetBrains Mono, cantos retos. Catálogo em [/design-system](https://dashboardatual.vercel.app/design-system).

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Preencha somente as variáveis necessárias ao trabalho, usando valores privados fora do Git. Consulte a infraestrutura atual e o código de cada integração.

**Produção e previews exigem login nas áreas privadas.** A ausência de Supabase não libera uma sessão demonstrativa nessas áreas. A sessão demo sem Auth se limita ao desenvolvimento/teste local fora da Vercel; simuladores identificados podem existir após o login. Dados fictícios não comprovam conexão ou execução externa.

## Comandos

| Comando                     | Uso                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`               | Desenvolvimento local                                                                 |
| `npm run build`             | Preparação do schema quando as guardas de produção permitem, seguida de build Next.js |
| `npm run format:check`      | Formatação                                                                            |
| `npm run lint`              | ESLint                                                                                |
| `npm run typecheck`         | TypeScript                                                                            |
| `npm run test`              | Vitest                                                                                |
| `npm run typecheck:domain`  | Tipagem do domínio executivo                                                          |
| `npm run test:architecture` | Regras da arquitetura executiva                                                       |
| `npm run db:generate`       | Gerar migrations Drizzle; revisar os snapshots existentes antes de usar               |
| `npm run db:migrate`        | Aplicar migrations ao banco configurado; conferir o destino antes de executar         |

O build pode preparar `0007_funnel_storage.sql` e `0008_rate_limits.sql` no banco de produção registrado. Leia `scripts/prepare-production-schema.mjs` e [Infraestrutura](docs/INFRASTRUCTURE.md) antes de rodar em um ambiente conectado.

## Documentação

- [Arquitetura executiva V2](docs/ARCHITECTURE-HARDENING-V2.md) — domínio, serviços, repositórios e formatação.
- [Privacidade e acesso ao painel](docs/private-dashboard.md) — proteção das áreas privadas.
- [Progresso](docs/PROGRESS.md), [Arquitetura](docs/ARCHITECTURE.md), [Banco](docs/DATABASE.md), [Deploy](docs/DEPLOY.md) e [Estrutura](docs/STRUCTURE.md) — documentação existente; verifique o mapa e a infraestrutura atuais quando houver nomes ou caminhos antigos.

O registro atual preserva os IDs dos recursos e o domínio de produção. Três bancos Supabase suspensos da integração Vercel têm finalidade ainda não identificada e não são o banco principal confirmado.
