import type { FunnelData } from "./funnel-model";

/**
 * Um funil de exemplo, para o quadro abrir já mostrando o que faz em vez
 * de uma tela vazia. Anúncio → Página de Captura → Redirecionador (quem é
 * de fora vai para "Indisponível"; metade pula direto para a Página de
 * Vendas) → Automação de E-mail → Página de Vendas → Checkout → Upsell →
 * Página de Obrigado.
 */
export const FUNIL_DEMO: FunnelData = {
  id: "demo",
  nome: "Lançamento — Demonstração",
  projeto: "Meu projeto",
  nodes: [
    {
      id: "n1",
      type: "brand",
      x: 80,
      y: 220,
      title: "Facebook Ads",
      cor: "#1877f2",
      sigla: "f",
    },
    {
      id: "n2",
      type: "ad",
      x: 80,
      y: 420,
      title: "Criativo VSL",
      url: "campanha-quente",
    },
    {
      id: "n3",
      type: "optin",
      x: 420,
      y: 160,
      title: "Captura",
      url: "/inscricao",
    },
    {
      id: "n7",
      type: "redirect",
      x: 800,
      y: 160,
      title: "Redirecionador",
      redir: {
        regras: [
          {
            id: "r1",
            tipo: "regiao",
            paises: ["RU", "IN", "NG"],
            dispositivos: [],
            percentual: 50,
            destino: "",
            destinoNoId: "n8",
            ativo: true,
          },
          {
            id: "r2",
            tipo: "fatia",
            paises: [],
            dispositivos: [],
            percentual: 50,
            destino: "",
            destinoNoId: "n5",
            ativo: true,
          },
        ],
      },
    },
    {
      id: "n4",
      type: "campaign",
      x: 1180,
      y: 200,
      title: "Boas-vindas",
      url: "sequência e-mail",
    },
    {
      id: "n5",
      type: "sales",
      x: 1560,
      y: 160,
      title: "Oferta",
      url: "/oferta",
    },
    {
      id: "n6",
      type: "checkout",
      x: 1940,
      y: 160,
      title: "Checkout",
      url: "/checkout",
    },
    {
      id: "n9",
      type: "upsell",
      x: 2320,
      y: 160,
      title: "Upsell",
      url: "/upsell",
    },
    {
      id: "n10",
      type: "thanks",
      x: 2700,
      y: 160,
      title: "Obrigado",
      url: "/obrigado",
    },
    {
      id: "n8",
      type: "page_v3",
      x: 1180,
      y: 560,
      title: "Indisponível",
      url: "/indisponivel",
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n3" },
    { id: "e2", source: "n2", target: "n3" },
    { id: "e3", source: "n3", target: "n7" },
    { id: "e4", source: "n7", target: "n4" },
    { id: "e5", source: "n4", target: "n5" },
    { id: "e6", source: "n5", target: "n6" },
    { id: "e7", source: "n6", target: "n9" },
    { id: "e8", source: "n9", target: "n10" },
  ],
};
