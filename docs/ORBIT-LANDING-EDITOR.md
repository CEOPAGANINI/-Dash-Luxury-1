# Editor visual de páginas · Orbit

Acesso: **Páginas → Editor de páginas** (`/editor/landing-page`). O catálogo
`/landing-pages` também oferece acesso, preservando a página pública existente.

## Design

Adaptado de `download.html`, `orbit-design-system.md` e `orbit-tokens.json`
fornecidos pelo usuário. O HTML referenciava CSS, JavaScript e imagem não
incluídos; os componentes foram reconstruídos em React. O canvas pontilhado,
estrutura dos blocos e espaçamento seguem Orbit. As cores seguem a paleta
branca e preta já solicitada para o dashboard, nos dois temas. A regra fixa
posteriormente solicitada de cantos retos (0 px) e blocos com profundidade
prevalece sobre os raios da referência, inclusive nos diálogos de prévia.

No desktop, blocos podem ser arrastados pelo ícone ou movidos com as setas
do teclado. Há zoom, ajuste à tela e lista textual das ligações. Em telas de
até 800 px os blocos ficam empilhados, sem arrastar nem zoom.

## Funil de vendas

- Criar, editar e remover até 20 etapas: início da loja, landing page, coleção,
  categoria, produto, carrinho, checkout, upsell, downsell, obrigado e página externa.
- Configurar nome, endereço, título, descrição, botão e imagem opcional.
- Criar/remover até 40 ligações direcionadas, sem duplicatas ou ciclos.
- Desfazer as últimas 30 alterações; remoção também remove ligações incidentes.
- Prévia de conteúdo para computador/celular e navegação simulada entre etapas.
- Salvar explicitamente, exportar e importar JSON versionado, com confirmação
  antes de substituir o fluxo em edição.
- Começar com um modelo de funil básico, loja completa ou upsell/downsell. A troca
  pede confirmação, pode ser desfeita e só substitui o rascunho salvo ao salvar.

Os modelos são **rascunhos de planejamento**. Não criam um catálogo comercial,
estoque, carrinho funcional, gateway de pagamento ou automação pós-compra. As
ligações de aceite/recusa de upsell são simuladas, não regras de cobrança.

## Entrega da página ao módulo Servidor

O editor prepara um **ZIP estático da página selecionada**, com `index.html` na
raiz e os arquivos de apoio do pacote incluídos. O ZIP de entrega deve ter no
máximo **3.000.000 bytes** e não pode conter PHP ou `.htaccess`. Esse arquivo é
um artefato para download, não uma publicação.

Há dois modos de conteúdo:

- **Página gerada:** usa os campos da etapa selecionada e inclui `index.html`
  mais `orbit-page.css`. Não baixa imagens remotas nem presume arquivos locais:
  se houver uma imagem configurada, é necessário importar o HTML com seus assets
  para exportar esse conteúdo. Uma etapa sem saída não ganha um botão fictício.
- **Página importada:** usa o HTML inicial escolhido no pacote e mantém os
  arquivos e links desse site. Os textos, botões e ligações do diagrama não são
  mesclados automaticamente ao código importado. Uma entrada em subpasta também
  é copiada para `index.html` na raiz; sua posição original é preservada e uma
  base local permite resolver os caminhos relativos. Um `index.html` anterior
  diferente é mantido como `orbit-original-index[-N].html`. HTML com `<base>`
  existente é recusado para evitar duas bases conflitantes; a entrada deve usar
  UTF-8.

Todos os arquivos de apoio do pacote importado são incluídos, mesmo que a página
selecionada não os referencie. A exportação revalida os limites e tipos aceitos;
as cópias de entrada/backup também contam no limite de 400 arquivos. Referências
externas que já existiam no HTML continuam externas: não são baixadas nem
incluídas no ZIP, e precisam continuar disponíveis no endereço original.

