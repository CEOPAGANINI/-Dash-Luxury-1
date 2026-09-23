# Dashboard · adaptação Nebula

Referência fornecida: `nebula/DESIGN-SYSTEM.md`, `tokens.css`, `components.css`
e prévia do catálogo. A marca do produto permanece **Dash Luxury**.
Por solicitação posterior, a paleta principal é **branco e preto**, com cinzas
neutros; a estrutura visual Nebula é mantida sem os destaques roxos e azuis.

## Aplicação

- `src/app/nebula-dashboard.css` é a camada de tema, importada após o CSS legado.
- O wrapper autenticado e o menu em portal usam `data-design-system="nebula"`.
- Tokens também existem em `body:has(...)`, permitindo que menus e modais
  portados mantenham cores e tipografia. Loja, checkout público e autenticação
  não são alvos do redesign.
- Inter para a interface e os títulos; fonte mono existente preservada para IDs.
- Fundo `#090909`, superfície `#121212`, superfície elevada `#191919`;
  texto `#f5f5f5`, secundário `#a3a3a3`, bordas brancas a 8%.
- Seleção, foco, marca, gráficos genéricos e CTA principal em branco/preto/cinza,
  com contraste invertido no tema claro. Estados positivos, negativos, de
  atenção e informativos continuam distintos; plataformas mantêm suas cores.
- Raios-base de 16px nos cartões, 24px nos painéis e 11px nos controles;
  a comparação de criativos mantém as medidas do layout mais recente.
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

Conferir tema claro e escuro, menus em portal, filtros, tabelas e posicionamentos
em celular e desktop. Não transformar ancestrais dos painéis fixos.
