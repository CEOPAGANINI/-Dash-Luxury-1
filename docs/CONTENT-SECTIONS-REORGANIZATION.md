# Dashboard 2.0 GPT — Reorganização por sessões

## Objetivo

Separar conteúdos, métricas e ferramentas em sessões independentes, mantendo uma sequência executiva clara e preservando todas as funções existentes.

## Nova sequência da visão executiva

0.  Contexto e filtros globais
1.  Confiança e disponibilidade dos dados
2.  Veredito executivo
3.  Verdade financeira e indicadores essenciais
4.  Composição financeira e ritmo de orçamento
5.  Tendência, previsão e preparação analítica
6.  Aquisição, criativos e atribuição
7.  Funil e perdas por etapa
8.  Clientes, retenção e coortes
9.  Receita por hora, dia, semana e calendário
10. Riscos, prioridades e plano de ação
11. Governança, linhagem e investigação técnica

## Mudanças de interface

- Foi criado um componente estrutural reutilizável para sessões executivas.
- Cada sessão possui número, categoria, título, descrição, ícone e conteúdo próprio.
- Foi adicionada navegação horizontal e fixa entre as sessões.
- Os KPIs primários foram separados dos indicadores secundários.
- Funil e clientes deixaram de compartilhar o mesmo bloco visual.
- Aquisição, criativos e atribuição permanecem relacionados, mas divididos em módulos internos.
- Riscos e plano de ação passaram a ocupar uma sessão específica de execução.
- Qualidade técnica e linhagem foram movidas para a última sessão, fora do primeiro nível de leitura.

## Organização da área operacional

1.  Resultado financeiro da operação
2.  Calendário operacional
3.  Receita por dia e por hora
4.  Alertas e prioridades operacionais

O antigo grid que misturava financeiro, calendário, gráfico e alertas foi substituído por sessões verticais independentes e navegáveis.

## Organização das outras abas

- Empresa: visão consolidada, resumo de lucro e crescimento em três sessões.
- Crescimento: sessão exclusiva de tendência.
- Funil: sessão exclusiva de conversão.
- Vendas: sessão comparativa entre hoje e acumulado.
- Radar: sessão técnica isolada do fluxo executivo.

## Arquivos modificados

- `src/features/dashboard/executive-overview.tsx`
- `src/features/dashboard/operational-command-center.tsx`
- `src/app/(painel)/dashboard/page.tsx`

## Validação executada

- 204 arquivos TypeScript e TSX foram processados pelo compilador TypeScript em modo de transpile para validação sintática.
- Nenhum diagnóstico de sintaxe foi encontrado.
- O typecheck e o build completos não foram executados porque o ZIP não contém `node_modules` e o registry do ambiente não disponibiliza todas as dependências do projeto.
- A validação visual em navegador real não foi executada neste ambiente.
