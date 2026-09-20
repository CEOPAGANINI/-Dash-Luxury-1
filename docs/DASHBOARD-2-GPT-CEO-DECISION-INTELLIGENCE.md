# Dashboard 2.0 GPT — CEO Decision Intelligence

## Objetivo

A versão foi reorganizada para conduzir a leitura executiva nesta sequência:

1. confiança e completude dos dados;
2. veredito financeiro;
3. KPIs principais;
4. composição do resultado;
5. ritmo do orçamento;
6. tendência;
7. aquisição e criativos;
8. funil e clientes;
9. receita por dia e hora;
10. calendário operacional;
11. riscos e oportunidades;
12. plano de ação.

A visão principal agora contém as funções críticas que antes dependiam da navegação por várias abas. As abas antigas permanecem disponíveis para investigação.

## Funções incorporadas

### Governança e filtros

- sequência lógica de filtros: contexto, tempo, negócio, aquisição, cliente e pagamento;
- diferenciação visual entre filtros globais e locais;
- chips removíveis para filtros ativos;
- limpar, desfazer, salvar, carregar e compartilhar uma visão;
- período global conectado ao modelo executivo;
- seleção de dia ou semana no calendário atualizando KPIs, financeiro, tendência, funil, clientes, riscos e plano de ação;
- granularidade diária, semanal e mensal no gráfico de tendência;
- filtros sem dimensão real permanecem desativados para evitar segmentações fictícias.

### Qualidade dos dados

- faixa de confiança posicionada antes do veredito;
- completude e latência por fonte;
- diferenciação entre saudável, atrasado e estimado;
- modo demonstração explicitamente identificado;
- bloqueio conceitual de automações financeiras quando custos ou atribuição são estimados.

### Financeiro Direct Response

- veredito: lucro, prejuízo, caixa, margem, causa, risco, oportunidade e ação;
- seis KPIs executivos: caixa, receita líquida, lucro de contribuição, margem, MER e NC-CAC;
- indicadores secundários: volume processado, pendência, mídia, aprovação, reembolso, chargeback, LTV, ticket e pedidos;
- ponte financeira;
- budget pacing com gasto esperado, observado, projeção e classificação do ritmo;
- separação entre volume processado, receita aprovada, receita líquida, caixa e lucro;
- ROI e ROAS calculados e apresentados como conceitos diferentes.

### Aquisição e ciência de dados

- canal, investimento, receita, contribuição, ROAS, ROI, NC-CAC, frequência, saturação e mROAS;
- filtro local por rede aplicado a aquisição e criativos;
- Creative Intelligence com Hook Rate, Hold Rate, CTR, CVR, CPA, frequência e fadiga;
- atribuição separada entre plataforma, first-party, assistida e incremental estimada;
- camada de prontidão analítica para anomalias, previsão, causalidade e incrementalidade;
- nenhuma causalidade é apresentada como confirmada sem experimento.

### Funil e clientes

- funil até aprovação, liquidação e retenção;
- perdas absolutas, conversão, benchmark interno demonstrativo e dinheiro na mesa;
- novos e recorrentes;
- LTV e retenção por coorte;
- margem por coorte.

### Receita, horário e calendário

- faturamento aprovado, pendente e recusado;
- comparação de hoje com ontem;
- total do período, aprovação média e melhor dia;
- gráfico diário dividido em 24 horas;
- horário de pico;
- tooltip com mouse, foco, clique e toque conforme os componentes existentes;
- calendário de janeiro do ano corrente a dezembro de 2028;
- seleção de dia, múltiplos dias e semana;
- painel detalhado do dia;
- ativação global e local de redes;
- mini pilar de 24 horas em cada dia;
- versão móvel em lista diária;
- bottom sheet para detalhes;
- filtros de ROAS agora relativos ao ROAS de equilíbrio estimado, em vez de limites fixos universais.

### ROI por rede corrigido

O ROI por rede agora aloca custos não relacionados à mídia proporcionalmente à participação de receita:

- investimento total da rede = mídia + custos não-mídia alocados;
- lucro da rede = receita atribuída − investimento total;
- ROI = lucro ÷ investimento total;
- ROAS = receita atribuída ÷ mídia.

A alocação continua identificada como estimativa até que custos reais estejam ligados a pedido, produto e canal.

### Centro de decisões

- prioridades ordenadas por impacto, urgência e confiança;
- evidência, causa provável, ação, responsável e horizonte;
- plano de ação com estados: Novo, Analisando, Aprovado, Executando, Concluído e Descartado;
- persistência local do estado das ações no navegador.

## Principais arquivos alterados

- `src/app/(painel)/dashboard/page.tsx`
- `src/features/dashboard/executive-overview.tsx`
- `src/features/dashboard/operations-revenue-calendar.tsx`
- `src/domain/analytics/executive-analytics.ts`
- `src/services/analytics/executive-dashboard-service.ts`
- `src/app/globals.css`
- `tests/unit/executive-analytics.test.ts`

## Novos componentes

- `advanced-analytics-readiness.tsx`
- `budget-pacing.tsx`
- `executive-action-plan.tsx`
- `executive-data-confidence.tsx`
- `executive-filter-system.tsx`
- `executive-operational-timeline.tsx`

## Validações executadas

- 215 arquivos TypeScript/TSX analisados pelo parser do TypeScript: sem erros de sintaxe;
- `tsc -p tsconfig.domain-strict.json --noEmit`: aprovado;
- teste unitário adicionado para seleção semanal atravessando dois meses;
- integridade do ZIP deve ser validada após empacotamento com `unzip -t`.

## Limitações reais

O projeto ainda usa dados demonstrativos. Por isso, os seguintes filtros aparecem estruturados, mas desabilitados até que existam dimensões reais no banco:

- produto;
- oferta;
- campanha, conjunto, anúncio e criativo por evento real;
- cliente novo ou recorrente por pedido;
- região e dispositivo;
- processador e status de pagamento por evento;
- previsão estatística;
- causalidade;
- incrementalidade observada.

Esses recursos não foram simulados artificialmente. A arquitetura está preparada para recebê-los por Supabase/Drizzle e, nos modelos avançados, por um serviço analítico separado.

## Limitação do ambiente de validação

O `npm ci` não foi concluído porque o registry do ambiente não disponibilizou `zod-validation-error@4.0.2`. Portanto, o build completo do Next.js não foi executado neste ambiente. A validação de domínio e a análise sintática foram concluídas com sucesso.
