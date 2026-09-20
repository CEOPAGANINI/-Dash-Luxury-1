# Estrutura do projeto

```text
.
├── .github/workflows/    # automações de qualidade no GitHub
├── docs/                 # arquitetura, banco, deploy e decisões técnicas
├── public/               # imagens e arquivos servidos diretamente
├── scripts/              # tarefas auxiliares executadas por Node.js
├── src/
│   ├── app/              # rotas, layouts, páginas e endpoints do Next.js
│   ├── components/       # componentes compartilhados e elementos de interface
│   ├── database/         # cliente, schema, migrations e seeds
│   ├── features/         # regras e telas agrupadas por domínio do produto
│   ├── lib/              # integrações e utilitários reutilizáveis
│   ├── payment-providers/# contratos e implementações de pagamentos
│   └── validations/      # schemas de validação com Zod
└── tests/unit/           # testes unitários
```

## Regra de organização

Arquivos específicos de uma função ficam dentro de `src/features/<domínio>`.
Componentes usados em vários domínios ficam em `src/components`.
Código de infraestrutura fica em `src/lib` ou `src/database`.

Não mova arquivos apenas por estética. Uma mudança de caminho exige atualizar os
imports e executar `npm run lint`, `npm run typecheck`, `npm run test` e
`npm run build`.
