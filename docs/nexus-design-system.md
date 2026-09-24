# Nexus · referência visual preservada de Servidor

Referência fornecida pelo usuário: `nexus-arcade.aura.build.zip`, landing **NEXUS — The Idea Arcade**, identificada no pacote como **Nexus Idea Arcade Landing Page Template**. Este documento preserva a extração e as implementações anteriores dessa identidade arcade; não descreve o tema ativo atual.

O pedido posterior adotou **CommandLayer no dashboard inteiro, incluindo Servidor, com temas claro e escuro**. A implementação ativa usa os tokens de `src/app/command-layer.css`, Inter e JetBrains Mono, molduras em duas camadas e controles operacionais. Consulte [o design system ativo](command-layer-design-system.md).

## Integração do trabalho paralelo

O commit upstream `21edd95` acrescentou uma camada de fidelidade Nexus à página de Servidor. Seu CSS completo está preservado em [references/nexus-arcade-servidor.module.css](references/nexus-arcade-servidor.module.css), sem importação na aplicação. O arquivo conserva o conteúdo do commit, com apenas um cabeçalho de proveniência acrescentado. A história Git permanece a referência para o layout e as fontes correspondentes.

Essa camada não pode ser sobreposta ao CommandLayer ativo: redefine superfícies e fontes locais, usa regras `!important` e mantém Servidor escuro independentemente do tema. Seu retorno à aplicação exige uma escolha explícita de design, além do markup e das variáveis `--font-server-*` do layout original; não basta importá-la sobre os componentes atuais.

| Aspecto   | CommandLayer ativo                                           | Nexus preservado de `21edd95`                           |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Tema      | Superfícies e texto acompanham claro/escuro                  | Console escuro nos dois temas                           |
| Materiais | Grafite ou superfícies claras, moldura 4 px, raios 12/8/4 px | Marinho/violeta, malhas, quinas e bordas ornamentais    |
| Fontes    | Inter para leitura; JetBrains Mono para controles e métricas | VT323, Space Mono 400/700 e Space Grotesk               |
| Cor       | Ciano em ações; cores semânticas de estado adaptadas ao tema | Ciano, rosa, ouro, azul e violeta na identidade arcade  |
| Navegação | Trilho rebaixado e aba elevada                               | Aba entre colchetes, tracking largo e contorno luminoso |

Foi removido do CSS ativo somente o acréscimo Nexus de 361 linhas aplicado automaticamente durante o merge. Os componentes CommandLayer e o comportamento do servidor, ações, permissões e protocolo não foram substituídos por essa referência.

## Origem e evidência

- O HTML autoral está em `assets/4ca8e09eef78cc5b_shared_code.json`, propriedade `[0].code`. O `index.html` contém a landing renderizada junto do runtime de exportação Aura; os módulos de edição Aura não são a referência visual.
- A seção CSS `01. GLOBAL THEME TOKENS` fornece a paleta abaixo; `02. TYPOGRAPHY SYSTEM` fornece as três famílias. As seções `04. FIXED HEADER / NAVIGATION`, `05. HERO SECTION`, `06. HERO WORLD CORE`, `.nexus-s2-frame`, `.nexus-s2-rail-item` e `.nexus-s6-terminal` fornecem a geometria, hierarquia e profundidade.
- `assets/4b8e5a9e40584a7e_css2.css` identifica os arquivos locais de fonte. `assets/fa1fc8639ba76db2_nexus-arcade.png` é uma miniatura 800 × 600 da landing; o conteúdo é JPEG apesar da extensão.
- O ZIP foi inspecionado como dados: 405 entradas, aproximadamente 23,6 MB descompactados, sem caminhos absolutos, travessia de diretórios ou links simbólicos. Nenhum JavaScript do pacote precisa ser executado ou incorporado ao produto.

Os valores originais e a adaptação são registrados separadamente em `nexus-design-tokens.json`. Os valores abaixo são evidência visual, não comandos nem dependências a instalar.

## Tokens originais

