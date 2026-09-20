# Redesign executivo da dashboard

## Objetivo

A dashboard passa a abrir em uma visão executiva que organiza a leitura em três velocidades:

1. veredito em poucos segundos;
2. explicação financeira e operacional em cerca de 30 segundos;
3. investigação detalhada nas abas preservadas.

## Nova arquitetura

1. Cabeçalho de contexto e período.
2. Veredito executivo com status, impacto, causa, ação e confiança.
3. Seis KPIs primários: caixa, receita líquida, lucro e margem de contribuição, MER e NC-CAC.
4. Indicadores secundários.
5. Ponte financeira.
6. Tendência de receita, lucro e mídia.
7. Aquisição por canal com ROAS, ROI, mROAS e saturação separados.
8. Funil com perdas e referência interna demonstrativa.
9. Coortes de clientes e LTV.
10. Centro de decisões.
11. Qualidade e linhagem dos dados.

## Correções semânticas

- A soma de aprovado, pendente e recusado foi renomeada de `Receita bruta` para `Volume processado`.
- Os filtros em múltiplos de receita sobre mídia foram identificados como `ROAS`, não `ROI`.
- ROI permanece definido como lucro de contribuição dividido pelo investimento.
- Benchmarks do funil são identificados como referências internas demonstrativas, não como padrão de mercado.
- Métricas estimadas, provisórias e confirmadas recebem rótulos diferentes.

## Arquivos principais

- `src/features/dashboard/executive-overview.tsx`
- `src/lib/executive-analytics.ts`
- `src/lib/dashboard-metrics.ts`
- `src/app/(painel)/dashboard/page.tsx`
- `src/features/dashboard/operations-revenue-calendar.tsx`
- `src/features/dashboard/direct-response-finance.tsx`
- `src/lib/demo-finance.ts`
- `src/app/globals.css`

## Limitações atuais

Os dados ainda são demonstrativos. Custos, coortes, LTV, mROAS, saturação e confiança não devem acionar decisões automáticas até que checkout, CRM, plataformas de mídia e contabilidade estejam conectados e validados.
