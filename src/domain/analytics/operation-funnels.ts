import type { DemoRevenueDay } from "@/lib/demo-data";
import { hashDate } from "@/domain/finance/demo-finance";
import { safeDivide } from "@/domain/shared/math";

/**
 * Funis por operação: cada operação tem seus próprios funis, e cada funil
 * tem etapas com nomes, taxas e custos próprios (um VSL mede "assistiu
 * metade do vídeo"; uma assinatura mede "renovou no mês 2"). Os números
 * são demonstrativos e determinísticos — escalam com o período escolhido
 * no Calendário sem mudar a cada carregamento.
 */

export interface FunnelStageDefinition {
  label: string;
  /** Fração média que avança da etapa anterior para esta (0–1). */
  rate: number;
  /** Rótulo do custo desta etapa (ex.: "Custo por clique"). */
  costLabel: string;
  /** Etapa que representa o resultado principal do funil (compra, assinatura). */
  primary?: boolean;
}

export interface OperationFunnelDefinition {
  id: string;
  name: string;
  /** Tipo em uma palavra do dia a dia ("Página de vendas", "Vídeo de vendas"...). */
  type: string;
  status: "Ativo" | "Escalando" | "Em teste";
  /** Impressões médias por dia. */
  dailyImpressions: number;
  /** Gasto médio de anúncio por dia. */
  dailySpend: number;
  /** Valor médio de cada resultado principal (ticket). */
  ticket: number;
  stages: FunnelStageDefinition[];
  /** Público por faixa de idade (soma ≈ 100). */
  demographics: { label: string; share: number }[];
  /** Retenção do vídeo do anúncio: % que assiste 25/50/75/100%. */
  video: [number, number, number, number];
}

export interface OperationDefinition {
  id: string;
  label: string;
  funnels: OperationFunnelDefinition[];
}

