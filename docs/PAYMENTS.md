# Pagamentos — Infinity

Arquitetura de pagamentos baseada em adapters: o checkout depende apenas da
interface `PaymentProvider` (`src/payment-providers/types.ts`), nunca de um
gateway específico.

## Gateway principal: Broski ⭐

Escolhido pelo usuário (2026-07-28). Gateway português de **MB WAY** e
**Multibanco**, somente **EUR**.

- Painel: https://app.broski.pt · Documentação: https://docs.broski.pt
- Adapter: `src/payment-providers/broski/index.ts` — implementado estritamente
  a partir da OpenAPI oficial (`https://docs.broski.pt/openapi.yaml`).

### Status atual (honesto)

🖥️ **Interface pronta sem credenciais** — o código do adapter está completo e
segue a especificação oficial, mas **nenhuma chamada real foi validada ainda**
(depende de `BROSKI_API_KEY`). Assim que houver credenciais, o botão "Testar
conexão" da página Processador (Fase 4) fará a validação real.

### Fatos da API (da documentação oficial — nada inventado)

| Item               | Valor                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL           | `https://api.broski.pt`                                                                                                                          |
| Autenticação       | `Authorization: Bearer sk_live_…` (server-to-server; CORS bloqueia browser)                                                                      |
| Métodos            | `mbway` (confirmação no telemóvel; €0,50–€5.000) e `multibanco` (voucher entidade/referência)                                                    |
| Moeda              | apenas `EUR`, valores em cêntimos                                                                                                                |
| Criar pedido       | `POST /v1/orders` (header `Idempotency-Key` obrigatório; `customer.email` obrigatório; `checkout_url` recomendado sempre)                        |
| Consultar          | `GET /v1/orders/{id}` · Listar: `GET /v1/orders` (paginação por cursor)                                                                          |
| Estorno            | `POST /v1/orders/{id}/refunds` (corpo `{}` = total; `{amount}` = parcial; `Idempotency-Key` obrigatória; só pedidos pagos)                       |
| Cancelamento       | **não existe na API** — pedidos expiram sozinhos                                                                                                 |
| Clientes           | **sem endpoint** — criados automaticamente pelo e-mail no pedido                                                                                 |
| Status             | `pending`, `awaiting_payment`, `paid`, `expired`, `failed`, `refunded`                                                                           |
| Webhooks           | `order.awaiting_payment`, `order.paid`, `order.failed`, `order.expired`, `order.refunded`, `payout.paid`, `dispute.created`                      |
| Assinatura webhook | Header `Broski-Signature: t=<unix>,v1=<hex>` — `v1 = HMAC-SHA256(secret, t + "." + corpo_cru)`, tolerância ±5 min, deduplicar por `id` do evento |
| Rate limit         | 120 req/min por chave · corpo máx. 64 KB                                                                                                         |

### Mapeamento de status Broski → plataforma

| Broski             | Infinity (`payment_status`) |
| ------------------ | --------------------------- |
| `pending`          | `processing`                |
| `awaiting_payment` | `pending`                   |
| `paid`             | `approved`                  |
| `expired`          | `expired`                   |
| `failed`           | `refused`                   |
| `refunded`         | `refunded`                  |

### Regras de integração

1. Produto só é liberado no webhook **`order.paid`** com assinatura válida (nunca no retorno do checkout).
2. Multibanco pode confirmar **dias depois** — o pedido fica `awaiting_payment` exibindo entidade/referência/valor.
3. Webhooks são entregues _at-least-once_ e sem ordem — deduplicação por `evt_…` (tabela `payment_webhooks`, unique em `provider_key + external_event_id`).
4. A chave `sk_live_…` vive apenas no servidor (variável `BROSKI_API_KEY`), criptografada quando salva no banco.
5. MB WAY exige telemóvel PT (`+3519XXXXXXXX`) — o checkout valida antes de criar o pedido.

### Variáveis de ambiente

```
BROSKI_API_KEY=          # chave sk_live_… do painel (Configurações → API)
BROSKI_WEBHOOK_SECRET=   # segredo whbroski_… do endpoint de webhook
```

### Configuração do webhook (quando o site estiver no ar)

No painel Broski, registrar: `https://seu-dominio.com/api/webhooks/broski`
(rota criada na Fase 4). URL final exata — redirects 3xx fazem a entrega falhar.

## Demais gateways (Fase 4)

Stripe, Mercado Pago, Pagar.me e Asaas estão no catálogo
(`src/payment-providers/catalog.ts`) com `adapterReady: false` — as interfaces
de configuração aparecerão como desconectadas até os adapters serem
implementados e as credenciais fornecidas.
