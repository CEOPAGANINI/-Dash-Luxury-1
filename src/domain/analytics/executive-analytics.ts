import type { DemoRevenueDay } from "@/lib/demo-data";
import type { DashboardMetricKey } from "@/domain/metrics";
import {
  dailyAdSpend,
  financeSummary,
  funnelStages,
  hashDate,
} from "@/domain/finance/demo-finance";
import {
  estimateLtv90,
  calculateRepeatRate,
} from "@/domain/customers/formulas";
import { relativeChange, safeDivide } from "@/domain/shared/math";
import {
  calculateRoas,
  calculateRoi,
  estimateMarginalRoas,
  estimateSaturation,
  recommendBudgetAction,
} from "@/domain/marketing/formulas";

export type ExecutivePeriod = "7d" | "15d" | "30d" | "month";
export type ExecutiveTone =
  "success" | "warning" | "destructive" | "info" | "neutral";

export interface ExecutiveKpi {
  key: string;
  label: string;
  value: number;
  format: "currency" | "percent" | "ratio" | "number";
  delta: number;
  comparison: string;
  goal: number;
  goalDirection: "higher" | "lower";
  tone: ExecutiveTone;
  status: "confirmed" | "provisional" | "estimated";
  metricKey: DashboardMetricKey;
  sparkline: number[];
}

export interface ExecutiveSnapshot {
  days: DemoRevenueDay[];
  previousDays: DemoRevenueDay[];
  label: string;
  previousLabel: string;
  volumeProcessado: number;
  receitaAprovada: number;
  receitaPendente: number;
  receitaRecusada: number;
  receitaLiquida: number;
  caixaRecebido: number;
  gastoMidia: number;
  taxas: number;
  custoProduto: number;
  reembolso: number;
  chargeback: number;
  lucroContribuicao: number;
  margemContribuicao: number;
  mer: number;
  ncCac: number;
  novosClientes: number;
  recorrentes: number;
  pedidos: number;
  ticket: number;
  taxaAprovacao: number;
  taxaPendente: number;
  taxaReembolso: number;
  taxaChargeback: number;
  paybackCompras: number;
  ltv90: number;
  conversaoPagamento: number;
  dataQuality: number;
  kpis: ExecutiveKpi[];
  verdict: {
    status: "Saudável" | "Atenção" | "Crítico" | "Dados insuficientes";
    tone: ExecutiveTone;
    summary: string;
    impact: number;
    cause: string;
    action: string;
    confidence: "Alta" | "Média" | "Baixa";
  };
}

export interface AcquisitionRow {
  name: "Face ADS" | "Google ADS" | "YouTube ADS";
  color: string;
  spend: number;
  revenue: number;
  contribution: number;
  roas: number;
  roi: number;
  ncCac: number;
  frequency: number;
  saturation: number;
  marginalRoas: number;
  action: "Escalar" | "Manter" | "Reduzir" | "Validar";
  confidence: number;
}

/**
 * Uma campanha dentro de uma rede. É o nível que faltava entre a rede
 * (Face, Google, YouTube) e o criativo: dá para ver de onde, dentro da
 * rede, vem o lucro ou o prejuízo.
 */
export interface CampaignRow {
  id: string;
  name: string;
  channel: AcquisitionRow["name"];
  channelColor: string;
  spend: number;
  revenue: number;
  contribution: number;
  roas: number;
  roi: number;
  orders: number;
  cpa: number;
  action: "Escalar" | "Manter" | "Reduzir" | "Validar";
}

export interface CreativeRow {
  id: string;
  name: string;
  angle: string;
  channel: AcquisitionRow["name"];
  channelColor: string;
  hookRate: number;
  holdRate: number;
  ctr: number;
  cvr: number;
  cpa: number;
  frequency: number;
  fatigue: number;
  contribution: number;
  status: "Escalar" | "Manter" | "Trocar" | "Validar";
}

export interface FinancialBridgeStep {
  key: string;
  label: string;
  value: number;
  kind: "start" | "cost" | "result";
  description: string;
}

export interface CohortRow {
  label: string;
  customers: number;
  ltv0: number;
  ltv30: number;
  ltv60: number;
  ltv90: number;
  retention90: number;
  margin90: number;
}

export interface ExecutiveRisk {
  id: string;
  title: string;
  severity: "Crítico" | "Alto" | "Atenção" | "Oportunidade";
  tone: ExecutiveTone;
  impact: number;
  evidence: string;
  cause: string;
  action: string;
  confidence: "Alta" | "Média" | "Baixa";
  owner: string;
  horizon: string;
}

