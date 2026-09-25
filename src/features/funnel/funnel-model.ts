/**
 * O modelo do quadro de funil.
 *
 * Extraído do editor de funil do SellFlux (app.sellflux.com/funnel/planner):
 * o registro de tipos de nó vem do bundle de produção, os rótulos e os
 * painéis "Recursos" e "Ícones" vêm da interface. Aqui ficam só os dados —
 * o desenho está em funnel.css e o comportamento em funnel-board.tsx.
 */

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
  | "brand";

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
  | "MessageSquare";

/** Um item do painel "Recursos" — cada um cria um nó ao ser solto no fluxo. */
export interface RecursoDef {
  type: FunnelNodeType;
  label: string;
  icon: LucideName;
}

/**
 * O painel "Recursos": os 20 recursos arrastáveis, na ordem em que o
 * editor os mostra. `type` casa com o registro de nós acima.
 */
export const RECURSOS: RecursoDef[] = [
  { type: "page_v3", label: "Página v3", icon: "FileText" },
  { type: "quiz", label: "Quiz", icon: "ListChecks" },
  { type: "campaign", label: "Automação Individual", icon: "Clock" },
  { type: "group_campaign", label: "Automação em Grupos", icon: "Users" },
  { type: "lead_list", label: "Lista", icon: "List" },
  { type: "report", label: "Relatório", icon: "BarChart3" },
  { type: "shortcut_url", label: "Atalho", icon: "ExternalLink" },
  { type: "link_test_ab", label: "Teste A/B", icon: "FlaskConical" },
  { type: "link_split", label: "Link Split", icon: "Split" },
  { type: "link_countries", label: "Link Países", icon: "Globe" },
  { type: "link_whats", label: "Link WhatsApp", icon: "MessageCircle" },
  { type: "pipeline", label: "Negócios", icon: "DollarSign" },
  { type: "pipeline_ticket", label: "Tickets", icon: "Ticket" },
  {
    type: "pipeline_attendance",
    label: "Atendimentos",
    icon: "MessagesSquare",
  },
  { type: "agents", label: "Agentes IA (Agents)", icon: "Bot" },
  { type: "device", label: "Dispositivo", icon: "Smartphone" },
  { type: "webhooks", label: "Integração", icon: "Plug" },
  { type: "internal_doc", label: "Documentos da empresa", icon: "BookOpen" },
  { type: "ad", label: "Copy e Anúncios", icon: "ImageIcon" },
  { type: "comment", label: "Comentário", icon: "MessageSquare" },
];

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
  page_v3: "Página v3",
  quiz: "Quiz",
  campaign: "Automação",
  group_campaign: "Grupos",
  lead_list: "Lista",
  report: "Relatório",
  shortcut_url: "Atalho",
  link_test_ab: "Teste A/B",
  link_split: "Link Split",
  link_countries: "Países",
  link_whats: "WhatsApp",
  pipeline: "Negócios",
  pipeline_ticket: "Tickets",
  pipeline_attendance: "Atendimentos",
  agents: "Agente IA",
  device: "Dispositivo",
  webhooks: "Integração",
  internal_doc: "Documento",
  ad: "Anúncio",
  comment: "Comentário",
  brand: "Origem",
};

/** Índice de recurso por tipo, para achar rótulo e ícone ao criar um nó. */
export const RECURSO_POR_TIPO: Record<string, RecursoDef> = Object.fromEntries(
  RECURSOS.map((r) => [r.type, r]),
);

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
  /** Cor do selo (nós `brand`). */
  cor?: string;
  sigla?: string;
}

/** Uma ligação saída → entrada entre dois nós. */
export interface FunnelEdge {
  id: string;
  source: string;
  target: string;
}

/** Todo o estado persistível de um funil. */
export interface FunnelData {
  id: string;
  nome: string;
  projeto: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}

/** Passo do grid do canvas (snap 20×20), igual ao editor de origem. */
export const GRID = 20;
/** Largura fixa do card de nó. */
export const NODE_W = 250;
