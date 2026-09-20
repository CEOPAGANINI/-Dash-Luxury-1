# Integração do calendário executivo

O calendário avançado foi integrado à aba **Operação** do dashboard.

## Arquivos principais

- `src/features/dashboard/operations-revenue-calendar.tsx`
  - calendário mensal com semanas completas de segunda a domingo;
  - seleção independente de dias e semanas;
  - botões de Face ADS, Google ADS e YouTube ADS em cada dia;
  - filtro global por rede;
  - resumo do período;
  - tooltip executivo com receita recebida, pendente, recusada, eficiência, pedidos, ticket, ROAS, meta e composição por rede.
- `src/features/dashboard/operational-command-center.tsx`
  - mantém o estado do período selecionado;
  - conecta o calendário ao gráfico de receita.
- `src/features/dashboard/revenue-chart.tsx`
  - aceita seleção externa de datas;
  - pode ocultar o calendário compacto interno quando o calendário executivo controla o período.
- `src/app/layout.tsx` e `src/app/globals.css`
  - Montserrat aplicada como fonte principal do painel.

## Comportamento

Quando o usuário seleciona dias ou uma semana no calendário, o gráfico de receita abaixo passa a mostrar exatamente esse período. A seleção das redes dentro de cada dia altera o valor exibido e o resumo do calendário, sem apagar os dados originais.

Os dados por rede são demonstrativos e determinísticos: a soma de Face ADS, Google ADS e YouTube ADS corresponde à receita aprovada do dia.
