import type { SecurityCheck } from "./model";

const auditedAt = "2026-10-02";

export const auditedSecurityChecks: SecurityCheck[] = [
  {
    id: "github-private-repository",
    title: "Código em repositório privado",
    description: "A visibilidade do repositório foi confirmada como privada.",
    detail:
      "Revisão de 02/10/2026. A aplicação não acompanha mudanças de visibilidade na conta do GitHub automaticamente.",
    status: "active",
    source: "audit",
    category: "github",
    checkedAt: auditedAt,
    actionHref: "https://github.com/CEOPAGANINI/dash-luxury-dashboard/settings",
    actionLabel: "Revisar repositório",
  },
  {
    id: "github-email-privacy",
    title: "E-mail protegido nos novos commits",
    description:
      "Privacidade do e-mail e bloqueio de envios que exponham o endereço foram confirmados.",
    detail:
      "A proteção vale para novos envios. O histórico anterior não foi reescrito. Preferências pessoais exigem revisão na conta.",
    status: "active",
    source: "audit",
    category: "github",
    checkedAt: auditedAt,
    actionHref: "https://github.com/settings/emails",
    actionLabel: "Revisar privacidade do e-mail",
  },
  {
    id: "github-dependency-protection",
    title: "Alertas de segurança das dependências",
    description:
      "Inventário de dependências, alertas de vulnerabilidades e malware e atualizações de segurança foram ativados.",
    detail:
      "Os quatro recursos gratuitos foram confirmados na revisão. A aplicação não lê essas preferências do GitHub em tempo real.",
    status: "active",
    source: "audit",
    category: "github",
    checkedAt: auditedAt,
    actionHref:
      "https://github.com/CEOPAGANINI/dash-luxury-dashboard/settings/security_analysis",
    actionLabel: "Revisar alertas do código",
  },
  {
    id: "github-mfa",
    title: "Autenticação em dois fatores no GitHub",
    description: "A ativação ficou para depois, por decisão do proprietário.",
    detail:
      "Esta etapa deve ser feita na conta pessoal. O painel não cadastra credenciais nem confirma a ativação automaticamente.",
    status: "pending",
    source: "audit",
    category: "github",
    checkedAt: auditedAt,
    actionHref: "https://github.com/settings/security",
    actionLabel: "Abrir segurança do GitHub",
  },
  {
    id: "vercel-model-data-sharing",
    title: "Compartilhamento para modelos desativado",
    description:
      "O uso de dados para aprimorar modelos foi desativado no projeto e na equipe.",
    detail:
      "Preferências confirmadas em 02/10/2026. Mudanças nas configurações externas precisam de nova revisão.",
    status: "active",
    source: "audit",
    category: "vercel",
    checkedAt: auditedAt,
    actionHref: "https://vercel.com/dashboard",
    actionLabel: "Revisar preferências da Vercel",
  },
  {
    id: "vercel-preview-protection",
    title: "Publicações de teste protegidas",
    description:
      "A autenticação da Vercel para previews já estava habilitada e foi confirmada.",
    detail:
      "Essa configuração protege publicações de teste. O painel em produção usa a autenticação da própria aplicação.",
    status: "active",
    source: "audit",
    category: "vercel",
    checkedAt: auditedAt,
    actionHref: "https://vercel.com/dashboard",
    actionLabel: "Revisar proteção de publicações",
  },
  {
    id: "vercel-source-map-protection",
    title: "Mapas do código protegidos",
    description:
      "Mapas do código do navegador foram desativados na produção; a proteção da Vercel já estava habilitada.",
    detail:
      "Verificado na versão publicada em 02/10/2026. O JavaScript necessário às páginas públicas continua acessível aos visitantes.",
    status: "active",
    source: "audit",
    category: "vercel",
    checkedAt: auditedAt,
    actionHref: "https://vercel.com/dashboard",
    actionLabel: "Revisar configurações do projeto",
  },
  {
    id: "vercel-mfa",
    title: "Autenticação em dois fatores na Vercel",
    description: "A ativação ficou para depois, por decisão do proprietário.",
    detail:
      "Esta etapa deve ser feita na conta pessoal. O painel não cadastra credenciais nem confirma a ativação automaticamente.",
    status: "pending",
    source: "audit",
    category: "vercel",
    checkedAt: auditedAt,
    actionHref: "https://vercel.com/account/settings/authentication",
    actionLabel: "Abrir segurança da Vercel",
  },
  {
    id: "privacy-tests-audit",
    title: "Testes de privacidade aprovados",
    description:
      "44 testes de privacidade passaram com dependências reais e a publicação concluiu.",
    detail:
      "Resultado da versão revisada em 02/10/2026. A verificação de tipos cobriu o recorte de privacidade; não foi uma aprovação de todo o repositório.",
    status: "active",
    source: "audit",
    category: "application",
    checkedAt: auditedAt,
  },
  {
    id: "dependency-audit-baseline",
    title: "Revisão das dependências publicada",
    description:
      "A auditoria do pacote corrigido retornou zero vulnerabilidades conhecidas.",
    detail:
      "Resultado do npm audit na revisão de 02/10/2026. Novas vulnerabilidades e alterações de dependências exigem outra auditoria.",
    status: "active",
    source: "audit",
    category: "application",
    checkedAt: auditedAt,
  },
  {
    id: "repository-format-ci",
    title: "Pipeline geral com pendência de formatação",
    description:
      "A revisão encontrou 121 arquivos anteriores à mudança com falhas de formatação.",
    detail:
      "O pipeline interrompeu antes de lint, tipos e testes. Os arquivos do ajuste passaram na formatação e nenhum check foi desativado. Esta é a situação da revisão de 02/10/2026.",
    status: "warning",
    source: "audit",
    category: "application",
    checkedAt: auditedAt,
    actionHref: "https://github.com/CEOPAGANINI/dash-luxury-dashboard/actions",
    actionLabel: "Consultar pipeline atual",
  },
  {
    id: "database-access-preserved",
    title: "Acesso existente preservado no banco",
    description:
      "O ajuste preservou as 15 políticas e as 640 permissões de leitura e escrita existentes.",
    detail:
      "Comparação de metadados em 02/10/2026. A conexão privilegiada do servidor continua exigindo validação de usuário, operação e permissões em cada acesso.",
    status: "active",
    source: "audit",
    category: "database",
    checkedAt: auditedAt,
  },
  {
    id: "database-advisor-deny-by-default",
    title: "Tabelas sem liberação de acesso direto",
    description:
      "O diagnóstico registrou 79 informações de RLS ativa sem política de liberação.",
    detail:
      "Essas tabelas negam acesso direto por padrão. Não foram criadas regras para liberar dados apenas para remover as informações do diagnóstico. A auditoria registrou zero erros e um aviso.",
    status: "active",
    source: "audit",
    category: "database",
    checkedAt: auditedAt,
  },
  {
    id: "database-leaked-password-protection",
    title: "Proteção contra senhas vazadas",
    description:
      "O recurso estava desativado e sua ativação exige Supabase Pro ou superior.",
    detail:
      "Limite do plano gratuito observado em 02/10/2026. Nenhum upgrade foi contratado. Esta pendência não é verificada automaticamente pelo painel.",
    status: "pending",
    source: "audit",
    category: "database",
    checkedAt: auditedAt,
    actionHref: "https://supabase.com/docs/guides/auth/password-security",
    actionLabel: "Consultar requisito do plano",
  },
  {
    id: "cloudflare-origin-protection",
    title: "Proxy e proteção da origem",
    description: "Nenhum túnel ou proxy Cloudflare foi configurado.",
    detail:
      "A configuração depende da definição de domínio e hospedagem sob controle da empresa. Não há proteção Cloudflare ativa nesta entrega.",
    status: "pending",
    source: "planned",
    category: "infrastructure",
    checkedAt: null,
  },
  {
    id: "php-public-hosting",
    title: "Hospedagem do motor de redirecionamento",
    description: "O motor PHP permanece no computador local.",
    detail:
      "É necessário definir uma hospedagem compatível para uso público. Supabase não é uma VPS e nenhuma VPS foi contratada.",
    status: "pending",
    source: "planned",
    category: "infrastructure",
    checkedAt: null,
  },
  {
    id: "business-domain",
    title: "Domínio próprio da empresa",
    description: "Nenhum domínio próprio foi adquirido ou configurado.",
    detail:
      "O endereço atual é fornecido pela hospedagem. A definição de domínio, DNS e origem permanece como etapa de infraestrutura.",
    status: "pending",
    source: "planned",
    category: "infrastructure",
    checkedAt: null,
  },
  {
    id: "commercial-hosting-plan",
    title: "Hospedagem compatível com operação comercial",
    description: "Vercel Hobby exige uso não comercial.",
    detail:
      "É preciso definir um plano ou uma hospedagem compatível antes da operação comercial. Nenhuma compra ou alteração de plano foi feita.",
    status: "warning",
    source: "planned",
    category: "infrastructure",
    checkedAt: null,
    actionHref:
      "https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage",
    actionLabel: "Consultar regras do plano",
  },
  {
    id: "public-information-limits",
    title: "Limites das informações públicas",
    description:
      "Domínio, páginas, anúncios, DNS, certificados e destinos públicos continuam observáveis.",
    detail:
      "O domínio fornecido pela Vercel identifica o provedor. As proteções reduzem exposição de dados privados e não garantem anonimato absoluto ou uma operação invisível.",
    status: "warning",
    source: "audit",
    category: "infrastructure",
    checkedAt: auditedAt,
  },
];
