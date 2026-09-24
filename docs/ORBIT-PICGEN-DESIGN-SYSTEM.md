# Orbit · PicGen — o design system do dashboard

União dos dois sistemas que o usuário trouxe. Não é uma página de catálogo:
é a **pele do painel inteiro**, em `src/app/orbit-dashboard.css`, ligada pelo
atributo `data-design-system="orbit"` na casca autenticada.

## De onde veio cada coisa

A regra da união: **onde os dois discordavam, o papel vem do Orbit e o valor
vem do PicGen.**

| | Orbit (tokens.json + md) | PicGen (a gravação do produto) |
| --- | --- | --- |
| Superfícies | quatro degraus de grafite | preto `#0D0D0D` contra branco `#FFFFFF` |
| Tipografia | escala 48 · 28 · 16 · 14 · 12 | a fonte: **Outfit** |
| Respiro | base 4: 4, 8, 12, 16, 24, 32, 48, 64 | — |
| Raios | os nomes do Orbit (etiqueta, controlo, bloco, painel) — **valendo 0**: cantos retos são decisão fixa do produto, reaplicada na união de 24/09 | blocos com painel interno e profundidade em camadas |
| Movimento | 150 ms e 250 ms, `ease-out` | brilho no que está escolhido |
| Fundo | — | canvas de pontinhos |

O Orbit chamava `model`, `image` e `generator` a três cores suas; o PicGen
mostra exactamente três acentos, com os hexadecimais por extenso. São os
mesmos três papéis, agora com a cor que o produto de facto usa:

| Papel | Valor | Onde aparece no PicGen |
| --- | --- | --- |
| modelo | `#FEFA3D` | a porta "model" e o cursor do Paul |
| imagem | `#6DB5FF` | a porta "image" e o cursor da Kate |
| gerador | `#FF5DE7` | o bloco que junta tudo, e o cursor do Mario |
| positivo | `#78F5AB` | a porta "positive" e o botão Generate |
| negativo | `#FB747E` | a porta "negative" e o erro |

A acção principal é branco sólido sobre preto, como o botão "Share": é o
único elemento cheio da tela, e por isso só existe um por bloco.

## O que a pele faz, e o que não faz

Sobrescreve os tokens que o app já consumia — `--background`, `--card`,
`--primary`, `--border`, `--radius*`, `--camada-*`, `--dash-surface-*`,
`--sem-*`. **Nenhum componente precisou de mudar.**

Não toca em cálculo, dados, rotas nem permissões. As cores das plataformas e
as séries com legenda própria ficam como estão: os gráficos genéricos é que
passam a monocromáticos, para a cor continuar a querer dizer só uma coisa.

## Duas armadilhas que a troca de pele revelou

**1. Uma regra apagava o fundo de qualquer elemento cujo único filho é um
ícone**, e estava desligada apenas para `nebula`:

```css
.dash-skin:not([data-design-system="nebula"]) …:has(> svg:only-child)
```

A marca do produto é exactamente essa forma — um quadrado com um raio
dentro. Ao trocar a pele, a regra voltou a disparar e comeu-lhe o fundo.
Passou a valer só para a pele legada: `.dash-skin:not([data-design-system])`.

**2. Regras órfãs com nomes `--nebula-*`** que não estavam presas ao seletor
do Nebula (a divisória do cabeçalho é uma). Sem os nomes, resolviam para nada
e o elemento desaparecia. A pele nova define apelidos que apontam para o seu
próprio token equivalente — não há ali nenhum valor novo, só endereços.

## Estado verificado

- Contraste: `OK 1708 · FALHA 0 · ERROS 0` — dez rotas, dois temas, medido no
  pixel real de cada elemento.
- Testes: 460, todos a passar, incluindo a guarda de contraste que lê os
  tokens do tema claro desta pele e refaz a conta da WCAG.
- Cenários de navegador: 469 verificações, zero falhas, zero erros.

### Uma correção a um cenário

`quadro-esmagado` tinha o número `24` cravado como respiro do rodapé — o
valor da pele anterior. A nova respira 32, que é a escala de base 4 do Orbit,
e o cenário passou a ler o respiro da própria página. A pergunta que ele faz
("o quadro ocupa o que sobra da janela?") continua a mesma; saiu a suposição.
Medido antes de mexer: a folga real é 32px e nenhum cartão fica cortado.
