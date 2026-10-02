# Prompt completo — evolução do design system Dash Luxury

Você é uma pessoa especialista em design de produto, UX de dashboards, visualização de dados, acessibilidade e implementação de interfaces. Melhore o dashboard **Dash Luxury** com base no sistema **CommandLayer** existente, nas referências pesquisadas abaixo e nas necessidades reais da operação. O resultado deve facilitar a leitura, a navegação e as decisões sobre lojas e tráfego.

Trabalhe no dashboard atual: [dashboardatual.vercel.app](https://dashboardatual.vercel.app). O catálogo existente está em [/design-system](https://dashboardatual.vercel.app/design-system). Este briefing descreve a base extraída em **2 de outubro de 2026**, no commit `9bf3092bfb91221c82dc6d7ae59811466b355ec9`. Confira a versão atual antes de implementar: o código pode ter evoluído desde a extração.

## 1. Contexto do produto e objetivo

Dash Luxury é um painel de operação de comércio e aquisição de tráfego. Preciso entender o que está acontecendo em cada loja, qual estrutura de anúncios trabalha para ela, quais campanhas geram resultados e onde existem erros, riscos ou oportunidades.

Considere o seguinte modelo de negócio solicitado:

**Loja → 1 a 5 Business Managers (BMs) → contas de anúncios → campanhas → conjuntos de anúncios → anúncios e criativos.**

Perfis de Facebook, páginas, pixels, públicos e demais ativos precisam aparecer com suas associações e identificadores corretos. Um perfil, uma BM e uma conta de anúncios são entidades diferentes. Ativos compartilhados devem mostrar o vínculo verdadeiro; não force uma árvore falsa nem some duas vezes o mesmo recurso. A existência de uma associação não comprova que todos os ativos estejam anunciando naquele momento.

O usuário deve conseguir responder:

- Quais BMs e contas de anúncios estão associadas à loja?
- Quais estão ativas agora e quais já anunciaram para ela?
- Quanto foi investido, qual resultado foi atribuído e em que período?
- Qual campanha, conjunto, anúncio, criativo ou público explica o resultado?
- Qual conexão falhou, qual informação está desatualizada e qual ação é possível?

Também há áreas de lojas, produtos, pedidos, clientes, páginas, funil, roteador de ofertas, conexões e APIs, rede de tráfego, servidores, domínios e agente de IA. Preserve o contexto entre as áreas. No **quadro de funil, mantenha o menu/painel de ferramentas à direita**, conforme a preferência do usuário.

Este prompt autoriza preparar o redesign e sua implementação dentro do projeto existente. Alterações de nomes, acesso, banco, integração ou infraestrutura não são parte de uma melhoria visual. Preserve contratos, autenticação, isolamento de lojas/workspaces e regras de negócio.

## 2. Fonte de verdade e separação entre atual e proposto

Leia os anexos `design-system-dashboard.md`, `design-system-tokens.json` e `design-system-commandlayer.css`. O JSON contém **186 variáveis CSS por tema**, preservando `var()`, gradientes e `color-mix()`. Ele representa propriedades CSS, não um arquivo pronto para importação nativa no Figma.

O repositório principal foi organizado como **`CEOPAGANINI/dash-luxury-dashboard`** (privado). Se tiver acesso, leia primeiro `AGENTS.md`, `README.md`, `PROJECT_MAP.md`, `project-registry.json` e `docs/PROJECT_REGISTRY.md`. O nome antigo era `CEOPAGANINI/dashboard`; os repositórios de reserva não contêm a aplicação. A Vercel usa o projeto `dash-luxury-dashboard`, preservando o endereço `dashboardatual.vercel.app`; o Supabase principal se chama `dash-luxury-dashboard-producao`. A produção exige autenticação. Demonstração deve ser uma experiência identificada dentro do acesso autorizado, sem contornar o login.

Confira especialmente:

- `src/app/command-layer.css` e `src/app/globals.css`: tokens, materiais, cascata e regras globais.
- `src/app/layout.tsx`: carregamento das fontes.
- `src/components/ui/` e `src/components/command-layer/`: componentes e shell existentes.
- `src/features/command-layer/`: catálogo.
- `src/lib/navigation.ts`, `src/lib/dashboard-nav.ts` e `src/components/layout/sidebar-folder-navigation.tsx`: navegação.
- `src/features/funnel/`: quadro de funil e experiência do roteador de ofertas.
- `src/features/ads/`, `src/features/stores/`, `src/features/ai-agent/`: recursos de tráfego, lojas e IA.

Identifique cada decisão como **“implementado na base”**, **“melhoria proposta”** ou **“pendente de validação”**. Tokens antigos Nexus, Orbit, Nebula ou PicGen não substituem CommandLayer. Não apresente referência visual, intenção de produto ou demonstração como funcionalidade conectada.

## 3. Pesquisa e referências

Use bibliotecas conhecidas de interfaces e documentação oficial. Não alegue um ranking de “maiores do mundo”. Compare padrões adequados a dashboards operacionais, com seus limites:

| Referência                                                                                                           | O que estudar para este projeto                                    | Limite                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| [Mobbin — interfaces web](https://mobbin.com/explore/web)                                                            | Navegação, tabelas, filtros, estados e composição de produtos      | Parte do acervo exige login ou assinatura; não invente acesso |
| [Refero](https://refero.design/)                                                                                     | Padrões de dashboards, barras de ferramentas e painéis de detalhes | Uma captura não demonstra todo o fluxo                        |
| [Refero — dashboards](https://styles.refero.design/examples/dashboard-ui-design)                                     | Hierarquia, densidade e organização dos módulos                    | Use como inspiração de composição                             |
| [Dribbble — analytics dashboard](https://dribbble.com/tags/analytics%20dashboard)                                    | Hierarquia visual, gráficos e acabamento                           | Shots não comprovam usabilidade nem funcionamento             |
| [Behance — Analytics Hub](https://www.behance.net/gallery/243699039/Analytics-Hub-Dashboard-Admin-Panel-UIUX-Design) | Organização de métricas e aprofundamento em detalhes               | É um caso de portfólio, não validação de resultado            |
| [Awwwards — dashboards](https://www.awwwards.com/websites/dashboard/)                                                | Consistência visual e acabamento                                   | Premiação não substitui eficiência operacional                |
| [Carbon — dashboards](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards)              | Hierarquia da informação e relação entre visualizações             | Adapte princípios, não a identidade visual da IBM             |
| [Fluent 2 — tokens](https://fluent2.microsoft.design/design-tokens)                                                  | Tokens por função e aplicação coerente em temas                    | Preserve os nomes e aliases já usados no projeto              |
| [Material 3 — fundamentos](https://m3.material.io/foundations/)                                                      | Estados, layout e organização dos fundamentos                      | Não importe cantos arredondados para este sistema             |

Em sua pesquisa, registre a referência, o problema observado no Dash Luxury e a melhoria aplicável. Prefira justificativas como “permite comparar contas em uma coluna” a adjetivos como “moderno”. Não copie uma tela inteira de outro produto. Se uma fonte estiver bloqueada, informe o limite e use a documentação acessível.

## 4. Identidade que deve permanecer

**Implementado na base:**

- Sistema ativo: **CommandLayer**.
- Dois temas: **preto**, padrão, e **branco**, selecionável.
- Superfícies em preto, branco e cinzas; cor destinada a dados e estados.
- **Cantos retos: raio 0px**, inclusive menus, botões, cards, badges e retângulos SVG.
- Inter para títulos e leitura; JetBrains Mono para controles e dados técnicos.
- Materiais com estrutura/moldura, superfície interna e leitura rebaixada.
- Ação, seleção e foco com acento neutro.
- Layout fluido de 100%, sem um teto global fixo de 1440px.
- Tema aplicado por `<html data-tema="preto|branco">` e preferência persistida pelo mecanismo existente.

Evolua essa identidade com melhor hierarquia e menos ruído. Preserve as superfícies em camadas, mas avalie o excesso de molduras repetidas e sombras em áreas densas. Uma tabela grande não precisa de uma moldura ornamental em cada célula. Essa simplificação é uma **proposta a validar**, não uma mudança já aplicada.

## 5. Pesquisa de fontes e sistema tipográfico

### Fontes comparadas

| Família                                                                          | Evidência e uso                                                                                                 | Decisão para Dash Luxury                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Inter](https://rsms.me/inter/)                                                  | Família voltada a interfaces; oferece números tabulares, recursos de distinção de caracteres e tamanhos ópticos | **Manter como fonte principal**; já está no projeto                 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/)                             | Desenvolvida para leitura de código e distinção de caracteres                                                   | **Manter** para IDs, logs, dados técnicos e os controles existentes |
| [IBM Plex Sans / Mono](https://www.ibm.com/design/language/typography/typeface/) | Família oficial da IBM, com versões Sans e Mono e recursos OpenType                                             | Candidata somente para um estudo comparativo, não implementada      |
| [Geist Sans / Mono](https://vercel.com/font)                                     | Família da Vercel para contextos de desenvolvimento e design, com versões Sans e Mono                           | Candidata somente para um estudo comparativo, não implementada      |

Minha recomendação é **preservar Inter + JetBrains Mono**: a base já é coerente com o produto e trocar fontes, por si só, não resolve densidade ou hierarquia. Isso é uma decisão para este projeto, não a afirmação de que uma família é universalmente superior.

Se comparar alternativas, use exatamente os mesmos textos e medidas: “Receita atribuída”, “Conexões e APIs”, “R$ 123.456,78”, “CPA R$ 38,20”, “ROAS 3,42×”, “BM 104938572”, “Última sincronização há 12 min” e nomes longos de campanhas. Avalie largura, truncamento, leitura de `0/O` e `1/l/I`, português com acentos, pesos, carregamento e desempenho. Apresente alternativas lado a lado; não substitua a fonte principal silenciosamente.

### Escala atual

| Uso                         | Fonte             | Tamanho atual                             | Peso/entrelinha atual     |
| --------------------------- | ----------------- | ----------------------------------------- | ------------------------- |
| Título de página            | Inter             | 24–30px, `clamp(1.5rem, 2.1vw, 1.875rem)` | 500 / 1.2                 |
| Título de seção             | Inter             | 20–24px, `clamp(1.25rem, 1.8vw, 1.5rem)`  | 500 como padrão           |
| Título de card              | Inter             | 16px                                      | 500 / 1.5                 |
| Corpo                       | Inter             | 14px                                      | 1.625                     |
| Legenda                     | Conforme contexto | Token de 12px                             | Texto secundário          |
| Métrica                     | JetBrains Mono    | 30px                                      | 400; números tabulares    |
| Botão / aba                 | JetBrains Mono    | 12px                                      | 400; entrelinha 1.4 / 1.5 |
| Campo compartilhado         | JetBrains Mono    | 13px                                      | Ajustes por componente    |
| Badge / cabeçalho de tabela | JetBrains Mono    | 11px                                      | 400 / 1.5                 |
| Célula de tabela            | Interface         | 13px                                      | Leitura simples           |

Títulos usam tracking `-0.025em`. Não reduza texto essencial para acomodar mais cards. Como melhoria, avalie labels críticos e números de tabelas em 13–14px, mantendo metadados compactos quando legíveis. Use `font-variant-numeric: tabular-nums` nas colunas comparáveis, inclusive quando forem Inter. Mantenha mono em informações técnicas; não transforme descrições longas em texto de terminal.

## 6. Pesquisa de cores e paletas completas da base

Adote tokens semânticos por função. A documentação [Fluent 2 — color](https://fluent2.microsoft.design/color) distingue cores neutras, de marca e de estado; no Dash Luxury, essa distinção sustenta uma estrutura neutra com dados destacados. Os valores abaixo já pertencem à base extraída.

### Superfícies e texto

| Token                 | Preto     | Branco    | Papel             |
| --------------------- | --------- | --------- | ----------------- |
| `--cl-canvas`         | `#050505` | `#ededed` | Fundo externo     |
| `--cl-chassis`        | `#0b0b0b` | `#fafafa` | Estrutura         |
| `--cl-screen`         | `#080808` | `#f2f2f2` | Display           |
| `--cl-well`           | `#000000` | `#e3e3e3` | Cavidade/trilho   |
| `--cl-terminal`       | `#020202` | `#e9e9e9` | Área técnica      |
| `--cl-readout`        | `#060606` | `#eeeeee` | Leitura           |
| `--cl-card-top`       | `#111111` | `#ffffff` | Material interno  |
| `--cl-raised`         | `#101010` | `#e8e8e8` | Controle/menu     |
| `--cl-hover`          | `#171717` | `#dedede` | Hover             |
| `--cl-border`         | `#202020` | `#d4d4d4` | Borda discreta    |
| `--cl-border-strong`  | `#303030` | `#a3a3a3` | Borda de controle |
| `--cl-text-primary`   | `#f5f5f5` | `#171717` | Títulos           |
| `--cl-text-secondary` | `#e5e5e5` | `#262626` | Texto forte       |
| `--cl-text-body`      | `#d4d4d4` | `#404040` | Corpo             |
| `--cl-text-muted`     | `#a3a3a3` | `#525252` | Descrição         |
| `--cl-text-dim`       | `#858585` | `#666666` | Metadados         |
| `--cl-accent`         | `#fafafa` | `#171717` | Ação/foco/seleção |

### Estados e séries

| Token           | Preto     | Branco    | Papel atual                |
| --------------- | --------- | --------- | -------------------------- |
| `--cl-activity` | `#06b6d4` | `#0e7490` | Atividade / primeira série |
| `--cl-success`  | `#34d399` | `#065f46` | Sucesso                    |
| `--cl-warning`  | `#f59e0b` | `#92400e` | Atenção                    |
| `--cl-info`     | `#60a5fa` | `#1d4ed8` | Informação                 |
| `--cl-danger`   | `#fb7185` | `#be123c` | Erro                       |
| `--cl-violet`   | `#a78bfa` | `#6d28d9` | Série distinta             |
| `--cl-pink`     | `#f472b6` | `#be185d` | Série distinta             |

`--serie-1` a `--serie-7` usam atividade, sucesso, aviso, rosa, violeta, informação e texto secundário. `--chart-1` a `--chart-5` reutilizam as cinco primeiras. O texto sobre preenchimentos de estado usa `--cl-on-status`: `#090909` no preto e `#ffffff` no branco.

**Melhorias propostas:** separar a identidade de uma série do significado positivo/negativo de um resultado; manter a mesma entidade com a mesma cor entre gráficos; verificar séries adjacentes em ambos os temas e em simulações de deficiência de visão de cores. Se a paleta precisar de ajustes, apresente novos aliases e a relação antes/depois. Não introduza cor forte em todas as superfícies nem associe automaticamente “número aumentou” a sucesso: aumento de CPA pode ser negativo.

Escolha a escala pela natureza dos dados: **categórica** para distinguir BMs/canais, **sequencial** para intensidade de uma medida e **divergente** para diferenças em torno de uma referência significativa. Não use sete cores de estado como se fossem uma escala crescente de volume. Aplique essa distinção preservando a identidade atual; uma paleta analítica nova será proposta, não implementada. Referência: [Carbon — Color Palettes](https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes).

Meça contraste nos pares realmente renderizados, incluindo opacidade, gradientes, hover, focus, badges e séries. As bordas atuais são discretas; confira quais identificam controles e quais são apenas decoração. Não declare a paleta inteira “WCAG aprovada” por avaliar apenas uma amostra. As exigências são **4.5:1 para texto normal e 3:1 para texto grande**, e **3:1 para informação visual necessária de controles e gráficos**, respeitando os critérios e exceções. [W3C — contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C — contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## 7. Espaçamento, geometria, materiais e ícones

**Base atual:** raio 0px, borda 1px, moldura interna 4px, `--cl-padding: 24px` e `--cl-gap: 24px`. Módulos usam normalmente 24–32px; grupos compactos, 8–16px. O shell tem margem/gap de 16px no desktop e 8px até 639px. O conteúdo usa `clamp(16px, 2vw, 32px)`, com 16px vertical e 12px horizontal no mobile.

Há tokens responsivos legados `--space-1` a `--space-6`. Confira a cascata antes de consolidá-los. Como proposta, formalize uma escala funcional com passos 4/8/12/16/24/32px e densidades “confortável” e “compacta”, sem alterar silenciosamente todas as telas.

Preserve os tokens de sombras `--cl-shadow-chassis`, `--cl-shadow-nav`, `--cl-shadow-card`, `--cl-shadow-metric`, `--cl-shadow-inset`, `--cl-shadow-screen`, `--cl-shadow-button`, `--cl-shadow-tab` e `--cl-shadow-overlay`. Reduza profundidade onde ela competir com dados, mantendo distinção clara de sobreposições.

O shell/catálogo usa **Solar Linear**, da 480 Design, traço 1.5 e `currentColor`; outros módulos usam Lucide. Preserve a atribuição Solar [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Como proposta de padronização, catalogue usos de 16/18/20/24px e evite misturar famílias no mesmo conjunto de ações. Ícone decorativo não precisa ser anunciado; botão com ícone precisa de nome acessível.

## 8. Menus e organização das sessões

A navegação deve funcionar como mapa da operação. O [Fluent 2 — Nav](https://fluent2.microsoft.design/components/web/react/core/nav/usage) recomenda nomes claros, categorias previsíveis e indicação da localização ativa. Adapte isso à estrutura já implementada.

Proponha o seguinte mapa, ajustando os destinos às rotas reais:

| Pasta/sessão        | Conteúdo de referência                                       |
| ------------------- | ------------------------------------------------------------ |
| Visão geral         | Resumo, indicadores e alertas relevantes                     |
| Lojas               | Cadastro, operação e contexto de cada loja                   |
| Produtos            | Catálogo, ofertas e desempenho dos produtos                  |
| Rede de tráfego     | Canais, BMs, contas, campanhas, criativos, públicos e pixels |
| Campanhas e funis   | Quadro de funil, fluxos e roteador de ofertas                |
| Páginas e conversão | Landing pages, checkout e etapas de conversão                |
| Conexões e APIs     | Integrações, permissões, sincronização e webhooks            |
| Servidores          | Infraestrutura e operação dos servidores                     |
| Domínios            | Vínculos, status e configuração dos domínios                 |
| Agente de IA        | Conversas, análises e resultados do agente                   |
| Gestão              | Relatórios, operação comercial e recursos existentes         |
| Sistema             | Usuários, acesso, configurações e histórico disponível       |

Essa é uma **proposta de taxonomia**, não a afirmação de que todas as páginas existem. Evite duplicar o mesmo destino em várias pastas sem motivo. Páginas ainda não implementadas precisam de estado honesto e explicação, não botões que simulam sucesso.

Mantenha categorias expansíveis, destaque da rota ativa, indicação da pasta ativa quando recolhida, busca com nomes claros e navegação móvel em drawer. Uma contagem de páginas deve corresponder ao conteúdo real. Diferencie o menu principal do app, o painel direito do funil e menus de ações de uma tabela.

Menus contextuais devem agrupar ações relacionadas, colocar ações destrutivas em grupo separado e usar rótulos curtos. Não enterre ações frequentes em sucessivos submenus. Use select/combobox para escolher um valor de formulário e menu para comandos. Essa distinção segue [Fluent 2 — Menu](https://fluent2.microsoft.design/components/web/react/core/menu/usage).

## 9. Composição do dashboard e cartões de métricas

O [Carbon — dashboards](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards) orienta hierarquia por importância e relação entre métricas e visualizações. Para este produto, proponho esta ordem:

1. Título da área e contexto de loja/workspace.
2. Período, comparação, filtros ativos e origem/atualização dos dados.
3. Um conjunto inicial de **4 a 6 KPIs relevantes**, como proposta ajustável à tarefa.
4. Tendência principal e comparação entre recursos.
5. Tabela operacional para investigação e ação.
6. Alertas explicáveis e painel de detalhes.

Evite preencher a página com dezenas de cartões semelhantes. Se um número não ajuda uma decisão, não precisa de destaque principal.

Cada KPI deve mostrar nome inequívoco, valor, unidade, período e base de comparação. Apresente fonte, última sincronização e limitações onde afetarem a leitura. “Receita da loja” e “receita atribuída aos anúncios” não são automaticamente a mesma medida. Diferencie ROAS de margem/lucro; não invente fórmula de negócio.

Use `—` e explicação para informação ausente; `0` apenas para zero conhecido. “Sem conexão” não significa “sem vendas”. Mostre “Estimativa” ou “Demonstração” quando aplicável. Variações devem dizer o que mudou, por exemplo “CPA aumentou 8,4% em relação aos 7 dias anteriores”, com avaliação coerente da direção.

## 10. Gráficos: escolha, cores e interação

Escolha o gráfico a partir da pergunta. A orientação [Microsoft — visualização de dados](https://learn.microsoft.com/en-us/office/dev/add-ins/design/data-visualization-guidelines) prioriza dados, clareza e elementos visuais discretos. A pesquisa [Nielsen Norman Group — dashboards e percepção](https://www.nngroup.com/articles/dashboards-preattentive/) ajuda a entender por que posição e comprimento favorecem comparações rápidas.

| Pergunta do Dash Luxury                              | Visualização proposta                      | Cuidados                                                        |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Como investimento ou receita evoluiu?                | Linhas por tempo                           | Período/unidade explícitos; lacunas reais; séries limitadas     |
| Quais BMs, contas ou campanhas geram mais resultado? | Barras horizontais ordenadas               | Base zero para comprimento comparável; nomes legíveis           |
| Qual a composição do gasto entre canais?             | Barras empilhadas ou 100% empilhadas       | Mostrar total e denominador; composição não prova eficiência    |
| Como gasto e retorno se relacionam?                  | Dispersão, quando houver dados suficientes | Explicar eixos, entidade de cada ponto e limites                |
| Em qual etapa o funil perde volume?                  | Barras/etapas com valores e taxa           | Mesmo recorte temporal; denominador de cada taxa                |
| Quais dias/horários concentram eventos?              | Mapa de calor, se apoiar a decisão         | Escala e valores acessíveis; não usar cor como única informação |
| Qual a tendência resumida de um KPI?                 | Sparkline acompanhada do valor             | Apoio visual; não substituir o gráfico detalhado                |

Evite gráficos 3D, sombras nos dados, eixos sem unidade e donuts/gauges apenas decorativos. Para comparação precisa, priorize barras ou linhas. Se usar donut para poucas categorias, exiba valores e legenda; não o use quando uma barra responde melhor.

Mantenha a cor de uma série constante durante filtros e entre telas. Diferencie séries por rótulo e, em linhas, também por traço/marcador quando necessário. Não use vermelho e verde como única distinção. Acrescente resumo textual e tabela ou outra forma acessível de obter os valores; tooltip não pode ser o único acesso à informação.

Explique período, moeda, timezone e janela/modelo de atribuição quando relevantes. Comparação entre moedas ou diferentes janelas não pode aparecer como ranking direto sem tratamento explícito. Permita selecionar uma entidade e aprofundar preservando filtros/contexto, quando o fluxo existir.

## 11. Barras de porcentagem e de carregamento

Trate dois componentes diferentes:

**A. Métrica/proporção:** consumo de orçamento, cumprimento de meta, participação de canal ou uso de capacidade. Tem valor, unidade, denominador e intervalo definidos. Quando apropriado, use semântica de `meter`, com nome e valor acessíveis. O [W3C — Meter Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/) diferencia esse indicador de uma tarefa em andamento.

**B. Progresso de processo:** importação, sincronização, upload ou geração em curso. Use barra determinada somente quando o backend fornecer progresso calculável. Se não houver medição, use indeterminado com o nome do processo; não invente “87%” ou tempo restante. Referência: [Carbon — Progress Bar](https://www.carbondesignsystem.com/building-blocks/core/components/progress-bar/guidelines).

**Proposta visual para métricas:** trilho neutro, preenchimento reto, 6–8px em tabelas e 8–12px em cards, com label e valor fora da barra. Esses tamanhos são escolhas propostas para Dash Luxury, não tokens já implementados. Mantenha mínimo contraste suficiente para a informação necessária.

Exemplos de demonstração:

- “Orçamento consumido: R$ 6.200 de R$ 10.000 — 62%”.
- “Meta de receita: R$ 45.000 de R$ 60.000 — 75%”.
- “Participação no gasto: Meta Ads — 68% do total da loja”.

Defina como lidar com `0`, ausência de denominador e valores acima da meta. Exiba “112% da meta” e o valor real; se o preenchimento for limitado a 100%, informe o excedente. Limiares de aviso devem vir de configuração/regra de negócio, não de uma escolha arbitrária de cor.

Mantenha a semântica acessível coerente com o intervalo: `aria-valuenow` não pode exceder `aria-valuemax`. Para uma meta superada, escolha um intervalo válido ou use a barra como representação complementar ao texto completo, sem declarar valores ARIA inválidos.

Para processos, mostre etapa, itens processados e erro/resultado quando disponíveis. Preserve a possibilidade de trabalhar nas partes da tela que não dependem do processo. Só ofereça “Cancelar” se o cancelamento for realmente suportado.

## 12. Botões, campos e controles

**Componentes atuais:** `Button` tem `default`, `secondary`, `outline`, `ghost`, `link`, `destructive` e `success`, com alturas 40/44/48px. `Badge` tem `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info` e `muted`. Reutilize variantes existentes; não crie um botão diferente em cada área.

A orientação [Carbon — Button](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines) distingue ações pela ênfase. Para este projeto, mantenha uma ação principal clara por contexto; dê menor destaque a ações auxiliares e agrupe comandos adicionais relacionados em menus.

Use verbos concretos: “Conectar conta”, “Salvar alterações”, “Aplicar filtros”, “Ver campanhas”, “Exportar relatório”. Um link navega e um botão executa uma ação. Confirmações devem explicar o efeito de uma ação destrutiva real, quando necessárias.

O botão primário atual tem texto branco e material neutro escuro. O gradiente base é `#171717 → #080808` no preto e `#262626 → #111111` no branco; o hover é `#202020 → #111111` e `#404040 → #262626`. Verifique a cascata antes de alterar.

Catalogue default, hover, pressed, focus-visible, disabled, loading, success e error. Durante envio, impeça duplicação, mantenha label compreensível e `aria-busy`. Estado desabilitado deve ter motivo perceptível quando necessário; não esconda o único caminho para resolver o problema.

Campos precisam de label persistente, ajuda, indicação de obrigatório quando relevante e erro associado. Placeholder não substitui label. Use combobox pesquisável em listas grandes de lojas, BMs ou contas. Mantenha validação que ajuda a corrigir o valor e não apague dados digitados após erro.

O input base atual declara 36px no desktop; o catálogo usa mínimo de 44px, e a camada móvel garante mínimo de 44px abaixo de 640px. Proponha padronização por densidade/contexto, distinguindo esse estado atual da melhoria.

Inclua também estas especificações no inventário de componentes. Confira o que já existe antes de implementar; a tabela descreve o comportamento esperado, não uma lista de recursos confirmados:

| Componente                | Comportamento a especificar                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| Checkbox / radio / switch | Múltipla seleção, escolha única e alternância com efeitos previsíveis    |
| Select / combobox         | Valor selecionado, busca quando necessária, vazio, loading e erro        |
| Seletor de período        | Início/fim, presets, timezone pertinente e comparação explícita          |
| Tabs                      | Separação de vistas relacionadas; seleção e teclado acessíveis           |
| Breadcrumb                | Localização em loja/BM/conta/campanha sem perder filtros                 |
| Tooltip                   | Ajuda breve acessível por foco; informação essencial permanece fora dele |
| Toast / alert             | Resultado breve versus mensagem persistente que exige atenção            |
| Dialog / drawer / sheet   | Escopo claro, fechar/cancelar, foco e tratamento de dados não salvos     |
| Paginação                 | Total/intervalo quando conhecidos e estado das ações anterior/próxima    |
| Painel de detalhes        | Abrir/fechar preservando linha selecionada, contexto e posição           |
| Skeleton / loading        | Espaço estável e indicação honesta da atualização em andamento           |
| EmptyState                | Causa da ausência de conteúdo e próximo passo possível                   |

## 13. Tabelas, filtros e pesquisa

O [Carbon — Data Table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) oferece padrões de busca, ordenação, expansão, seleção, ações e paginação. Para Dash Luxury, proponha linhas de 40–48px por padrão e uma opção compacta de 32px onde a leitura e os controles permitirem. Essas medidas são propostas, não uma regra universal.

Tabelas de campanhas/contas devem permitir comparar nome, status, vínculo com a loja, investimento, resultado, CPA/ROAS relevantes e sincronização. Mostre as colunas necessárias para a tarefa, com seleção de colunas e aprofundamento nos detalhes quando justificável.

Alinhe texto à esquerda e números comparáveis à direita; mantenha números tabulares. Use cabeçalhos compreensíveis, unidade/moeda explícitas e indicação de ordenação. Se houver seleção em lote, mostre quantidade selecionada e ações válidas. Não ofereça ação operacional real em dados de demonstração.

Preserve pesquisa, filtros e contexto ao abrir/fechar detalhes. Em conjuntos grandes, use paginação ou estratégia apropriada ao backend; não carregue todos os recursos apenas para parecer completo. Um cabeçalho fixo não pode encobrir foco ou controles.

Filtros ativos precisam permanecer visíveis quando o painel estiver fechado, com resumo, remoção individual e “Limpar filtros”. Use “Aplicar” para conjuntos de alterações que disparam consultas custosas; aplicação imediata deve ser previsível quando leve. Referência: [Carbon — Filtering](https://www.carbondesignsystem.com/building-blocks/core/patterns/filtering).

## 14. Estados de dados, conexão e demonstração

Projete estados diferentes para:

- Carregamento inicial, atualização parcial e dados já disponíveis durante atualização.
- Sem dados no período, nenhum resultado de filtro e nenhum recurso cadastrado.
- Conexão ausente, permissão insuficiente, erro de API, token expirado e dado desatualizado.
- Sucesso, falha parcial e necessidade de configuração.

Cada estado precisa de título específico, explicação e próximo passo possível. A referência [Carbon — Empty States](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states) diferencia situações que exigem respostas diferentes.

Quero visualizar a experiência completa **em demonstração antes de conectar os serviços**. Crie dados fictícios coerentes, identificados como “Demonstração”, para uma loja com até cinco BMs, contas, campanhas, criativos, pixels e públicos. Inclua uma BM ativa, outra que já anunciou, uma conexão com pendência e campanhas com resultados diferentes.

Faça totais, séries, tabelas e porcentagens concordarem. Não misture dados fictícios com dados reais sem identificação. Mostre também os estados sem conexão, erro e sem dados. A ação “Conectar” deve abrir o fluxo verdadeiro quando disponível ou explicar o que falta; demonstração não pode retornar “Conectado com sucesso” como se houvesse integração real.

Não exponha tokens, segredos, identificadores pessoais sensíveis ou credenciais em protótipos e exemplos.

## 15. Agente de IA e recomendações

Organize a área da IA em contexto da loja, pergunta/tarefa, resposta, fontes/período utilizados e próximos passos. Diferencie resposta demonstrativa de geração real configurada.

Uma recomendação deve dizer qual dado sustenta a conclusão e quais limitações existem. “Criar rascunho”, “Gerar texto”, “Publicar” e “Executar alteração” são efeitos diferentes. Preserve as permissões e confirmações necessárias para ações reais; não represente uma análise como campanha publicada.

Planeje mensagens em andamento, erro, tentativa novamente, ausência de configuração e resultado concluído. Streaming e cancelamento são propostas condicionadas à implementação real, não funcionalidades presumidas.

## 16. Responsividade e acessibilidade

Projete os dois temas em desktop, notebook, tablet e celular. Use larguras de inspeção como 320/390/768/1280/1440px, além de redimensionamento contínuo. Essas larguras são uma matriz proposta de validação, não novos breakpoints obrigatórios.

Em telas pequenas, mantenha o contexto de loja/período, empilhe KPIs prioritários, use drawer para navegação/filtros e rolagem horizontal localizada em tabelas. Para o funil, proponha uma alternativa em lista ou operações por controles quando o canvas não for suficiente. Não remova ações essenciais para caber na tela.

Critérios de acessibilidade:

- Contraste de texto e informação visual conforme os critérios W3C citados na seção de cores.
- Navegação completa por teclado, nomes acessíveis, labels, ordem de foco e retorno de foco após fechar sobreposições.
- Foco visível e não totalmente escondido por cabeçalhos/painéis. O contorno atual da camada é 2px com offset 3px; confira o resultado da cascata. [W3C — Focus Not Obscured, AA](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Alvos mínimos de 24×24 CSS px ou condições de espaçamento/exceções do critério AA. Como recomendação de conforto no mobile, preserve alvos de 44–48px; não declare que 44px é uma obrigação universal de WCAG AA. [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Reflow a 320 CSS px para o conteúdo aplicável; tabelas e diagramas que necessitam de duas dimensões têm tratamento específico. [W3C — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Alternativa a operações que exigem arrastar, salvo exceções aplicáveis; ofereça controles para mover/adicionar/conectar no funil e suporte por teclado. [W3C — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Estado comunicado por texto/ícone além da cor; gráficos com acesso aos valores e resumo compreensível.
- Respeito a `prefers-reduced-motion`, já contemplado na base. Evite animação contínua de números, brilho ou gráfico que distraia da operação.

Faça verificação automática e inspeção manual dos fluxos relevantes. Uma ferramenta sem erros não comprova sozinha conformidade completa.

## 17. Entregáveis

Entregue:

1. **Diagnóstico do estado atual**, com problemas concretos, telas afetadas, evidência e prioridade.
2. **Pesquisa aplicada**, com links consultados e o motivo de cada padrão escolhido.
3. **Design system revisado**, incluindo fontes, cores dos dois temas, tokens, tipografia, espaçamento, densidade, materiais, ícones, gráficos, barras percentuais e estados.
4. **Inventário de componentes**, com anatomia, variantes, estados, responsividade, acessibilidade e relação com componentes existentes.
5. **Mapa de navegação**, associando nomes claros às rotas reais e sinalizando páginas ainda propostas.
6. **Telas/protótipos representativos**: visão geral da loja; tráfego/BMs/contas/campanhas; detalhe de campanha; funil com ferramentas à direita; conexões/APIs; agente de IA.
7. **Demonstração coerente**, com dados fictícios identificados e os estados de carregamento, vazio, erro, desatualizado e sem conexão.
8. **Plano de implementação por etapas**, priorizando tokens/componentes compartilhados e evitando duplicação de CSS.
9. **Relatório de validação**, distinguindo o que foi observado, implementado, testado e continua pendente.

Quando implementar, reutilize os componentes e aliases existentes. Documente mudanças de tokens e migrações. Não altere fórmulas de métricas, contratos de API, regras de autorização ou conexões para resolver um problema visual.

## 18. Critérios de aceite

O trabalho será aceito quando:

- CommandLayer permanecer reconhecível, com dois temas, cantos retos e Inter/JetBrains Mono preservadas.
- A loja selecionada e o período forem claros; seja possível investigar BMs, contas e campanhas sem perder o contexto.
- Uma entidade não aparecer duplicada nos totais devido a vínculos compartilhados.
- KPIs, gráficos, tabelas e barras exibirem unidade, base de cálculo e estados coerentes.
- Informação ausente, zero, estimativa, demonstração e dado real forem distinguíveis.
- Menus e pastas tiverem nomes claros e destinos consistentes, incluindo conexões/APIs, tráfego, servidor, domínios, produtos e lojas.
- O quadro de funil manter as ferramentas à direita e oferecer operações acessíveis.
- As interações essenciais funcionarem com teclado e em telas pequenas nos dois temas.
- Contrastes forem medidos nos componentes afetados e os problemas identificados tiverem correção ou registro explícito.
- As demonstrações não simularem conexão, publicação ou execução real com mensagens enganosas.
- A implementação, se realizada, preservar contratos e regras de negócio e passar as verificações pertinentes às alterações.

Comece pela leitura do projeto e por um diagnóstico objetivo. Depois apresente a proposta visual, componentes e demonstrações antes de generalizar o redesign para todas as áreas. Relate melhorias com evidências; não invente testes realizados, referências visualizadas ou integrações concluídas.