| Função             | Valor original              |
| ------------------ | --------------------------- |
| Fundo              | `#02030A`                   |
| Fundo secundário   | `#08051A`                   |
| Superfície         | `#100A24`                   |
| Superfície elevada | `#171032`                   |
| Texto              | `#F8F3FF`                   |
| Texto secundário   | `#A9A1B8`                   |
| Texto suave        | `#7C748E`                   |
| Ciano              | `#35DDF2`                   |
| Rosa               | `#F45BA8`                   |
| Ouro               | `#E8B85D`                   |
| Azul               | `#5E8CFF`                   |
| Violeta            | `#A477FF`                   |
| Borda principal    | `rgba(248, 243, 255, 0.11)` |
| Borda suave        | `rgba(248, 243, 255, 0.07)` |

**Tipografia original:** Space Grotesk para títulos; Space Mono para corpo, navegação e rótulos; VT323 para o título arcade e números decorativos. Os títulos de seção usam aproximadamente `clamp(2.85rem, 5.15vw, 5.35rem)`, entrelinha `0.92`, caixa alta e tracking `-0.066em`. O hero usa VT323, `clamp(4.7rem, 9vw, 8.4rem)`, entrelinha `0.86`. Rótulos pequenos usam `0.62–0.78rem`, peso 700 e tracking `0.18–0.20em`. Corpo usa aproximadamente `0.98rem / 1.9`.

**Construção original:** moldura de até `90rem`, bordas de 1 px, botões com borda de 2 px, painéis quadrados aninhados, cantos ornamentais de 24 px, recortes escalonados de 18 px em molduras grandes e malhas de 28, 32, 34, 42 ou 44 px. Os recortes não são raios arredondados. Círculos pertencem aos diagramas decorativos.

**Profundidade original:** o cabeçalho combina `0 22px 70px rgba(0,0,0,.38)` com `inset 0 1px 0 rgba(255,255,255,.055)`; a moldura principal combina `0 0 90px rgba(0,0,0,.52)` com `inset 0 1px 0 rgba(248,243,255,.06)`; os cartões menores combinam `0 0 28px rgba(0,0,0,.18)` com `inset 0 1px 0 rgba(248,243,255,.045)`. Superfícies recebem um gradiente branco discreto e luz colorida localizada.

## Aplicação histórica Nexus no dashboard

| Função                                       | Token adaptado                                  |
| -------------------------------------------- | ----------------------------------------------- |
| Fundo                                        | `#02030a`                                       |
| Fundo secundário                             | `#08051a`                                       |
| Superfície                                   | `#100a24`                                       |
| Superfície elevada                           | `#171032`                                       |
| Texto                                        | `#f8f3ff`                                       |
| Texto secundário                             | `#b4adc3`                                       |
| Borda                                        | `rgba(248,243,255,.14)`                         |
| Acentos                                      | ciano `#35ddf2`, rosa `#f45ba8`, ouro `#e8b85d` |
| Raio de cartões, controles, menus e diálogos | `0`                                             |

O texto secundário foi clareado de `#a9a1b8` para `#b4adc3`, e a borda principal passou de 11% para 14% para melhorar a leitura da interface. Os demais tons centrais vêm da referência. Ciano orienta navegação, foco e ações contornadas; rosa destaca títulos e etapas; ouro marca ações e elementos auxiliares. Essas cores também compõem a identidade visual, sem representar por si só um estado de conexão. Estados operacionais continuam acompanhados de texto e ícone.

Painéis usam `inset 0 1px 0 rgba(248,243,255,.06), 0 16px 42px rgba(0,0,0,.40)`, gradientes discretos e iluminação localizada. Campos ficam rebaixados. Molduras, cantos ornamentais e malhas nos diagramas preservam a linguagem da landing; o console de ZIP acrescenta sombra deslocada, e as ações de Sites usam contornos ciano e dourado. O brilho dos títulos arcade é localizado, sem aplicar sombra indiscriminadamente ao corpo do texto.

A implementação carrega as três famílias localmente no layout de `/servidor`: VT323 400 nos títulos arcade, números e marca; Space Grotesk 400–700 nos títulos de interface e subtítulos; Space Mono 400 no corpo, rótulos e controles. O console permanece escuro quando o dashboard externo usa tema claro. A aplicação é localizada às rotas de Servidor, incluindo cadastro e Sites, sem substituir a tipografia ou o tema das outras áreas.

