# Dashboard · adaptação Nebula

Referência fornecida: `nebula/DESIGN-SYSTEM.md`, `tokens.css`, `components.css`
e prévia do catálogo. A marca do produto permanece **Dash Luxury**.
Por solicitação posterior, a paleta principal é **branco e preto**, com cinzas
neutros; a estrutura visual Nebula é mantida sem os destaques roxos e azuis.

## Aplicação

- A união com a versão atual mantém **Orbit · PicGen** como pele ativa,
  com fonte Outfit, escala, canvas e cores semânticas dessa versão. Esta
  documentação também registra a pele Nebula legada, sem substituí-la.
- A política de geometria e profundidade descrita abaixo vale para **ambas**
  as peles. Trocar `data-design-system` não reativa cantos arredondados.
- `src/app/nebula-dashboard.css` é a camada de tema, importada após o CSS legado.
- O wrapper autenticado atual usa `data-design-system="orbit"`; a folha
  `orbit-dashboard.css` entra após Nebula. As cores e fontes abaixo descrevem
  somente a variante Nebula.
- Tokens também existem em `body:has(...)`, permitindo que menus e modais
  portados mantenham cores e tipografia. Loja, checkout público e autenticação
  não são alvos do redesign.
- Inter para a interface e os títulos; fonte mono existente preservada para IDs.
- Fundo `#090909`, superfície `#121212`, superfície elevada `#191919`;
  texto `#f5f5f5`, secundário `#a3a3a3`, bordas brancas a 8%.
- Seleção, foco, marca, gráficos genéricos e CTA principal em branco/preto/cinza,
  com contraste invertido no tema claro. Estados positivos, negativos, de
  atenção e informativos continuam distintos; plataformas mantêm suas cores.
- Cantos retos fixos: todos os raios são **0**, nos dois temas, incluindo
  cartões, controles, avatares, miniaturas e menus/modais em portal. Não há
  preferência ou opção de arredondamento. A comparação de criativos mantém
  as medidas do layout mais recente.
- Profundidade neutra por superfície: luz interna discreta na aresta superior,
  contorno fino e sombra externa curta nos blocos; modais usam elevação maior.
  O tema claro reduz a opacidade das sombras. Textos e marcas dos gráficos
  não recebem sombra individual nem transformação.
- O tema claro é uma adaptação do dashboard, não um token original da landing.

## Limites

Não foram alterados cálculos, integrações, permissões, dados ou rotas. As cores
dos logos sociais e as séries vinculadas a legendas foram preservadas. Não foram
adicionados os shaders, partículas ou scroll suavizado da landing: o dashboard
continua usando a navegação de trabalho existente. Movimento reduzido é respeitado.

Na publicação, as atualizações de comparação de criativos já presentes no
repositório foram preservadas, incluindo colunas, abas de posicionamento e neon.
Essas abas são excluídas da seleção monocromática genérica para manter suas cores.

## Manutenção

Componentes novos devem usar `--nebula-*` ou os tokens semânticos (`--card`,
`--foreground`, `--success`, etc.), evitando novos hexadecimais de superfície.
Alguns overrides com `!important` ainda são necessários por causa da pele legada.
Não remover os estilos de responsividade/posicionamento ao substituir essa pele.

A camada central `@layer dashboard-geometry` fixa `border-radius: 0 !important`
e os tokens de raio no corpo autenticado. Sua prioridade de camada prevalece
sobre regras `!important` não agrupadas dos módulos antigos/novos, inclusive
o editor Orbit. Pseudoelementos e controles em portal também são cobertos.
Não adicionar exceções de arredondamento ou controles que alterem essa política.
Elementos SVG e seus descendentes são excluídos: curvas de gráficos, ícones e
ligações mantêm sua geometria própria; isso não é arredondamento de um bloco.
As roscas CSS da Visão geral (`visual-overview-donut` e `visual-overview-pie`,
ambas com `role="img"`) e seus furos usam `clip-path: circle(50%)` para preservar
a forma que representa os dados. O raio CSS continua zero; cartões, legendas,
avatares e controles não entram nessa regra de recorte.
Roscas dos componentes Medidas, Funil operacional e Demográficos usam os
atributos `data-dashboard-chart="donut"` e `data-dashboard-chart-part="ring"`
ou `"hole"`. Somente a pintura das fatias e o furo recebem o recorte, sem
seletores dependentes de nomes gerados por CSS Modules.

Superfícies existentes usam `--nebula-card-depth`; portais usam
`--nebula-overlay-depth`. Um novo bloco pode adotar `data-dashboard-surface`
para receber a mesma profundidade sem seletores dependentes de CSS Modules.
Não aplicar sombra indiscriminadamente a `span`, texto, células ou à árvore toda.
Na pele Orbit, os aliases `--nebula-*-depth` apontam para
`--orb-profundidade-bloco`, `--orb-profundidade-controlo` e
`--orb-profundidade-portal`. Assim o editor e os portais mantêm profundidade
nos temas claro e escuro, sem trocar as cores auditadas da versão atual.

Conferir tema claro e escuro, menus em portal, filtros, tabelas e posicionamentos
em celular e desktop. Não transformar ancestrais dos painéis fixos.