O fluxo entre os módulos é manual: editar a página → baixar o ZIP no editor →
abrir **Servidor → Sites** → escolher o site e publicar o ZIP. O editor não se
conecta à VPS nem guarda credencial. Quem publica é o Servidor do Funil
([VPS.md](VPS.md)): o agente na VPS baixa o ZIP, confere e coloca a versão no
ar, e também cuida do nginx, do domínio e do HTTPS do site. O contrato entre o
ZIP do editor e o Servidor é testado em
`tests/integration/editor-para-servidor.test.ts`.

Na página gerada a partir dos campos do funil, cada ligação de saída precisa de
um endereço válido na etapa de destino. O editor não inventa URLs, não publica
automaticamente as outras etapas nem instala redirecionamentos. Cada página
de destino precisa existir no endereço configurado. Revisar as ligações antes
de enviar o pacote para hospedagem.

As páginas geradas são HTML estático: botões de checkout, upsell ou downsell
são links, não processamento de pagamento, carrinho, reserva de estoque ou
regras condicionais de cobrança. O JSON exportado continua sendo o rascunho
editável do funil, um arquivo diferente do ZIP para hospedagem.

## ZIP de cada página

A segunda área do editor permite escolher uma etapa em **Página para exportar**,
usar seu conteúdo do editor ou associar um pacote HTML a essa etapa. O modo
**Usar HTML importado** aceita um ZIP ou arquivos soltos de um **site estático**:
HTML, CSS, JavaScript, JSON, TXT, imagens e fontes permitidas. Deve existir pelo
menos um HTML. Para preservar diretórios e referências a imagens, prefira ZIP;
não misture um ZIP com arquivos soltos na mesma importação.

- Conferir o inventário, tamanho dos arquivos e selecionar o HTML inicial.
- Manter um pacote independente por etapa, preservado ao alternar páginas.
- Substituir os arquivos da etapa após confirmação; uma importação inválida
  mantém o pacote anterior.
- ZIP local até 20 MiB, cada arquivo até 10 MiB, conteúdo extraído até 40 MiB e
  no máximo 400 entradas entre arquivos e pastas.
- Baixar o ZIP da etapa selecionada, dentro do limite de entrega de 3.000.000 bytes.

Os pacotes ficam **somente na memória desta aba**, separados do JSON do funil e
associados pelo ID da etapa. Recarregar, sair do editor ou trocar de conta descarta
esses arquivos. Alternar entre páginas ou entre as duas áreas do editor não os
descarta. Salvar/exportar o rascunho do funil não salva os arquivos HTML/CSS/JS.

Substituir o funil por um modelo ou por JSON importado também descarta os pacotes
associados, após aviso na confirmação. **Desfazer restaura o diagrama, não esses
arquivos descartados.** Baixar os ZIPs antes de substituir o fluxo ou sair.

O HTML e os scripts importados não são executados nem editados nessa área;
o inventário mostra os nomes/tamanhos dos arquivos, sem prévia de código. A prévia
do funil usa os campos configurados nas etapas, **não renderiza o site importado**.
Selecionar o HTML inicial define a entrada do pacote associado à etapa; isso não
altera URLs públicas nem envia nada à VPS. Para a transferência remota, baixe o
pacote compatível e faça o envio no módulo Servidor. O limite do ZIP de entrega
é menor que o de importação local: 3.000.000 bytes.

Este importador não instala WordPress, temas, plugins ou PHP. Esses projetos
precisam ser exportados como arquivos estáticos antes da importação. Também não
é um editor visual do código-fonte completo da loja.

## Persistência e segurança

Rascunhos usam `localStorage`, com chave versionada por ID de usuário da sessão.
Não há sincronização entre dispositivos, gravação no Supabase, publicação ou
alteração automática de páginas/rotas/redirecionamentos públicos. A aplicação
não tinha um resolvedor de workspace autorizado por usuário; o workspace padrão
compartilhado não foi reutilizado para evitar misturar dados de contas.

Uma alteração em outra aba impede sobrescrita silenciosa. Conteúdo corrompido
é preservado e sinalizado. Falhas/quota do armazenamento não são reportadas
como sucesso: o usuário pode exportar o estado em edição. A chave por usuário
evita mistura acidental, mas armazenamento no navegador não substitui isolamento
de dados no servidor e não deve guardar segredos.