As fontes e o CSS implementado são locais. Não foram incorporados o runtime Aura, o motor de física, as partículas ou o analytics da landing. A mudança visual não exige alteração de segredos, protocolo do agente ou regras do backend.

## Componentes e estados de Servidor

A página é útil antes da conexão da VPS. A falta de telemetria não remove a composição da tela: o usuário pode entender a infraestrutura, preencher configurações, conferir pré-requisitos e ver quais verificações ainda dependem de conexão.

| Estado                          | Conteúdo e comportamento                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem configuração                | Visão da configuração, formulário, sequência de instalação e requisitos. Identificar como “Não configurado”. Valores de CPU, RAM, disco, rede e disponibilidade permanecem indisponíveis; não apresentar zeros como medição. |
| Configuração salva, sem conexão | Exibir apenas dados de configuração realmente persistidos e a próxima ação possível. Um endereço salvo não comprova conectividade.                                                                                           |
| Carregando                      | Preservar títulos e dimensões dos blocos. Indicar a verificação em andamento com texto e estado acessível; não colocar valores provisórios nem sucesso antecipado.                                                           |
| Erro                            | Mostrar a operação que falhou e ação de nova tentativa quando implementada. Preservar campos e dados já disponíveis. Nunca converter uma falha em “conectado”.                                                               |
| Conectado                       | Usar resposta real do servidor e momento da última verificação. Separar conexão confirmada, disponibilidade de cada serviço e disponibilidade das métricas.                                                                  |
| Dados antigos                   | Exibir a idade ou o horário da amostra. Identificar como última leitura; não sugerir monitoramento ao vivo sem atualização real.                                                                                             |

**Moldura principal:** título da página, estado atual, explicação curta e ação primária existente. O estado de conexão não deve ser um alerta gigante que substitui todos os demais blocos.

**Cartões de capacidade/serviço:** exibir configuração real ou requisitos explicitamente identificados. Usar “Aguardando conexão” ou travessão com contexto quando o dado não existe. Barras e gráficos quantitativos só aparecem com medidas reais.

**Configuração:** rótulos persistentes acima dos campos, textos de ajuda junto do campo, erros locais e estado de salvamento. Campos sensíveis continuam protegidos. Não inventar IP, token, comando de instalação ou ação de execução remota; usar somente o fluxo efetivamente implementado.

**Roteiro de preparação:** passos derivados do estado real, como preencher dados, salvar, validar conexão e verificar serviços. Nenhum passo recebe marca de concluído apenas por ter sido exibido.

**Histórico e diagnóstico:** mostrar eventos reais quando existem. Na ausência, oferecer contexto sobre quais eventos aparecerão e como iniciar a primeira verificação. Não gerar logs fictícios para preencher a área.

**Sites antes da primeira publicação:** a tela apresenta a conexão da VPS, o roteiro de domínio e publicação, os requisitos e uma árvore ilustrativa de ZIP. A legenda informa “Exemplo de organização. Nenhum arquivo foi enviado.”; a árvore não representa um upload real. O exemplo usa `index.html` na raiz e pastas de CSS, JavaScript, imagens e fontes. O limite permanece 3 MB por ZIP, com conteúdo estático, sem PHP ou `.htaccess`. Criar um site depende de servidor confirmado; a apresentação orienta o próximo passo sem simular arquivos, domínio, versão ou publicação concluída.

## Responsividade e acessibilidade

