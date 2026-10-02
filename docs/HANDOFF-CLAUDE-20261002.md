# Passagem de bastão — Claude → Codex (02/10/2026)

Nota de coordenação entre as duas IAs que trabalham neste repositório. Sem
segredos; só o que está onde, o que ainda falta e o que não deve ser feito
sem o dono.

## O que este branch (`claude/futurist-sobre-main`) traz por cima do `main`

| Item                                                                                           | Onde                                                                                                                                                                    | Estado                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Design system "Futurist Workflow" (fontes, textos, diagramação, menu de vidro, chips, cartões) | `src/app/futurist.css`, `src/components/dashboard/page-header.tsx`, `page-eyebrow.tsx`, `public/design-system/futurist-workflow.html`, `docs/design-system-futurist.md` | Camada CSS `futurist`, a última da ordem (`… commandlayer, dashboard, futurist`). Convive com a camada `dashboard` do Codex. |
| Painel fluido de borda a borda (sem o contêiner de 1280px)                                     | `src/app/futurist.css`                                                                                                                                                  | Pedido do dono: "está enquadrado e não responsivo".                                                                          |
| Banco fora do ar não derruba as telas                                                          | `src/lib/workspace.ts` (`bancoIndisponivel`, `tentarWorkspaceAccess`) e páginas que o usam                                                                              | Só devolve `null` para erro de rede/DNS; 401/403 continuam erro. Compatível com a política "falha fechada sem Supabase".     |
| Quadro do funil: previsão em gaveta com rolagem, painéis à direita do trilho                   | `src/features/funnel/funnel.css`, `content-editor.module.css`                                                                                                           | O enquadramento do card (`nodeFocusViewport`) é o do `main`.                                                                 |
| `sidebarFolderLabel` (pasta do menu → eyebrow do cabeçalho)                                    | `src/components/layout/sidebar-folder-navigation.tsx`                                                                                                                   | A navegação em si é a do `main` (15 pastas).                                                                                 |

## O que foi consertado no próprio código do `main`

- Acentos corrompidos (U+FFFD) em 10 arquivos do commit "apply dashboard design system and editable funnel connections": textos visíveis ("Editar conexão", "Nome da saída", "Traçado", "Automática"), comentários, storybook, teste e2e e `docs/design-system-flow.md`.
- `tests/components/sidebar-folder-navigation.test.tsx`, `tests/components/app-sidebar.test.tsx`: esperavam as pastas antigas ("Gestão", "Páginas", "Meta Ads" no topo) e falhavam inteiros.
- `tests/components/dashboard-union-geometry.test.ts`: a ordem de camadas aceita o que vem depois de `commandlayer`.
- `tests/unit/edge-status.test.ts`: três frases com caracteres corrompidos.
- `tests/components/command-layer-design-system.test.tsx`: o PR #34 renomeou o título para "CommandLayer · VECTR" e pôs um link para `/public`; o teste esperava o título antigo e tentava usar o link como seletor.
- `src/features/funnel/meta-business-panel.tsx`: `setState` síncrono dentro do efeito (erro de lint `react-hooks/set-state-in-effect`).
- Páginas do Servidor com o mesmo nome do menu (`Servidores`, `Adicionar servidor`, `Domínios e sites hospedados`); teste `vps-paginas` ganhou o mock de `usePathname`.

## Pendências que ficam com o Codex

1. **PR #24 (`codex/redirector-in-funnel`) foi aberto contra `claude/codex-revisado`, não contra `main`.** Ele não está no `main` e foi tirado deste branch para não brigar com a refatoração mais nova do funil (`edge-status`, `reconnect-edge`, `connection-geometry`). Reabrir sobre o `main` e resolver com o código novo.
2. **`format:check` está vermelho no `main`**: 121 arquivos sem Prettier antes desta junção (`npm run format`). Melhor fazer numa passada só, depois de mesclar os PRs abertos, para não gerar conflito de espaço em branco em #22, #31, #33 e #34.
3. **`tests/components/funnel-initial-fit.test.tsx` ("frames more than 200 nodes")** estoura o tempo de 15 s nesta máquina (17 s). Verificar no CI; se for só lentidão, subir o tempo do caso ou reduzir a fixture.
   **`tests/unit/vps-acesso.test.ts` ("a ordem das recusas")** também já falha no `main`: com Supabase "desligado" o teste espera `403 modo_demo`, mas `getSession` devolve `null` (`401 sem_sessao`). A regra `allowLocalDemo` devolve `true` no vitest (NODE_ENV=test, sem VERCEL), então a causa está entre o mock de `isSupabaseConfigured` e o `cache()` de `getSession`; não mexi na regra de segurança.
   **O CI do `main` está vermelho em todas as execuções de hoje** no passo "Verificar formatação"; lint, tipos e testes nem chegam a rodar, por isso os testes desatualizados passaram despercebidos.
4. **Três direções de design ao mesmo tempo**: camada `dashboard` (já no `main`), tema VECTR (PR #34, já mesclado: `src/app/vectr-theme.css`, `data-visual-theme="vectr"`) e Futurist (este branch). O dono precisa escolher uma como padrão; as outras podem continuar como temas opcionais, mas não as três ligadas de uma vez.
5. **`CEOPAGANINI/dash-luxury-reserva-publica` (antigo `-Dash-Luxury-1`) é público** e tem o branch `claude/vercel-supabase-dashboard-zca00s` com o código-fonte completo do painel (espelho pedido pelo dono numa sessão anterior). O registro diz "reserva sem aplicação". Decidir com o dono: tornar privado, apagar o branch, ou deixar de espelhar.

## O que não fazer sem o dono

- Não trocar IDs de projeto Vercel/Supabase nem o alias `dashboardatual.vercel.app` (ver `project-registry.json`).
- Não rodar `npm run format` em cima dos PRs abertos.
- Não apagar o branch `claude/codex-revisado` enquanto o PR #24 não for reaberto sobre o `main` (é a base atual dele).
