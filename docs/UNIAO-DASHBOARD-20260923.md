# União do dashboard · 23/09/2026

> **Atualizado na união de 24/09/2026** (ver [UNIAO-DASHBOARD-20260924.md](UNIAO-DASHBOARD-20260924.md)).
> O `/servidor` por SSH descrito abaixo **foi substituído** pelo Servidor do
> Funil, que funciona por agente instalado na VPS e não guarda chave nenhuma
> no painel (ver [VPS.md](VPS.md)). O código SSH continua preservado no ramo
> `chatgpt-trabalho`. O editor do funil e os cantos retos seguem valendo.
> O resto é o registro de 23/09, só com notas do que mudou.

## Referências preservadas no GitHub

Repositório: `CEOPAGANINI/dashboard`.

- `chatgpt-trabalho`: `cc5fad3f83a694da42f7d9cb7c11d9a2654e6d6c`, snapshot do trabalho anterior.
- `referencia-editor-20260923-c126846`: `c126846525cb9569020be8589ae0bb41e06d2b4a`, editor e ZIP estático.
- `referencia-main-20260923-bd6d390`: `bd6d39095c615ccca44f1d8042954d7c6e6e27a7`, dashboard mais recente antes da união.
- Trabalho unificado: ramo `integracao-dashboard-20260923`, merge do editor com `origin/main`.

Não fazer push no `main`. A publicação desta união usa o ramo de integração;
a incorporação definitiva ao `main` permanece uma decisão separada.

## Projeto de publicação escolhido

O usuário autorizou publicar no projeto que recebeu a última mudança. A consulta
à Vercel encontrou os dois projetos no mesmo commit `bd6d390`, em produção:

| Projeto            | Produção concluída em 23/09/2026 (Brasília) | Endereço                                  |
| ------------------ | ------------------------------------------- | ----------------------------------------- |
| **dashboardatual** | **16:52:44**                                | https://dashboardatual.vercel.app         |
| dashboard          | 16:51:56                                    | https://dashboard-beta-lime-30.vercel.app |

Destino escolhido: `dashboardatual`, projeto `prj_sughoBVaJoeQClw8ULoHNECAzuYt`.
O projeto `dashboard` não é alvo desta publicação de produção.

Referência anterior para recuperação deliberada na Vercel:

- Deployment: `dpl_H7hDDyXVEVKwUj4oZcQZkSJVW7oJ`.
- URL imutável: https://dashboardatual-jjao93m6a-jungerpgnn-4359s-projects.vercel.app

Nenhuma referência foi apagada e não foi executado rollback automático.

## Conteúdo da união

- Preserva a pele Orbit/PicGen, fonte Outfit, cálculos e estados sem dados do `main`.
- Aplica a decisão fixa de cantos retos e profundidade também à pele Orbit ativa;
  os gráficos circulares continuam circulares, sem arredondar cartões ou controles.
- Mantém o editor de funil e a exportação por página em ZIP estático até 3.000.000
  bytes, `index.html` na raiz, assets, sem PHP ou `.htaccess`.
- Corrige a classificação dos tipos de arquivo SFTP e mantém `ssh2` externo ao
  bundle do servidor para resolver a compilação (saiu com o SSH em 24/09).
- Adiciona `/servidor` para as APIs SSH existentes: conexões, estado, usuários e
  arquivos somente leitura, envio de ZIP para pasta privada nova (substituído
  pelo Servidor do Funil em 24/09).

## Limites e ativação da VPS (por SSH, arquivada no ramo `chatgpt-trabalho`)

A interface não oferece terminal arbitrário, instalação de serviços, edição de
usuários, DNS/SSL ou publicação automática. Enviar um ZIP **não coloca o site no ar**.
É necessário configurar a hospedagem separadamente.

Sem autenticação real, `DATABASE_URL` e uma `ENCRYPTION_KEY` dedicada, o painel
bloqueia operações e não pede credenciais utilizáveis. As tabelas do SQL em
`docs/sql/vps-panel.sql` (arquivado no ramo `chatgpt-trabalho`) precisam ser
revisadas/aplicadas pelo responsável pelo banco.
Essa união não aplica SQL, não altera variáveis de produção e não conecta uma VPS.
A preparação e os limites completos estavam em `docs/VPS-PANEL.md` (arquivado no
ramo `chatgpt-trabalho`). Quem chegou a aplicar aquele SQL: ver [VPS.md](VPS.md),
seção 3.

## Verificação

- Build Next.js de produção com Webpack e checagem TypeScript concluídos.
- 917 testes aprovados em 73 suítes, incluindo dez testes da nova interface VPS.
- ESLint completo (`src` e `tests`) aprovado.
- Validação local das telas de dashboard, editor e servidor, incluindo telas de
  375 e 1280 px sem overflow horizontal e geração de `obrigado.zip` com dois
  arquivos. Sem erros no console das telas verificadas, sem dados ou credenciais
  de VPS reais. O build remoto da Vercel deve concluir antes de considerar a
  publicação entregue.

O diretório local isolado usa um symlink de dependências; por isso a validação
local usa Webpack. Na Vercel, as dependências são instaladas do lockfile e o build
normal usa Turbopack. `.env.local`, `.vercel` e credenciais permanecem ignorados.
