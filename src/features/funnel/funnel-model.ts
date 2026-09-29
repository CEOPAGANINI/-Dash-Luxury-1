/**
 * O modelo do quadro de funil.
 *
 * Extraído do editor de funil do SellFlux (app.sellflux.com/funnel/planner):
 * o registro de tipos de nó vem do bundle de produção, os rótulos e os
 * painéis "Recursos" e "Ícones" vêm da interface. Aqui ficam só os dados —
 * o desenho está em funnel.css e o comportamento em funnel-board.tsx.
 */

import type { RedirectRule } from "@/features/offer-router/offer-router-model";

/** As chaves de tipo de nó registradas no editor (nodeTypes do bundle). */
export type FunnelNodeType =
  | "page_v3"
  | "quiz"
  | "campaign"
  | "group_campaign"
  | "lead_list"
  | "report"
  | "shortcut_url"
  | "link_test_ab"
  | "link_split"
  | "link_countries"
  | "link_whats"
  | "pipeline"
  | "pipeline_ticket"
  | "pipeline_attendance"
  | "agents"
  | "device"
  | "webhooks"
  | "internal_doc"
  | "ad"
  | "comment"
  | "brand"
  // Blocos do funil de vendas (nomes do dono): páginas e o redirecionador.
  | "optin"
  | "vsl"
  | "sales"
  | "checkout"
  | "upsell"
  | "downsell"
  | "thanks"
  | "webinar"
  | "members"
  | "redirect"
  // Anotações do quadro (mapa mental): post-it, texto, forma, moldura.
  | "note"
  | "text"
  | "shape"
  | "frame";

/** Nome do ícone do lucide-react usado por cada recurso. */
export type LucideName =
  | "FileText"
  | "ListChecks"
  | "Clock"
  | "Users"
  | "List"
  | "BarChart3"
  | "ExternalLink"
  | "FlaskConical"
  | "Split"
  | "Globe"
  | "MessageCircle"
  | "DollarSign"
  | "Ticket"
  | "MessagesSquare"
  | "Bot"
  | "Smartphone"
  | "Plug"
  | "BookOpen"
  | "ImageIcon"
  | "MessageSquare"
  | "Shuffle"
  | "UserPlus"
  | "Video"
  | "ShoppingBag"
  | "CreditCard"
  | "TrendingUp"
  | "TrendingDown"
  | "PartyPopper"
  | "Presentation"
  | "GraduationCap"
  | "Mail"
  | "StickyNote"
  | "Type"
  | "Shapes"
  | "Frame";

/** Um item do painel "Recursos" — cada um cria um nó ao ser solto no fluxo. */
export interface RecursoDef {
  type: FunnelNodeType;
  label: string;
  icon: LucideName;
  /** Família do painel "Recursos" (páginas, tráfego, automação, outros). */
  familia: FamiliaRecurso;
  /** Caminho sugerido ao criar (só páginas), ex.: "/checkout". */
  slug?: string;
}

export type FamiliaRecurso = "paginas" | "trafego" | "automacao" | "anotacoes" | "outros";

/** Rótulo de cada família, na ordem do painel. */
export const FAMILIAS: { id: FamiliaRecurso; nome: string }[] = [
  { id: "paginas", nome: "Páginas do funil" },
  { id: "trafego", nome: "Tráfego e links" },
  { id: "automacao", nome: "Automação e vendas" },
  { id: "anotacoes", nome: "Anotações" },
  { id: "outros", nome: "Outros" },
];

/**
 * O painel "Recursos": os 20 recursos arrastáveis, na ordem em que o
 * editor os mostra. `type` casa com o registro de nós acima.
 */
