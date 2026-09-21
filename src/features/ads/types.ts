import type { CampaignClassId } from "./campaign-classes";
import type { VendaPorPosicao } from "./creative-placements";

/*
  O formato do gerenciador de anúncios, do banco até a tela.

  Os três níveis carregam as mesmas métricas dos últimos 7 dias; o que muda
  é o que cada um deixa editar: campanha e conjunto têm orçamento, anúncio
  não. Tudo em centavos e inteiros — a conversão para "R$ 1,2 mil" é da
  tela.
*/

export type AdNetwork = "meta" | "google" | "youtube";
export type AdStatus = "active" | "paused" | "archived";
export type AdSource = "manual" | "meta" | "demo";
export type AdEntityType = "campaign" | "ad_set" | "ad";

export interface AdMetrics {
  spendCents: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenueCents: number;
  /**
   * Quantas pessoas iniciaram o checkout. Fica de fora quando a
   * plataforma não devolve o evento — é por isso que é opcional, e não
   * zero: zero significaria "ninguém iniciou", e isso é diferente de
   * "não sabemos". Quem lê trata `undefined` como "—".
   */
  checkouts?: number;
}

export interface AdRow {
  id: string;
  externalId: string | null;
  name: string;
  status: AdStatus;
  creative: { title?: string; body?: string; thumbnailUrl?: string };
  metrics: AdMetrics;
  /**
   * De onde vieram as vendas: feed, explorar, stories, reels… É a
   * partição que a plataforma devolve (publisher_platform +
   * platform_position). Ausente enquanto ninguém a sincronizou — a tela
   * não mostra posição nenhuma em vez de inventar.
   */
  placements?: VendaPorPosicao[];
}

export interface AdSetRow {
  id: string;
  externalId: string | null;
  name: string;
  status: AdStatus;
  dailyBudgetCents: number | null;
  metrics: AdMetrics;
  ads: AdRow[];
}

export interface CampaignRow {
  id: string;
  externalId: string | null;
  network: AdNetwork;
  name: string;
  objective: string | null;
  /** Browser-local organization label; never sent to the ad platform. */
  campaignClass?: CampaignClassId;
  status: AdStatus;
  dailyBudgetCents: number | null;
  source: AdSource;
  syncedAt: string | null;
  metrics: AdMetrics;
  adSets: AdSetRow[];
}

export interface CampaignTree {
  campanhas: CampaignRow[];
  /** De onde a árvore veio — e a tela diz isso. */
  modo: "banco" | "demo";
  metaConectado: boolean;
  ultimaSync: string | null;
  /** A leitura falhou; não tratar a ausência de resposta como saldo zero. */
  loadError?: boolean;
}

export const STATUS_LABEL: Record<AdStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};

export const NETWORK_LABEL: Record<AdNetwork, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  youtube: "YouTube Ads",
};

export const OBJETIVOS = [
  "Vendas",
  "Leads",
  "Tráfego",
  "Reconhecimento",
  "Engajamento",
  "Remarketing",
] as const;

export const METRICAS_ZERADAS: AdMetrics = {
  spendCents: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  revenueCents: 0,
};

/** As leituras derivadas. Null quando a divisão não faz sentido. */
export function derivadas(m: AdMetrics) {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    ctr: div(m.clicks, m.impressions),
    cpcCents: div(m.spendCents, m.clicks),
    cpmCents: div(m.spendCents * 1000, m.impressions),
    cpaCents: div(m.spendCents, m.purchases),
    roas: div(m.revenueCents, m.spendCents),
    /** Sem custo de produto por campanha, a margem aqui é sobre a mídia. */
    margem: div(m.revenueCents - m.spendCents, m.revenueCents),
  };
}

export function somarMetricas(lista: AdMetrics[]): AdMetrics {
  const soma = lista.reduce(
    (acc, m) => ({
      spendCents: acc.spendCents + m.spendCents,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      purchases: acc.purchases + m.purchases,
      revenueCents: acc.revenueCents + m.revenueCents,
    }),
    { ...METRICAS_ZERADAS },
  );
  /* Os checkouts só entram na soma se alguém os souber: somar um lote
     em que ninguém sabe daria zero, e zero seria uma mentira diferente
     de "não sabemos". */
  const sabidos = lista.filter((m) => typeof m.checkouts === "number");
  if (sabidos.length) return { ...soma, checkouts: sabidos.reduce((s, m) => s + (m.checkouts ?? 0), 0) };
  return soma;
}

export function isAdStatus(v: unknown): v is AdStatus {
  return v === "active" || v === "paused" || v === "archived";
}

export function isAdNetwork(v: unknown): v is AdNetwork {
  return v === "meta" || v === "google" || v === "youtube";
}
