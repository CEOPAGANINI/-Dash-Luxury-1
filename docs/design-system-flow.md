# Design system Flow

Flow organiza o quadro de funil e o roteador de ofertas com uma linguagem comum: canvas discreto, cards com hierarquia legível, ações em verde e estados acompanhados de texto e ícone.

## Diagnóstico e correções

Atalhos globais podiam interceptar Enter em um botão e operar sobre outra etapa selecionada. Agora os botões mantêm seu comportamento nativo e a remoção pelo teclado exige foco no quadro ou na lista. O inspetor móvel contém o foco, permite circular com Tab e devolve o foco ao controle de origem.

A configuração dos nós agora apresenta um checklist calculado a partir do conteúdo e das ligações atuais. Metadados salvos de um ZIP não significam que o arquivo esteja preparado nesta aba. Destinos inválidos, autorredirecionamento, saídas padrão ambíguas, fatias acima de 100% e regras incompatíveis com a exportação impedem o indicador de configuração pronta. O exportador e a API continuam responsáveis pela validação completa.

O painel apresenta a saída padrão real, prioridade editável e o motivo da decisão no testador. Simulações e métricas de demonstração têm identificação explícita. A publicação indica confirmação somente quando a versão ativa, a versão informada pelo servidor e o release solicitado correspondem; respostas de uma seleção antiga não alteram o estado da seleção atual.

A lista responsiva mantém as posições e conexões do quadro. A ação de ver um destino fecha o inspetor móvel e mostra a etapa de destino com foco, em vez de deslocar uma câmera encoberta.

## Fontes de verdade

- `src/features/funnel/flow-tokens.css`: tokens semânticos e adaptação dos temas existentes.
- `src/features/funnel/flow-design-system.css`: aparência dos componentes do quadro e do inspetor.
- `src/features/funnel/flow-ui.tsx`: `FlowButton`, `FlowIconButton`, `FlowStatusBadge`, `FlowField`, `FlowSelect` e `FlowConfirmDialog`.
- `src/features/funnel/flow-inspector.tsx`: contenção e retorno de foco do inspetor em telas menores.
- `src/features/funnel/node-readiness.ts`: requisitos usados para calcular a preparação das etapas.
- `src/features/funnel/flow-ui.stories.tsx`: catálogo isolado com estados locais de referência.

Os estilos Flow têm escopo `.funnel`. Os aliases `--fn-*` permitem que componentes existentes usem os mesmos valores. A repetição intencional de `.funnel` nos aliases evita que tokens antigos substituam o sistema quando o Next carrega CSS de outra rota. Os estilos do dashboard continuam separados.

## Tokens

| Papel                      | Token                      | Tema escuro |
| -------------------------- | -------------------------- | ----------- |
| Área de trabalho           | `--flow-canvas`            | `#090B0D`   |
| Painéis                    | `--flow-surface`           | `#121518`   |
| Cards e grupos             | `--flow-surface-raised`    | `#1A1E23`   |
| Hover                      | `--flow-surface-hover`     | `#22282F`   |
| Separadores                | `--flow-border`            | `#343C46`   |
| Limites de controles       | `--flow-border-functional` | `#667382`   |
| Texto principal            | `--flow-text`              | `#F4F6F8`   |
| Texto secundário           | `--flow-text-secondary`    | `#AAB4C0`   |
| Texto auxiliar             | `--flow-text-muted`        | `#8D99A8`   |
| Ação e confirmação         | `--flow-primary`           | `#22E58B`   |
| Hover da ação principal    | `--flow-primary-hover`     | `#58F0A6`   |
| Texto sobre ação principal | `--flow-on-primary`        | `#071A10`   |
| Informação                 | `--flow-info`              | `#71B7FF`   |
| Pendência                  | `--flow-warning`           | `#F2C66D`   |
| Erro                       | `--flow-danger`            | `#FF919B`   |
| Roteamento                 | `--flow-routing`           | `#B6A0FF`   |

Cada cor de estado possui uma superfície suave correspondente. Azul e Grafite mantêm a hierarquia escura; Papel usa superfícies claras e cores de estado mais escuras. Use tokens semânticos para que a mesma regra permaneça legível em cada tema.

A família principal é Inter, com fallbacks do sistema. Caminhos, identificadores e números usam Consolas/SFMono-Regular/monospace. O Storybook usa os fallbacks quando Inter não está disponível; não depende de uma consulta externa de fontes para renderizar os exemplos.

Escala de interface: 12/18 px para metadados, 14/22 px para conteúdo, 16/24 px para nomes de etapas, 20/28 px para painéis e 28/36 px para páginas. Pesos 400–600. Espaçamentos: 4, 8, 12, 16, 20, 24 e 32 px. Raios: 4, 8 e 12 px.

## Contraste e interação

