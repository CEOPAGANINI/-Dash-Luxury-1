import type { CampaignRow } from "./types";

/*
  Classes de trabalho: rótulos de organização, nunca objetivos da rede.
  Os pilares do quadro, na ordem padrão:

    1. Teste de criativos — com especificação: criativos em vídeo ou em imagem
    2. Teste de público
    3. Teste de página de vendas
    4. Teste de checkout
    5. Teste de oferta
    6. Aquecimento de pixel
    7. Pré-escala
    8. Escala
    9. Explosiva

  "Outras campanhas 1" a "6" guardam os outros tipos de campanha; o
  primeiro também recebe o que ainda não foi classificado. Todos os
  quinze blocos têm o mesmo tamanho no quadro (cinco colunas, três
  fileiras). A classe é o que a campanha carrega; o pilar é o bloco do
  quadro. No primeiro pilar cada especificação é uma página própria.
*/

export const PILARES = [
  { id: "creative-test", label: "Teste de criativos" },
  { id: "audience-test", label: "Teste de público" },
  { id: "sales-page-test", label: "Teste de página de vendas" },
  { id: "checkout-test", label: "Teste de checkout" },
  { id: "offer-test", label: "Teste de oferta" },
  { id: "pixel-warmup", label: "Aquecimento de pixel" },
  { id: "pre-scale", label: "Pré-escala" },
  { id: "scale", label: "Escala" },
  { id: "explosive", label: "Explosiva" },
  { id: "unclassified", label: "Outras campanhas 1" },
  { id: "others-2", label: "Outras campanhas 2" },
  { id: "others-3", label: "Outras campanhas 3" },
  { id: "others-4", label: "Outras campanhas 4" },
  /* Os ids "big-*" ficam por compatibilidade com o que já foi guardado. */
  { id: "big-1", label: "Outras campanhas 5" },
  { id: "big-2", label: "Outras campanhas 6" },
] as const;

export type PilarId = (typeof PILARES)[number]["id"];

export const CAMPAIGN_CLASSES = [
  { id: "creative-test-video", label: "Teste de criativos · vídeo", curto: "Criativos em vídeo", pilar: "creative-test" },
  { id: "creative-test-image", label: "Teste de criativos · imagem", curto: "Criativos em imagem", pilar: "creative-test" },
  /* Campanhas classificadas antes da especificação existir. */
  { id: "creative-test", label: "Teste de criativos", curto: "Teste de criativos", pilar: "creative-test" },
  { id: "audience-test", label: "Teste de público", curto: "Teste de público", pilar: "audience-test" },
  { id: "sales-page-test", label: "Teste de página de vendas", curto: "Teste de página de vendas", pilar: "sales-page-test" },
  { id: "checkout-test", label: "Teste de checkout", curto: "Teste de checkout", pilar: "checkout-test" },
  { id: "offer-test", label: "Teste de oferta", curto: "Teste de oferta", pilar: "offer-test" },
  { id: "pixel-warmup", label: "Aquecimento de pixel", curto: "Aquecimento de pixel", pilar: "pixel-warmup" },
  { id: "pre-scale", label: "Pré-escala", curto: "Pré-escala", pilar: "pre-scale" },
  { id: "scale", label: "Escala", curto: "Escala", pilar: "scale" },
  { id: "explosive", label: "Explosiva", curto: "Explosiva", pilar: "explosive" },
  { id: "unclassified", label: "Outras campanhas 1", curto: "Outras campanhas 1", pilar: "unclassified" },
  { id: "others-2", label: "Outras campanhas 2", curto: "Outras campanhas 2", pilar: "others-2" },
  { id: "others-3", label: "Outras campanhas 3", curto: "Outras campanhas 3", pilar: "others-3" },
  { id: "others-4", label: "Outras campanhas 4", curto: "Outras campanhas 4", pilar: "others-4" },
  { id: "big-1", label: "Outras campanhas 5", curto: "Outras campanhas 5", pilar: "big-1" },
  { id: "big-2", label: "Outras campanhas 6", curto: "Outras campanhas 6", pilar: "big-2" },
] as const satisfies readonly { id: string; label: string; curto: string; pilar: PilarId }[];

export type CampaignClassId = (typeof CAMPAIGN_CLASSES)[number]["id"];

export function isCampaignClass(value: unknown): value is CampaignClassId {
  return CAMPAIGN_CLASSES.some((item) => item.id === value);
}

export function isPilar(value: unknown): value is PilarId {
  return PILARES.some((item) => item.id === value);
}

/** As classes que vivem num pilar; no primeiro, as duas especificações. */
export function classesDoPilar(pilar: PilarId): CampaignClassId[] {
  return CAMPAIGN_CLASSES.filter((item) => item.pilar === pilar).map((item) => item.id);
}

export function pilarDaClasse(classe: CampaignClassId): PilarId {
  return CAMPAIGN_CLASSES.find((item) => item.id === classe)?.pilar ?? "unclassified";
}

export function pilarLabel(pilar: PilarId): string {
  return PILARES.find((item) => item.id === pilar)?.label ?? "Outras campanhas 1";
}

/* Classes que existiram antes dos nove pilares. Um valor guardado com um
   destes ids vira a classe mais próxima em vez de se perder. */
const LEGADO: Record<string, CampaignClassId> = {
  remarketing: "offer-test",
  prospecting: "audience-test",
  launch: "explosive",
  awareness: "pixel-warmup",
  leads: "sales-page-test",
};

/** Aceita a classe atual ou uma antiga (migrada); qualquer outra coisa é null. */
export function normalizarClasse(value: unknown): CampaignClassId | null {
  if (isCampaignClass(value)) return value;
  if (typeof value === "string" && value in LEGADO) return LEGADO[value];
  return null;
}

// Explicit labels for known examples only. Never infer real campaign strategy.
const EXAMPLE_CLASSES: Record<string, CampaignClassId> = {
  "demo-a1": "scale",
  "demo-a2": "creative-test-video",
  "demo-a3": "offer-test",
  "demo-a4": "explosive",
  "demo-a5": "pixel-warmup",
  "demo-a6": "sales-page-test",
  "demo-g1": "scale",
  "demo-g2": "audience-test",
  "demo-g3": "checkout-test",
  "demo-y1": "pre-scale",
  "demo-y2": "creative-test-image",
  "demo-y3": "offer-test",
};

export function campaignClass(campaign: CampaignRow): CampaignClassId {
  const propria = normalizarClasse(campaign.campaignClass);
  if (propria) return propria;
  return campaign.source === "demo"
    ? (EXAMPLE_CLASSES[campaign.id] ?? "unclassified")
    : "unclassified";
}

export function campaignClassLabel(value: CampaignClassId): string {
  return (
    CAMPAIGN_CLASSES.find((item) => item.id === value)?.label ?? "Outras campanhas 1"
  );
}

/** O rótulo curto, para a faixa dentro do pilar. */
export function campaignClassCurto(value: CampaignClassId): string {
  return CAMPAIGN_CLASSES.find((item) => item.id === value)?.curto ?? "Outras campanhas 1";
}
