# Banco de dados — Infinity

PostgreSQL (Supabase) + Drizzle ORM. Schema em `src/database/schema/`, dividido por domínio.

## Convenções

- IDs: UUID v4 (`gen_random_uuid()`)
- `workspace_id` em todas as entidades de negócio (multi-tenant + RLS)
- `created_at` / `updated_at` em todas as tabelas; `deleted_at` para soft delete quando faz sentido
- Valores monetários: `bigint` em **centavos** + coluna `currency`
- Status via enums PostgreSQL padronizados (`payment_status`, `order_status`, ...)
- Chaves de idempotência com unique constraints (`payments.idempotency_key`, `webhook_deliveries`, `payment_webhooks`)

## Domínios e tabelas

| Arquivo          | Tabelas                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| workspaces.ts    | profiles, workspaces, workspace_members                                                                                                   |
| stores.ts        | stores, store_settings, domains                                                                                                           |
| catalog.ts       | products, product_variants, product_images, product_files, categories, product_categories, inventory_movements, coupons, coupon_uses      |
| pages.ts         | landing_pages, landing_page_versions                                                                                                      |
| checkouts.ts     | checkouts, checkout_versions, checkout_products, order_bumps, payment_links                                                               |
| customers.ts     | customers, customer_addresses, customer_consents                                                                                          |
| carts.ts         | carts, cart_items, checkout_sessions                                                                                                      |
| orders.ts        | orders, order_items, order_status_history                                                                                                 |
| payments.ts      | payment_providers, payment_provider_accounts, payments, payment_attempts, refunds, chargebacks, payment_webhooks, payouts, ledger_entries |
| analytics.ts     | visitor_sessions, analytics_events, campaigns, campaign_links                                                                             |
| pixels.ts        | pixels, pixel_bindings, pixel_events                                                                                                      |
| integrations.ts  | integrations, integration_logs, webhook_endpoints, webhook_deliveries                                                                     |
| emails.ts        | email_campaigns, email_recipients, email_events, email_suppressions, email_frequency_caps                                                 |
| notifications.ts | notification_preferences, notifications                                                                                                   |
| system.ts        | audit_logs, files                                                                                                                         |

## Migrations

```bash
# gerar migration a partir do schema
npm run db:generate

# aplicar migrations (requer DIRECT_URL ou DATABASE_URL)
npm run db:migrate
```

- `DATABASE_URL`: pooler do Supabase (porta 6543) — usado pela aplicação (serverless, `prepare: false`).
- `DIRECT_URL`: conexão direta (porta 5432) — usada apenas pelo drizzle-kit.

## RLS (Row Level Security)

Será configurada quando o projeto Supabase for criado (Fase 1 → deploy):
políticas por `workspace_id` via `workspace_members`, com papéis (owner, admin,
finance, marketing, support, analyst, viewer). O SQL das políticas entrará em
migration própria assim que houver credenciais para validar.

## Dados sensíveis

- Nunca armazenar: número completo de cartão, CVV.
- `payments`: apenas bandeira + últimos 4 dígitos.
- IP sempre mascarado (`ip_masked`).
- Credenciais de integrações criptografadas (`encrypted_credentials`).
