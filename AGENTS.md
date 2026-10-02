<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Instruções de colaboração — Dash Luxury

## Identidade e fonte de verdade

- Este é o único dashboard principal da operação Dash Luxury. Reutilize este projeto para novas funcionalidades.
- A marca de interface está em `src/lib/brand.ts`. O nome técnico legado `infinity-dashboard` em `package.json` não deve ser alterado incidentalmente.
- Consulte `PROJECT_MAP.md`, `docs/INFRASTRUCTURE.md`, `docs/PROJECT_REGISTRY.md` e `project-registry.json` antes de mexer em organização, deploy ou conexões. IDs de recursos são mais confiáveis que nomes.
- O registro distingue recursos confirmados de projetos cuja finalidade ainda não foi identificada. Não atribua um projeto desconhecido ao ambiente de produção pelo nome.
- Preserve mudanças de outros colaboradores, inclusive outro Codex usando o mesmo repositório no Mac.

## Arquitetura e organização

- Rotas e endpoints ficam em `src/app`; a lógica e as telas de cada domínio ficam em `src/features/<domínio>`.
- Componentes compartilhados ficam em `src/components`, infraestrutura em `src/lib` e `src/database`, e validações em `src/validations`.
- Mantenha a divisão de domínio, serviços, repositórios e apresentação da arquitetura executiva; consulte `docs/ARCHITECTURE-HARDENING-V2.md`.
- O quadro de campanhas/funil e o roteador de ofertas compartilham `src/features/funnel`. `/roteador-de-ofertas` abre o mesmo quadro com foco no bloco redirecionador; não crie outro editor para esta rota.
- O Agente IA faz parte deste dashboard e reutiliza sua autenticação, operação e integrações. Não crie outro repositório ou projeto Vercel para ele.
- Não mova ou renomeie código apenas para combinar nomes de recursos externos. As reservas GitHub não são fontes alternativas do dashboard.

## Autenticação, dados e integrações

- Produção e previews Vercel exigem autenticação para áreas privadas. Sem Supabase configurado, essas áreas falham fechadas; não habilite sessão demo pública para contornar isso.
- A sessão demo sem autenticação só existe em desenvolvimento/teste local, fora da Vercel. Simuladores de funcionalidades podem existir depois do login, desde que identificados como demonstração.
- Usuário, papel e workspace vêm da sessão validada no servidor. Não confie em identificadores enviados pelo cliente para conceder acesso.
- Preserve isolamento por workspace, verificações de papel, RLS, assinaturas de webhooks/agente VPS e idempotência de ações externas.
- Não misture dados fictícios com dados reais, nem anuncie integração configurada como validada sem verificar uma chamada real.
- Credenciais ficam no servidor e nos cofres/configurações dos provedores. Nunca registre segredos em documentação, commits, logs ou mensagens. Segredos não recebem prefixo `NEXT_PUBLIC_`.
- A IA analisa e gera rascunhos. Não descreva sugestões como anúncios publicados, mudanças de verba, DNS ou infraestrutura executadas.

## Infraestrutura e banco

- Preserve `https://dashboardatual.vercel.app` durante renomeações. Renomear recurso não autoriza excluir/recriar projeto, mudar região, migrar banco, alterar DNS ou trocar domínio.
- O projeto Supabase confirmado de produção é `dzjvmbfgytbhhpkcaxei`. Não atribua ao dashboard os três projetos inativos de finalidade ainda não confirmada.
- O build executa `scripts/prepare-production-schema.mjs`. Esse script contém guardas para a Vercel de produção e o banco registrados e prepara apenas `0007_funnel_storage.sql` e `0008_rate_limits.sql`.
- Não amplie os alvos do script, enfraqueça as guardas ou execute migrations em projetos não confirmados como efeito colateral de organização.

## Interface e validação

- Preserve a identidade visual e a navegação existentes. O painel usa temas claro/escuro, tokens semânticos e cantos retos; uma regra global de raio zero vence defaults arredondados do UI kit.
- Use componentes existentes e confira estilos finais do tema antes de assumir que uma classe base define a aparência efetiva.
- Execute verificações proporcionais à mudança: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`, conforme o escopo e o ambiente disponível.
- Para domínio executivo, use também `npm run typecheck:domain` e `npm run test:architecture` quando afetado.
- Não descreva testes não executados como aprovados. Diferencie falhas novas de problemas preexistentes e registre limitações relevantes.
- Ao publicar, confirme o deploy do projeto correto e as rotas afetadas. Não atribua funcionamento real a rotas que implementam somente configuração, interface ou simulação.
