import type { FunnelData } from "./funnel-model";

/**
 * Um funil de exemplo, para o quadro abrir já mostrando o que faz em vez
 * de uma tela vazia. Origem de tráfego → página de captura → automação →
 * página de oferta → checkout, com um selo de anúncio ligado à página.
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
      type: "page_v3",
      x: 420,
      y: 160,
      title: "Captura",
      url: "/inscricao",
    },
    {
      id: "n4",
      type: "campaign",
      x: 800,
      y: 200,
      title: "Boas-vindas",
      url: "sequência e-mail",
    },
    {
      id: "n5",
      type: "page_v3",
      x: 1120,
      y: 160,
      title: "Oferta",
      url: "/oferta",
    },
    {
      id: "n6",
      type: "pipeline",
      x: 1500,
      y: 200,
      title: "Checkout",
      url: "negócios",
    },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n3" },
    { id: "e2", source: "n2", target: "n3" },
    { id: "e3", source: "n3", target: "n4" },
    { id: "e4", source: "n4", target: "n5" },
    { id: "e5", source: "n5", target: "n6" },
  ],
};
