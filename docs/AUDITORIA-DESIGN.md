# Auditoria de design — 23/09/2026

Feita com a skill `audit-ai-design-slop` sobre o painel a correr localmente,
tema Nebula escuro, 1512×982 (a resolução do Mac). Diagnóstico apenas: nada
foi corrigido nesta passagem.

## Veredito

O problema dominante não é estética, é **contraste perdido na repintura para
preto e branco**: a etiqueta vermelha e o filtro escolhido ficaram com texto
da mesma cor do próprio fundo, e é justamente o estado de alerta — o que
precisa de ser lido — que desapareceu. Depois disso, o maior ganho vem de
**subtrair**: três cartões do painel inicial desenham gráfico completo por
cima de zero, e o painel emite veredito ("Crítico", "Saudável") sobre dados
que não existem.

## Escopo conferido

10 rotas em 1512×982, tema escuro, sem banco ligado: `/dashboard`,
`/campanhas/quadro`, `/campanhas/meta/classes`,
`/campanhas/meta/gerenciador-quadro`, `/campanhas/calculadora`, `/seguranca`,
`/clientes`, `/integracoes`, `/dashboard/trafego`, `/dashboard/financeiro`.
Contraste medido no pixel real do screenshot de cada elemento, não no CSS.

## Achados

| P | Classe | Padrão | Prova | Dano | Remover ou corrigir |
|---|---|---|---|---|---|
| ✅ P0 | Defeito | Etiqueta e filtro escolhido sem contraste | `/calculadora`: botão "Todas as redes" a **1,07:1**; etiquetas "nota 15"/"Pausar" a **1,16:1** em 4 dos 12 cartões. `/clientes`: chip "Risco" do segmento e 2 linhas da tabela, **1,16:1** | O estado de alerta é o único ilegível | Corrigir a variante destrutiva do `Badge` e o estado escolhido do botão nos próprios componentes, com os tokens do Nebula — não página a página |
| P1 | Defeito | Gráfico desenhado por cima de zero | `/dashboard`: **488px mortos** dentro de cartões de 596px (rosca "Margem" a 0%, anel "Saúde dos pagamentos", 4 barras a zero). `/calculadora`: **839px mortos** num cartão de 1424px | O olho procura dado numa forma feita para ter dado | Trocar o gráfico por um estado vazio de uma linha, na altura natural do cartão; não esticar o cartão para acompanhar o vizinho |
| ✅ P1 | Slop | Veredito inventado sobre zero | `/dashboard`: "Receita líquida R$ 0 — Crítico", "Payback 0 compras — **Saudável**", "Lucro final R$ 0 — Atenção", e "0% vs. período anterior" cinco vezes | Apresenta julgamento como prova quando não há prova; "0 compras = saudável" contradiz-se | Esconder o selo de veredito e a linha de comparação quando o período não tem dado |
| P1 | Defeito | Dois `h1` na mesma página | `/campanhas/calculadora` ("Calculadora" + "Calculadora de campanhas"); `/dashboard/trafego` | Quem usa leitor de tela recebe dois títulos de página | A migalha de pão passa a `span` |
| P2 | Slop | Aviso de "sem dados" em duplicado | `/clientes`: faixa amarela + pílula "Demonstração — sem banco". `/calculadora`: faixa + "Demonstração interativa · dados fictícios…" | Mesma mensagem duas vezes; e a faixa fala de `.env` e `docs/DEPLOY.md` dentro do produto | Ficar com um; tirar os caminhos de ficheiro da faixa do utilizador |
| P2 | Slop | Ícone decorativo no cabeçalho de cada cartão | `/dashboard`: "Visão geral da operação", "Margem", "Composição financeira", "Saúde dos pagamentos" — quatro quadradinhos arredondados intercambiáveis | Quatro ornamentos iguais competem com quatro títulos diferentes | Remover: o teste da remoção não perde nada |
| P2 | Defeito | Ação repetida e minúscula | `/calculadora`: "só esta" 12×, a 12px; 16 alvos abaixo de 24px | Alvo pequeno de mais e rótulo que não diz o que faz | Um alvo de 24px no mínimo, e um rótulo que se explique |
| P3 | Defeito | Plural errado | `/clientes`: "1 pagos" em 6 linhas | Ruído de qualidade numa tabela de dinheiro | Concordar o plural com o número |