export const OPERATIONS: OperationDefinition[] = [
  {
    id: "alpha",
    label: "Operação Alpha",
    funnels: [
      {
        id: "geral",
        name: "Funil Geral",
        type: "Página de vendas",
        status: "Ativo",
        dailyImpressions: 2600,
        dailySpend: 120,
        ticket: 289,
        stages: [
          {
            label: "Viram o anúncio",
            rate: 1,
            costLabel: "Custo por mil (CPM)",
          },
          {
            label: "Clicaram no link",
            rate: 0.026,
            costLabel: "Custo por clique",
          },
          {
            label: "Abriram a página",
            rate: 0.9,
            costLabel: "Custo por visita",
          },
          {
            label: "Começaram a pagar",
            rate: 0.1,
            costLabel: "Custo por checkout",
          },
          {
            label: "Compraram",
            rate: 0.29,
            costLabel: "Custo por compra",
            primary: true,
          },
        ],
        demographics: [
          { label: "25 a 34 anos", share: 53 },
          { label: "18 a 24 anos", share: 27 },
          { label: "35 a 44 anos", share: 16 },
          { label: "45 a 54 anos", share: 3 },
          { label: "Outras idades", share: 1 },
        ],
        video: [42, 24, 13, 7],
      },
      {
        id: "vsl",
        name: "VSL Principal",
        type: "Vídeo de vendas",
        status: "Escalando",
        dailyImpressions: 4700,
        dailySpend: 185,
        ticket: 280,
        stages: [
          {
            label: "Viram o anúncio",
            rate: 1,
            costLabel: "Custo por mil (CPM)",
          },
          {
            label: "Clicaram no link",
            rate: 0.032,
            costLabel: "Custo por clique",
          },
          {
            label: "Abriram a página",
            rate: 0.89,
            costLabel: "Custo por visita",
          },
          {
            label: "Assistiram metade do vídeo",
            rate: 0.31,
            costLabel: "Custo por meia visualização",
          },
          {
            label: "Começaram a pagar",
            rate: 0.26,
            costLabel: "Custo por checkout",
          },
          {
            label: "Compraram",
            rate: 0.28,
            costLabel: "Custo por compra",
            primary: true,
          },
          {
            label: "Levaram o extra (upsell)",
            rate: 0.29,
            costLabel: "Custo por upsell",
          },
        ],
        demographics: [
          { label: "25 a 34 anos", share: 44 },
          { label: "35 a 44 anos", share: 26 },
          { label: "18 a 24 anos", share: 20 },
          { label: "45 a 54 anos", share: 7 },
          { label: "Outras idades", share: 3 },
        ],
        video: [55, 34, 19, 10],
      },
      {
        id: "remarketing",
        name: "Remarketing 7 dias",
        type: "Quem já visitou",
        status: "Ativo",
        dailyImpressions: 1000,
        dailySpend: 62,
        ticket: 214,
        stages: [
          {
            label: "Viram o anúncio",
            rate: 1,
            costLabel: "Custo por mil (CPM)",
          },
          {
            label: "Clicaram no link",
            rate: 0.049,
            costLabel: "Custo por clique",
          },
          {
            label: "Abriram a página",
            rate: 0.93,
            costLabel: "Custo por visita",
          },
          {
            label: "Começaram a pagar",
            rate: 0.22,
            costLabel: "Custo por checkout",
          },
          {
            label: "Compraram",
            rate: 0.22,
            costLabel: "Custo por compra",
            primary: true,
          },
          {
            label: "Levaram o extra (upsell)",
            rate: 0.47,
            costLabel: "Custo por upsell",
          },
          {
            label: "Compraram de novo",
            rate: 0.43,
            costLabel: "Custo por recompra",
          },
        ],
        demographics: [
          { label: "35 a 44 anos", share: 37 },
          { label: "25 a 34 anos", share: 31 },
          { label: "45 a 54 anos", share: 18 },
          { label: "18 a 24 anos", share: 10 },
          { label: "Outras idades", share: 4 },
        ],
        video: [48, 28, 16, 8],
      },
    ],
  },
  {
    id: "beta",
    label: "Operação Beta",
    funnels: [
      {
        id: "assinatura",
        name: "Oferta de Assinatura",
        type: "Mensalidade",
        status: "Em teste",
        dailyImpressions: 3200,
        dailySpend: 136,
        ticket: 237,
        stages: [
          {
            label: "Viram o anúncio",
            rate: 1,
            costLabel: "Custo por mil (CPM)",
          },
          {
            label: "Clicaram no link",
            rate: 0.029,
            costLabel: "Custo por clique",
          },
          {
            label: "Abriram a página",
            rate: 0.9,
            costLabel: "Custo por visita",
          },
          {
            label: "Começaram o teste grátis",
            rate: 0.17,
            costLabel: "Custo por teste",
          },
          {
            label: "Viraram assinantes",
            rate: 0.17,
            costLabel: "Custo por assinatura",
            primary: true,
          },
          {
            label: "Renovaram no mês 2",
            rate: 0.61,
            costLabel: "Custo por renovação",
          },
          {
            label: "Renovaram no mês 3",
            rate: 0.64,
            costLabel: "Custo por renovação",
          },
        ],
        demographics: [
          { label: "25 a 34 anos", share: 48 },
          { label: "18 a 24 anos", share: 22 },
          { label: "35 a 44 anos", share: 20 },
          { label: "45 a 54 anos", share: 7 },
          { label: "Outras idades", share: 3 },
        ],
        video: [46, 27, 14, 7],
      },
      {
        id: "webinar",
        name: "Webinar Automático",
        type: "Aula ao vivo",
        status: "Ativo",
        dailyImpressions: 5700,
        dailySpend: 211,
        ticket: 285,
        stages: [
          {
            label: "Viram o anúncio",
            rate: 1,
            costLabel: "Custo por mil (CPM)",
          },
          {
            label: "Clicaram na página",
            rate: 0.036,
            costLabel: "Custo por clique",
          },
          {
            label: "Se inscreveram",
            rate: 0.5,
            costLabel: "Custo por inscrição",
          },
          {
            label: "Participaram da aula",
            rate: 0.44,
            costLabel: "Custo por participante",
          },
          {
            label: "Viram a oferta",
            rate: 0.57,
            costLabel: "Custo por oferta vista",
          },
          {
            label: "Começaram a pagar",
            rate: 0.39,
            costLabel: "Custo por checkout",
          },
          {
            label: "Compraram",
            rate: 0.35,
            costLabel: "Custo por compra",
            primary: true,
          },
        ],
        demographics: [
          { label: "35 a 44 anos", share: 41 },
          { label: "25 a 34 anos", share: 34 },
          { label: "45 a 54 anos", share: 14 },
          { label: "18 a 24 anos", share: 8 },
          { label: "Outras idades", share: 3 },
        ],
        video: [62, 41, 26, 15],
      },
    ],
  },
];

