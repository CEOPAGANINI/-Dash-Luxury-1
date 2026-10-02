# Catálogo Flow

Execute `npm ci` e `npm run storybook` na raiz do repositório. O catálogo possui 20 histórias em **Flow / Design system**, incluindo conexões editáveis, com controles para os temas Escuro, Papel, Azul e Grafite.

O guia de tokens, estados, componentes e contribuições está em [Design system Flow](../docs/design-system-flow.md).

Para exportar: `npm run build-storybook`. Para compilar apenas as histórias: `npm run build-storybook:preview`.

As histórias usam um cofre em memória. Chamadas `/api/*` são bloqueadas pela configuração do catálogo; nenhuma história confirma publicação em uma VPS.

Na verificação local em Windows, TypeScript e a compilação da prévia das histórias passaram. A construção do painel de navegação do Storybook encontrou uma restrição de leitura de diretórios ancestrais pelo esbuild no sandbox. A prévia compilada permite verificar os componentes, mas não equivale a validar esse painel nem executar o addon de acessibilidade.