Texto normal deve alcançar 4,5:1; texto grande e elementos essenciais precisam de 3:1. `--flow-border` é usado em separadores decorativos; campos e controles usam `--flow-border-functional` para tornar seus limites identificáveis. Avalie a combinação efetiva de texto e fundo, incluindo tema, hover e estados desabilitados. A presença de uma paleta adequada não substitui a verificação da tela renderizada.

Foco visível usa anel de 2 px. Seleção de card usa anel de 2 px e destaque suave; o hover aumenta a sombra sem deslocar o card, preservando o alinhamento dos conectores. Controles têm 40 px de altura; em dispositivos com ponteiro de toque, os alvos principais chegam a 44 px. Ícones decorativos usam `aria-hidden`; botões de ícone precisam de nome acessível.

Transições usam 120–180 ms. `prefers-reduced-motion` desliga as transições e a rotação do indicador de atividade.

## Estados independentes

| Categoria     | Exemplos                                    | Significado                             |
| ------------- | ------------------------------------------- | --------------------------------------- |
| Configuração  | Rascunho, Em preparação, Pronto, erro       | Requisitos válidos da etapa             |
| Sincronização | Conferindo, Pendente, salvo, falha          | Persistência do rascunho na conta       |
| Publicação    | Não publicado, publicando, publicado, falha | Resultado real do serviço de publicação |
| Métricas      | Sem medição, dados reais, simulação         | Origem e disponibilidade dos números    |

`FlowStatusBadge` recebe `tone` (`neutral`, `success`, `warning`, `danger`, `info`) e `busy`. O texto define o significado do estado; a cor e o ícone reforçam a leitura. Um badge de configuração pronta não confirma que a etapa foi publicada. Confirme publicação somente após resposta do serviço.

Simulação é apresentada como “Simulação — não são dados reais”. O quadro não deve fabricar visitas, receita ou conversão da conta. As stories usam dados fictícios e nenhuma delas grava, sincroniza ou publica no backend.

## Card e checklist

O card mantém a referência de 280 px e padding de 16 px. Cabeçalho mostra tipo e ordem; corpo mostra nome, descrição e caminho; rodapé mostra preparação e quantidade de ligações.

O checklist é informativo. Seus itens refletem requisitos calculados por `nodePreparation`; clicar no card abre a configuração. Não transforme um requisito validado em um checkbox manual. O progresso usa itens concluídos/total e expõe esse valor com `role="progressbar"`. A fonte de verdade para um ZIP disponível é o estado de arquivo carregado no editor, não somente um metadado persistido.

No roteador, os quatro itens são Regras revisadas, Regras exportáveis, Destinos válidos e Alternativa ligada. Uma condição de região/IP ou rede ativa deixa Regras exportáveis pendente mesmo quando seu destino é válido.

Quando `data-compact="true"`, descrições, caminhos, métricas e checklist resumido ficam ocultos. Tipo, título e estado continuam disponíveis. Campos de edição e controles essenciais não são escondidos por esse modo. A forma compacta entra abaixo de 60% de zoom.

## Roteador

Regras aparecem em ordem de prioridade. A primeira regra correspondente define o destino; sem correspondência, o visitante segue a alternativa. Ativação e validade do destino têm textos próprios.

Reordenação por arraste possui alternativa por botões Subir/Descer. O alvo de drop usa destaque de roteamento, sem mudar a geometria. Após reordenar ou adicionar, o foco retorna ao contexto relevante.

O teste explica a regra aplicada e o motivo. Condições indisponíveis precisam explicar a limitação. No ZIP único, aparelho, sistema, `utm_source` e fatia de tráfego têm suporte; regras ativas de região/IP ou rede impedem essa exportação. Esse roteamento no navegador não representa controle de acesso.

## Responsividade

Acima de 1024 px, o modo inicial é o canvas. Ao abrir um bloco, seu card completo fica centralizado na metade esquerda e o inspetor ocupa a metade direita. A câmera ajusta o zoom às dimensões reais do card, mantendo os controles do quadro livres. O bloco aberto preserva todos os detalhes mesmo abaixo de 60% de zoom. Até 1024 px, o modo inicial é a lista de etapas e o inspetor ocupa a tela inteira em um diálogo com foco contido. Escape fecha o diálogo e devolve o foco ao controle de origem. O usuário pode alternar entre quadro e lista.

## Edição das conexões

As duas pontas podem ser posicionadas em qualquer ponto do contorno de um bloco. Ao selecionar o fio, as alças das pontas permitem reposicionar sua entrada e saída; arrastar o fio ou sua alça central altera o percurso. As posições são proporcionais às bordas para acompanhar alterações no tamanho dos cards.

O painel flutuante usa grupos arredondados e controles identificados para nome, curva, seta, cor, espessura e fluxo. A espessura e a cor são independentes para cada conexão. O controle de fluxo liga ou desliga a animação visual.

A luz indica preparação: verde quando origem e destino estão configurados, vermelha quando há pendências. Blocos sem checklist funcionam como passagem. A cor personalizada do fio permanece independente da luz. Esses sinais não representam visitas reais nem confirmam publicação. A preferência por movimento reduzido mantém o indicador estático. Geometria e estilo são salvos no rascunho e nas cópias JSON; a preparação é recalculada a partir dos requisitos atuais.

