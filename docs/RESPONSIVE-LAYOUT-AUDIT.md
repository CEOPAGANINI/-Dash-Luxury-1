# Auditoria de responsividade e organização — Dash Luxury

## Problemas estruturais encontrados

1. **O editor aplicava o `grid-column` salvo em todas as larguras.**
   Em telas de uma coluna, um bloco configurado como 25% ou 33% criava colunas
   implícitas no CSS Grid. O efeito era uma página horizontal, minúscula e com
   textos difíceis de ler.

2. **Painéis compostos podiam receber largura e altura incompatíveis.**
   Tráfego, Funil, Diário e Planejamento são aplicações completas, com filtros,
   calendários, gráficos e tabelas. Permitir largura de 25% ou uma altura fixa de
   260 px cortava conteúdo e criava rolagens internas.

3. **O layout salvo anteriormente continuava reabrindo quebrado.**
   Mesmo depois de alterar o CSS, o `localStorage` restaurava spans e alturas da
   versão anterior. O editor agora usa uma nova versão da chave e sanitiza todo
   layout importado.

4. **Havia duas navegações laterais/horizontais concorrendo por largura.**
   A navegação global já existia no cabeçalho e o Dashboard adicionava uma
   sidebar de 232 px. Em notebook, isso reduzia demais a área dos gráficos. A
   navegação interna agora é horizontal, rolável e sticky.

5. **Funil e Operação mostravam versões repetidas do mesmo conteúdo.**
   A rota Funil empilhava três implementações, e Operação empilhava o Diário e
   uma timeline legada. O padrão agora usa apenas os painéis unificados; os
   componentes legados permanecem no código, mas não são duplicados na página.

6. **Funil e Diário repetiam o título da página dentro do próprio bloco.**
   O cabeçalho da rota e o cabeçalho interno exibiam a mesma informação. Os
   cabeçalhos internos duplicados foram removidos.

7. **O breakpoint de três colunas entrava cedo demais.**
   Em 1600 px, três painéis eram comprimidos mesmo quando a área útil era menor.
   O breakpoint amplo passou para 1800 px; abaixo disso, a análise usa duas
   colunas e, no celular, uma coluna.

8. **O gráfico horário fazia a primeira linha da grade ficar muito alta.**
   As 24 horas agora podem usar duas colunas por container em telas largas,
   mantendo todos os horários visíveis sem obrigar os painéis vizinhos a
   esticarem.

9. **Calendário e gráficos tinham detalhes demais no celular.**
   No celular, o calendário mostra primeiro o número e o estado do dia; receita,
   barra e detalhes aparecem progressivamente a partir de `sm` e `md`. A ordem e
   as ações continuam iguais.

10. **Não existia um contexto global visível para a operação.**
    Foi criado um contexto global compacto com Operação, Data ativa, Estado e
    Limpar filtros. Ele fica logo abaixo do título de cada área e usa o mesmo contexto
    entre Tráfego, Funil e Diário.

## Nova regra do canvas

- Menos de 768 px: todos os blocos ocupam 100% da largura.
- A partir de 768 px: o span salvo passa a valer em uma grade de 12 colunas.
- Blocos compostos: largura mínima e máxima de 12 colunas, altura automática.
- Blocos simples: podem continuar usando os presets de 50%, 66%, 75% e 100%,
  conforme a restrição do bloco.
- Layouts JSON importados são validados antes de serem aplicados.

## Breakpoints principais

- **< 768 px:** uma coluna, conteúdo progressivo, sem rolagem horizontal global.
- **768–1279 px:** grid editável de 12 colunas; módulos internos priorizam uma ou
  duas colunas conforme o container.
- **1280–1799 px:** duas colunas na análise operacional.
- **>= 1800 px:** grade executiva de 12 colunas; Creative, Calendário e Receita
  dividem a primeira linha, Funil e Público formam a segunda.
- **>= 2400 px:** reserva para futuras composições ultrawide, sem esticar o
  container além de 1900 px.

## Arquivos principais alterados

- `src/features/dashboard/layout-canvas.tsx`
- `src/lib/dashboard-blocks.tsx`
- `src/components/dashboard/dashboard-shell.tsx`
- `src/features/unified-dashboard/traffic-board.tsx`
- `src/features/unified-dashboard/funnel-dashboard.tsx`
- `src/features/unified-dashboard/daily-dashboard.tsx`
- `src/features/unified-dashboard/shared.tsx`
- `src/app/(painel)/dashboard/**/page.tsx`
- `src/app/globals.css`

## Validação executada neste ambiente

- 238 arquivos `.ts` e `.tsx` processados pelo transpiler TypeScript.
- Nenhum erro de sintaxe encontrado.
- Estrutura do ZIP validada.

O build completo não pôde ser executado porque o registry disponível neste
ambiente não fornece `zod@4.4.3` e `zod-validation-error@4.0.2`. As versões não
foram alteradas silenciosamente.
