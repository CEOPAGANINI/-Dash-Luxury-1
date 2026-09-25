/*
  O catálogo das credenciais que o painel conhece, para a página de
  Configurações: cada serviço com as variáveis de ambiente que o código
  realmente lê, onde ele é usado e se as variáveis estão presentes.

  É a verificação honesta de sempre: presença da variável, nunca o valor,
  e "presente" ainda não quer dizer "conexão validada". A função é pura
  (recebe o env) para o teste não depender do ambiente.
*/

export interface VariavelDeAmbiente {
  nome: string;
  presente: boolean;
  /** Opcional: só listada, sem entrar na conta do "configurado". */
  opcional?: boolean;
}

export interface ServicoConfiguravel {
  id: string;
  nome: string;
  descricao: string;
  /** Onde o painel usa este serviço (rota ou área). */
  usadoEm: string;
  /** Cor semântica do avatar-ícone, no padrão 10/20/400 do DevMode. */
  cor: "emerald" | "indigo" | "orange" | "blue" | "zinc";
  grupo: "essencial" | "pagamentos" | "anuncios" | "outros";
  variaveis: VariavelDeAmbiente[];
  configurado: boolean;
}

type Env = Record<string, string | undefined>;

function servico(
  env: Env,
  base: Omit<ServicoConfiguravel, "variaveis" | "configurado">,
  nomes: (string | [nome: string, opcional: true])[],
  regra?: (variaveis: VariavelDeAmbiente[]) => boolean,
): ServicoConfiguravel {
  const variaveis = nomes.map((n) => {
    const [nome, opcional] = Array.isArray(n) ? n : [n, undefined];
    return { nome, presente: Boolean(env[nome]), opcional };
  });
  return {
    ...base,
    variaveis,
    configurado: regra
      ? regra(variaveis)
      : variaveis.filter((v) => !v.opcional).every((v) => v.presente),
  };
}

export function catalogoDeServicos(env: Env): ServicoConfiguravel[] {
  return [
    servico(
      env,
      {
        id: "banco",
        nome: "Banco de dados (Postgres)",
        descricao: "Sem ele o painel inteiro fica no modo demonstração.",
        usadoEm: "Todas as páginas",
        cor: "emerald",
        grupo: "essencial",
      },
      ["DATABASE_URL"],
    ),
    servico(
      env,
      {
        id: "supabase",
        nome: "Supabase (login, auth, realtime)",
        descricao: "Login de verdade, sessões e RLS.",
        usadoEm: "Login e sessão",
        cor: "emerald",
        grupo: "essencial",
      },
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ),
    servico(
      env,
      {
        id: "cripto",
        nome: "Criptografia das integrações",
        descricao:
          "Chave que protege os segredos guardados no banco (Meta, Google, Pushcut).",
        usadoEm: "/integracoes e /notificacoes",
        cor: "emerald",
        grupo: "essencial",
      },
      [
        ["ENCRYPTION_KEY", true],
        ["SUPABASE_SERVICE_ROLE_KEY", true],
      ],
      // Basta uma das duas: a ENCRYPTION_KEY, ou a service role como reserva.
      (variaveis) => variaveis.some((v) => v.presente),
    ),
    servico(
      env,
      {
        id: "app-url",
        nome: "Endereço público do painel",
        descricao: "Usado nos retornos de OAuth e nos links de e-mail.",
        usadoEm: "OAuth e e-mails",
        cor: "zinc",
        grupo: "essencial",
      },
      ["NEXT_PUBLIC_APP_URL"],
    ),
    servico(
      env,
      {
        id: "oauth-meta",
        nome: "OAuth do Meta Ads",
        descricao: "Botão “Conectar com o Meta” em Integrações.",
        usadoEm: "/integracoes",
        cor: "blue",
        grupo: "anuncios",
      },
      ["META_APP_ID", "META_APP_SECRET"],
    ),
    servico(
      env,
      {
        id: "oauth-google",
        nome: "OAuth do Google Ads",
        descricao: "Botão “Conectar com o Google” e o token de desenvolvedor.",
        usadoEm: "/integracoes",
        cor: "blue",
        grupo: "anuncios",
      },
      [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        ["GOOGLE_ADS_DEVELOPER_TOKEN", true],
      ],
    ),
    servico(
      env,
      {
        id: "utmify",
        nome: "UTMify",
        descricao: "Rastreamento de conversões.",
        usadoEm: "Tráfego",
        cor: "orange",
        grupo: "anuncios",
      },
      ["UTMIFY_API_TOKEN"],
    ),
    servico(
      env,
      {
        id: "broski",
        nome: "Broski (gateway principal)",
        descricao: "MB WAY e Multibanco — Portugal (EUR). Adapter pronto.",
        usadoEm: "/gateways e /financeiro",
        cor: "indigo",
        grupo: "pagamentos",
      },
      ["BROSKI_API_KEY", "BROSKI_WEBHOOK_SECRET"],
    ),
    servico(
      env,
      {
        id: "stripe",
        nome: "Stripe",
        descricao: "Gateway de pagamento.",
        usadoEm: "/gateways",
        cor: "indigo",
        grupo: "pagamentos",
      },
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    ),
    servico(
      env,
      {
        id: "mercado-pago",
        nome: "Mercado Pago",
        descricao: "Gateway de pagamento.",
        usadoEm: "/gateways",
        cor: "indigo",
        grupo: "pagamentos",
      },
      ["MERCADO_PAGO_ACCESS_TOKEN"],
    ),
    servico(
      env,
      {
        id: "pagarme",
        nome: "Pagar.me",
        descricao: "Gateway de pagamento.",
        usadoEm: "/gateways",
        cor: "indigo",
        grupo: "pagamentos",
      },
      ["PAGARME_API_KEY"],
    ),
    servico(
      env,
      {
        id: "asaas",
        nome: "Asaas",
        descricao: "Gateway de pagamento.",
        usadoEm: "/gateways",
        cor: "indigo",
        grupo: "pagamentos",
      },
      ["ASAAS_API_KEY"],
    ),
    servico(
      env,
      {
        id: "resend",
        nome: "Resend (e-mails)",
        descricao: "E-mails transacionais e campanhas.",
        usadoEm: "/emails",
        cor: "orange",
        grupo: "outros",
      },
      ["RESEND_API_KEY", ["RESEND_FROM_EMAIL", true]],
    ),
    servico(
      env,
      {
        id: "upstash",
        nome: "Upstash Redis",
        descricao: "Rate limiting, cache e filas.",
        usadoEm: "APIs",
        cor: "orange",
        grupo: "outros",
      },
      ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ),
    servico(
      env,
      {
        id: "vps",
        nome: "Servidores (VPS)",
        descricao:
          "A chave mestra do agente e as regras de acesso da área Servidor.",
        usadoEm: "/servidor",
        cor: "zinc",
        grupo: "outros",
      },
      [
        "VPS_CHAVE_MESTRA",
        ["VPS_DONOS", true],
        ["VPS_CHECKOUT_ORIGENS", true],
        ["VPS_LOGIN_RECENTE_HORAS", true],
      ],
    ),
  ];
}