export const RECURSOS: RecursoDef[] = [
  // ── Páginas do funil (nomes do dono) ─────────────────────────────
  { type: "page_v3", label: "Landing Page", icon: "FileText", familia: "paginas", slug: "/landing-page" },
  { type: "optin", label: "Página de Captura", icon: "UserPlus", familia: "paginas", slug: "/captura" },
  { type: "vsl", label: "VSL (vídeo de vendas)", icon: "Video", familia: "paginas", slug: "/vsl" },
  { type: "sales", label: "Página de Vendas", icon: "ShoppingBag", familia: "paginas", slug: "/vendas" },
  { type: "checkout", label: "Checkout", icon: "CreditCard", familia: "paginas", slug: "/checkout" },
  { type: "upsell", label: "Upsell", icon: "TrendingUp", familia: "paginas", slug: "/upsell" },
  { type: "downsell", label: "Downsell", icon: "TrendingDown", familia: "paginas", slug: "/downsell" },
  { type: "thanks", label: "Página de Obrigado", icon: "PartyPopper", familia: "paginas", slug: "/obrigado" },
  { type: "quiz", label: "Quiz", icon: "ListChecks", familia: "paginas", slug: "/quiz" },
  { type: "webinar", label: "Webinar", icon: "Presentation", familia: "paginas", slug: "/webinar" },
  { type: "members", label: "Área de Membros", icon: "GraduationCap", familia: "paginas", slug: "/membros" },
  // ── Tráfego e links ───────────────────────────────────────────────
  { type: "ad", label: "Anúncio", icon: "ImageIcon", familia: "trafego" },
  { type: "redirect", label: "Redirecionador", icon: "Shuffle", familia: "trafego" },
  { type: "shortcut_url", label: "Link / Atalho", icon: "ExternalLink", familia: "trafego" },
  { type: "link_test_ab", label: "Teste A/B", icon: "FlaskConical", familia: "trafego" },
  { type: "link_split", label: "Divisor de Tráfego", icon: "Split", familia: "trafego" },
  { type: "link_countries", label: "Link por País", icon: "Globe", familia: "trafego" },
  { type: "link_whats", label: "Link do WhatsApp", icon: "MessageCircle", familia: "trafego" },
  // ── Automação e vendas ────────────────────────────────────────────
  { type: "campaign", label: "Automação de E-mail", icon: "Mail", familia: "automacao" },
  { type: "group_campaign", label: "Automação em Grupo", icon: "Users", familia: "automacao" },
  { type: "lead_list", label: "Lista de Leads", icon: "List", familia: "automacao" },
  { type: "pipeline", label: "Vendas (CRM)", icon: "DollarSign", familia: "automacao" },
  { type: "pipeline_ticket", label: "Suporte (Tickets)", icon: "Ticket", familia: "automacao" },
  { type: "pipeline_attendance", label: "Atendimento", icon: "MessagesSquare", familia: "automacao" },
  { type: "agents", label: "Agente de IA", icon: "Bot", familia: "automacao" },
  { type: "webhooks", label: "Integração (Webhook)", icon: "Plug", familia: "automacao" },
  // ── Anotações (mapa mental) ───────────────────────────────────────
  { type: "note", label: "Post-it", icon: "StickyNote", familia: "anotacoes" },
  { type: "text", label: "Texto", icon: "Type", familia: "anotacoes" },
  { type: "shape", label: "Forma", icon: "Shapes", familia: "anotacoes" },
  { type: "frame", label: "Moldura", icon: "Frame", familia: "anotacoes" },
  { type: "comment", label: "Comentário", icon: "MessageSquare", familia: "anotacoes" },
  // ── Outros ────────────────────────────────────────────────────────
  { type: "report", label: "Relatório", icon: "BarChart3", familia: "outros" },
  { type: "device", label: "Aparelho", icon: "Smartphone", familia: "outros" },
  { type: "internal_doc", label: "Documento", icon: "BookOpen", familia: "outros" },
];

/** Os tipos que são anotações do quadro (sem alças, com redimensionar). */
export const TIPOS_ANOTACAO: ReadonlySet<FunnelNodeType> = new Set<FunnelNodeType>([
  "note",
  "text",
  "shape",
  "frame",
  "comment",
]);

/** Os tipos que são páginas (têm endereço e abrem o publicador). */
export const TIPOS_PAGINA: ReadonlySet<FunnelNodeType> = new Set<FunnelNodeType>(
  RECURSOS.filter((r) => r.familia === "paginas").map((r) => r.type),
);

