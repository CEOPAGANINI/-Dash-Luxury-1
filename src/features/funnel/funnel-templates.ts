/*
  Modelos prontos de funil (Parte 5): um clique monta o quadro inteiro
  com os blocos já ligados. O dono depois troca nomes, endereços e regras.
*/

import type { FunnelData, FunnelEdge, FunnelNode, FunnelNodeType } from "./funnel-model";
import { lojaDemo } from "./store-model";

export interface ModeloFunil {
  id: string;
  nome: string;
  /** Uma frase: para quem serve. */
  para: string;
  /** Os passos, em ordem (viram blocos ligados em linha). */
  passos: { type: FunnelNodeType; title: string; url?: string }[];
  /** Blocos extras fora da linha principal, ligados a um passo. */
  extras?: { type: FunnelNodeType; title: string; url?: string; de: number; abaixo?: boolean }[];
}

export const MODELOS: ModeloFunil[] = [
  {
    id: "lancamento",
    nome: "Lançamento",
    para: "Captura → aquecimento por e-mail → oferta com prazo → checkout → upsell.",
    passos: [
      { type: "ad", title: "Anúncio de inscrição", url: "campanha-lancamento" },
      { type: "optin", title: "Página de inscrição", url: "/inscricao" },
      { type: "campaign", title: "Aquecimento (5 e-mails)", url: "sequência" },
      { type: "sales", title: "Página de vendas", url: "/oferta" },
      { type: "checkout", title: "Checkout", url: "/checkout" },
      { type: "upsell", title: "Upsell", url: "/upsell" },
      { type: "thanks", title: "Obrigado", url: "/obrigado" },
    ],
    extras: [{ type: "downsell", title: "Downsell", url: "/downsell", de: 5, abaixo: true }],
  },
  {
    id: "perpetuo-vsl",
    nome: "Perpétuo com VSL",
    para: "Tráfego direto para um vídeo de vendas, todo dia, com upsell e downsell.",
    passos: [
      { type: "ad", title: "Anúncio", url: "campanha-perpetuo" },
      { type: "vsl", title: "VSL", url: "/vsl" },
      { type: "checkout", title: "Checkout", url: "/checkout" },
      { type: "upsell", title: "Upsell", url: "/upsell" },
      { type: "thanks", title: "Obrigado", url: "/obrigado" },
    ],
    extras: [
      { type: "downsell", title: "Downsell", url: "/downsell", de: 3, abaixo: true },
      { type: "redirect", title: "Redirecionador", de: 1, abaixo: true },
    ],
  },
  {
    id: "loja",
    nome: "Loja (e-commerce)",
    para: "Anúncio → página do produto → checkout → obrigado, com WhatsApp de apoio.",
    passos: [
      { type: "ad", title: "Anúncio do produto", url: "campanha-produto" },
      { type: "store", title: "Loja", url: "/" },
      { type: "checkout", title: "Checkout", url: "/checkout" },
      { type: "thanks", title: "Pedido confirmado", url: "/obrigado" },
    ],
    extras: [
      { type: "link_whats", title: "WhatsApp de dúvidas", url: "https://wa.me/", de: 1, abaixo: true },
      { type: "pipeline", title: "Pedidos (CRM)", url: "crm", de: 3, abaixo: true },
    ],
  },
  {
    id: "webinar",
    nome: "Webinar",
    para: "Inscrição → lembretes → aula ao vivo → oferta → checkout.",
    passos: [
      { type: "optin", title: "Inscrição no webinar", url: "/webinar" },
      { type: "campaign", title: "Lembretes", url: "sequência" },
      { type: "webinar", title: "Aula ao vivo", url: "/aula" },
      { type: "sales", title: "Oferta", url: "/oferta" },
      { type: "checkout", title: "Checkout", url: "/checkout" },
      { type: "thanks", title: "Obrigado", url: "/obrigado" },
    ],
    extras: [{ type: "brand", title: "Instagram", de: 0 }],
  },
  {
    id: "quiz",
    nome: "Quiz de qualificação",
    para: "Anúncio → quiz → redirecionador manda cada perfil para a oferta certa.",
    passos: [
      { type: "ad", title: "Anúncio do quiz", url: "campanha-quiz" },
      { type: "quiz", title: "Quiz", url: "/quiz" },
      { type: "redirect", title: "Redirecionador" },
      { type: "sales", title: "Oferta principal", url: "/oferta" },
      { type: "checkout", title: "Checkout", url: "/checkout" },
    ],
    extras: [{ type: "sales", title: "Oferta de entrada", url: "/oferta-entrada", de: 2, abaixo: true }],
  },
];

const PASSO_X = 380;
const CORES_MARCA: Record<string, { cor: string; sigla: string }> = {
  Instagram: { cor: "#e1306c", sigla: "Ig" },
  Facebook: { cor: "#1877f2", sigla: "f" },
};

/** Monta o funil de um modelo, com os blocos em linha e as ligações. */
export function montarModelo(m: ModeloFunil): FunnelData {
  const nodes: FunnelNode[] = [];
  const edges: FunnelEdge[] = [];
  let seq = 1;
  m.passos.forEach((p, i) => {
    const n: FunnelNode = {
      id: `n${seq++}`,
      type: p.type,
      x: 80 + i * PASSO_X,
      y: 160,
      title: p.title,
      url: p.url,
    };
    if (p.type === "redirect") n.redir = { regras: [] };
    if (p.type === "store") n.loja = lojaDemo();
    nodes.push(n);
    if (i > 0) edges.push({ id: `e${i}`, source: nodes[i - 1].id, target: n.id });
  });
  for (const x of m.extras ?? []) {
    const base = nodes[x.de];
    const n: FunnelNode = {
      id: `n${seq++}`,
      type: x.type,
      x: x.abaixo ? base.x + PASSO_X : base.x,
      y: x.abaixo ? 560 : base.y - 200,
      title: x.title,
      url: x.url,
    };
    if (x.type === "brand") {
      const c = CORES_MARCA[x.title] ?? { cor: "#6b7280", sigla: x.title.slice(0, 2) };
      n.cor = c.cor;
      n.sigla = c.sigla;
      nodes.push(n);
      edges.push({ id: `e${seq}`, source: n.id, target: base.id });
      continue;
    }
    if (x.type === "redirect") n.redir = { regras: [] };
    nodes.push(n);
    edges.push({ id: `e${seq}`, source: base.id, target: n.id, rotulo: x.type === "downsell" ? "não comprou" : undefined });
  }
  return { id: `modelo-${m.id}`, nome: m.nome, projeto: "Meu projeto", nodes, edges };
}
