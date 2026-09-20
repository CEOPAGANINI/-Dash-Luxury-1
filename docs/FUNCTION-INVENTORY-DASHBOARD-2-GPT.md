# Inventário de funções — Dashboard 2.0 GPT

| Ordem | Função                                              | Escopo                          | Decisão suportada                                          | Componente principal               |
| ----: | --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
|     1 | Qualidade e latência das fontes                     | Global                          | Os dados são confiáveis?                                   | `executive-data-confidence.tsx`    |
|     2 | Veredito financeiro                                 | Global                          | Houve lucro, prejuízo ou consumo de caixa?                 | `executive-overview.tsx`           |
|     3 | Caixa, receita líquida, lucro, margem, MER e NC-CAC | Global                          | A operação está saudável?                                  | `executive-overview.tsx`           |
|     4 | Volume processado e status de pagamento             | Global                          | Quanto está aprovado, pendente ou recusado?                | `direct-response-finance.tsx`      |
|     5 | Ponte financeira                                    | Global                          | Para onde foi cada real?                                   | `executive-overview.tsx`           |
|     6 | Ritmo do orçamento                                  | Global diário                   | O gasto está lento, correto ou acelerado?                  | `budget-pacing.tsx`                |
|     7 | Tendência diária, semanal e mensal                  | Global                          | O crescimento preserva margem?                             | `executive-overview.tsx`           |
|     8 | Aquisição por rede                                  | Local de aquisição              | Qual rede escalar, manter ou reduzir?                      | `executive-overview.tsx`           |
|     9 | Creative Intelligence                               | Local de aquisição              | Qual criativo trocar, validar ou escalar?                  | `executive-overview.tsx`           |
|    10 | Atribuição                                          | Global                          | Qual fonte de receita pode ser comparada?                  | `executive-overview.tsx`           |
|    11 | Funil                                               | Global                          | Em qual etapa há perda financeira?                         | `executive-overview.tsx`           |
|    12 | Clientes e coortes                                  | Global                          | A aquisição gera valor futuro?                             | `executive-overview.tsx`           |
|    13 | Receita em 24 horas                                 | Global/temporal                 | Qual dia e horário mais vende?                             | `revenue-chart.tsx`                |
|    14 | Calendário                                          | Local temporal com cross-filter | Quando o resultado aconteceu?                              | `operations-revenue-calendar.tsx`  |
|    15 | Filtros por ROAS relativo ao equilíbrio             | Local do calendário             | Quais dias ficaram abaixo ou acima do ponto de equilíbrio? | `operations-revenue-calendar.tsx`  |
|    16 | Redes globais e por dia                             | Local do calendário             | Qual rede causou o resultado do dia?                       | `operations-revenue-calendar.tsx`  |
|    17 | Centro de decisões                                  | Global                          | Qual risco ou oportunidade tratar primeiro?                | `executive-overview.tsx`           |
|    18 | Plano de ação                                       | Global                          | Quem faz o quê e em qual estado?                           | `executive-action-plan.tsx`        |
|    19 | Ciência de dados e prontidão                        | Global                          | A análise é regra, estimativa, previsão ou causalidade?    | `advanced-analytics-readiness.tsx` |
|    20 | Filtros salvos e compartilháveis                    | Global/local                    | Como reproduzir uma leitura executiva?                     | `executive-filter-system.tsx`      |

## Ordem de leitura

`Confiança → Resultado → Causa financeira → Canal → Funil/cliente → Dia/hora → Risco → Ação`

## Cross-filter implementado

- período altera o modelo executivo e o conjunto analisado no financeiro e gráfico;
- seleção do calendário altera o modelo executivo completo;
- seleção semanal atravessando meses é preservada;
- rede filtra aquisição e criativos sem fingir que altera métricas globais;
- granularidade altera a consolidação do gráfico de tendência.

## Filtros aguardando dados reais

Produto, oferta, campanha, conjunto, anúncio, criativo real, região, dispositivo, processador e cliente por evento estão visíveis como arquitetura, mas desabilitados. Isso impede que a interface apresente uma segmentação que o conjunto demonstrativo não contém.