/** Um selo de origem de tráfego do painel "Ícones" — vira um nó `brand`. */
export interface MarcaDef {
  id: string;
  label: string;
  /** Cor da plataforma; o selo é um disco nessa cor. */
  cor: string;
  /** Sigla mostrada dentro do disco (não temos os logos originais). */
  sigla: string;
}

/**
 * O painel "Ícones": os selos de plataforma de tráfego, na ordem do editor.
 * As cores são as das marcas; a sigla substitui o logo, que não copiamos.
 */
export const MARCAS: MarcaDef[] = [
  { id: "carrinho", label: "Carrinho de Compras", cor: "#ef4444", sigla: "🛒" },
  {
    id: "afiliados",
    label: "Programa de Afiliados",
    cor: "#22c55e",
    sigla: "AF",
  },
  { id: "bing", label: "Bing", cor: "#0c8484", sigla: "b" },
  { id: "chatbot", label: "Chatbot", cor: "#2563eb", sigla: "CB" },
  { id: "chat", label: "Chat", cor: "#3b82f6", sigla: "Ch" },
  { id: "whatsapp", label: "WhatsApp", cor: "#25d366", sigla: "Wa" },
  { id: "email", label: "E-mail", cor: "#2f80ed", sigla: "@" },
  { id: "facebook", label: "Facebook", cor: "#1877f2", sigla: "f" },
  { id: "google_ads", label: "Google Ads", cor: "#34a853", sigla: "GA" },
  { id: "instagram", label: "Instagram", cor: "#e1306c", sigla: "Ig" },
  { id: "linkedin", label: "LinkedIn", cor: "#0a66c2", sigla: "in" },
  { id: "messenger", label: "Messenger", cor: "#0084ff", sigla: "M" },
  { id: "pinterest", label: "Pinterest", cor: "#e60023", sigla: "P" },
  { id: "relatorio", label: "Relatório", cor: "#6b7280", sigla: "R" },
  { id: "snapchat", label: "Snapchat", cor: "#fffc00", sigla: "Sn" },
  { id: "tiktok", label: "TikTok", cor: "#111111", sigla: "Tk" },
  { id: "twitter", label: "Twitter", cor: "#1da1f2", sigla: "Tw" },
  { id: "youtube", label: "YouTube", cor: "#ff0000", sigla: "Yt" },
  { id: "produto", label: "Produto", cor: "#7c3aed", sigla: "Pr" },
  { id: "upsell", label: "UpSell/DownSell", cor: "#0ea5e9", sigla: "Up" },
  { id: "obrigado", label: "Página de Obrigado", cor: "#16a34a", sigla: "Ok" },
];

/** Rótulo curto por tipo, usado no selo de tipo do nó. */
export const ROTULO_TIPO: Record<FunnelNodeType, string> = {
  page_v3: "Landing Page",
  optin: "Captura",
  vsl: "VSL",
  sales: "Vendas",
  checkout: "Checkout",
  upsell: "Upsell",
  downsell: "Downsell",
  thanks: "Obrigado",
  quiz: "Quiz",
  webinar: "Webinar",
  members: "Membros",
  ad: "Anúncio",
  redirect: "Redirecionador",
  shortcut_url: "Link",
  link_test_ab: "Teste A/B",
  link_split: "Divisor",
  link_countries: "Por país",
  link_whats: "WhatsApp",
  campaign: "E-mail",
  group_campaign: "Grupo",
  lead_list: "Leads",
  pipeline: "CRM",
  pipeline_ticket: "Suporte",
  pipeline_attendance: "Atendimento",
  agents: "Agente IA",
  webhooks: "Integração",
  report: "Relatório",
  device: "Aparelho",
  internal_doc: "Documento",
  comment: "Comentário",
  note: "Post-it",
  text: "Texto",
  shape: "Forma",
  frame: "Moldura",
  brand: "Origem",
};

/** Índice de recurso por tipo, para achar rótulo e ícone ao criar um nó. */
export const RECURSO_POR_TIPO: Record<string, RecursoDef> = Object.fromEntries(
  RECURSOS.map((r) => [r.type, r]),
);

/**
 * Uma regra do bloco Redirecionador: a mesma regra do roteador de ofertas
 * (região, aparelho, sistema, rede, origem ou fatia), mas o destino pode
 * ser um bloco do próprio quadro — aí a linha até ele é desenhada sozinha.
 */