## Não verificado

- Tema claro, celular e tablet: esta passagem foi só escuro a 1512.
- Estados de foco de teclado e de hover além dos posicionamentos.
- Páginas públicas (loja, checkout, autenticação) ficaram fora.

## A correção com maior retorno

Devolver contraste à variante de alerta do `Badge` e ao estado escolhido do
botão. É um ponto no design system e apaga os oito piores achados de leitura
de uma vez, em todas as páginas ao mesmo tempo.


---

## Passagem de correção — P0 fechado

### Causa raiz

Uma regra só, em `nebula-dashboard.css`, inflava a própria especificidade:

```css
:is([data-slot="button"], …, input:not(…):not(…):not(…))
```

`:is()` vale o mais forte dos seus argumentos, e `input:not():not():not()`
vale (0,3,1). As três regras de variante logo abaixo — `bg-primary`,
`bg-destructive`, `bg-success` — valem (0,2,0), e perdiam. O **fundo** passava
a vir da regra genérica enquanto a **cor do texto** continuava a vir da
variante: os dois deixavam de combinar, e o selo de alerta desaparecia.

### O que mudou

- `nebula-dashboard.css`: o `input` saiu do `:is()`, com a mesma declaração
  numa segunda linha do seletor. As variantes voltaram a ter o peso que já
  tinham no papel.
- `ui/badge.tsx`: a variante `destructive` passou de sólida a tingida
  (`bg-destructive/15 text-destructive`), igual a `success`/`warning`/`info`.
  A pele apaga o fundo com `!important` mas não toca na cor do texto — num
  selo tingido quem manda na leitura é o texto.
- Tema claro: `--nebula-positive`, `--nebula-negative`, `--nebula-cyan` e
  `--warning` escurecidos o mínimo para passarem 4,5:1 nas três superfícies
  onde assentam (painel `#f0f0f0`, cartão branco, faixa âmbar). Antes ficavam
  entre 3,5 e 4,3:1.

### Correção ao método de medição

A primeira varredura usava percentil 10 contra percentil 90 dos pixels. Num
selo de 12px o texto é menos de 10% da área, e o percentil 10 nunca chega à
cor da letra: o método **subestimava** o contraste e acusou falhas a mais.

O método em uso agora separa as duas fontes de verdade: a cor da letra sai do
CSS, onde é exacta, e a cor do fundo sai da **moda do histograma** do pixel —
a cor que mais se repete na foto do elemento é o fundo, por definição.

### Estado

`OK 1656 · FALHA 0 · ERROS 0` em 10 rotas × 2 temas. Guarda de regressão em
`tests/unit/contraste-nebula.test.ts`, que refaz a conta a partir dos próprios
tokens do CSS.


## Passagem de correção — veredito sobre zero

`estadoPayback(0)` devolvia `success`, porque zero cai na faixa de "até 1
compra". Mas zero compras até o cliente se pagar quer dizer que não houve
compra nenhuma, e não que ele se pagou à primeira. O mesmo com a receita:
`R$ 0 — Crítico` é um veredito sobre a ausência de dado.

Entrou um estado novo, `vazio` ("Sem dado"), que lê o mesmo cinza de "sem
meta" e nunca verde nem âmbar, e um sinal único:

```ts
const periodoSemDado = snapshot.pedidos === 0 && snapshot.gastoMidia === 0;
const veredito = (tom: TomEstado): TomEstado => (periodoSemDado ? "vazio" : tom);
```

Os dez vereditos de desempenho da tela passam por esse filtro. Os rótulos
puramente informativos (`info`, `accent`) ficaram como estavam: não julgam
nada. A linha "0% vs. período anterior", repetida cinco vezes sobre zero,
deu lugar a "Sem movimento no período".

Guarda de regressão em `tests/components/painel-sem-dado.test.tsx`.
