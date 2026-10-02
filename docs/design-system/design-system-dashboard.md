# Design system do dashboard Dash Luxury

Referência do sistema visual implementado no dashboard atual, conferida em 2 de outubro de 2026. O sistema ativo se chama **CommandLayer**. Ele usa temas preto e branco, superfícies neutras, cantos retos e cor para comunicar dados e estados.

Catálogo interativo: [Design system do dashboard](https://dashboardatual.vercel.app/design-system).

Esta referência descreve o código atual. Não altera a aparência do dashboard. Os arquivos Nexus, Orbit, Nebula e PicGen preservados no repositório são referências anteriores; seus tokens não substituem os tokens CommandLayer.

## Identidade visual

| Elemento   | Padrão atual                                                       |
| ---------- | ------------------------------------------------------------------ |
| Nome       | CommandLayer, aplicado ao Dash Luxury                              |
| Temas      | Preto, padrão; branco, selecionável no painel                      |
| Estrutura  | Branco, preto e cinzas neutros                                     |
| Cor        | Dados, gráficos, porcentagens, ícones e indicadores de estado      |
| Formas     | Cantos retos, raio de 0px                                          |
| Materiais  | Moldura elevada, superfície interna e display rebaixado            |
| Tipografia | Inter para leitura; JetBrains Mono para controles e dados técnicos |
| Layout     | Fluido, com largura de 100%; sem teto fixo de 1440px               |

A seleção, o foco e as ações usam acento neutro. Ciano indica atividade ou uma série de dados. Sombras e gradientes estruturais permanecem neutros.

## Paleta de superfícies e textos

Use as variáveis CSS no componente. Os valores abaixo são declarados na camada CommandLayer; os arquivos de cada área continuam controlando sua composição.

| Variável              | Tema preto | Tema branco | Uso                           |
| --------------------- | ---------- | ----------- | ----------------------------- |
| `--cl-canvas`         | `#050505`  | `#ededed`   | Fundo externo                 |
| `--cl-chassis`        | `#0b0b0b`  | `#fafafa`   | Estrutura e moldura do painel |
| `--cl-screen`         | `#080808`  | `#f2f2f2`   | Display rebaixado             |
| `--cl-well`           | `#000000`  | `#e3e3e3`   | Cavidade e trilhos            |
| `--cl-terminal`       | `#020202`  | `#e9e9e9`   | Área técnica                  |
| `--cl-readout`        | `#060606`  | `#eeeeee`   | Superfície de leitura         |
| `--cl-card-top`       | `#111111`  | `#ffffff`   | Topo do material interno      |
| `--cl-raised`         | `#101010`  | `#e8e8e8`   | Controles e menus elevados    |
| `--cl-hover`          | `#171717`  | `#dedede`   | Superfície em hover           |
| `--cl-border`         | `#202020`  | `#d4d4d4`   | Borda padrão                  |
| `--cl-border-strong`  | `#303030`  | `#a3a3a3`   | Borda de controle             |
| `--cl-text-primary`   | `#f5f5f5`  | `#171717`   | Títulos                       |
| `--cl-text-secondary` | `#e5e5e5`  | `#262626`   | Texto forte                   |
| `--cl-text-body`      | `#d4d4d4`  | `#404040`   | Texto de leitura              |
| `--cl-text-muted`     | `#a3a3a3`  | `#525252`   | Descrições                    |
| `--cl-text-dim`       | `#858585`  | `#666666`   | Metadados secundários         |
| `--cl-accent`         | `#fafafa`  | `#171717`   | Ação, foco e seleção          |

## Cores de estados e gráficos

| Variável        | Tema preto | Tema branco | Significado                  |
| --------------- | ---------- | ----------- | ---------------------------- |
| `--cl-activity` | `#06b6d4`  | `#0e7490`   | Atividade e primeira série   |
| `--cl-success`  | `#34d399`  | `#065f46`   | Sucesso e resultado positivo |
| `--cl-warning`  | `#f59e0b`  | `#92400e`   | Atenção e pendência          |
| `--cl-info`     | `#60a5fa`  | `#1d4ed8`   | Informação                   |
| `--cl-danger`   | `#fb7185`  | `#be123c`   | Erro e falha                 |
| `--cl-violet`   | `#a78bfa`  | `#6d28d9`   | Distinção entre séries       |
| `--cl-pink`     | `#f472b6`  | `#be185d`   | Distinção entre séries       |

As séries `--serie-1` a `--serie-7` apontam, nessa ordem, para atividade, sucesso, aviso, rosa, violeta, informação e texto secundário. `--chart-1` a `--chart-5` reutilizam as cinco primeiras. O estado deve vir acompanhado de texto, ícone ou legenda.

## Tipografia

| Uso                 | Fonte             | Tamanho                                   | Peso e entrelinha                  |
| ------------------- | ----------------- | ----------------------------------------- | ---------------------------------- |
| Título de página    | Inter             | 24–30px, `clamp(1.5rem, 2.1vw, 1.875rem)` | 500; 1.2                           |
| Título de seção     | Inter             | 20–24px, `clamp(1.25rem, 1.8vw, 1.5rem)`  | 500 como padrão de títulos         |
| Título de card      | Inter             | 16px                                      | 500; 1.5                           |
| Corpo               | Inter             | 14px                                      | Entrelinha 1.625                   |
| Legenda             | Conforme contexto | Token de 12px                             | Texto secundário                   |
| Métrica             | JetBrains Mono    | Token de 30px                             | Peso 400; números tabulares        |
| Botão               | JetBrains Mono    | 12px                                      | 400; 1.4; tracking 0.025em         |
| Campo               | JetBrains Mono    | 13px na camada compartilhada              | Ver ajustes do componente e mobile |
| Badge               | JetBrains Mono    | 11px                                      | 400; 1.5; tracking 0.03em          |
| Aba                 | JetBrains Mono    | 12px                                      | 400; 1.5                           |
| Cabeçalho de tabela | JetBrains Mono    | 11px                                      | 400; 1.5; tracking 0.05em          |
| Célula de tabela    | Interface         | 13px                                      | Leitura simples                    |

Os títulos usam tracking de `-0.025em`. Métricas e valores em coluna usam números tabulares. Na amostra do catálogo, a métrica usa 30px com entrelinha de 36px. O título de apresentação do catálogo é uma exceção local, com tamanho entre 30 e 42px.

Os comentários antigos sobre Montserrat e Outfit não definem a tipografia ativa do painel: CommandLayer redefine as famílias por aliases. As fontes são carregadas em `src/app/layout.tsx` por `next/font/google`.

## Espaçamento e geometria

| Elemento                                  | Medida                                |
| ----------------------------------------- | ------------------------------------- |
| Raio de controles, cards, menus e painéis | 0px                                   |
| Borda padrão                              | 1px                                   |
| Moldura interna                           | 4px                                   |
| Padding base, `--cl-padding`              | 24px                                  |
| Gap base, `--cl-gap`                      | 24px                                  |
| Respiro usual entre módulos               | 24–32px                               |
| Grupos compactos                          | 8–16px, conforme área                 |
| Margem externa do workspace               | 16px; 8px até 639px                   |
| Gap entre partes do shell                 | 16px; 8px até 639px                   |
| Padding da área principal                 | `clamp(16px, 2vw, 32px)`              |
| Padding da área principal até 639px       | 16px vertical e 12px horizontal       |
| Painel do catálogo                        | 20px de padding; 16px abaixo de 640px |

Os tokens responsivos legados `--space-1` a `--space-6` ainda existem em `globals.css` e variam com a viewport. Eles convivem com os tokens CommandLayer; não há uma escala única de espaçamento aplicada a todas as telas.

O código dos componentes contém classes `rounded-*`, mas o CSS global aplica raio zero com `!important`. O resultado visual é reto. A regra global também zera `rx` e `ry` de retângulos SVG; não se deve inferir o resultado final apenas pelas classes do componente.

## Materiais e profundidade

| Token de sombra         | Função                      |
| ----------------------- | --------------------------- |
| `--cl-shadow-chassis`   | Estrutura principal         |
| `--cl-shadow-nav`       | Navegação                   |
| `--cl-shadow-card`      | Card elevado                |
| `--cl-shadow-metric`    | Leitura de métrica          |
| `--cl-shadow-highlight` | Brilho superior fino        |
| `--cl-shadow-inset`     | Campo e cavidade rebaixados |
| `--cl-shadow-screen`    | Display rebaixado           |
| `--cl-shadow-button`    | Ação principal              |
| `--cl-shadow-tab`       | Aba selecionada             |
| `--cl-shadow-overlay`   | Menu e sobreposição         |

O card compartilhado usa `data-surface="layered"`. Sua superfície interna fica 4px para dentro, usa uma borda discreta e o gradiente `--cl-card-top → --cl-chassis`. No tema branco, as sombras estruturais têm menor intensidade. As expressões completas estão no JSON e no CSS anexos.

## Componentes compartilhados

| Componente             | Variantes e comportamento                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Button`               | `default`, `secondary`, `outline`, `ghost`, `link`, `destructive`, `success`; tamanhos 40px, 44px e 48px; ícone 40px ou 44px |
| `Card`                 | Header, title, description, action, content e footer; superfície em camadas                                                  |
| `Input`                | Label, placeholder, ajuda e erro associados; superfície rebaixada                                                            |
| `Badge`                | `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`, `muted`                                      |
| `Tabs`                 | Trilho rebaixado; aba selecionada elevada e neutra                                                                           |
| `Alert`                | Explica o resultado ou o erro com texto acessível                                                                            |
| `Skeleton`             | Preserva o espaço do conteúdo durante carregamento                                                                           |
| `EmptyState`           | Explica a ausência de dados e apresenta o próximo passo                                                                      |
| Menus, sheet e tooltip | Usam as superfícies, bordas e cores do tema                                                                                  |

Os botões principais usam texto branco sobre camadas escuras. Na camada CommandLayer, o gradiente normal é `#171717 → #080808` no preto e `#262626 → #111111` no branco; o hover é `#202020 → #111111` e `#404040 → #262626`, respectivamente. A aparência final deve considerar o CSS global e o CSS da área, além da variante React.

O `Input` base declara altura de 36px. O catálogo usa mínimo de 44px, e a camada móvel compartilhada garante mínimo de 44px para campos e botões abaixo de 640px. Não há uma altura de 44px universal para todos os campos desktop.

## Estados e acessibilidade

- **Hover:** muda a superfície ou o material para orientar interação.
- **Pressionado:** o botão compartilhado desloca 1px para baixo.
- **Foco:** a camada CommandLayer declara contorno de 2px e offset de 3px; os componentes também têm seus rings de foco.
- **Desabilitado:** bloqueia a interação e reduz a opacidade. A camada CommandLayer declara 0.45; o UI kit também contém regras de 0.5.
- **Carregando:** o botão usa spinner, `aria-busy` e bloqueio de nova ação.
- **Erro de campo:** usa `aria-invalid`, borda de erro e texto associado.
- **Sem dados:** usa mensagem explicativa e um próximo passo.
- **Movimento reduzido:** `prefers-reduced-motion` desativa animações e transições do painel.

Use labels associados aos campos e nomes acessíveis nos controles só com ícone. Preserve a navegação por teclado e a leitura dos estados em ambos os temas. As amostras do catálogo são demonstrações locais; não comprovam conexão real com um serviço.

## Ícones

O shell e o catálogo usam **Solar Linear**, de **480 Design**, em SVGs locais com traço de 1.5 e `currentColor`. O componente usa `viewBox="0 0 24 24"`. O tamanho é definido pelo contexto: por exemplo, 18px nas ações da topbar. Outros módulos e o spinner também usam Lucide.

Solar Linear está sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). A atribuição é preservada em `src/components/command-layer/solar-icon.tsx`. Ícones decorativos ficam fora da árvore acessível; ações precisam de label.