export interface RegraRedir extends RedirectRule {
  /** Id do bloco de destino no quadro (quando o destino é um bloco). */
  destinoNoId?: string;
  /** Estilo da linha desenhada até o destino. */
  estilo?: EstiloLinha;
}

/** Aparência de um bloco (inspetor de estilo). */
export interface EstiloNo {
  /** Cor de destaque do bloco (ícone e borda). */
  cor?: string;
  /** Espessura da borda (1 = fina, 3 = grossa). */
  borda?: 1 | 2 | 3;
  /** Tamanho do nome. */
  texto?: "normal" | "grande";
  negrito?: boolean;
}

/** Aparência do mapa inteiro (fundo, linhas). */
export interface EstiloMapa {
  fundo?: "pontos" | "grade" | "liso";
  /** Cor padrão das linhas sem cor própria. */
  corLinha?: string;
  /** Fluxo animado em todas as linhas. */
  fluxo?: boolean;
}

/** O que um bloco Redirecionador guarda. */
export interface RedirNode {
  regras: RegraRedir[];
}

/** Um nó posicionado no quadro. */
export interface FunnelNode {
  id: string;
  type: FunnelNodeType;
  x: number;
  y: number;
  /** Nome mostrado no cabeçalho do nó. */
  title: string;
  /** URL/subtítulo (nós de página). */
  url?: string;
  /** Título da landing (nós de página) — editado dentro do nó. */
  headline?: string;
  /** Descrição da landing (nós de página) — editada dentro do nó. */
  descricao?: string;
  /** Cor do selo (nós `brand`). */
  cor?: string;
  sigla?: string;
  /** Dados do publicador (nós de página) — só interface, demonstração. */
  pagina?: DadosPagina;
  /** As regras do bloco Redirecionador (nós `redirect`). */
  redir?: RedirNode;
  /** Aparência do bloco (cor, borda, texto). */
  estilo?: EstiloNo;
  /** Largura/altura (anotações redimensionáveis). */
  w?: number;
  h?: number;
  /** Forma geométrica (nós `shape`). */
  forma?: "retangulo" | "circulo" | "losango";
  /** A conversa de um comentário. */
  mensagens?: Mensagem[];
}

/** Uma mensagem na conversa de um comentário. */
export interface Mensagem {
  autor: string;
  texto: string;
  /** Data/hora já formatada (pt-BR). */
  quando: string;
}

/* ── Publicador da página (só a interface, demonstração) ──────────────────
   O bloco "Página" ganha as funções do publicador: escolher domínio e
   caminho, arrastar o ZIP para conferir, SEO, rastreio (pixels), proteção,
   velocidade (Turbo) e as saídas ligadas às próximas etapas. Nada publica
   nem sobe ZIP de verdade — o botão Publicar fica em "VPS não conectada". */

export interface PaginaSaida {
  /** Próxima etapa do funil (id de um nó), quando ligada a uma. */
  etapaId?: string;
  /** Ou um link manual. */
  url?: string;
}

export interface ProtecaoPagina {
  cliqueDireito?: boolean;
  atalhos?: boolean;
  selecao?: boolean;
  imagens?: boolean;
  devtools?: boolean;
}

export interface VelocidadePagina {
  imagens?: boolean;
  lazy?: boolean;
  fontes?: boolean;
  minificar?: boolean;
  comprimir?: boolean;
  cache?: boolean;
}

/** Bloqueios de busca/rastreamento da página (só interface). */
export interface IndexacaoPagina {
  /** noindex — não aparecer no Google. */
  noindex?: boolean;
  /** nofollow — robôs não seguem os links da página. */
  nofollow?: boolean;
  /** Fora do sitemap.xml e do sitemap index. */
  foraDoSitemap?: boolean;
  /** Disallow no robots.txt para este caminho. */
  robotsDisallow?: boolean;
  /** noarchive + nosnippet — sem cache e sem trecho nos resultados. */
  semCacheTrecho?: boolean;
  /** noimageindex — imagens da página não indexam. */
  semImagens?: boolean;
  /** Bloquear robôs de IA (GPTBot, ClaudeBot, CCBot, Google-Extended…). */
  bloquearIA?: boolean;
}

