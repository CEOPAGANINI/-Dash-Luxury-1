/**
 * As fontes de dados que o painel sabe conectar — e o formato do que fica
 * guardado sobre cada uma.
 *
 * Este módulo não tem "use client" nem acesso a banco de propósito: é lido
 * pelo servidor (ações, rotas de OAuth) e pelo navegador (placas e
 * checklist), e precisa ser a mesma lista dos dois lados.
 */

export type ConnectionId =
  "meta" | "google" | "youtube" | "gateway" | "shopify";

export interface ConnectionMeta {
  id: ConnectionId;
  name: string;
  category: string;
  /** A cor da fonte, a mesma que os painéis usam para ela. */
  color: string;
  /** O que aparece de verdade no painel quando esta fonte sincronizar. */
  unlocks: string;
}

/*
  A lista única das fontes — o checklist e a página de conexão leem daqui.

  A cor de cada fonte é identidade, não estado: são degraus de cinza, para
  não competir com o verde, amarelo e vermelho que no painel só aparecem
  quando existe meta atrás do número.
*/
export const CONNECTION_META: ConnectionMeta[] = [
  {
    id: "meta",
    name: "Meta Ads",
    category: "Facebook e Instagram",
    color: "#f5f5f5",
    unlocks: "Gasto, ROAS, campanhas e criativos do Meta na Gestão de Tráfego.",
  },
  {
    id: "google",
    name: "Google Ads",
    category: "Pesquisa e display",
    color: "#d0d0d0",
    unlocks: "Gasto, ROAS e campanhas do Google na Gestão de Tráfego.",
  },
  {
    id: "youtube",
    name: "YouTube Ads",
    category: "Vídeo, via Google Ads",
    color: "#ababab",
    unlocks: "Gasto e retorno dos vídeos, com gancho e retenção nos criativos.",
  },
  {
    id: "gateway",
    name: "Gateway de pagamento",
    category: "Checkout",
    color: "#888888",
    unlocks:
      "Recebido, pendente e recusado reais no calendário e na receita por hora.",
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Loja",
    color: "#676767",
    unlocks: "Pedidos, ticket médio e receita confirmada da loja.",
  },
];

export const CONNECTION_IDS = CONNECTION_META.map((item) => item.id);

export function isConnectionId(value: unknown): value is ConnectionId {
  return (
    typeof value === "string" && CONNECTION_IDS.includes(value as ConnectionId)
  );
}

export interface StoredConnection {
  id: ConnectionId;
  /** Identificador público da conta — nunca o segredo. */
  identifier: string;
  /** Máscara do token, só para a pessoa reconhecer qual usou. */
  tokenMask: string;
  /** Quando foi configurada, em ISO. */
  connectedAt: string;
  /** Como a credencial chegou: digitada ou autorizada na plataforma. */
  via: "form" | "oauth";
}

export type ConnectionsState = Partial<Record<ConnectionId, StoredConnection>>;

/** "shpat_a1b2…9y8z" — o suficiente para reconhecer, inútil para usar. */
export function maskSecret(secret: string): string {
  const clean = secret.trim();
  if (clean.length <= 8) return "••••";
  return `${clean.slice(0, 5)}…${clean.slice(-4)}`;
}
