# Mapa do projeto — Dash Luxury

Referência do código auditado: `613837d7507db502d4f7e39b1ebf99f493d13833`, em 02/10/2026. Os recursos externos confirmados são registrados em `project-registry.json`.

## Estrutura técnica

| Caminho                                            | Responsabilidade                                       |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/app/(auth)`                                   | Login, cadastro e recuperação de senha                 |
| `src/app/(painel)`                                 | Páginas privadas da operação                           |
| `src/app/api`                                      | Endpoints, OAuth, tracking, integrações e agente VPS   |
| `src/features`                                     | Telas, regras e serviços por domínio                   |
| `src/components/ui`                                | Componentes base compartilhados                        |
| `src/components/layout`                            | Navegação e estrutura do painel                        |
| `src/components/command-layer`                     | Estrutura e ícones da identidade CommandLayer          |
| `src/lib/auth`, `src/lib/supabase`, `src/proxy.ts` | Sessão, clientes Supabase e proteção de acesso         |
| `src/database`                                     | Cliente PostgreSQL, schema Drizzle, migrations e seeds |
| `src/payment-providers`, `src/integrations`        | Contratos e adaptadores externos                       |
| `src/analytics`, `src/emails`, `src/validations`   | Tracking, e-mails e validação                          |
| `scripts`                                          | Ferramentas de operação, banco, build e VPS            |
| `tests`                                            | Testes por domínio; suites Vitest e agente Python      |
| `docs`                                             | Arquitetura, contratos, deploy, operação e design      |

## Áreas funcionais e pontos de entrada

| Área                              | Rotas principais                                                                                                                               | Implementação principal                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Visão geral e analytics           | `/dashboard`, `/dashboard/dados`, `/dashboard/trafego`, `/dashboard/financeiro`                                                                | `dashboard`, `analytics`, `unified-dashboard`                                             |
| Pedidos, clientes e carrinhos     | `/pedidos`, `/clientes`, `/carrinhos`                                                                                                          | `orders`, `customers`, `carts`                                                            |
| Catálogo e produtos               | `/catalogo/produtos`, `/catalogo/categorias`, `/catalogo/estoque`, `/catalogo/cupons`                                                          | `catalog`                                                                                 |
| Lojas e páginas                   | `/lojas`, `/landing-pages`, `/editor/loja`, `/editor/pagina`, `/editor/landing-page`                                                           | `stores`, `landing`, `landing-editor`, `orbit`                                            |
| Checkout e frete                  | `/checkouts`, `/editor/checkout`, `/editor/fretes`                                                                                             | `checkout`, `checkouts`, `checkout-editor`, `shipping`                                    |
| Financeiro e pagamentos           | `/financeiro`, `/financeiro/entradas-saidas`, `/financeiro/repasses`, `/financeiro/processador`, `/financeiro/links-de-pagamento`, `/gateways` | `gateways`, `src/payment-providers`, schema `payments`                                    |
| Campanhas e redes de tráfego      | `/campanhas`, `/campanhas/[rede]`, `/campanhas/[rede]/[sessao]`, `/campanhas/analise`, `/campanhas/calculadora`, `/campanhas/campanha/[id]`    | `ads`                                                                                     |
| Quadro do funil e planejamento    | `/campanhas/quadro`                                                                                                                            | `funnel/funnel-board-client.tsx` e módulos de grafo, armazenamento e pacotes              |
| Roteador de ofertas               | `/roteador-de-ofertas`                                                                                                                         | O mesmo `FunnelBoardClient`, com `focoTipo="redirect"`; módulos `funnel` e `offer-router` |
| Pixels, captura e prova social    | `/pixel`, `/captura`, `/provas-sociais`, `/live-view`                                                                                          | `pixels`, `capture`, `reviews`, `analytics`                                               |
| Conexões, APIs e automações       | `/integracoes`, `/webhooks`, `/emails`                                                                                                         | `integrations`, `emails`, endpoints OAuth e webhooks                                      |
| Servidor e domínios               | `/servidor`, `/servidor/novo`, `/servidor/[servidorId]`, `/servidor/sites`, `/servidor/sites/[siteId]`                                         | `vps`                                                                                     |
| Segurança e filtro de acesso      | `/seguranca`, `/filtro-de-acesso`, `/configuracoes/acessos`, `/configuracoes/diagnosticos`                                                     | `access-filter`, `guardrails`, `auth`, `settings`                                         |
| Agente IA                         | `/agente-ia`, `/agente-ia/rascunhos`, `/agente-ia/historico`, `/agente-ia/configuracoes`                                                       | `ai-agent`; APIs `/api/ia-agent` e `/api/ia-agent/settings`                               |
| Notificações, logs e configuração | `/notificacoes`, `/logs`, `/configuracoes`, `/configuracoes/operacao`                                                                          | `notifications`, `settings`                                                               |
| Design system                     | `/design-system`                                                                                                                               | `command-layer`, componentes compartilhados e `src/app/globals.css`                       |

Os caminhos da coluna de implementação são relativos a `src/features`, exceto quando indicado. O mapa identifica código e pontos de entrada; não declara todas as integrações reais como configuradas ou operacionais.

## Funil, roteador e agente: limites que precisam permanecer claros

- `/campanhas/quadro` é o canvas do funil e substituiu o quadro antigo de campanhas nessa rota. Gestão de campanhas também possui suas próprias telas em `ads`.
- `/roteador-de-ofertas` abre o mesmo canvas com o redirecionador em foco. A rota de editor, sozinha, não prova que existe roteamento público em execução. Publicação, exportação, regras e motor público devem ser verificados no fluxo específico.
- BMs, contas, campanhas e criativos podem ser apresentados por simulação ou por conexão real. A interface precisa dizer qual origem está sendo usada; não assumir que todas as contas de uma loja estão sincronizadas só porque o bloco existe.
- O agente IA de chat é diferente do agente operacional da VPS. O primeiro analisa e prepara rascunhos; o segundo usa seus próprios endpoints e verificações de assinatura.
- A demonstração do agente IA é uma simulação local de tarefas dentro do painel autenticado. Não substitui Supabase Auth nem constitui inferência real em um provedor.

## Leituras complementares

- `AGENTS.md`: regras de colaboração e segurança.
- `docs/STRUCTURE.md`: organização de pastas.
- `docs/ARCHITECTURE.md` e `docs/ARCHITECTURE-HARDENING-V2.md`: arquitetura; a política mais recente de acesso está em `docs/private-dashboard.md`.
- `docs/DEPLOY.md`, `docs/DATABASE.md`, `docs/VPS.md`: procedimentos existentes.
- `docs/agente-ia.md`: funcionamento, conexão e limites do agente.
- `docs/INFRASTRUCTURE.md` e `docs/PROJECT_REGISTRY.md`: infraestrutura confirmada e recursos de finalidade pendente.