Importações de fluxo JSON têm limite de 200.000 bytes, validação de estrutura/versão/IDs/limites,
URLs, coordenadas, integridade das ligações e ciclos. URLs aceitam apenas HTTP,
HTTPS e caminhos internos iniciados com uma barra; esquemas executáveis,
URLs protocol-relative e credenciais são bloqueados. Links externos usam
`noopener noreferrer`. Imagens remotas só são carregadas quando a prévia abre.

O importador de sites valida diretório central/cabeçalhos, CRC e tamanhos do ZIP,
limita a descompressão e rejeita arquivos criptografados, ZIP64, links simbólicos,
caminhos absolutos/travessia, duplicatas e conflitos entre arquivos e diretórios.
Nomes associados a credenciais, `.env`, `.ssh` e repositórios são bloqueados;
isso não substitui uma revisão do conteúdo para remover segredos embutidos em
HTML ou JavaScript. Metadados macOS são ignorados. Um diretório comum que envolve
todo o site é removido da estrutura importada.

Os dados iniciais são exemplos identificados como rascunhos e sem endereços
reais. Ligar um checkout a uma página de obrigado no diagrama não implementa
validação de pagamento nem um redirecionamento pós-compra.

## Verificação

Suítes focadas: `landing-flow-model`, `landing-flow-store`,
`landing-flow-editor`, `site-package`, `static-page-export`, `page-export-panel`,
`sidebar-folder-navigation` e `app-sidebar`.
Executar também TypeScript, ESLint dos arquivos alterados e build Next.js.

O exportador estático deve ser testado com títulos contendo marcação, URLs
inválidas, etapas sem destino configurado, HTML em subpastas, referências a
assets, limites do ZIP e tentativa de incluir PHP/`.htaccess`. Validar também que
o download não dispara chamadas ao módulo Servidor nem publica arquivos.

Os testes de importação e editor não comprovam publicação ou funcionamento de
checkout. Nenhuma VPS foi conectada nem site público alterado nessa validação.

### Validação do ramo original do editor (23/09/2026)

- 235 testes aprovados em oito suítes do editor, importador e exportador.
- ESLint e formatação dos arquivos alterados aprovados.
- Navegador: geração de ZIP, importação/exportação de pacote com HTML/CSS/JS/SVG,
  associação por página, validação de destinos e layout a 375 e 1280 px conferidos.
  O JavaScript importado não foi executado no dashboard.
- O build Webpack compila, mas a checagem TypeScript geral para em
  `src/features/vps/files.ts:79`: `Attributes` não declara `isSymbolicLink`,
  `isDirectory` ou `isFile`. Há também um aviso da extensão nativa opcional do
  `ssh2`. Esses caminhos pertencem ao trabalho paralelo de VPS e **não foram
  alterados no ramo do editor**. A integração final precisa repetir o build
  após incorporar a reconstrução do módulo Servidor.

### União posterior (23/09/2026)

O erro de tipos do SFTP foi corrigido por inspeção dos bits de `Attributes.mode`.
O pacote `ssh2` é externo ao bundle do servidor, mantendo seu fallback JavaScript
para a extensão nativa opcional. O build completo com Webpack e TypeScript passou
na união. As referências originais permanecem preservadas; ver
[`UNIAO-DASHBOARD-20260923.md`](UNIAO-DASHBOARD-20260923.md).

> **Nota histórica.** A VPS por SSH citada nas duas seções acima (inclusive
> `src/features/vps/files.ts` e o `ssh2`) saiu na união de 24/09/2026 e ficou
> arquivada no ramo `chatgpt-trabalho`. Hoje não há `ssh2` nem
> `serverExternalPackages`; o módulo Servidor é o Servidor do Funil, por agente.
> Ver [`UNIAO-DASHBOARD-20260924.md`](UNIAO-DASHBOARD-20260924.md).