## Layout e responsividade

O shell tem navegação lateral, cabeçalho e uma área principal de rolagem. A coluna principal usa `width: 100%`, sem largura máxima fixa. As páginas controlam suas próprias grades e limites de leitura.

O catálogo reduz as colunas de sinais abaixo de 1024px, empilha suas grades abaixo de 768px e passa os sinais para uma coluna abaixo de 400px. O shell compacta margens e controles abaixo de 640px. Os módulos de negócio têm seus próprios breakpoints; esses valores não representam uma única grade universal.

Tabelas devem manter rolagem horizontal localizada quando necessário. Cabeçalhos técnicos usam fonte mono e valores numéricos mantêm alinhamento tabular. Ações essenciais permanecem disponíveis no mobile.

## Uso no código

O host do dashboard usa a classe `cl` e o atributo `data-design-system="commandlayer"`. O tema fica em `<html data-tema="preto">` ou `<html data-tema="branco">`, controlado por `next-themes`. O padrão é preto, e a preferência fica no navegador.

Para novos componentes, reutilize `src/components/ui/` e consuma tokens semânticos como `--card`, `--foreground`, `--border`, `--success` ou os equivalentes `--cl-*`. Preserve os aliases já usados por módulos antigos. O CSS exportado é a camada CommandLayer original; sua integração também depende de `globals.css`, das fontes e dos componentes do projeto.

