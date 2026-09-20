# Reforço de arquitetura — Dashboard Executiva V2

## Objetivo

Separar interface, regras financeiras, aquisição, clientes, acesso a dados e ciência de dados. A dashboard continua em TypeScript/Next.js, enquanto cálculos e fontes passam a ter fronteiras explícitas e testáveis.

## O que mudou

### 1. Domínio financeiro centralizado

Novos módulos:

- `src/domain/finance/formulas.ts`
- `src/domain/finance/demo-finance.ts`
- `src/domain/marketing/formulas.ts`
- `src/domain/customers/formulas.ts`
- `src/domain/shared/math.ts`

Fórmulas centralizadas:

- lucro e margem de contribuição;
- receita líquida;
- MER;
- ROAS;
- ROI;
- NC-CAC;
- payback;
- LTV 90 dias;
- saturação;
- mROAS;
- recomendação de orçamento.

Os módulos antigos em `src/lib` foram preservados como reexports para não quebrar imports externos durante a migração.

### 2. Caso de uso executivo único

`src/services/analytics/executive-dashboard-service.ts` calcula uma única vez:

- snapshot executivo;
- aquisição por canal;
- criativos;
- ponte financeira;
- tendência;
- coortes;
- riscos;
- funil;
- frescor das fontes.

O componente `ExecutiveOverview` recebe um view model consistente em vez de recalcular as mesmas métricas em várias seções.

### 3. Repositórios e contratos de dados

Foram adicionados:

- contrato `ExecutiveAnalyticsRepository`;
- implementação demonstrativa;
- implementação Drizzle para o data mart real;
- contratos de frescor e qualidade;
- schemas Zod para validar payloads de analytics.

A interface deixa de depender diretamente de Supabase, Drizzle ou APIs de mídia.

### 4. Data mart financeiro

Novas tabelas:

- `daily_business_metrics`;
- `analytics_source_syncs`.

Migration:

- `src/database/migrations/0004_executive_analytics_mart.sql`.

Os valores monetários são armazenados em centavos. A tabela separa volume processado, receita aprovada, pendente, recusada, caixa liquidado, reembolsos, chargebacks, taxas, impostos, mídia, produto e lucro de contribuição.

### 5. Formatação única

`src/shared/formatters/dashboard.ts` padroniza:

- moeda completa;
- moeda compacta;
- percentuais;
- múltiplos;
- inteiros;
- duração;
- status dos dados.

Os principais componentes executivos, calendário e gráfico passaram a usar essa camada.

### 6. TypeScript endurecido

No `tsconfig.json`:

- `allowJs: false`;
- `forceConsistentCasingInFileNames: true`;
- `noFallthroughCasesInSwitch: true`;
- `noImplicitOverride: true`;
- `useUnknownInCatchVariables: true`.

O arquivo `tsconfig.domain-strict.json` adiciona, para as camadas novas:

- `noUncheckedIndexedAccess: true`;
- `exactOptionalPropertyTypes: true`.

Comando:

```bash
npm run typecheck:domain
```

### 7. Preparação para ciência de dados

A dashboard não foi reescrita em Python. Foi criada uma fronteira independente:

- `AdvancedAnalyticsProvider`;
- `HttpAdvancedAnalyticsProvider`.

Um worker Python pode fornecer previsão e anomalias por HTTP sem acoplar o frontend à linguagem do modelo.

## Testes adicionados

- `domain-formulas.test.ts`;
- `executive-dashboard-service.test.ts`;
- `demo-repository.test.ts`.

Comando:

```bash
npm run test:architecture
```

## Validações executadas neste ambiente

- 204 arquivos TypeScript/TSX analisados por `transpileModule`: sem erro de sintaxe;
- `tsconfig.domain-strict.json`: aprovado;
- execução real das fórmulas e do view model executivo: aprovada;
- ponte financeira fecha no lucro de contribuição;
- seis KPIs, três canais, oito etapas de funil e quatro sinais de qualidade gerados.

## Limitação do ambiente

O `npm ci` não pôde ser concluído porque o registry interno retornou HTTP 404 para `zod-validation-error@4.0.2`. Por isso, o build completo do Next.js e o Vitest não foram executados aqui. O projeto não inclui `node_modules` no ZIP.

## Próximas integrações reais

1. Executar a migration em ambiente de desenvolvimento.
2. Criar jobs de ingestão para checkout, gateway, Meta, Google, CRM e custos.
3. Preencher `daily_business_metrics` e `analytics_source_syncs`.
4. Trocar `DemoExecutiveAnalyticsRepository` por `DrizzleExecutiveAnalyticsRepository` na página servidor.
5. Conectar um worker analítico somente quando houver histórico suficiente para previsão ou anomalias.
