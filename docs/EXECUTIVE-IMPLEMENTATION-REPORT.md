# Relatório de implementação — Dashboard executiva

## Escopo aplicado

A dashboard existente foi refatorada sem criar um painel paralelo. A nova aba padrão é **Visão executiva**, e as abas anteriores permanecem disponíveis como camadas de investigação.

## Diagnóstico encontrado

- A página começava pela operação diária, antes de apresentar o estado financeiro consolidado ao CEO.
- ROI e ROAS apareciam misturados nos filtros do calendário.
- A soma de aprovado, pendente e recusado era apresentada como receita bruta, apesar de representar volume processado.
- As métricas financeiras estavam espalhadas entre abas e componentes sem um dicionário central.
- O funil usava referências demonstrativas descritas como padrão de mercado.
- Receita, custo de mídia e resultado não eram apresentados juntos em uma narrativa executiva.
- Não havia uma camada consolidada de qualidade, confiança, atribuição, coortes e retorno marginal.

## Nova organização

1. Cabeçalho de contexto, período, comparação, atualização, moeda e timezone.
2. Veredito executivo com status, impacto, causa provável, ação e confiança.
3. Seis KPIs primários: caixa, receita líquida, lucro e margem de contribuição, MER e NC-CAC.
4. Indicadores secundários: mídia, payback, aprovação, reembolso, chargeback, clientes, LTV e ticket.
5. Ponte financeira.
6. Tendência conjunta de receita líquida, contribuição e mídia.
7. Aquisição por canal com ROAS, ROI, NC-CAC, mROAS, saturação e decisão.
8. Creative Intelligence com Hook, Hold, CTR, CVR, CPA, frequência e fadiga.
9. Atribuição separada em plataforma, first-party, assistida e incremental estimada.
10. Funil completo até liquidação e retenção.
11. Coortes de LTV e margem.
12. Centro de decisões por impacto, urgência e confiança.
13. Qualidade e linhagem dos dados.

## Correções financeiras

- `Volume processado = aprovado + pendente + recusado`.
- `ROAS = receita atribuída ÷ mídia`.
- `ROI = lucro de contribuição ÷ mídia` na análise por canal.
- `MER = caixa aprovado demonstrativo ÷ mídia total`.
- `Receita líquida demonstrativa = aprovada − reembolsos − chargebacks`.
- `Lucro de contribuição = caixa − mídia − taxas − produto − reembolsos − chargebacks`.
- Métricas modeladas são identificadas como estimadas ou provisórias.

## Responsividade e acessibilidade

- Layouts com Grid, `minmax`, `auto-fit`, `clamp` e containers já existentes foram preservados e ampliados.
- Visão executiva reorganiza-se em uma coluna no celular, duas colunas quando existe espaço e até seis KPIs em telas amplas.
- Tabelas de aquisição viram cards em telas menores.
- Controles padrão e abas passaram a usar alvos maiores.
- Fontes funcionais novas não ficam abaixo de 12 px.
- Dados financeiros usam algarismos tabulares.
- Estados não dependem apenas de cor: incluem texto, selo, sinal e contexto.
- `prefers-reduced-motion` e `forced-colors` receberam tratamento adicional.

## Validações executadas

- Parse sintático de 181 arquivos TypeScript/TSX: aprovado.
- Typecheck isolado das novas bibliotecas financeiras e analíticas: aprovado.
- Verificação de runtime das fórmulas executivas: aprovado.
- Ponte financeira fecha no lucro de contribuição: aprovado.
- Volume processado permanece separado da receita aprovada: aprovado.
- Três canais de aquisição e seis KPIs primários: aprovado.

## Limitação do ambiente de validação

O `npm ci` não foi concluído porque o registry interno retornou HTTP 404 para uma dependência transitiva. Por isso, o build completo do Next.js, o Vitest e screenshots automatizados não foram executados neste ambiente. O projeto não inclui `node_modules` no ZIP final.

## Pontos que ainda exigem dados reais

- liquidação bancária real;
- custos contábeis e impostos;
- clientes novos e recorrentes do CRM;
- LTV e retenção observados;
- atribuição first-party;
- testes de lift e incrementalidade;
- mROAS e saturação calibrados;
- métricas reais de criativos;
- qualidade e frescor reais por integração.

Esses elementos aparecem como demonstração e não devem acionar automações financeiras até a conexão e validação das fontes reais.
