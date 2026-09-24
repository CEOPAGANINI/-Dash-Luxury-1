# União do dashboard · 24/09/2026

Junta numa dashboard só dois trabalhos feitos sobre o mesmo `main`
(`bd6d390`):

- `2ca18ba` (ramo `chatgpt-trabalho`): a união do ChatGPT, que está no ar no
  `dashboardatual`, com o editor do funil, os cantos retos e uma VPS por SSH.
- `fcbd711`: o Servidor do Funil, painel de VPS por agente (ver
  [VPS.md](VPS.md)).

A união de 23/09 está em [UNIAO-DASHBOARD-20260923.md](UNIAO-DASHBOARD-20260923.md).

## O que entrou

- **Editor do funil**, inteiro: `/editor/landing-page`, `/landing-pages` e
  `src/features/landing-editor`. Landing, checkout, upsell e downsell, com
  exportação de cada página num ZIP estático de até 3.000.000 bytes,
  `index.html` na raiz e sem PHP ou `.htaccess`.
- **Servidor do Funil**: `/servidor`, `/servidor/sites`, `/servidor/novo`,
  as rotas `/api/agente/v1/*` e `/api/painel/vps/*` e o agente em
  `public/agente/v1`. O painel não guarda nada que abra a VPS.
- **Cantos retos e profundidade** nas duas peles (`src/app/orbit-dashboard.css`
  e `src/app/nebula-dashboard.css`). Os gráficos redondos continuam redondos.

## O que saiu

- **A VPS por SSH**: o `/servidor` antigo, as APIs de conexão, arquivos e
  envio de ZIP, `docs/VPS-PANEL.md` e `docs/sql/vps-panel.sql`. Com ela saíram
  `ssh2`, `@types/ssh2`, `server-only` e o `serverExternalPackages` do
  `next.config.ts`. O código fica arquivado no ramo `chatgpt-trabalho`.

## Menu

A pasta **Páginas** (Landing pages, Editor de páginas) vem logo antes da pasta
**Servidor** (Servidores, Sites, Adicionar servidor), na ordem do funil:
primeiro se faz a página, depois se hospeda. Não há link repetido de Servidor
dentro de Páginas.

## Do editor ao Servidor

1. No editor, em “ZIP de cada página”, baixe o ZIP da página. O botão não se
   conecta à VPS.
2. Em **Servidor → Sites**, abra o site e publique o ZIP. O agente baixa,
   confere o sha256 e troca `current` para a versão nova. O nginx, o domínio e
   o HTTPS também passam pelo agente.

O contrato entre os dois lados é testado em
`tests/integration/editor-para-servidor.test.ts`: o painel aceita o ZIP de
cada etapa dos modelos do funil, e o agente extrai byte a byte o que o editor
gera. Três divergências ficaram fixadas nesse teste:

- arquivo ou pasta oculta (ex.: `.well-known/`): o editor exporta, o Servidor
  recusa;
- nome acima de 255 bytes: o editor conta caracteres, o Linux conta bytes;
- `index.html` acima de 2 MB: o editor aceita, o Servidor recusa porque a
  conferência “No ar” baixa só 2 MB.

## Banco e agente

- Quem chegou a colar `docs/sql/vps-panel.sql` no Supabase: veja
  [VPS.md](VPS.md), seção 3. A 0006 corrige a `vps_operation_attempts` sozinha;
  a `vps_connections` com as credenciais SSH deve ser apagada à mão.
- A regra de nomes de arquivo do ZIP mudou nos dois lados (acento em NFC com a
  marca UTF-8 do ZIP, `@2x`, `&`, colchetes e outros) e o agente foi selado de
  novo, ainda na versão 1.0.0. Um agente instalado antes desta união continua
  com a regra antiga e recusa esses nomes: reinstale pelo comando do painel.

## Conferência antes de publicar

- Vitest: 97 arquivos, 1.252 testes. Agente: 146 testes em Python 3.13 e
  146 em 3.12. ESLint sem aviso e `tsc` sem erro.
- Navegador, nos temas preto e branco: `/servidor`, `/servidor/novo`,
  `/servidor/sites`, `/editor/landing-page`, `/landing-pages` e `/dashboard`
  sem estouro lateral, erro de console, pedido falho ou canto arredondado
  fora de círculo.
- Contraste em 15 rotas nos dois temas: 1.928 textos, nenhum abaixo do mínimo.

Dois acertos saíram dessa conferência:

- o título do editor passou de `h1` para `h2`, porque a faixa do topo já
  traz o `h1` da página;
- o amarelo de atenção do tema claro (`--orb-atencao`) foi de `#7a5a00` para
  `#684d00`: o aviso “Sem dados conectados” estava em 4,19:1 sobre o próprio
  fundo e agora passa de 4,5:1.
