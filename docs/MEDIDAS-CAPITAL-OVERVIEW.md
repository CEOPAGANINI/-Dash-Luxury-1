# Gráfico, barra e rosca — do Capital Overview Dashboard

Referência: o design system **Capital Overview Dashboard**, do aura.build,
que o usuário trouxe exportado. O HTML original saiu de dentro do dump da
página (estava lá como texto escapado) e está em
`docs/referencia/capital-overview.html`.

A casca do painel continua a ser **Orbit · PicGen**. O que este sistema
governa são as **formas de medida**: gráfico, barra de porcentagem e
círculo de porcentagem.

## O que a referência faz, e o que copiámos

| Forma | Como é lá | Como ficou aqui |
| --- | --- | --- |
| Barra de porcentagem | `flex h-2 rounded-full` com **fresta de 2px** entre os pedaços e **sem trilho** aparente; brilho branco a atravessar cada pedaço ao passar o rato, um a seguir ao outro | igual, com o trilho de volta só quando não há movimento |
| Legenda da barra | grelha: ponto e nome, o valor, e a porcentagem miúda por baixo | igual |
| Rosca | `conic-gradient` das fatias, o resto a `rgba(255,255,255,.1)`, e um **disco da cor do cartão** no meio com o número grande; encolhe 5% ao passar o rato | igual, com o resto a ler o token do trilho |
| Legenda da rosca | lista ao lado: ponto e nome à esquerda, porcentagem à direita | igual |
| Linha | SVG `viewBox="0 0 100 40"`, área em degradê até ao transparente a 10–12%, traço de 1–1,5px com pontas redondas, ponto no vértice | igual, com o traço a não engordar quando o SVG estica |
| Colunas | barra vertical `rounded-md` com **halo da própria cor**, e `brightness(1.1)` ao passar o rato | igual |

## A paleta de séries

Os 400 do Tailwind, como na referência:

| | Escuro | Claro |
| --- | --- | --- |
| série 1 | `#818cf8` indigo | `#4f46e5` |
| série 2 | `#34d399` emerald | `#047857` |
| série 3 | `#fbbf24` amber | `#b45309` |
| série 4 | `#f472b6` pink | `#be185d` |
| série 5 | `#a78bfa` purple | `#7e22ce` |
| série 6 | `#fb7185` rose | `#be123c` |
| série 7 | `#9ca3af` o resto | `#6b7280` |

No tema claro elas escurecem: as de cima são claras de mais contra branco.
Todas passam **3:1** — o mínimo de um elemento gráfico — contra o cartão e
contra o canvas, nos dois temas. O teste em
`tests/unit/series-do-grafico.test.ts` refaz essa conta.

**Por que uma paleta a cores num painel preto e branco.** A cor de uma série
é identidade do dado, não enfeite da casca: duas linhas no mesmo gráfico têm
de se distinguir. A regra do monocromático sempre valeu para o cromo e nunca
para o que tem legenda ao lado — é o que a nota do Nebula já dizia ao
preservar as séries com legenda.

`--chart-1` a `--chart-5` passam a apontar para as séries, por isso os
gráficos que já existiam (recharts) adoptaram a paleta sem precisar de mudar.

## Detalhes que a referência não resolve, e este código resolve

- **A última fatia fecha a conta.** Arredondar cada fatia por si dá somas
  como 100,1%, e numa fila de pedaços lado a lado isso empurra o último para
  fora do trilho. Quem fecha é a última fatia com valor.
- **Um todo de zero dá zero**, e não infinito: hoje há divisões por zero
  espalhadas pelo painel.
- **O disco do meio da rosca é da cor do cartão**, e não transparente: assim
  o contraste do número não muda conforme a fatia que estiver atrás.
- **Barra vazia mantém o trilho** e diz "sem movimento" a quem lê a tela.
- **Série plana não divide por zero** no gráfico de linha.
- Tudo respeita `prefers-reduced-motion`.

## O que ainda não foi migrado, e porquê

O painel tem 46 barras de porcentagem em 20 ficheiros e 9 roscas. Elas não
foram trocadas em bloco de propósito: várias carregam significado que uma
troca cega apagaria — as cores de plataforma dos posicionamentos (Instagram
rosa, Facebook azul) e a contagem de pedidos por fatia na saúde dos
pagamentos, por exemplo. A migração vai uma de cada vez, com a leitura
conferida em cada bloco.