export interface FunnelStageSnapshot {
  label: string;
  volume: number;
  /** % que avançou da etapa anterior (100 na primeira). */
  conversion: number;
  costLabel: string;
  /** Custo por unidade desta etapa (por clique, por compra...). */
  costValue: number;
  primary: boolean;
}

export interface OperationFunnelSnapshot {
  operationLabel: string;
  funnel: OperationFunnelDefinition;
  daysCount: number;
  spend: number;
  revenue: number;
  purchases: number;
  costPerResult: number;
  cpm: number;
  ctr: number;
  entryVolume: number;
  finalConversion: number;
  primaryLabel: string;
  stages: FunnelStageSnapshot[];
}

/**
 * Calcula o funil para o período escolhido. O volume diário varia por data
 * (mesma técnica determinística do resto do painel), então dois dias nunca
 * são idênticos, mas o mesmo período sempre dá o mesmo resultado.
 */
export function buildOperationFunnelSnapshot(
  operationId: string,
  funnelId: string,
  days: DemoRevenueDay[],
): OperationFunnelSnapshot | null {
  const operation = OPERATIONS.find((op) => op.id === operationId);
  const funnel = operation?.funnels.find((f) => f.id === funnelId);
  if (!operation || !funnel) return null;

  let impressions = 0;
  let spend = 0;
  for (const day of days) {
    const wobble = 0.72 + hashDate(day.date, 401) * 0.6;
    impressions += funnel.dailyImpressions * wobble;
    spend += funnel.dailySpend * (0.78 + hashDate(day.date, 409) * 0.5);
  }
  impressions = Math.round(impressions);
  spend = Math.round(spend * 100) / 100;

  const stages: FunnelStageSnapshot[] = [];
  let volume = impressions;
  funnel.stages.forEach((stage, index) => {
    if (index > 0) {
      const seed = days[0]?.date ?? "2026-01-01";
      const noise = 0.9 + hashDate(seed, 421 + index) * 0.2;
      volume = Math.round(volume * Math.min(stage.rate * noise, 1));
    }
    const isCpm = index === 0;
    stages.push({
      label: stage.label,
      volume,
      conversion:
        index === 0
          ? 100
          : safeDivide(volume, Math.max(stages[index - 1].volume, 1)) * 100,
      costLabel: stage.costLabel,
      costValue: isCpm
        ? safeDivide(spend, Math.max(volume, 1)) * 1000
        : safeDivide(spend, Math.max(volume, 1)),
      primary: Boolean(stage.primary),
    });
  });

  const primaryStage =
    stages.find((stage) => stage.primary) ?? stages[stages.length - 1];
  const purchases = primaryStage?.volume ?? 0;
  const clicks = stages[1]?.volume ?? 0;
  const revenue = Math.round(purchases * funnel.ticket * 100) / 100;

  return {
    operationLabel: operation.label,
    funnel,
    daysCount: days.length,
    spend,
    revenue,
    purchases,
    costPerResult: safeDivide(spend, Math.max(purchases, 1)),
    cpm: safeDivide(spend, Math.max(impressions, 1)) * 1000,
    ctr: safeDivide(clicks, Math.max(impressions, 1)),
    entryVolume: impressions,
    finalConversion: safeDivide(purchases, Math.max(impressions, 1)),
    primaryLabel: primaryStage?.label ?? "Resultado",
    stages,
  };
}