/* Os cofres locais deste navegador que a página de Configurações sabe
   limpar: arrumações e rascunhos, nunca dados do banco. */
export const COFRES_LOCAIS: { chave: string; rotulo: string }[] = [
  { chave: "dash-luxury:block-tags:v1", rotulo: "Tags dos blocos do quadro" },
  { chave: "dash-luxury:blocos:v1", rotulo: "Tamanhos e blocos criados" },
  {
    chave: "dash-luxury:campaign-classes:v1",
    rotulo: "Campanhas em cada bloco",
  },
  {
    chave: "dash-luxury:ordem-painel-campanha:v1",
    rotulo: "Ordem do painel da campanha",
  },
  { chave: "dash-luxury:ordem-metricas:v1", rotulo: "Ordem das métricas" },
  {
    chave: "dash-luxury:card-notes:v1",
    rotulo: "Notas e etiquetas dos cartões",
  },
  { chave: "dash-classes-ordem-pilares", rotulo: "Ordem dos pilares" },
  { chave: "dash-luxury:pilares-fixos:v1", rotulo: "Pilares fixados" },
  {
    chave: "dash-luxury:roas-historico:v1",
    rotulo: "Histórico de ROAS dos blocos",
  },
  {
    chave: "dash-luxury:roas-campanhas:v1",
    rotulo: "Histórico de ROAS das campanhas",
  },
  {
    chave: "dash-luxury:campaign-sandbox:v1",
    rotulo: "Alterações de demonstração",
  },
  {
    chave: "dash-luxury:checkout-editor:v1",
    rotulo: "Rascunho do editor de checkout",
  },
  { chave: "dash-global-filters-v1", rotulo: "Filtros globais do dashboard" },
  { chave: "dash-5-unified-context", rotulo: "Período e funil escolhidos" },
  { chave: "dash-operation-funnel-v1", rotulo: "Funil da operação" },
  { chave: "dashboard-ceo-saved-view", rotulo: "Visão salva do executivo" },
  { chave: "dashboard-ceo-action-plan", rotulo: "Plano de ação do executivo" },
];
