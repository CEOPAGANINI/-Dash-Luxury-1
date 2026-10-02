# Design system "Futurist Workflow" no painel

Extraído da página de referência `futurist-workflow.aura.build` (template
"Futurist Workflow Interface", marca DORA_) e aplicado ao Dash Luxury só no
que é **fonte, texto e diagramação**. Cantos continuam retos (regra do dono)
e a única cor nova é o ciano de acento da própria referência.

- Vitrine viva, com as classes e os arquivos originais: `/design-system/futurist-workflow.html`
- Regras aplicadas ao painel: `src/app/futurist.css` (camada `futurist`, a última)
- Cabeçalho de página com eyebrow: `src/components/dashboard/page-header.tsx`

## Fontes

| Papel               | Fonte                                                   | Onde                                      |
| ------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Interface e títulos | Inter                                                   | tudo                                      |
| Acento              | Instrument Serif itálico 400                            | primeira linha de um título (`.fw-serif`) |
| Técnica             | JetBrains Mono (no lugar da ui-monospace da referência) | códigos, IDs, rótulos de 10px             |

## Escala de texto (medida em 1440px)

| Estilo              | Tamanho / entrelinha        | Peso            | Tracking            | Cor                            |
| ------------------- | --------------------------- | --------------- | ------------------- | ------------------------------ |
| Display             | 128 / 115                   | 500             | −0,05em             | branco com gradiente           |
| Display serif       | 60 / 60                     | 300–400 itálico | −0,025em            | zinc-200                       |
| Heading 1           | 60 / 57                     | 500             | −0,025em            | branco                         |
| Heading 2           | 48 / 48                     | 500             | −0,025em            | branco                         |
| Heading 3           | 30 / 36                     | 500             | −0,025em            | branco                         |
| Heading 4           | 24 / 32                     | 500             | −0,025em            | branco                         |
| Heading 5           | 20 / 28                     | 500             | −0,025em            | branco                         |
| Eyebrow             | 12 / 16                     | 600             | +0,1em, caixa alta  | zinc-500, filete 2px ciano 20% |
| Bold S              | 12 / 16                     | 600             | +0,05em, caixa alta | branco                         |
| Lead                | 20 / 32                     | 300             | 0                   | slate-400                      |
| Paragraph L / M / S | 18 / 29 · 16 / 26 · 14 / 23 | 300             | 0                   | slate-400                      |
| Nav                 | 14 / 20                     | 500             | 0                   | zinc-400, branco no hover      |
| Caption             | 12 / 16                     | 400             | 0                   | zinc-600                       |
| Mono label          | 10 / 15                     | 400             | +0,1em, caixa alta  | zinc-500                       |
| Botão               | 14–16                       | 700             | 0                   | preto sobre branco ou ciano    |

## Cores e superfícies

| Token        | Valor                                                                       | Uso                   |
| ------------ | --------------------------------------------------------------------------- | --------------------- |
| Fundo        | `#030305` + radial ciano 10% (canto esquerdo) e violeta 10% (canto direito) | página                |
| Texto padrão | `#cbd5e1` slate-300                                                         | body                  |
| Corpo        | `#94a3b8` slate-400                                                         | parágrafos            |
| Rótulo       | `#71717a` zinc-500                                                          | eyebrow, th, label    |
| Legenda      | `#52525b` zinc-600                                                          | notas pequenas        |
| Vidro        | branco 2% + blur 20px + borda branco 5% (10% no hover)                      | cartões               |
| Acento       | `#22d3ee` cyan-400 sobre cyan-500 10% com borda 20%                         | selo, filete, seleção |

## Diagramação

- Conteúdo fluido, de borda a borda, só com o respiro lateral do painel
  (16–32px). A referência centra o site em 1280px, mas no painel isso
  enquadrava tudo numa caixa no meio de telas largas, então ficou de fora.
  O quadro do funil continua em tela cheia.
- Blocos de página separados por 32px; cabeçalho = eyebrow + título + parágrafo
  leve, com uma linha branca a 5% embaixo.
- Grade de 3 colunas com 32px de vão; bento 2 + 1, depois 3.
- Botões com borda de baixo de 3px (3D): hover sobe 1px e afina a borda; ativo
  desce 3px e some a borda.

## Movimento

- Entrada da página: `fw-reveal` 0,8s `cubic-bezier(0.2, 0.8, 0.2, 1)`
  (opacidade 0→1, 20px para cima, desfoque 10px→0), escalonada por bloco.
- Ponto do selo: `fw-ping` 1s.
- Respeita `prefers-reduced-motion`.

## Onde o desenho aparece no painel

| Peça                  | Como ficou                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Menu lateral          | painel de vidro escuro (preto 50% + blur 24px, borda branco 5%); marca num quadrado ciano 10% com borda ciano 20% e nome em mono com o `_` ciano; pastas em Inter 14/20 500 zinc-400, branco no hover; pasta ou página atual = chip ciano (fundo 10%, borda 20%, brilho) |
| Busca                 | campo de vidro, Inter 300, foco com brilho ciano                                                                                                                                                                                                                         |
| Aviso de demonstração | barra de vidro, Inter 300 12px, ícone ciano                                                                                                                                                                                                                              |
| Cartões               | uma moldura só (a moldura interna do chassi some); fundo zinc-900 30% + blur, borda branco 5%, no hover 10% (ciano 20% nos indicadores)                                                                                                                                  |
| Visão geral           | barra de vidro com título 20/28 500; chips de período (ativo = chip ciano); indicadores com rótulo mono 10px caixa alta e número Inter 500 26–34px; zonas com título 20/28 500 e subtítulo 14px 300; métricas de apoio com rótulo mono e valor Inter 500                 |
| Acento do painel      | o ciano `#22d3ee` vira o acento do CommandLayer (foco, selos, estados ativos); no tema branco é `#0e7490`                                                                                                                                                                |

## Classes utilitárias novas

`fw-eyebrow`, `fw-serif`, `fw-pill` (+ `fw-pill-dot`), `fw-page-header`, `fw-mono`.