### Instrução para reutilizar no Codex

> Use o design system CommandLayer existente no dashboard Dash Luxury. Reutilize src/components/ui e os tokens de src/app/command-layer.css. Preserve os temas preto e branco, as superfícies neutras, os cantos retos com raio 0px, Inter para títulos e leitura e JetBrains Mono para controles e dados técnicos. Use títulos de página de 24–30px, corpo de 14px, moldura de 4px e espaçamento conforme os tokens da área. Reserve cor para dados e estados, com rótulos acessíveis. Mantenha o layout fluido, os estados de foco, erro, loading e vazio e o comportamento responsivo. Confira a cascata de globals.css e do módulo antes de definir valores fixos. Preserve os contratos e as regras de negócio do dashboard.

## Arquivos entregues e fontes

- `design-system-dashboard.md`: esta referência consolidada.
- `design-system-tokens.json`: 186 variáveis CSS por tema, com as 39 substituições do tema branco aplicadas. Expressões `var()`, `color-mix()` e gradientes são preservadas; não é um formato nativo de importação do Figma.
- `design-system-commandlayer.css`: cópia da camada CSS ativa.

Base: commit `9bf3092bfb91221c82dc6d7ae59811466b355ec9` do repositório [CEOPAGANINI/dashboard](https://github.com/CEOPAGANINI/dashboard).

Fontes principais: `src/app/command-layer.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(painel)/layout.tsx`, `src/components/ui/`, `src/components/command-layer/shell.module.css`, `src/components/command-layer/solar-icon.tsx` e `src/features/command-layer/`.

A página publicada foi inspecionada no tema preto: título Inter de 30px e peso 500; botão JetBrains Mono de 12px, altura de 44px, raio zero e gradiente neutro. Os valores do tema branco foram extraídos do código, sem alterar a preferência do usuário. Esta extração não executou uma nova auditoria completa de acessibilidade ou de todas as telas.
