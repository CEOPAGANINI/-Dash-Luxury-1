# Infraestrutura — Dash Luxury

Registro em 02/10/2026. Esta documentação organiza referências existentes; não contém credenciais nem implica criação, exclusão, migração ou publicação de recursos. Para estado e nomes de cada recurso, consulte `../project-registry.json` e `PROJECT_REGISTRY.md`.

## Recursos principais confirmados

| Serviço              | Identificador estável               | Nome e finalidade                                                          |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| GitHub               | Repositório `1316545148`            | Dashboard principal privado `CEOPAGANINI/dash-luxury-dashboard`            |
| Vercel               | `prj_sughoBVaJoeQClw8ULoHNECAzuYt`  | Único projeto Vercel do dashboard; nome confirmado `dash-luxury-dashboard` |
| Time Vercel          | `team_WUbbs5CEXGEJYWWvUQev4XyR`     | Time do projeto principal                                                  |
| Endereço publicado   | `https://dashboardatual.vercel.app` | Deve ser preservado durante a organização                                  |
| Supabase             | `dzjvmbfgytbhhpkcaxei`              | Banco/Auth de produção; nome confirmado `dash-luxury-dashboard-producao`   |
| Organização Supabase | `fvtrspqqfksswyockbyv`              | `CEOPAGANINI's Org`                                                        |
| Região Supabase      | `ca-central-1`                      | Canada Central; não alterada pela renomeação                               |

Renomeações alteram rótulos de organização. Não autorizam trocar os IDs, recriar projetos, mudar região, copiar banco ou retirar o domínio de produção. Os nomes GitHub, Vercel e Supabase principal foram confirmados, e o alias de produção continuou com configuração válida.

## Fluxo técnico

1. O código do repositório principal é construído no projeto Vercel existente.
2. Next.js entrega as áreas privadas e rotas públicas já existentes. `src/proxy.ts` protege áreas privadas e renova a sessão Supabase.
3. `src/lib/auth/session.ts` valida a sessão no servidor. APIs e serviços também verificam papel e workspace.
4. `src/lib/supabase` concentra os clientes Auth/Supabase; `src/database` concentra PostgreSQL e schema Drizzle.
5. Integrações externas dependem de configuração real e validação própria. O rótulo ou o simulador de uma integração não comprova conexão.

A aplicação de produção usa configurações de Supabase/PostgreSQL nos ambientes existentes. O Supabase principal não foi associado como recurso Vercel Storage nesta organização; não inferir esse vínculo pelos três projetos inativos da integração.

## Política de autenticação atual

Produção e previews Vercel não fornecem sessão demo quando Supabase está ausente. Áreas privadas retornam indisponibilidade, e a sessão fica nula. Sem login, uma área privada configurada redireciona para `/login`.

A sessão demo sem Auth só é permitida com `NODE_ENV=development` ou `NODE_ENV=test` e sem `VERCEL` nem `VERCEL_ENV`. Demonstrações de tarefas e tráfego podem funcionar dentro de uma sessão autenticada; são outro conceito.

As rotas públicas de loja, checkout e tracking seguem seus fluxos existentes. Webhooks e agente VPS dependem das verificações de assinatura próprias; sua exceção no proxy não elimina essas verificações. Consulte `docs/private-dashboard.md` para as medidas de privacidade e pendências.

## Build e preparação do schema

`npm run build` executa `node scripts/prepare-production-schema.mjs && next build`.

O script registra o projeto Vercel `prj_sughoBVaJoeQClw8ULoHNECAzuYt` e o banco `dzjvmbfgytbhhpkcaxei`. A execução automática só prossegue com `VERCEL_ENV=production`; se `VERCEL_PROJECT_ID` estiver presente e for outro, a preparação é ignorada. A conexão do banco é validada pelo hostname direto do ref confirmado ou pelo usuário correspondente no pooler Supabase.

As migrations explicitamente preparadas por esse script são:

- `src/database/migrations/0007_funnel_storage.sql`;
- `src/database/migrations/0008_rate_limits.sql`.

A preparação usa transação e lock, verifica RLS nas quatro tabelas registradas e exercita o driver com consultas de conexão e uma transação sem persistência de dados de usuário. Ela não substitui a auditoria completa de RLS, views, funções e buckets. Não estenda a lista ou altere o banco-alvo durante uma renomeação.

## Configurações e segredos

- Auth usa as configurações existentes `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. O endpoint precisa corresponder ao ref de produção confirmado.
- A conexão PostgreSQL de servidor usa `DATABASE_URL`.
- Criptografia de credenciais usa o helper existente; `ENCRYPTION_KEY` é a configuração preferida documentada para o agente IA.
- Valores ficam nos ambientes e cofres correspondentes. Esta documentação contém somente nomes de variáveis, IDs e endereço público.
- Não acrescente `NEXT_PUBLIC_` a segredos de servidor nem copie chaves, senhas, strings de conexão, cookies ou tokens para o registro.

## Recursos Supabase sem associação confirmada

Os projetos `olgetcvivvdqbebeepfm` (`supabase-inativo-diamond`), `zuhgbwbwjralkzsusjyq` (`supabase-inativo-canvas`) e `dxoglxgdwpnpiqpcysgr` (`supabase-inativo-desert`) aparecem com nomes confirmados e estado `INACTIVE` no acesso MCP da organização `vercel_icfg_CIvqmLCQrZeQuIiBqTalgl3s`. A Vercel Storage mostra nenhum projeto conectado a esses recursos. A finalidade e a associação com esta aplicação não estão confirmadas. Preserve nomes e estado; não migre dados, retome, exclua ou atribua ambiente a eles a partir desta documentação.

## Pendências de verificação

- Confirmar a finalidade dos projetos Supabase inativos antes de lhes atribuir produto ou ambiente.
- Atualizar o registro quando houver mudança confirmada de nome, vínculo ou estado de um recurso.