export interface TrendPoint {
  date: string;
  label: string;
  approved: number;
  netRevenue: number;
  contribution: number;
  spend: number;
}

const MS_DAY = 86_400_000;

function toMs(date: string) {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIso(ms: number) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function rangeLabel(days: DemoRevenueDay[]) {
  if (days.length === 0) return "Sem dados";
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return "Sem dados";
  return ordered.length === 1
    ? shortDate(first.date)
    : `${shortDate(first.date)}–${shortDate(last.date)}`;
}

function daysForPeriod(anchorDate: string, period: ExecutivePeriod) {
  const anchor = toMs(anchorDate);
  if (period === "month") {
    const date = new Date(anchor);
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    return { start, end: anchor };
  }
  const count = period === "7d" ? 7 : period === "15d" ? 15 : 30;
  return { start: anchor - (count - 1) * MS_DAY, end: anchor };
}

export function selectExecutivePeriod(
  allDays: DemoRevenueDay[],
  anchorDate: string,
  period: ExecutivePeriod,
) {
  const currentRange = daysForPeriod(anchorDate, period);
  const current = allDays.filter((day) => {
    const ms = toMs(day.date);
    return ms >= currentRange.start && ms <= currentRange.end;
  });
  const length = Math.max(current.length, 1);
  const previousEnd = currentRange.start - MS_DAY;
  const previousStart = previousEnd - (length - 1) * MS_DAY;
  const previous = allDays.filter((day) => {
    const ms = toMs(day.date);
    return ms >= previousStart && ms <= previousEnd;
  });
  return { current, previous };
}

const delta = relativeChange;

function aggregateBase(days: DemoRevenueDay[]) {
  const finance = financeSummary(days);
  const volumeProcessado = days.reduce(
    (sum, day) => sum + day.aprovada + day.pendente + day.recusada,
    0,
  );
  const receitaPendente = days.reduce((sum, day) => sum + day.pendente, 0);
  const receitaRecusada = days.reduce((sum, day) => sum + day.recusada, 0);
  const resolved = finance.caixaRecebido + receitaRecusada;
  const receitaLiquida =
    finance.caixaRecebido - finance.reembolso - finance.chargeback;
  const funil = funnelStages(days);
  const purchase = funil.at(-2)?.volume ?? 0;
  const approved = funil.at(-1)?.volume ?? 0;
  const repeatRate = calculateRepeatRate(
    finance.clientesRecorrentes,
    finance.pedidos,
  );
  const ltv90 = estimateLtv90(finance.ticket, repeatRate);

  return {
    ...finance,
    volumeProcessado,
    receitaPendente,
    receitaRecusada,
    receitaLiquida,
    taxaAprovacao: safeDivide(finance.caixaRecebido, resolved),
    taxaPendente: safeDivide(receitaPendente, volumeProcessado),
    taxaReembolso: safeDivide(finance.reembolso, finance.caixaRecebido),
    taxaChargeback: safeDivide(finance.chargeback, finance.caixaRecebido),
    ltv90,
    conversaoPagamento: safeDivide(approved, purchase),
  };
}

function dailyContribution(day: DemoRevenueDay) {
  return financeSummary([day]).lucroContribuicao;
}

function spark(
  days: DemoRevenueDay[],
  selector: (day: DemoRevenueDay) => number,
) {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map(selector);
}

function toneFor(
  value: number,
  warning: number,
  destructive: number,
  lowerIsBetter = false,
) {
  if (lowerIsBetter) {
    if (value <= warning) return "success" as const;
    if (value <= destructive) return "warning" as const;
    return "destructive" as const;
  }
  if (value >= warning) return "success" as const;
  if (value >= destructive) return "warning" as const;
  return "destructive" as const;
}

function buildExecutiveSnapshotFromRanges(
  current: DemoRevenueDay[],
  previous: DemoRevenueDay[],
): ExecutiveSnapshot {
  const now = aggregateBase(current);
  const before = aggregateBase(previous);
  const completeness = current.length > 0 ? 1 : 0;
  const volumeConfidence = Math.min(
    current.reduce((sum, day) => sum + day.pedidos, 0) / 180,
    1,
  );
  const dataQuality = Math.min(
    0.72 + completeness * 0.16 + volumeConfidence * 0.12,
    1,
  );

  const contributionGoal = Math.max(now.caixaRecebido * 0.18, 1);
  const marginGoal = 0.18;
  const merGoal = 1.8;
  const ncCacGoal = Math.max(now.ticket * 0.36, 1);

  const kpis: ExecutiveKpi[] = [
    {
      key: "cash",
      label: "Caixa recebido",
      value: now.caixaRecebido,
      format: "currency",
      delta: delta(now.caixaRecebido, before.caixaRecebido),
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: current.length * 3_800,
      goalDirection: "higher",
      tone: toneFor(
        now.caixaRecebido,
        current.length * 3_800,
        current.length * 3_200,
      ),
      status: "provisional",
      metricKey: "caixaRecebido",
      sparkline: spark(current, (day) => day.aprovada),
    },
    {
      key: "net",
      label: "Receita líquida",
      value: now.receitaLiquida,
      format: "currency",
      delta: delta(now.receitaLiquida, before.receitaLiquida),
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: current.length * 3_650,
      goalDirection: "higher",
      tone: toneFor(
        now.receitaLiquida,
        current.length * 3_650,
        current.length * 3_000,
      ),
      status: "estimated",
      metricKey: "receitaLiquida",
      sparkline: spark(current, (day) => {
        const f = financeSummary([day]);
        return f.caixaRecebido - f.reembolso - f.chargeback;
      }),
    },
    {
      key: "contribution",
      label: "Lucro de contribuição",
      value: now.lucroContribuicao,
      format: "currency",
      delta: delta(now.lucroContribuicao, before.lucroContribuicao),
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: contributionGoal,
      goalDirection: "higher",
      tone: toneFor(now.lucroContribuicao, contributionGoal, 0),
      status: "estimated",
      metricKey: "lucroContribuicao",
      sparkline: spark(current, dailyContribution),
    },
    {
      key: "margin",
      label: "Margem de contribuição",
      value: now.margemContribuicao,
      format: "percent",
      delta: now.margemContribuicao - before.margemContribuicao,
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: marginGoal,
      goalDirection: "higher",
      tone: toneFor(now.margemContribuicao, marginGoal, 0.08),
      status: "estimated",
      metricKey: "margemContribuicao",
      sparkline: spark(
        current,
        (day) => financeSummary([day]).margemContribuicao,
      ),
    },
    {
      key: "mer",
      label: "MER blended",
      value: now.mer,
      format: "ratio",
      delta: delta(now.mer, before.mer),
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: merGoal,
      goalDirection: "higher",
      tone: toneFor(now.mer, merGoal, 1.25),
      status: "estimated",
      metricKey: "mer",
      sparkline: spark(current, (day) => financeSummary([day]).mer),
    },
    {
      key: "nc-cac",
      label: "NC-CAC",
      value: now.ncCac,
      format: "currency",
      delta: delta(now.ncCac, before.ncCac),
      comparison: `vs. ${rangeLabel(previous)}`,
      goal: ncCacGoal,
      goalDirection: "lower",
      tone: toneFor(now.ncCac, ncCacGoal, ncCacGoal * 1.35, true),
      status: "estimated",
      metricKey: "ncCac",
      sparkline: spark(current, (day) => financeSummary([day]).ncCac),
    },
  ];

  const contributionDelta = now.lucroContribuicao - before.lucroContribuicao;
  const worstMetric = [
    { label: "aprovação", score: (0.94 - now.taxaAprovacao) * 2.4 },
    { label: "margem", score: (0.18 - now.margemContribuicao) * 2.8 },
    { label: "chargeback", score: (now.taxaChargeback - 0.009) * 9 },
    {
      label: "aquisição",
      score: (now.ncCac / Math.max(ncCacGoal, 1) - 1) * 0.7,
    },
  ].sort((a, b) => b.score - a.score)[0] ?? { label: "dados", score: 0 };

  const isCritical = now.lucroContribuicao < 0 || now.margemContribuicao < 0.05;
  const isWarning =
    !isCritical && (now.margemContribuicao < 0.18 || now.taxaAprovacao < 0.93);
  const status =
    current.length === 0
      ? "Dados insuficientes"
      : isCritical
        ? "Crítico"
        : isWarning
          ? "Atenção"
          : "Saudável";
  const tone: ExecutiveTone =
    status === "Saudável"
      ? "success"
      : status === "Crítico"
        ? "destructive"
        : status === "Atenção"
          ? "warning"
          : "neutral";

  return {
    days: current,
    previousDays: previous,
    label: rangeLabel(current),
    previousLabel: rangeLabel(previous),
    volumeProcessado: now.volumeProcessado,
    receitaAprovada: now.caixaRecebido,
    receitaPendente: now.receitaPendente,
    receitaRecusada: now.receitaRecusada,
    receitaLiquida: now.receitaLiquida,
    caixaRecebido: now.caixaRecebido,
    gastoMidia: now.gastoAnuncio,
    taxas: now.taxas,
    custoProduto: now.custoProduto,
    reembolso: now.reembolso,
    chargeback: now.chargeback,
    lucroContribuicao: now.lucroContribuicao,
    margemContribuicao: now.margemContribuicao,
    mer: now.mer,
    ncCac: now.ncCac,
    novosClientes: now.novosClientes,
    recorrentes: now.clientesRecorrentes,
    pedidos: now.pedidos,
    ticket: now.ticket,
    taxaAprovacao: now.taxaAprovacao,
    taxaPendente: now.taxaPendente,
    taxaReembolso: now.taxaReembolso,
    taxaChargeback: now.taxaChargeback,
    paybackCompras: now.paybackCompras,
    ltv90: now.ltv90,
    conversaoPagamento: now.conversaoPagamento,
    dataQuality,
    kpis,
    verdict: {
      status,
      tone,
      summary:
        status === "Saudável"
          ? `A operação preservou ${(now.margemContribuicao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do caixa após custos variáveis.`
          : status === "Crítico"
            ? "O crescimento não está convertendo em margem suficiente para proteger o caixa."
            : status === "Atenção"
              ? "O período gerou resultado positivo, mas há pressão relevante na eficiência financeira."
              : "Não há volume suficiente para uma leitura executiva confiável.",
      impact: contributionDelta,
      cause:
        worstMetric.score > 0.02
          ? `Principal pressão associada a ${worstMetric.label}; a relação ainda requer validação causal.`
          : "Nenhuma deterioração dominante foi identificada no período.",
      action: isCritical
        ? "Congele aumentos de verba e revise custos, aprovação e criativos antes de escalar."
        : isWarning
          ? "Priorize o canal com maior retorno marginal e corrija a principal perda do funil."
          : "Mantenha o ritmo e teste uma expansão controlada no canal mais eficiente.",
      confidence:
        dataQuality >= 0.9 ? "Alta" : dataQuality >= 0.78 ? "Média" : "Baixa",
    },
  };
}

export function buildExecutiveSnapshot(
  allDays: DemoRevenueDay[],
  anchorDate: string,
  period: ExecutivePeriod,
): ExecutiveSnapshot {
  const { current, previous } = selectExecutivePeriod(
    allDays,
    anchorDate,
    period,
  );
  return buildExecutiveSnapshotFromRanges(current, previous);
}

/**
 * Snapshot para seleções arbitrárias do calendário. A comparação usa a janela
 * imediatamente anterior com a mesma duração da seleção, preservando semanas
 * que atravessam meses e seleções de vários dias não contíguos.
 */
export function buildExecutiveSnapshotForSelection(
  allDays: DemoRevenueDay[],
  selectedDates: string[],
): ExecutiveSnapshot {
  const selected = new Set(selectedDates);
  const current = allDays
    .filter((day) => selected.has(day.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (current.length === 0) return buildExecutiveSnapshotFromRanges([], []);

  const first = current[0];
  if (!first) return buildExecutiveSnapshotFromRanges([], []);
  const previousEnd = toMs(first.date) - MS_DAY;
  const previousStart = previousEnd - Math.max(current.length - 1, 0) * MS_DAY;
  const previous = allDays.filter((day) => {
    const ms = toMs(day.date);
    return ms >= previousStart && ms <= previousEnd;
  });

  return buildExecutiveSnapshotFromRanges(current, previous);
}

const NETWORKS = [
  {
    name: "Face ADS" as const,
    color: "#f5f5f5",
    revenueSalt: 11,
    spendSalt: 91,
  },
  {
    name: "Google ADS" as const,
    color: "#a8a8a8",
    revenueSalt: 23,
    spendSalt: 97,
  },
  {
    name: "YouTube ADS" as const,
    color: "#6a6a6a",
    revenueSalt: 37,
    spendSalt: 103,
  },
];

function networkRevenueWeights(day: DemoRevenueDay) {
  const raw = NETWORKS.map((network, index) => {
    const base = index === 0 ? 0.4 : index === 1 ? 0.28 : 0.16;
    const amplitude = index === 0 ? 0.24 : index === 1 ? 0.2 : 0.16;
    return base + hashDate(day.date, network.revenueSalt) * amplitude;
  });
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  return raw.map((value) => value / total);
}

export function acquisitionRows(days: DemoRevenueDay[]): AcquisitionRow[] {
  const summary = financeSummary(days);
  const totals = NETWORKS.map((network) => ({
    ...network,
    revenue: 0,
    spend: 0,
  }));

  for (const day of days) {
    const revenueWeights = networkRevenueWeights(day);
    const weightedSpend = NETWORKS.map(
      (network, index) =>
        (revenueWeights[index] ?? 0) *
        (0.75 + hashDate(day.date, network.spendSalt) * 0.55),
    );
    const totalWeightedSpend =
      weightedSpend.reduce((sum, value) => sum + value, 0) || 1;
    const daySpend = dailyAdSpend(day);

    totals.forEach((row, index) => {
      row.revenue += day.aprovada * (revenueWeights[index] ?? 0);
      row.spend +=
        daySpend * ((weightedSpend[index] ?? 0) / totalWeightedSpend);
    });
  }

  const revenueTotal = totals.reduce((sum, row) => sum + row.revenue, 0) || 1;
  const spendTotal = totals.reduce((sum, row) => sum + row.spend, 0) || 1;
  const nonMediaCosts =
    summary.taxas +
    summary.custoProduto +
    summary.reembolso +
    summary.chargeback;

  return totals.map((row, index) => {
    const revenueShare = row.revenue / revenueTotal;
    const spendShare = row.spend / spendTotal;
    const allocatedNonMediaCosts = nonMediaCosts * revenueShare;
    const totalInvestment = row.spend + allocatedNonMediaCosts;
    const contribution = row.revenue - totalInvestment;
    const roas = calculateRoas(row.revenue, row.spend);
    const roi = calculateRoi(contribution, totalInvestment);
    const customers = Math.max(
      1,
      Math.round(summary.novosClientes * revenueShare),
    );
    const ncCac = safeDivide(row.spend, customers);
    const frequency =
      1.8 + hashDate(days[0]?.date ?? "2026-01-01", 301 + index) * 2.7;
    const saturation = estimateSaturation({
      spendShare,
      revenueShare,
      frequency,
    });
    const incrementalFactor = [0.82, 0.88, 0.75][index] ?? 0.75;
    const marginalRoas = estimateMarginalRoas(
      roas,
      incrementalFactor,
      saturation,
    );
    const confidence = Math.min(
      0.96,
      0.74 +
        Math.min(customers / 90, 1) * 0.16 +
        Math.min(days.length / 28, 1) * 0.06,
    );
    const action = recommendBudgetAction({
      confidence,
      marginalRoas,
      saturation,
    });

    return {
      name: row.name,
      color: row.color,
      spend: Math.round(row.spend),
      revenue: Math.round(row.revenue),
      contribution: Math.round(contribution),
      roas,
      roi,
      ncCac,
      frequency,
      saturation,
      marginalRoas,
      action,
      confidence,
    };
  });
}

/** Campanhas típicas de Direct Response, por rede. */
const CAMPAIGN_NAMES: Record<AcquisitionRow["name"], string[]> = {
  "Face ADS": [
    "Público frio — vídeo de dor",
    "Remarketing 7 dias",
    "Semelhantes de compradores",
  ],
  "Google ADS": ["Busca — marca", "Busca — concorrentes", "Performance Max"],
  "YouTube ADS": ["Vídeo 30s — frio", "Remarketing de quem assistiu"],
};

/**
 * Divide o investimento e a receita de cada rede entre as campanhas dela.
 * Os pesos vêm do gerador determinístico, então os números não mudam a
 * cada carregamento e a soma das campanhas fecha com o total da rede.
 */
export function campaignRows(
  snapshot: ExecutiveSnapshot,
  acquisition: AcquisitionRow[],
): CampaignRow[] {
  const seedDate = snapshot.days[0]?.date ?? "2026-01-01";
  const rows: CampaignRow[] = [];

  acquisition.forEach((channel, channelIndex) => {
    const names = CAMPAIGN_NAMES[channel.name] ?? [];

    // Pesos de gasto e de receita são sorteados separadamente: é isso que
    // faz uma campanha gastar muito e devolver pouco, e vice-versa.
    const spendWeights = names.map(
      (_, i) => 0.5 + hashDate(seedDate, 701 + channelIndex * 10 + i) * 1.1,
    );
    const revenueWeights = names.map(
      (_, i) => 0.4 + hashDate(seedDate, 751 + channelIndex * 10 + i) * 1.4,
    );
    const spendTotal = spendWeights.reduce((sum, w) => sum + w, 0) || 1;
    const revenueTotal = revenueWeights.reduce((sum, w) => sum + w, 0) || 1;

    names.forEach((name, i) => {
      const spend = channel.spend * ((spendWeights[i] ?? 0) / spendTotal);
      const revenue =
        channel.revenue * ((revenueWeights[i] ?? 0) / revenueTotal);
      // A contribuição da rede é repartida na proporção da receita, para a
      // soma das campanhas continuar batendo com o total da rede.
      const contribution =
        channel.contribution * ((revenueWeights[i] ?? 0) / revenueTotal);
      const roas = calculateRoas(revenue, spend);
      const roi = calculateRoi(contribution, spend);
      const orders = Math.max(
        1,
        Math.round(spend / Math.max(channel.ncCac, 1)),
      );
      const cpa = safeDivide(spend, orders);
      const action: CampaignRow["action"] =
        contribution <= 0
          ? "Reduzir"
          : roas >= channel.roas * 1.15
            ? "Escalar"
            : roas < channel.roas * 0.85
              ? "Validar"
              : "Manter";

      rows.push({
        id: `CP-${channelIndex + 1}${i + 1}`,
        name,
        channel: channel.name,
        channelColor: channel.color,
        spend,
        revenue,
        contribution,
        roas,
        roi,
        orders,
        cpa,
        action,
      });
    });
  });

  return rows;
}

export function creativeRows(
  snapshot: ExecutiveSnapshot,
  acquisition: AcquisitionRow[],
): CreativeRow[] {
  const concepts = [
    ["UGC — problema imediato", "Dor direta"],
    ["Demonstração do mecanismo", "Prova visual"],
    ["Oferta principal", "Benefício + urgência"],
    ["Founder explica o método", "Autoridade"],
    ["Cliente conta o resultado", "Prova social"],
    ["Comparação com alternativa", "Contraste"],
  ] as const;

  return concepts.map(([name, angle], index) => {
    const channel = acquisition[index % Math.max(acquisition.length, 1)];
    const seedDate =
      snapshot.days[index % Math.max(snapshot.days.length, 1)]?.date ??
      "2026-01-01";
    const hookRate = 0.22 + hashDate(seedDate, 501 + index) * 0.31;
    const holdRate = 0.14 + hashDate(seedDate, 521 + index) * 0.29;
    const ctr = 0.008 + hashDate(seedDate, 541 + index) * 0.034;
    const cvr = 0.014 + hashDate(seedDate, 561 + index) * 0.058;
    const frequency = 1.5 + hashDate(seedDate, 581 + index) * 3.8;
    const fatigue = Math.min(
      1,
      Math.max(0, (frequency - 1.6) / 4 + Math.max(0, 0.018 - ctr) * 8),
    );
    const cpa =
      (channel?.ncCac ?? snapshot.ncCac) *
      (0.72 + hashDate(seedDate, 601 + index) * 0.72);
    const contribution = Math.round(
      (channel?.contribution ?? snapshot.lucroContribuicao / 3) *
        (0.1 + hashDate(seedDate, 621 + index) * 0.18),
    );
    const status =
      fatigue > 0.72
        ? "Trocar"
        : contribution > 0 && cpa <= snapshot.ncCac * 0.9
          ? "Escalar"
          : ctr < 0.012 || cvr < 0.022
            ? "Validar"
            : "Manter";

    return {
      id: `CR-${String(index + 1).padStart(2, "0")}`,
      name,
      angle,
      channel: channel?.name ?? "Face ADS",
      channelColor: channel?.color ?? "#f5f5f5",
      hookRate,
      holdRate,
      ctr,
      cvr,
      cpa,
      frequency,
      fatigue,
      contribution,
      status,
    };
  });
}

export function financialBridge(
  snapshot: ExecutiveSnapshot,
): FinancialBridgeStep[] {
  return [
    {
      key: "approved",
      label: "Receita aprovada",
      value: snapshot.receitaAprovada,
      kind: "start",
      description: "Pagamentos aprovados no período.",
    },
    {
      key: "refund",
      label: "Reembolsos",
      value: -snapshot.reembolso,
      kind: "cost",
      description: "Estimativa demonstrativa de devoluções.",
    },
    {
      key: "chargeback",
      label: "Chargebacks",
      value: -snapshot.chargeback,
      kind: "cost",
      description: "Estimativa demonstrativa de contestações.",
    },
    {
      key: "fees",
      label: "Taxas",
      value: -snapshot.taxas,
      kind: "cost",
      description: "Gateway, checkout e tarifa por pedido.",
    },
    {
      key: "media",
      label: "Mídia",
      value: -snapshot.gastoMidia,
      kind: "cost",
      description: "Face, Google e YouTube Ads.",
    },
    {
      key: "product",
      label: "Produto",
      value: -snapshot.custoProduto,
      kind: "cost",
      description: "Plataforma, comissões e suporte.",
    },
    {
      key: "contribution",
      label: "Lucro de contribuição",
      value: snapshot.lucroContribuicao,
      kind: "result",
      description:
        "Resultado depois de todos os custos variáveis demonstrados.",
    },
  ];
}

export function trendPoints(snapshot: ExecutiveSnapshot): TrendPoint[] {
  return [...snapshot.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const f = financeSummary([day]);
      return {
        date: day.date,
        label: shortDate(day.date),
        approved: f.caixaRecebido,
        netRevenue: f.caixaRecebido - f.reembolso - f.chargeback,
        contribution: f.lucroContribuicao,
        spend: f.gastoAnuncio,
      };
    });
}

/**
 * Economia de cliente do período.
 *
 * Reúne as quatro leituras que os painéis de referência tratam como o teste
 * de que o negócio fecha a conta: quanto um cliente devolve (LTV), quanto
 * ele custou (CAC), a razão entre os dois e em quantas compras ele paga o
 * próprio custo.
 *
 * Um aviso que precisa viajar junto do número: o LTV aqui é de 90 dias, e a
 * meta de mercado de 3:1 é medida em 24 meses. Comparar um com o outro dá
 * um diagnóstico errado — em 90 dias o que se espera é o cliente ter se
 * pagado, ou seja, razão a partir de 1.
 */
export interface CustomerEconomics {
  ltv90: number;
  cac: number;
  /** Null quando não houve custo de aquisição para dividir. */
  ltvCac: number | null;
  /** Em COMPRAS, não em dias: o modelo não conhece o intervalo entre elas. */
  paybackCompras: number;
  taxaRecompra: number;
  novosClientes: number;
  recorrentes: number;
  pedidos: number;
}

export function customerEconomics(days: DemoRevenueDay[]): CustomerEconomics {
  const f = financeSummary(days);
  const taxaRecompra = calculateRepeatRate(f.clientesRecorrentes, f.pedidos);
  const ltv90 = estimateLtv90(f.ticket, taxaRecompra);

  return {
    ltv90,
    cac: f.ncCac,
    ltvCac: f.ncCac > 0 ? ltv90 / f.ncCac : null,
    paybackCompras: f.paybackCompras,
    taxaRecompra,
    novosClientes: f.novosClientes,
    recorrentes: f.clientesRecorrentes,
    pedidos: f.pedidos,
  };
}

/** A mesma leitura no período escolhido e no anterior, para comparar. */
export function customerEconomicsComparison(snapshot: ExecutiveSnapshot) {
  return {
    atual: customerEconomics(snapshot.days),
    anterior: customerEconomics(snapshot.previousDays),
  };
}

export function cohortRows(snapshot: ExecutiveSnapshot): CohortRow[] {
  const ordered = [...snapshot.days].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (ordered.length === 0) return [];
  const groups: DemoRevenueDay[][] = [];
  for (let i = Math.max(0, ordered.length - 35); i < ordered.length; i += 7) {
    groups.push(ordered.slice(i, i + 7));
  }

  return groups.slice(-5).map((group, index) => {
    const f = financeSummary(group);
    const seedDate = group[0]?.date ?? snapshot.days[0]?.date ?? "2026-01-01";
    const retention30 = 0.2 + hashDate(seedDate, 401) * 0.18;
    const retention60 = retention30 * (0.58 + hashDate(seedDate, 403) * 0.18);
    const retention90 = retention60 * (0.6 + hashDate(seedDate, 407) * 0.2);
    const ltv0 = f.ticket;
    const ltv30 = ltv0 * (1 + retention30 * 0.74);
    const ltv60 = ltv30 + ltv0 * retention60 * 0.68;
    const ltv90 = ltv60 + ltv0 * retention90 * 0.64;
    const margin90 = Math.max(0, f.margemContribuicao + retention90 * 0.16);
    return {
      label: `Coorte ${index + 1} · ${shortDate(seedDate)}`,
      customers: f.novosClientes,
      ltv0,
      ltv30,
      ltv60,
      ltv90,
      retention90,
      margin90,
    };
  });
}

export function executiveRisks(
  snapshot: ExecutiveSnapshot,
  acquisition: AcquisitionRow[],
): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = [];
  const worstChannel = [...acquisition].sort(
    (a, b) => a.marginalRoas - b.marginalRoas,
  )[0];
  const bestChannel = [...acquisition].sort(
    (a, b) => b.marginalRoas - a.marginalRoas,
  )[0];

  if (snapshot.taxaAprovacao < 0.94) {
    risks.push({
      id: "approval",
      title: "Aprovação abaixo do nível interno esperado",
      severity: snapshot.taxaAprovacao < 0.9 ? "Crítico" : "Alto",
      tone: snapshot.taxaAprovacao < 0.9 ? "destructive" : "warning",
      impact: -snapshot.receitaRecusada * 0.38,
      evidence: `${(snapshot.taxaAprovacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de aprovação entre pagamentos resolvidos.`,
      cause:
        "Associado à concentração de recusas; gateway e método de pagamento precisam ser verificados.",
      action:
        "Segmentar recusas por gateway, bandeira e dispositivo e testar rota alternativa de pagamento.",
      confidence: snapshot.dataQuality >= 0.9 ? "Alta" : "Média",
      owner: "Operações",
      horizon: "Hoje",
    });
  }

  if (snapshot.margemContribuicao < 0.18) {
    risks.push({
      id: "margin",
      title: "Margem de contribuição sob pressão",
      severity: snapshot.margemContribuicao < 0.08 ? "Crítico" : "Alto",
      tone: snapshot.margemContribuicao < 0.08 ? "destructive" : "warning",
      impact: snapshot.lucroContribuicao - snapshot.caixaRecebido * 0.18,
      evidence: `A margem ficou em ${(snapshot.margemContribuicao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% para uma referência interna de 18%.`,
      cause:
        "Provavelmente influenciada por mídia e custos variáveis; não é uma conclusão causal.",
      action:
        "Revisar a ponte financeira e congelar escala nos canais com retorno marginal baixo.",
      confidence: "Média",
      owner: "FP&A",
      horizon: "24 horas",
    });
  }

  if (
    worstChannel &&
    (worstChannel.saturation > 0.92 || worstChannel.marginalRoas < 1.1)
  ) {
    risks.push({
      id: `channel-${worstChannel.name}`,
      title: `${worstChannel.name} perdeu eficiência marginal`,
      severity: "Atenção",
      tone: "warning",
      impact: -Math.max(
        0,
        worstChannel.spend * (1.2 - worstChannel.marginalRoas) * 0.32,
      ),
      evidence: `mROAS demonstrativo de ${worstChannel.marginalRoas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x e saturação de ${(worstChannel.saturation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%.`,
      cause:
        "Associado a frequência e participação de gasto acima da participação de receita.",
      action:
        "Reduzir incrementalmente o orçamento e substituir criativos antes de voltar a escalar.",
      confidence: worstChannel.confidence >= 0.88 ? "Alta" : "Média",
      owner: "Growth",
      horizon: "Próximo ciclo",
    });
  }

  if (bestChannel) {
    risks.push({
      id: `opportunity-${bestChannel.name}`,
      title: `${bestChannel.name} concentra a melhor oportunidade de escala`,
      severity: "Oportunidade",
      tone: "success",
      impact: Math.max(
        0,
        bestChannel.spend * Math.max(0, bestChannel.marginalRoas - 1) * 0.18,
      ),
      evidence: `mROAS demonstrativo de ${bestChannel.marginalRoas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x com confiança de ${(bestChannel.confidence * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%.`,
      cause: "Maior eficiência marginal entre os canais no período analisado.",
      action:
        "Realocar verba em pequenos degraus e confirmar o incremento antes do próximo aumento.",
      confidence: bestChannel.confidence >= 0.88 ? "Alta" : "Média",
      owner: "Growth",
      horizon: "48 horas",
    });
  }

  return risks
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 4);
}

export function periodAnchorFromDays(days: DemoRevenueDay[]) {
  const today = toIso(Date.now());
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const completed = ordered.filter((day) => day.date <= today);
  return completed.at(-1)?.date ?? ordered.at(-1)?.date ?? today;
}