/**
 * Back redirect (só interface): quando o visitante aperta "voltar" ou
 * tenta sair, é enviado para outra página — a oferta mais barata.
 */
export interface BackRedirect {
  ligado?: boolean;
  /** Para onde mandar: uma etapa do funil ou um link manual. */
  destinoEtapaId?: string;
  url?: string;
  /** O que dispara o desvio. */
  botaoVoltar?: boolean;
  fecharAba?: boolean;
  mouseSaindo?: boolean;
  inatividade?: boolean;
  /** Segundos parado até contar como inatividade. */
  inatividadeSeg?: number;
  /** Segundos na página antes de armar o desvio (evita disparar cedo). */
  armarApos?: number;
  /** Só uma vez por visita (não fica preso em loop). */
  umaVez?: boolean;
  /** Levar os parâmetros UTM junto para a página de destino. */
  repassarUtm?: boolean;
}

export interface DadosPagina {
  /** Domínio da VPS (ex.: loja-suprema.com). */
  dominio?: string;
  /** Caminho no domínio (ex.: "/nova-pagina" ou "/"). */
  caminho: string;
  meta: {
    titulo?: string;
    descricao?: string;
    imagem?: string;
    faviconPng?: string;
    esconderDoGoogle?: boolean;
    metaPixel?: string;
    ga4?: string;
    gtm?: string;
    clarity?: string;
    repassarUtm?: boolean;
    protecao?: ProtecaoPagina;
    velocidade?: VelocidadePagina | false;
    indexacao?: IndexacaoPagina;
  };
  /** Back redirect: desvio ao voltar/sair para a oferta mais barata. */
  backRedirect?: BackRedirect;
  /** nome da saída (data-saida no HTML) → próxima etapa ou link manual. */
  saidas: Record<string, PaginaSaida>;
  /** O último ZIP conferido (só nome/tamanho — demonstração). */
  zip?: { nome: string; tamanho: number; ok: boolean };
}

/** Uma página nova em branco para o publicador. */
export function paginaVazia(): DadosPagina {
  return {
    caminho: "/nova-pagina",
    meta: { repassarUtm: true, velocidade: {} },
    saidas: {},
  };
}

/** Uma ligação saída → entrada entre dois nós. */
/** Estilo de uma linha (ligação) do quadro — como no Miro/Funnelytics. */
export interface EstiloLinha {
  /** Curva (padrão), reta, cotovelo (90°) ou livre (com pontos para dobrar). */
  forma?: "curva" | "reta" | "cotovelo" | "livre";
  /** Seta no fim (padrão), nas duas pontas ou nenhuma. */
  pontas?: "fim" | "ambas" | "nenhuma";
  tracejada?: boolean;
  /** Tracinhos andando na direção do fluxo. */
  fluxo?: boolean;
  cor?: string;
  espessura?: 1 | 2 | 3;
  /** Pontos de controle (mundo) da forma "livre". */
  pontos?: { x: number; y: number }[];
}

export interface FunnelEdge {
  id: string;
  source: string;
  target: string;
  estilo?: EstiloLinha;
  /** Texto mostrado no meio da linha (ex.: a regra que a desenhou). */
  rotulo?: string;
}

/** Todo o estado persistível de um funil. */
export interface FunnelData {
  id: string;
  nome: string;
  projeto: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  /** Aparência do mapa (fundo, cor das linhas, fluxo). */
  mapa?: EstiloMapa;
}

/** Passo do grid do canvas (snap 20×20), igual ao editor de origem. */
export const GRID = 20;
/** Largura fixa do card de nó. */
export const NODE_W = 280;

/**
 * Um endereço é "configurado" quando é um caminho interno (começa com /)
 * ou uma URL http(s) com host. Serve só ao selo de status do nó — não
 * publica nem cria rota, como diz o próprio editor.
 */
export function enderecoConfigurado(url?: string): boolean {
  const t = (url ?? "").trim();
  if (!t) return false;
  if (t.startsWith("/")) return t.length > 1;
  try {
    const u = new URL(t);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}
