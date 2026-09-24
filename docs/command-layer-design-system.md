# CommandLayer no dashboard

## Fonte e escopo

Referência visual: [CommandLayer](https://command-layer.aura.build/). A implementação parte do pacote fornecido pelo usuário (`desing dashbord desiing.zip`), em especial `GUIA.md`, `tokens.json`, `command-layer.css` e o código original da página. Não é uma cópia do conteúdo comercial da landing page.

Os dois temas preservam os materiais e a profundidade da referência, com uma **paleta estrutural monocromática solicitada pelo usuário em 24/09/2026**: branco, preto e cinzas neutros. Cores ficam reservadas a gráficos, porcentagens, ícones e indicadores semânticos. O tema claro e os componentes operacionais são adaptações para o dashboard, não variantes extraídas da landing. Não se alega equivalência pixel a pixel.

A cena de hero do Unicorn Studio não integra o dashboard. Nenhum gradiente CSS ou elemento estático é apresentado como reprodução dessa cena.

## Onde o sistema vive

- `src/app/command-layer.css`: tokens, temas, aliases de compatibilidade e materiais compartilhados.
- `src/components/command-layer/`: shell e ícones locais.
- `src/components/ui/`: componentes reutilizados, incluindo Card, Button, Input, Badge, Tabs, Alert e Skeleton.
- `src/features/command-layer/`: catálogo vivo, disponível em `/design-system`.
- O catálogo anterior de Orbit foi preservado no repositório como referência; a rota atual exibe CommandLayer.

O host visual é identificado por `data-design-system="commandlayer"` e pela classe `cl`. Os aliases legados permitem migrar a aparência sem reescrever contratos funcionais. Portais de menus, tooltips e notificações herdam os tokens do mesmo tema. A camada não deve alterar a identidade dos sites públicos nem das páginas criadas pelo usuário dentro do editor.

## Tokens de cor

Use as variáveis semânticas, não valores hexadecimais dentro dos componentes. Os valores abaixo descrevem os temas implementados:

| Token                 | Escuro — adaptação | Claro — adaptação | Papel                       |
| --------------------- | ------------------ | ----------------- | --------------------------- |
| `--cl-canvas`         | `#050505`          | `#ededed`         | Fundo externo               |
| `--cl-chassis`        | `#0b0b0b`          | `#fafafa`         | Estrutura e moldura         |
| `--cl-screen`         | `#080808`          | `#f2f2f2`         | Display rebaixado           |
| `--cl-well`           | `#000000`          | `#e3e3e3`         | Cavidade e trilhos          |
| `--cl-terminal`       | `#020202`          | `#e9e9e9`         | Leitura técnica             |
| `--cl-card-top`       | `#111111`          | `#ffffff`         | Topo do gradiente interno   |
| `--cl-raised`         | `#101010`          | `#e8e8e8`         | Controles elevados          |
| `--cl-border`         | `#202020`          | `#d4d4d4`         | Borda padrão                |
| `--cl-border-strong`  | `#303030`          | `#a3a3a3`         | Borda de controle           |
| `--cl-text-primary`   | `#f5f5f5`          | `#171717`         | Títulos                     |
| `--cl-text-secondary` | `#e5e5e5`          | `#262626`         | Texto forte                 |
| `--cl-text-body`      | `#d4d4d4`          | `#404040`         | Texto de leitura            |
| `--cl-text-muted`     | `#a3a3a3`          | `#525252`         | Descrições                  |
| `--cl-text-dim`       | `#858585`          | `#666666`         | Metadados secundários       |
| `--cl-accent`         | `#fafafa`          | `#171717`         | Ação e seleção neutras      |
| `--cl-activity`       | `#06b6d4`          | `#0e7490`         | Atividade                   |
| `--cl-success`        | `#34d399`          | `#065f46`         | Sucesso                     |
| `--cl-warning`        | `#f59e0b`          | `#92400e`         | Aviso                       |
| `--cl-info`           | `#60a5fa`          | `#1d4ed8`         | Informação                  |
| `--cl-danger`         | `#fb7185`          | `#be123c`         | Erro — extensão             |
| `--cl-violet`         | `#a78bfa`          | `#6d28d9`         | Série de gráfico — extensão |
| `--cl-pink`           | `#f472b6`          | `#be185d`         | Série de gráfico — extensão |

`--cl-accent` é neutro e controla ações, foco e seleção. `--cl-activity` e as séries de gráficos permanecem coloridas, sem tingir o fundo da interface. Verde, âmbar, azul, rosa e violeta diferenciam dados e estados; rótulos, ícones e legendas acompanham as cores. Botões, menus, molduras e sombras não devem usar pigmentos de dados.

## Tipografia, estrutura e profundidade

- **Inter** (`--cl-sans`): títulos e leitura. Títulos de página entre 24–30px, peso 500 e tracking `-0.025em`; corpo de 14px com altura de linha próxima de 1.625.
- **JetBrains Mono** (`--cl-mono`): controles, rótulos, métricas e registros técnicos. Botões com 12px; métricas com 30px e números tabulares; unidades separadas do valor.
- **Painel em duas camadas**: moldura externa de 4px, borda de 1px e cantos retos (raio zero). A superfície interna usa gradiente `--cl-card-top → --cl-chassis`, borda interna discreta e brilho superior.
- **Controles**: raio zero em ambos os temas, inclusive menus e diálogos em portal. O pedido posterior do usuário substitui os raios 12/8/4 da referência. A geometria dos gráficos e o conteúdo autoral das páginas não são alterados.
- **Displays**: fundo `--cl-screen` com sombra inset. O trilho usa `--cl-well`; as superfícies elevadas usam `--cl-raised`.
- **LEDs**: pontos de 6–8px, brilho pequeno e localizado. No catálogo, a amostra usa 7px. Não representam conexão real por si só.
- **Espaços**: 20–24px dentro dos módulos, 24–32px entre composições; grupos compactos podem usar 8–16px conforme densidade.

Sombras têm papéis distintos em `--cl-shadow-chassis`, `--cl-shadow-card`, `--cl-shadow-inset`, `--cl-shadow-screen`, `--cl-shadow-button` e `--cl-shadow-overlay`. No tema claro, as sombras usam intensidades menores, mantendo a hierarquia material sem reproduzir uma moldura preta.

O shell conserva uma região principal de rolagem dentro do chassis, com `min-height: 0`. A largura máxima foi adaptada de 1200px na landing para 1440px no dashboard para acomodar tabelas e métricas. A margem externa é 16px no desktop e 8px em telas pequenas.

## Botões e ajuste de contraste

Os CTAs usam camadas de preto com texto branco, sem scrim nem halo azul:

- Escuro: normal `#171717 → #080808`; hover `#202020 → #111111`.
- Claro: normal `#262626 → #111111`; hover `#404040 → #262626`.

Os testes calculam contraste mínimo de 4,5:1 nos dois extremos de cada
gradiente, nos dois temas. As cores originais continuam disponíveis no
histórico Git; não são a aparência ativa.

O botão pressionado desloca 1px. Variantes secundária, contorno e discreta mantêm hierarquia. Destrutivo e sucesso mantêm cor semântica no texto, com fundo neutro. `loading` bloqueia nova ação e informa `aria-busy`; `disabled` não simula uma operação concluída. O foco visível tem contorno branco no escuro e preto no claro. A preferência `prefers-reduced-motion` desativa animações e transições na camada do painel.

## Componentes funcionais e catálogo

O catálogo usa os componentes compartilhados reais, não versões desenhadas apenas para a documentação. Ele demonstra:

- Painéis e displays com profundidade.
- Amostras de tokens que acompanham a troca de tema e copiam o nome da variável; falha do clipboard é informada sem falso sucesso.
- Botões com feedback local e estados indisponível/carregando claramente identificados como exemplos.
- Badges com ícone ou texto de estado.
- Campo com label associado, ajuda, erro e validação local.
- Abas acessíveis para sucesso, erro e carregamento; skeleton preserva espaço de leitura.
- Estado vazio com explicação e próximo passo demonstrativo.

O valor tipográfico `1.234,56 MB` e os estados desse catálogo são amostras explícitas. O formulário não persiste informações. Os botões não publicam sites, não conectam servidores e não fazem chamadas de backend. O seletor de tema usa a preferência já existente do dashboard; ele não cria uma configuração paralela.

Em tabelas, o cabeçalho é mono, as células mantêm leitura simples e a rolagem horizontal fica localizada. Em formulários e navegação, as ações essenciais permanecem disponíveis no mobile. O catálogo empilha módulos abaixo de 768px e reduz colunas de amostras progressivamente.

## Ícones e atribuição

Os ícones são da família **Solar Linear**, de **480 Design**, distribuída sob [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Fonte: [Solar Icon Set](https://github.com/480-Design/Solar-Icon-Set), distribuída também pelo Iconify.

Os paths SVG são incorporados localmente em `src/components/command-layer/solar-icon.tsx`; não há script remoto de ícones em tempo de renderização. A adaptação adiciona o componente React, tamanhos e atributos de acessibilidade. Ícones decorativos ficam fora da árvore acessível; controles somente com ícone precisam de nome acessível.

## Limites de segurança

Esta é uma migração de interface. O catálogo e a documentação não modificam backend, autenticação, contrato do agente da VPS, permissões, dados ou regras de negócio. O trabalho de apresentação deve preservar esses contratos. Nenhum segredo é necessário para este catálogo; não se deve criar `.env`, copiar valores de credenciais para documentação nem incluir segredos em artefatos.

## Validação da entrega

Em 24/09/2026, o build de produção local e o ESLint completo passaram. A suíte completa passou com 1.272 testes e 15 ignorados, usando `vitest run --testTimeout=10000`. O limite maior acomoda um teste de integração já existente que aguarda uma conferência HTTPS externa de até cinco segundos; não foi alterada a lógica do servidor para acomodar o teste. As verificações adicionais de tokens/contraste e a regressão do tema do Servidor são executadas após a união.

O navegador local foi usado em 390, 768, 1024 e 1440px, com os temas preto e branco. Foram feitas 100 verificações de navegação/geometria nas áreas de visão geral, tráfego, financeiro, campanhas, catálogo, pedidos, integrações, configurações, editor, Servidor/Sites e design system. Nenhuma apresentou transbordamento da página. Uma medição durante a montagem de campanhas mostrou 6px adicionais no contêiner interno; a página permaneceu contida.

A inspeção visual incluiu as molduras do Servidor nos dois temas, o menu móvel, o editor móvel, os cards/filtros da visão geral, o calendário e o catálogo. A revisão corrigiu títulos quebrados e filtros apertados no celular, além de gráficos sem contraste no claro. As cores do calendário foram conferidas por estilos computados. Os controles de validação e abas do catálogo foram acionados, incluindo erro, sucesso e carregamento demonstrativos; o menu e a navegação por teclado também foram exercitados.

O ambiente local usa o modo demonstração já existente. A conexão com uma VPS real, execução de comandos e publicação de sites de clientes não foram exercitadas nesta revisão visual; os contratos de backend continuam cobertos pelos testes existentes. Os arquivos do agente, APIs, banco, autenticação e proxy não foram alterados por esta migração. A publicação do dashboard é registrada separadamente após a Vercel confirmar `Ready`.

## União com a correção anterior

O commit `25a0307` do ramo principal corrigia texto branco sobre cartões brancos forçando a antiga área Nexus a permanecer escura. Sua história foi integrada ao ramo `codex/commandlayer-dashboard`. O pedido posterior de dois temas foi atendido por pares de superfície/texto CommandLayer; por isso, o override Nexus foi substituído, e seu teste foi atualizado para proteger a legibilidade dos dois temas.

Na conferência anterior à publicação, o ramo principal avançou para `21edd95`.
Essa nova história também foi integrada. Como ela oferecia outra aplicação
CommandLayer sobre Orbit e mantinha o Servidor exclusivamente Nexus escuro,
a união preserva a camada CommandLayer unificada e seus dois temas. As
alternativas, fontes e documentação recebidas continuam no repositório:
o CSS Nexus completo está em `docs/references/nexus-arcade-servidor.module.css`,
e `src/app/commandlayer-dashboard.css` permanece como referência não importada.
Nenhuma alteração de backend veio nesse commit; contratos e comportamento
operacional foram mantidos. Os testes de paleta e geometria agora verificam
a camada ativa, incluindo portais, foco, contraste e raios 12/8/4.

Após essa segunda união, o build de produção local (incluindo TypeScript),
o ESLint e os 31 testes focados de integração visual, paleta, geometria e
contraste passaram novamente.

## Revisão monocromática e cantos retos

O pedido posterior de 24/09/2026 substitui os raios da referência por zero e
os fundos cinza do tema escuro por camadas pretas entre `#000000` e `#111111`.
Branco e tons neutros de texto garantem leitura; bordas discretas e sombras
separam as superfícies. Azul não é usado na estrutura nem em ações ou seleção.
Cores são reservadas a dados, porcentagens, ícones e indicadores.
Donuts e outros gráficos mantêm sua geometria; previews e exportações das
landing pages continuam independentes da aparência do dashboard.

A correção paralela `3f3567b` foi integrada: o catálogo não duplica o h1 do
shell, o verde de sucesso claro tem contraste reforçado e os textos neutros
usam tons legíveis. A regra monocromática mais recente prevalece sobre os
antigos acentos azulados.

Após a revisão e a união: build de produção com TypeScript, ESLint e suíte
completa aprovados (1.286 testes; 15 ignorados; timeout de teste de 10s).
