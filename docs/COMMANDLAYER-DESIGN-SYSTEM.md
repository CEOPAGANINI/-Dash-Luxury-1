# CommandLayer: a pele do painel

> Referência histórica da implementação alternativa recebida em `21edd95`.
> Após a união, a implementação ativa é `src/app/command-layer.css`, documentada
> em [command-layer-design-system.md](command-layer-design-system.md).
> Ela cobre também o Servidor nos temas claro e escuro. O arquivo
> `commandlayer-dashboard.css` abaixo foi preservado, mas não é importado
> pelo layout. As seções seguintes descrevem a alternativa original.

Referência: `command-layer.aura.build.zip`, enviada pelo usuário junto com o
plano do Codex. Vale para o painel inteiro, nos dois temas. A exceção é a área
`/servidor`, que segue o Nexus Arcade (veja `nexus-design-system.md`).

## Onde está

- `src/app/commandlayer-dashboard.css` é carregado em `src/app/layout.tsx`
  **depois** de `orbit-dashboard.css`. Ele redefine os mesmos tokens `--orb-*`,
  e a pele Orbit já os liga aos tokens do app. Nenhum componente muda de
  classe.
- As trancas de canto reto de `nebula-dashboard.css` (`@layer dashboard-geometry`)
  valem só dentro de `[data-server-design="nexus"]`. Fora dali quem manda é o
  raio do CommandLayer.

## Tokens

| Papel | Escuro | Claro |
|---|---|---|
| Fundo / superfície / elevado | `#09090b` / `#131315` / `#18181b` | `#f4f4f5` / `#fff` / `#fafafa` |
| Linha / linha forte | `#27272a` / `#3f3f46` | `#e4e4e7` / `#d4d4d8` |
| Texto / secundário / apagado | `#f4f4f5` / `#a1a1aa` / `#8e8e98` | `#09090b` / `#52525b` / `#60606a` |
| Acento (ciano) | `#22d3ee` (texto), `#0e7490` (ação) | `#0e7490`, selecionado `#155e75` |
| Positivo / negativo / atenção | `#34d399` / `#fb747e` / `#f59e0b` | `#047857` / `#be123c` / `#684d00` |

Os raios são 12 px nos blocos (cartões, seções, popovers, diálogos), 8 px nos
controles (botões, campos, abas) e 4 px nas etiquetas. `.rounded-full`
continua redondo. O quadro de classes fica fora do raio de bloco, porque as
colunas dele se encaixam umas nas outras.

Os títulos usam Inter com tracking -0.02em. Rótulos `.uppercase` usam
JetBrains Mono com tracking 0.12em. A ação principal é um gradiente ciano com
brilho. Os campos são "visores" afundados (`inset 0 2px 4px`). O fundo tem
uma grade de 24 px.

## Casos que pedem regra própria

- **Menus em portal.** Menus e janelas do Radix são montados no `<body>`,
  fora do `.dash-skin`, e por isso ganham uma regra só deles (12 px no
  menu, 8 px nos itens).
- **Redondo continua redondo.** `.rounded-full` volta a ter 9999 px com
  `!important`, senão as trancas antigas de canto reto de `globals.css`
  ganhavam.
- **Foco do teclado.** O anel antigo `#f5f5f5 !important` sumia no tema
  claro. O do CommandLayer também usa `!important` e segue o ciano de cada
  tema (`#22d3ee` no escuro, `#0e7490` no claro). No Nexus ele é `#35ddf2`.
- **Seletores exatos.** A regra de blocos cita as classes pelo nome (as de
  gateways, as do calendário com limite de palavra, `rounded-[1.`) e não
  por prefixo. Com prefixo ela pegava etiquetas e as barrinhas de 1 px do
  gráfico por hora.

## Gráficos

As cores de `visual-overview.tsx` saem de variáveis `--overview-*` (trilho,
neutro, sucesso, info, accent, grade, eixo, cursor, serie e
serie-contorno), com a cor antiga como
fallback. No tema claro os trilhos passam a ser pretos translúcidos, e não
brancos, que somem no fundo claro.

## Conferência

- Contraste de todo texto visível em 15 rotas do painel, nos dois temas:
  1914 textos, nenhum abaixo de 4,5:1 (3:1 para texto grande).
- Área do servidor: 150 textos, todos OK.
- 72 medições de tela (6 rotas × 2 temas) sem falha. O raio é arredondado
  fora do Nexus e reto dentro dele.
- Testes: `tests/components/dashboard-union-geometry.test.ts` e
  `dashboard-palette.test.ts` garantem a ordem dos imports, os três raios e
  que a tranca reta só alcança o Nexus.
