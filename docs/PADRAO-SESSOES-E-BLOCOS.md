# Padrão de seções e blocos

Texto enviado pelo dono do projeto como padrão de interface. Guardado aqui
para reutilizar sem copiar do chat. A parte aplicada ao painel está em
`src/app/globals.css` (bloco "Padrão de seções") e nas folhas de cada
funcionalidade; a paleta de seleção do painel continua a atual (branco
sobre preto fosco), sem o azul `#1500FF` do configurador de relógios.

---

## Blocos de escolha

PAPEL — És engenheiro de front-end especialista em interfaces de luxo. Constrói blocos de escolha para um configurador de relógios. Fundo preto fosco `#09090B`.

MATERIAL DE CADA BLOCO (idêntico em todos, sem exceção)

```css
background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
box-shadow: inset 0 1px 0 rgba(255,255,255,.07),
            inset 0 -1px 0 rgba(0,0,0,.5),
            0 2px 6px rgba(0,0,0,.42);
border: 0;
border-radius: 0;
```

Profundidade vem da luz na aresta superior + sombra curta. Nunca bordas, nunca cantos arredondados (exceção: elementos circulares por natureza — visto de confirmação, pontinhos).

ESTADOS

* Repouso: material acima.
* Hover: mesmo gradiente com brancos a `.085` / `.02`.
* Selecionado: fundo azul elétrico `#1500FF`, texto branco, `inset 0 1px 0 rgba(255,255,255,.22), 0 3px 14px rgba(21,0,255,.42)`.
* Visto de confirmação: círculo 26px, `#1500FF`, ✓ branco, `box-shadow: 0 0 0 2px rgba(4,6,10,.9), 0 0 10px 2px rgba(21,0,255,.75)`, `z-index` acima de tudo, a 10px da quina interna.

TIPOGRAFIA

* Rótulo micro: 8,5–10px, maiúsculas, `letter-spacing: .12em`, peso 600, `rgba(255,255,255,.55)`.
* Valor: Montserrat, 13px, peso 400, `rgba(255,255,255,.62)`; quando preenchido → `#FFF` peso 500 e rótulo `#7B8CFF`.
* Nomes dentro de cartões: uma única linha; se não couber, reduzir a fonte (piso 9px), nunca cortar nem quebrar.

GEOMETRIA E ENQUADRAMENTO

* Os blocos partilham uma moldura de altura comum, medida em tempo real a partir do card lateral (`--wm-frame`), nunca um valor fixo em `vh`.
* Painéis: `flex: 1 1 0` + `min-height: 0` — esticam quando sobra altura, encolhem quando falta.
* Grelhas de opções: `grid-auto-rows: minmax(0, 1fr)`, `align-content: stretch`, preenchendo a moldura até ao fundo, sem espaço sobrante.
* Um único ritmo de espaçamento entre todos os blocos (`--wm-gap`).

ANTI-CORTE (inegociável)

1. `min-height`, nunca `height` fixo, em caixas com texto.
2. `overflow: hidden` proibido sobre texto (exceto truncagem intencional comentada).
3. Todo filho de grid/flex leva `min-width: 0`.
4. Imagens: a altura disponível manda, a largura ajusta-se (`height: 100%; width: auto; object-fit: contain`) — nunca recortar.
5. Validar a 320 / 390 / 768 / 1440px antes de entregar.

CONTEÚDO — Português de Portugal. Rótulos curtos de uma linha. Sem espaços vazios: se um bloco parece vazio, é problema de layout, não falta de texto.

ENTREGA — Devolve o ficheiro completo e funcional, sem omitir partes nem usar "o restante permanece igual". No fim, lista cada tipo de texto com o seu tamanho e a confirmação "sem corte a 320px".

---

## Arquitetura de camadas

PAPEL — Engenheiro de front-end. Constrói a hierarquia de camadas de um configurador. Cada camada tem uma responsabilidade única e não invade a seguinte.

CAMADA 0 — Fundo. Preto fosco `#09090B` + textura/vídeo em loop, `position: fixed`, `z-index: 0`. Nunca reage a eventos (`pointer-events: none`).

CAMADA 1 — Sessão (`<section>`, um ecrã). `min-height: 100dvh`, coluna flex centrada. É a unidade de rolagem: uma sessão por gesto. Não desenha material próprio — é só enquadramento.

CAMADA 2 — Layout de duas colunas. `display: grid` com a coluna de escolhas à esquerda e o card de reserva à direita. Ambas partilham a mesma moldura de altura, medida em tempo real a partir do card (`--wm-frame`), nunca valor fixo. No móvel (≤960px) colapsa para uma coluna.

CAMADA 3 — Moldura da coluna (`overflow: hidden`, `height: var(--wm-frame)`). Contém os blocos empilhados verticalmente, cada um com exatamente a altura da moldura. É aqui que vive a paginação interna: um bloco visível de cada vez.

CAMADA 4 — Bloco/passo (`flex: 1 1 0`, `min-height: 0`). Cada passo é independente: Modelo · Bracelete · Número de série · Entrega. Estrutura interna fixa:

* bloco-título (`flex: none`)
* grelha de opções (`flex: 1 1 auto`, `min-height: 0`)

CAMADA 5 — Grelha de opções. `grid-auto-rows: minmax(0, 1fr)`, `align-content: stretch`, um só `gap` (`--wm-gap`). Preenche a moldura até ao fundo — sem espaço sobrante, sem transbordo.

CAMADA 6 — Cartão de opção. Material padrão (gradiente sutil + luz na aresta + sombra curta, cantos retos, zero bordas). Estrutura interna: miniatura (`flex: 1 1 auto`, altura manda sobre a largura) + selo do nome encostado à base (`margin-top: auto`, `flex: none`).

CAMADA 7 — Sobreposições. Visto de confirmação (`position: absolute`, `z-index` acima do cartão, 10px da quina), ilha de navegação fixa no topo. A ilha nunca tapa conteúdo: as sessões reservam-lhe folga no topo (`padding-top` + `scroll-margin-top`).

REGRAS TRANSVERSAIS

* Nenhuma camada usa `height` fixo em caixas com texto — só `min-height`.
* `overflow: hidden` existe apenas nas camadas 3 e 6 (recorte de moldura e de imagem), nunca sobre texto.
* Todo filho de grid/flex leva `min-width: 0`.
* Um só eixo de rolagem ativo por vez: quando a coluna pagina, a página não se move.
* Validar a 320 / 390 / 768 / 1440px.

ENTREGA — Ficheiro completo e funcional. No fim, listar as camadas com a altura resolvida de cada uma e confirmar "sem corte nem sobreposição a 320px".