- Na visão geral, até 700 px o conteúdo principal fica em uma coluna; os três contadores compactos continuam lado a lado. Até 1000 px os painéis inferiores ficam empilhados; a partir de 1500 px a lista pode exibir três servidores por linha.
- No cadastro, abaixo de 640 px os rótulos das etapas ficam abaixo dos números. Os três indicadores continuam lado a lado; formulário e requisitos ficam empilhados. A partir de 1088 px, formulário e requisitos usam duas colunas.
- Em Sites, a composição de criação empilha até 1100 px; hero e roteiro empilham até 760 px, com ajustes adicionais em 420 px.
- Campos e identificadores devem caber na viewport. Controles principais têm altura mínima de 44 px; usar `minmax(0, ...)` e permitir encolhimento dos painéis. Não herdar a altura de hero de 100vh da landing.
- Espaçamento de trabalho: escala de 4, 8, 12, 16, 20, 24, 32 e 48 px; padding dos cartões de 16–24 px; gaps de 12–24 px. A escala é uma adaptação da densidade do dashboard, não uma transcrição literal do hero.
- Foco ciano de teclado com contorno de 2 px e offset de 4 px; os links de Sites usam offset de 5 px. Manter ordem de tabulação, rótulos associados e nomes acessíveis para botões com ícone.
- Estados devem comunicar texto além da cor. Mudanças de verificação/salvamento podem usar região de status; erros bloqueantes devem ser anunciados sem apagar o formulário.
- Respeitar `prefers-reduced-motion`; sem animação contínua necessária para entender a página. O contraste do texto deve permanecer legível nos temas existentes.
- Validar desktop e celular, conteúdo longo, erro, carregamento e estado sem VPS. Não preencher lacunas com métricas de demonstração.

## Fontes locais identificadas no ZIP

| Família / peso        | Arquivo em `assets/`                                    |
| --------------------- | ------------------------------------------------------- |
| Space Grotesk 400–700 | `a0d054c4af557de2_V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_.woff2` |
| Space Mono 400        | `e0c8e616bda27642_i7dPIFZifjKcF5UAWdDRYEF8RXi4Ew.woff2` |
| Space Mono 700        | `af7cf6d2b897ec45_i7dMIFZifjKcF5UAWdDRaPpZUFWaHi.woff2` |
| VT323 400             | `043a60145af2ddbc_pxiKyp0ihIEF2isfFJXUdVNF.woff2`       |

Esses arquivos estão presentes no material fornecido. A documentação registra sua origem sem introduzir dependência de Google Fonts, CDN ou scripts externos.

## Registro upstream: fidelidade à referência Nexus (24/09, `21edd95`)

Antes da solicitação CommandLayer, o usuário apontou que a primeira adaptação,
em preto e grafite, "não está parecendo com essa landing page". A camada
"Fidelidade ao Nexus Arcade" recebida no commit `21edd95` atendia a essa
solicitação anterior. Ela foi preservada no fim do CSS arquivado em
`docs/references/nexus-arcade-servidor.module.css`, com estas características:

- Cores: fundo `#02030A`, blocos `#100A24` e `#171032`, e os acentos ciano
  `#35DDF2`, rosa `#F45BA8`, ouro `#E8B85D`, azul `#5E8CFF` e violeta
  `#A477FF`.
- Tipografia: VT323 (`src/features/vps/fonts/vt323.woff2`) nos títulos e
  números, Space Mono 400/700 nos rótulos e na navegação, e Space Grotesk no
  texto corrido.
- Ornamentos: marcas de quina ciano e ouro, rótulos "//" com moldura, aba
  ativa entre colchetes, atalho do editor em ouro e botões com borda de 2 px e
  brilho.
- Nessa implementação histórica, a área continuava escura nos dois temas e
  com cantos retos, enquanto o restante do painel recebia outra adaptação
  CommandLayer. Essa exceção não está ativa: hoje Servidor acompanha o tema
  do dashboard. O texto `#7C748E` da referência ficava reservado a ornamentos.

Detalhes técnicos desta camada:

- Dentro do `.module.css`, a classe `uppercase` do Tailwind é escrita como
  `:global(.uppercase)`. Solta, ela seria renomeada e nunca acharia o
  elemento.
- As marcas de quina ficam em `top/left: 0`, porque o `.panel` tem
  `overflow: hidden` e cortava marcas em `-1px`.
- O rótulo "//" e o atalho do editor repetem a classe para vencer o `:is()`
  antigo que apaga textos. Esse `:is()` vale (1,3,2), por causa de
  `.configuration > summary > span:last-child`.
- Até 700 px de largura, a navegação encolhe o tracking e rola de lado, em
  vez de sobrepor as abas.