Na lista, a viewport do canvas permanece montada e invisível; isso preserva as medições usadas para enquadrar e conectar etapas. A lista possui rolagem própria. As abas do inspetor se tornam uma faixa horizontal com rolagem quando necessário.

Valide teclado e conteúdo em 375, 768, 1024 e 1440 px, além de telas baixas. As verificações automáticas de acessibilidade são complementares: não asseguram sozinhas clareza dos fluxos, uso de teclado ou ausência de sobreposições.

## Storybook

```sh
npm run storybook
npm run build-storybook
```

O catálogo está em **Flow / Design system**. O seletor **Tema Flow** alterna Escuro, Papel, Azul e Grafite. Use os controles para simular desabilitado, atividade e tom. As stories incluem campos com erro, estados de preparação, card selecionado, card compacto, regras e tokens, além de composições com o quadro, roteador, inspetor e publicador reais.

O quadro das stories recebe um cofre em memória e `storageId="demo-user"`. O interceptor de `.storybook/api-guard.ts` recusa chamadas `/api/*` com indisponibilidade explícita, sem simular sucesso ou enviar comandos a uma VPS. O diálogo de publicação abre pelo botão da story; a confirmação de remoção altera somente um estado React local.

O framework usa `@storybook/nextjs-vite`. Os addons Docs e A11y estão configurados; os resultados do painel Accessibility precisam ser inspecionados após a renderização. `a11y.test="error"` faz as violações falharem quando as histórias forem executadas por uma integração de testes compatível; construir o catálogo não equivale a executar esse teste.

Referências de configuração: [Next.js com Vite no Storybook](https://storybook.js.org/docs/get-started/frameworks/nextjs-vite) e [verificação de acessibilidade](https://storybook.js.org/docs/writing-tests/accessibility-testing).

## Catálogo e componentes existentes

| Contrato            | Implementação atual                                                     | Cobertura no catálogo                                                                  |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Button / IconButton | `flow-ui.tsx`, incluindo tooltip de 120 ms e nome acessível             | Componentes, controles desabilitados, botão de confirmação                             |
| Field / Select      | `flow-ui.tsx`, labels e mensagens associadas                            | Componentes e Campo com erro                                                           |
| StatusBadge         | `flow-ui.tsx`, cinco tons e atividade reduzida por preferência          | Estados e Salvando                                                                     |
| FunnelNode          | `NodeView` interno de `funnel-board.tsx`; card com preparação calculada | Quadro real, Quadro com inspetor; snapshots visuais de preparação/pronto/erro/compacto |
| ConnectionEdge      | SVG, área de clique e rótulos de `funnel-board.tsx`                     | Quadro real, usando conexões efetivas de exemplo                                       |
| CanvasToolbar       | Menu e controles existentes de `funnel-board.tsx`                       | Quadro real; zoom, enquadrar, bloqueio, modos e simulação                              |
| RuleCard            | Composição existente de `redirect-panel.tsx`                            | Roteador real: editar, pausar, reordenar, validar e testar                             |
| Inspector           | Painéis existentes envolvidos por `FlowInspector`                       | Quadro com inspetor e Inspetor com foco contido                                        |
| PublishReview       | `FunnelSitePublisher` e `PageVpsPublisher`                              | Revisão de publicação e Publicação sem pacote; API bloqueada                           |
| ConfirmDialog       | `FlowConfirmDialog` usado para excluir rascunho                         | Confirmação de remoção; Cancelar e Confirmar com estado local                          |
| Toast               | `funnel__save-notice` de `funnel-board.tsx`                             | Quadro com falha de salvamento, acionado em Configurações → Salvar                     |

Node, Edge, Toolbar, RuleCard e Toast continuam nas composições funcionais existentes. O catálogo usa essas composições diretamente; não há uma extração fictícia ou versões paralelas para substituir o editor. Os snapshots de card são referências de apresentação com dados identificados como fictícios. A confirmação específica de substituir um site permanece dentro de `PageVpsPublisher`; o estado com envio confirmado requer uma resposta real da integração e não é fabricado nas stories.

## Como contribuir

1. Comece pela fonte de verdade do comportamento; evite alterar regra de negócio apenas para ajustar a aparência.
2. Reuse o componente Flow adequado e seus tokens. Acrescente um token semântico somente quando existir um papel novo.
3. Adicione ou atualize uma story com os estados afetados, incluindo mensagens longas e erro quando aplicável.
4. Verifique os quatro temas, foco de teclado, toque e largura reduzida. Preserve os dados preenchidos em falhas.
5. Execute typecheck, testes pertinentes e build do Storybook. Registre as limitações de verificação; não declare uma publicação ou medição sem evidência.

O catálogo cobre os componentes e contratos visuais. Integrações com conta, arquivos, persistência e publicação continuam exigindo testes no aplicativo real.
