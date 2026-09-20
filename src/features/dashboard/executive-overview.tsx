"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Gauge,
  Info,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DemoRevenueDay } from "@/lib/demo-data";
import { DASHBOARD_METRICS } from "@/domain/metrics";
import type {
  AcquisitionRow,
  CohortRow,
  CreativeRow,
  ExecutiveKpi,
  ExecutivePeriod,
  ExecutiveRisk,
  ExecutiveSnapshot,
  ExecutiveTone,
  FinancialBridgeStep,
  TrendPoint,
} from "@/domain/analytics";
import type { FunnelStage } from "@/domain/finance";
import {
  buildExecutiveDashboardModel,
  type ExecutiveDashboardModel,
} from "@/services/analytics/executive-dashboard-service";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/shared/formatters/dashboard";
import {
  FILTERS_EVENT,
  FILTERS_STORAGE_KEY,
  writeStoredFilters,
  type StoredGlobalFilters,
} from "@/lib/dashboard-filters";
import { cn } from "@/lib/utils";
import { PageSection as ExecutiveSection } from "@/components/dashboard/page-section";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { AdvancedAnalyticsReadiness } from "@/features/dashboard/advanced-analytics-readiness";
import { BudgetPacing } from "@/features/dashboard/budget-pacing";
import { CampaignBreakdown } from "@/features/dashboard/campaign-breakdown";
import { ExecutiveActionPlan } from "@/features/dashboard/executive-action-plan";
import { ExecutiveDataConfidence } from "@/features/dashboard/executive-data-confidence";
import {
  ExecutiveFilterSystem,
  type ExecutiveFilterState,
} from "@/features/dashboard/executive-filter-system";
import {
  ExecutiveCalendar,
  ExecutiveOperationalTimeline,
} from "@/features/dashboard/executive-operational-timeline";

/** Chaves das sessões executivas — cada página do dashboard modular
    escolhe quais blocos renderiza, sem duplicar código nem perder função. */
export type ExecutiveSectionKey =
  | "context"
  | "confidence"
  | "result"
  | "financial-truth"
  | "financial-composition"
  | "trends"
  | "acquisition"
  | "funnel"
  | "customers"
  | "timeline"
  | "calendar"
  | "decisions"
  | "governance";

type ExecutiveKpiGroup = "cashflow" | "efficiency";

interface ExecutiveOverviewProps {
  days: DemoRevenueDay[];
  anchorDays: DemoRevenueDay[];
  demoMode: boolean;
  operationMinMonth: { year: number; month: number };
  operationMaxMonth: { year: number; month: number };
  dailyGoal: number;
  hourlyByDay: Record<string, { hour: string; valor: number }[]>;
  /** Sessões a renderizar. Sem o prop, renderiza todas (comportamento antigo). */
  sections?: ExecutiveSectionKey[];
  /** Esconde os cabeçalhos "Parte NN · título" quando a página já se apresenta. */
  bare?: boolean;
  /** Divide os seis KPIs em blocos independentes de três cards. */
  kpiGroup?: ExecutiveKpiGroup;
}

const KPI_GROUPS: Record<
  ExecutiveKpiGroup,
  { keys: ReadonlySet<string>; title: string; description: string }
> = {
  cashflow: {
    keys: new Set(["cash", "net", "contribution"]),
    title: "Entradas e resultado",
    description:
      "Três indicadores mostram quanto entrou, quanto virou venda líquida e quanto sobrou.",
  },
  efficiency: {
    keys: new Set(["margin", "mer", "nc-cac"]),
    title: "Eficiência e aquisição",
    description:
      "Três indicadores mostram margem, retorno de mídia e custo por cliente novo.",
  },
};

/** Ordem em que as sessões aparecem no JSX — base da numeração posicional. */
const SECTION_RENDER_ORDER: ExecutiveSectionKey[] = [
  "financial-truth",
  "context",
  "confidence",
  "result",
  "financial-composition",
  "trends",
  "acquisition",
  "funnel",
  "customers",
  "timeline",
  "calendar",
  "decisions",
  "governance",
];

const toneText: Record<ExecutiveTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
  neutral: "text-muted-foreground",
};

const toneBorder: Record<ExecutiveTone, string> = {
  success: "border-success/25 bg-success/[0.045]",
  warning: "border-warning/30 bg-warning/[0.055]",
  destructive: "border-destructive/25 bg-destructive/[0.045]",
  info: "border-info/20 bg-info/[0.045]",
  neutral: "border-border bg-muted/20",
};

const toneVariant: Record<
  ExecutiveTone,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  info: "info",
  neutral: "muted",
};

function formatKpiValue(kpi: ExecutiveKpi) {
  if (kpi.format === "currency") return formatCompactCurrency(kpi.value);
  if (kpi.format === "percent") return formatPercent(kpi.value);
  if (kpi.format === "ratio") return formatRatio(kpi.value);
  return formatInteger(kpi.value);
}

function formatGoal(kpi: ExecutiveKpi) {
  if (kpi.format === "currency") return formatCompactCurrency(kpi.goal);
  if (kpi.format === "percent") return formatPercent(kpi.goal);
  if (kpi.format === "ratio") return formatRatio(kpi.goal);
  return formatInteger(kpi.goal);
}

function formatKpiPoint(kpi: ExecutiveKpi, value: number) {
  if (kpi.format === "currency") return formatCompactCurrency(value);
  if (kpi.format === "percent") return formatPercent(value);
  if (kpi.format === "ratio") return formatRatio(value);
  return formatInteger(value);
}

function goalProgress(kpi: ExecutiveKpi) {
  if (kpi.goal <= 0) return 0;
  if (kpi.goalDirection === "lower")
    return Math.min(1, kpi.goal / Math.max(kpi.value, 0.01));
  return Math.min(1, kpi.value / kpi.goal);
}

/*
  ────────────────────────────────────────────────────────────────
  Linguagem simples
  ────────────────────────────────────────────────────────────────
  Os nomes técnicos (MER, NC-CAC, "lucro de contribuição") só fazem
  sentido para quem já conhece o jargão. Aqui cada indicador ganha um
  nome do dia a dia e uma frase que explica o que ele significa em
  dinheiro. O nome técnico e a fórmula continuam disponíveis no ⓘ.
*/
const PLAIN_KPI: Record<
  string,
  { name: string; help: (kpi: ExecutiveKpi) => string }
> = {
  cash: {
    name: "Dinheiro que entrou",
    help: () => "Pagamentos que já caíram na conta.",
  },
  net: {
    name: "Vendas limpas",
    help: () => "Vendas após devoluções e cancelamentos.",
  },
  contribution: {
    name: "O que sobrou no fim",
    help: () => "Resultado após anúncios, taxas e produto.",
  },
  margin: {
    name: "Quanto sobra de cada venda",
    help: () => "Valor preservado a cada R$ 100 vendidos.",
  },
  mer: {
    name: "Retorno do anúncio",
    help: () => "Receita gerada por real investido em anúncios.",
  },
  "nc-cac": {
    name: "Custo de um cliente novo",
    help: () => "Investimento para conquistar um cliente novo.",
  },
};

/** "Provisório"/"Estimado" ditos como se fala. */
function plainStatus(status: ExecutiveKpi["status"]) {
  if (status === "confirmed") return "Número confirmado";
  if (status === "provisional") return "Ainda pode mudar";
  return "É uma estimativa";
}

/** A variação em palavras: subiu ou caiu, e se isso é bom ou ruim. */
function plainChange(kpi: ExecutiveKpi) {
  const better =
    kpi.goalDirection === "lower" ? kpi.delta <= 0 : kpi.delta >= 0;
  if (Math.abs(kpi.delta) < 0.005) {
    return {
      text: "Ficou igual ao período anterior",
      better: true,
      flat: true,
    };
  }
  const amount = Math.abs(kpi.delta * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });
  const direction = kpi.delta >= 0 ? "Subiu" : "Caiu";
  return {
    text: `${direction} ${amount}% — ${better ? "isso é bom" : "isso é ruim"}`,
    better,
    flat: false,
  };
}

/** Onde o número está em relação à meta, em palavras. */
function plainGoal(kpi: ExecutiveKpi) {
  const progress = goalProgress(kpi);
  if (progress >= 1)
    return { text: "Chegou na meta", tone: "success" as const, progress };
  if (progress >= 0.8)
    return { text: "Quase na meta", tone: "warning" as const, progress };
  return {
    text: "Ainda longe da meta",
    tone: "destructive" as const,
    progress,
  };
}

function KpiPillars({ kpi, color }: { kpi: ExecutiveKpi; color: string }) {
  const chartData = kpi.sparkline.map((value, index) => ({
    point: index + 1,
    value,
  }));
  const firstValue = chartData[0]?.value ?? kpi.value;
  const lastValue = chartData.at(-1)?.value ?? kpi.value;
  const gradientId = `kpi-pillar-${kpi.key}`;

  return (
    <div
      className="executive-kpi__pillars px-2.5 pt-2.5 pb-2 text-center"
      data-kpi-pillars
    >
      <p className="executive-kpi__chart-title text-muted-foreground truncate px-1 whitespace-nowrap">
        Evolução no período · {chartData.length} pilares
      </p>
      <div
        className="mt-1 h-24 min-w-0"
        data-kpi-chart
        role="img"
        aria-label={`Evolução de ${kpi.label}: começou em ${formatKpiPoint(kpi, firstValue)} e terminou em ${formatKpiPoint(kpi, lastValue)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 4, bottom: 2, left: 4 }}
            barCategoryGap="22%"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.32} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 5"
              vertical={false}
              opacity={0.42}
            />
            <XAxis dataKey="point" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <ReferenceLine
              y={firstValue}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <RechartsTooltip
              cursor={{ stroke: "var(--color-border)" }}
              contentStyle={{
                backgroundColor: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                color: "var(--color-popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value) => [
                formatKpiPoint(kpi, Number(value)),
                "Valor",
              ]}
              labelFormatter={(label) => `Ponto ${label}`}
            />
            <Bar
              dataKey="value"
              fill={`url(#${gradientId})`}
              stroke={color}
              strokeWidth={0.8}
              radius={[3, 3, 1, 1]}
              maxBarSize={22}
              minPointSize={4}
              isAnimationActive={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`${kpi.key}-${entry.point}`}
                  fillOpacity={index === chartData.length - 1 ? 1 : 0.82}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="executive-kpi__chart-caption text-muted-foreground truncate px-1 whitespace-nowrap tabular-nums">
        Início {formatKpiPoint(kpi, firstValue)} · Agora{" "}
        {formatKpiPoint(kpi, lastValue)}
      </p>
    </div>
  );
}

/**
 * Cartão visual de indicador: o valor abre a leitura, a curva mostra a
 * direção e o medidor responde quanto falta para a meta. Texto e ícones
 * mantêm a interpretação acessível sem depender apenas da cor.
 */
function ExecutiveKpiCard({ kpi }: { kpi: ExecutiveKpi }) {
  const metric = DASHBOARD_METRICS[kpi.metricKey];
  const plain = PLAIN_KPI[kpi.key];
  const plainName = plain?.name ?? kpi.label;
  const helpText = plain?.help(kpi) ?? metric.description;
  const change = plainChange(kpi);
  const goal = plainGoal(kpi);
  const changeAmount = `${kpi.delta >= 0 ? "+" : "−"}${Math.abs(
    kpi.delta * 100,
  ).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  const changeLabel = change.flat
    ? "Estável"
    : change.better
      ? "Melhorou"
      : "Piorou";
  const chartColor = change.flat
    ? "var(--color-muted-foreground)"
    : change.better
      ? "var(--color-success)"
      : "var(--color-destructive)";
  const goalColor =
    goal.tone === "success"
      ? "var(--color-success)"
      : goal.tone === "warning"
        ? "var(--color-warning)"
        : "var(--color-destructive)";
  const goalPercent = Math.round(goal.progress * 100);

  return (
    <Card className="executive-kpi h-full min-w-0 gap-0 border-0 bg-transparent py-0 text-center shadow-none">
      <CardHeader className="executive-kpi__header px-4 pt-4 pb-3 text-center">
        <div className="executive-kpi__title-row relative grid min-h-6 place-items-center px-7">
          <h4
            className="executive-kpi__title w-full truncate text-center whitespace-nowrap"
            title={plainName}
          >
            {plainName}
          </h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-0 -translate-y-1/2 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`O que significa ${plainName}`}
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-80 space-y-1.5 text-left text-sm">
              <p className="font-semibold">Nome técnico: {kpi.label}</p>
              <p>{metric.description}</p>
              <p>
                <strong>Conta:</strong> {metric.formula}
              </p>
              <p>
                <strong>De onde vem:</strong> {metric.source}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <p className="executive-kpi__value mt-2 truncate text-center whitespace-nowrap tabular-nums">
          {formatKpiValue(kpi)}
        </p>
        <p
          className="executive-kpi__description text-muted-foreground mt-2 truncate text-center whitespace-nowrap"
          title={helpText}
        >
          {helpText}
        </p>
      </CardHeader>

      <CardContent className="executive-kpi__body grid flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-3 px-4 pb-4 text-center">
        <KpiPillars kpi={kpi} color={chartColor} />

        <div className="executive-kpi__comparison-grid grid grid-cols-2 items-stretch gap-2 text-center">
          <div className="executive-kpi__comparison relative grid min-w-0 grid-rows-[auto_1fr_auto] place-items-center px-3 pt-5 pb-2.5 text-center">
            <p className="executive-kpi__eyebrow text-muted-foreground w-full truncate whitespace-nowrap uppercase">
              Período anterior
            </p>
            {!change.flat &&
              (kpi.delta >= 0 ? (
                <ArrowUpRight
                  className={cn(
                    "executive-kpi__comparison-arrow absolute top-2 right-2 size-3.5",
                    change.better ? "text-success" : "text-destructive",
                  )}
                  aria-hidden
                />
              ) : (
                <ArrowDownRight
                  className={cn(
                    "executive-kpi__comparison-arrow absolute top-2 right-2 size-3.5",
                    change.better ? "text-success" : "text-destructive",
                  )}
                  aria-hidden
                />
              ))}
            <div
              className={cn(
                "executive-kpi__comparison-value mt-1.5 flex w-full items-center justify-center whitespace-nowrap",
                change.flat
                  ? "text-muted-foreground"
                  : change.better
                    ? "text-success"
                    : "text-destructive",
              )}
              aria-label={change.text}
            >
              <span className="tabular-nums">{changeAmount}</span>
            </div>
            <p
              className={cn(
                "executive-kpi__comparison-label mt-0.5 w-full truncate text-center whitespace-nowrap",
                change.flat
                  ? "text-muted-foreground"
                  : change.better
                    ? "text-success"
                    : "text-destructive",
              )}
            >
              {changeLabel}
            </p>
          </div>

          <div className="executive-kpi__comparison relative grid min-w-0 grid-rows-[auto_1fr_auto] place-items-center px-3 pt-5 pb-2.5 text-center">
            <p className="executive-kpi__eyebrow text-muted-foreground w-full truncate whitespace-nowrap uppercase">
              Meta do período
            </p>
            <p
              className={cn(
                "executive-kpi__comparison-value mt-1.5 w-full truncate text-center whitespace-nowrap tabular-nums",
                goal.tone === "success"
                  ? "text-success"
                  : goal.tone === "warning"
                    ? "text-warning"
                    : "text-destructive",
              )}
            >
              {goalPercent}% atingido
            </p>
            <p className="executive-kpi__comparison-label text-muted-foreground mt-0.5 w-full truncate text-center whitespace-nowrap tabular-nums">
              alvo {formatGoal(kpi)}
            </p>
          </div>
        </div>

        <div className="executive-kpi__goal mt-auto space-y-2 p-3 text-center">
          <div className="flex min-w-0 items-center justify-center gap-1.5 overflow-hidden text-center">
            <span
              className={cn(
                "executive-kpi__goal-state truncate whitespace-nowrap",
                goal.tone === "success"
                  ? "text-success"
                  : goal.tone === "warning"
                    ? "text-warning"
                    : "text-destructive",
              )}
            >
              {goal.text}
            </span>
            <span className="text-muted-foreground shrink-0" aria-hidden>
              ·
            </span>
            <span className="executive-kpi__goal-note text-muted-foreground truncate whitespace-nowrap">
              {plainStatus(kpi.status)}
            </span>
          </div>
          <div
            className="bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-label={`Progresso de ${plainName} em relação à meta`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goalPercent}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${goalPercent}%`,
                backgroundColor: goalColor,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutiveVerdict({ snapshot }: { snapshot: ExecutiveSnapshot }) {
  const icon =
    snapshot.verdict.tone === "success" ? (
      <CheckCircle2 className="size-6" />
    ) : snapshot.verdict.tone === "destructive" ? (
      <AlertTriangle className="size-6" />
    ) : snapshot.verdict.tone === "warning" ? (
      <Gauge className="size-6" />
    ) : (
      <Database className="size-6" />
    );

  return (
    <section
      className={cn(
        "grid gap-5 rounded-2xl border p-4 sm:p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]",
        toneBorder[snapshot.verdict.tone],
      )}
      aria-labelledby="executive-verdict-title"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={toneVariant[snapshot.verdict.tone]}>
            {snapshot.verdict.status}
          </StatusBadge>
          <span className="text-muted-foreground text-xs">
            Confiança {snapshot.verdict.confidence} · dados demonstrativos
          </span>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <div
            className={cn("mt-0.5 shrink-0", toneText[snapshot.verdict.tone])}
          >
            {icon}
          </div>
          <div>
            <h2
              id="executive-verdict-title"
              className="text-xl leading-tight font-extrabold tracking-tight sm:text-2xl"
            >
              {snapshot.verdict.summary}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
              {snapshot.verdict.cause}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <div className="bg-background/70 rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Impacto vs. período anterior
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-extrabold tracking-tight tabular-nums",
              snapshot.verdict.impact >= 0
                ? "text-success"
                : "text-destructive",
            )}
          >
            {formatCompactCurrency(snapshot.verdict.impact)}
          </p>
        </div>
        <div className="bg-background/70 rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Decisão recomendada
          </p>
          <p className="mt-2 text-sm leading-5 font-semibold">
            {snapshot.verdict.action}
          </p>
        </div>
      </div>
    </section>
  );
}

function FinancialBridge({
  snapshot,
  steps,
}: {
  snapshot: ExecutiveSnapshot;
  steps: FinancialBridgeStep[];
}) {
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);

  return (
    <Card id="financial-bridge" className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Ponte financeira</CardTitle>
            <CardDescription className="mt-1">
              Para onde foi cada real aprovado no período.
            </CardDescription>
          </div>
          <Badge variant="outline">Composição do resultado</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {steps.map((step) => {
          const width = Math.max(3, (Math.abs(step.value) / max) * 100);
          return (
            <div
              key={step.key}
              className="grid gap-2 sm:grid-cols-[minmax(130px,.6fr)_minmax(160px,1fr)_auto] sm:items-center"
            >
              <div>
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="text-muted-foreground text-xs">
                  {step.description}
                </p>
              </div>
              <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    step.kind === "start"
                      ? "bg-info"
                      : step.kind === "result"
                        ? snapshot.lucroContribuicao >= 0
                          ? "bg-success"
                          : "bg-destructive"
                        : "bg-foreground/35",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p
                className={cn(
                  "text-right text-sm font-extrabold tabular-nums",
                  step.kind === "cost" && "text-destructive",
                  step.kind === "result" &&
                    (step.value >= 0 ? "text-success" : "text-destructive"),
                )}
              >
                {step.value < 0 ? "−" : ""}
                {formatCompactCurrency(Math.abs(step.value))}
              </p>
            </div>
          );
        })}
        <div className="bg-muted/50 mt-4 grid gap-2 rounded-xl p-3 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">Custos variáveis</p>
            <p className="mt-1 font-bold tabular-nums">
              {formatCompactCurrency(
                snapshot.caixaRecebido - snapshot.lucroContribuicao,
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              % do caixa consumido
            </p>
            <p className="mt-1 font-bold tabular-nums">
              {formatPercent(1 - snapshot.margemContribuicao)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              Resultado preservado
            </p>
            <p
              className={cn(
                "mt-1 font-bold tabular-nums",
                snapshot.lucroContribuicao >= 0
                  ? "text-success"
                  : "text-destructive",
              )}
            >
              {formatPercent(snapshot.margemContribuicao)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function aggregateTrend(
  data: TrendPoint[],
  granularity: ExecutiveFilterState["granularity"],
) {
  if (granularity === "day" || granularity === "hour") return data;
  if (granularity === "week") {
    const groups: TrendPoint[] = [];
    for (let index = 0; index < data.length; index += 7) {
      const chunk = data.slice(index, index + 7);
      const first = chunk[0];
      const last = chunk.at(-1);
      if (!first || !last) continue;
      groups.push({
        date: first.date,
        label: `${first.label}–${last.label}`,
        approved: chunk.reduce((sum, point) => sum + point.approved, 0),
        netRevenue: chunk.reduce((sum, point) => sum + point.netRevenue, 0),
        contribution: chunk.reduce((sum, point) => sum + point.contribution, 0),
        spend: chunk.reduce((sum, point) => sum + point.spend, 0),
      });
    }
    return groups;
  }

  const byMonth = new Map<string, TrendPoint>();
  data.forEach((point) => {
    const key = point.date.slice(0, 7);
    const current = byMonth.get(key);
    if (current) {
      current.approved += point.approved;
      current.netRevenue += point.netRevenue;
      current.contribution += point.contribution;
      current.spend += point.spend;
    } else {
      const [year, month] = key.split("-");
      byMonth.set(key, {
        ...point,
        label: `${month}/${year}`,
      });
    }
  });
  return Array.from(byMonth.values());
}

function TrendChart({
  data,
  granularity,
}: {
  snapshot: ExecutiveSnapshot;
  data: TrendPoint[];
  granularity: ExecutiveFilterState["granularity"];
}) {
  const chartData = React.useMemo(
    () => aggregateTrend(data, granularity),
    [data, granularity],
  );

  return (
    <Card className="min-w-0 gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Crescimento com qualidade</CardTitle>
            <CardDescription className="mt-1">
              Receita, lucro e mídia no mesmo eixo · granularidade{" "}
              {granularity === "week"
                ? "semanal"
                : granularity === "month"
                  ? "mensal"
                  : "diária"}
              .
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              ["Receita líquida", "var(--color-chart-1)"],
              ["Lucro de contribuição", "var(--color-chart-2)"],
              ["Mídia", "var(--color-chart-3)"],
            ].map(([label, color]) => (
              <span
                key={label}
                className="text-muted-foreground flex items-center gap-1.5"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-2 sm:px-5">
        <div
          className="h-[310px] min-w-0"
          role="img"
          aria-label="Tendência diária de receita líquida, lucro de contribuição e investimento em mídia"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                tickFormatter={(value: number) => formatCompactCurrency(value)}
              />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-popover-foreground)",
                  fontSize: 13,
                }}
                formatter={(value, name) => [
                  formatCurrency(Number(value), 2),
                  name === "netRevenue"
                    ? "Receita líquida"
                    : name === "contribution"
                      ? "Lucro de contribuição"
                      : "Mídia",
                ]}
                labelFormatter={(label) => `Data ${label}`}
              />
              <Line
                type="monotone"
                dataKey="netRevenue"
                stroke="var(--color-chart-1)"
                strokeWidth={2.4}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="contribution"
                stroke="var(--color-chart-2)"
                strokeWidth={2.2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="spend"
                stroke="var(--color-chart-3)"
                strokeWidth={1.8}
                dot={false}
                strokeDasharray="5 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionBadge({ row }: { row: AcquisitionRow }) {
  const variant =
    row.action === "Escalar"
      ? "success"
      : row.action === "Reduzir"
        ? "destructive"
        : row.action === "Validar"
          ? "warning"
          : "info";
  return <StatusBadge variant={variant}>{row.action}</StatusBadge>;
}

function AcquisitionPerformance({
  rows,
}: {
  snapshot: ExecutiveSnapshot;
  rows: AcquisitionRow[];
}) {
  return (
    <Card id="acquisition-performance" className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              Aquisição e retorno marginal
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              ROAS mede receita atribuída. ROI usa lucro de contribuição. mROAS
              e saturação são estimativas demonstrativas para orientar
              investigação, não automação de verba.
            </CardDescription>
          </div>
          <Badge variant="outline">Plataforma + first-party</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-5">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                {[
                  "Canal",
                  "Mídia",
                  "Receita",
                  "Contribuição",
                  "ROAS",
                  "ROI",
                  "NC-CAC",
                  "mROAS",
                  "Saturação",
                  "Decisão",
                ].map((heading, index) => (
                  <th
                    key={heading}
                    className={cn(
                      "border-b px-3 py-3 font-semibold",
                      index > 0 && index < 9 && "text-right",
                    )}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="hover:bg-muted/40">
                  <td className="border-b px-3 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      {row.name}
                    </span>
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatCompactCurrency(row.spend)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatCompactCurrency(row.revenue)}
                  </td>
                  <td
                    className={cn(
                      "border-b px-3 py-3 text-right font-bold tabular-nums",
                      row.contribution >= 0
                        ? "text-success"
                        : "text-destructive",
                    )}
                  >
                    {formatCompactCurrency(row.contribution)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatRatio(row.roas)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatPercent(row.roi)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatCompactCurrency(row.ncCac)}
                  </td>
                  <td className="border-b px-3 py-3 text-right font-bold tabular-nums">
                    {formatRatio(row.marginalRoas)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatPercent(row.saturation)}
                  </td>
                  <td className="border-b px-3 py-3">
                    <ActionBadge row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 lg:hidden">
          {rows.map((row) => (
            <article key={row.name} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  {row.name}
                </span>
                <ActionBadge row={row} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Mídia", formatCompactCurrency(row.spend)],
                  ["Receita", formatCompactCurrency(row.revenue)],
                  ["ROAS", formatRatio(row.roas)],
                  ["ROI", formatPercent(row.roi)],
                  ["NC-CAC", formatCompactCurrency(row.ncCac)],
                  ["mROAS", formatRatio(row.marginalRoas)],
                  ["Saturação", formatPercent(row.saturation)],
                  ["Confiança", formatPercent(row.confidence)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-bold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CreativeIntelligence({
  rows,
}: {
  snapshot: ExecutiveSnapshot;
  rows: CreativeRow[];
}) {
  const statusVariant = {
    Escalar: "success",
    Manter: "info",
    Trocar: "destructive",
    Validar: "warning",
  } as const;

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Creative Intelligence</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Atenção, retenção, clique, venda, custo e fadiga na mesma leitura.
              Os valores são demonstrativos até a integração com as APIs de
              mídia.
            </CardDescription>
          </div>
          <Badge variant="outline">6 criativos</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: row.channelColor }}
                  />
                  {row.id} · {row.channel} · {row.angle}
                </p>
                <h3
                  className="mt-2 truncate text-sm font-bold"
                  title={row.name}
                >
                  {row.name}
                </h3>
              </div>
              <StatusBadge variant={statusVariant[row.status]}>
                {row.status}
              </StatusBadge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Hook", formatPercent(row.hookRate)],
                ["Hold", formatPercent(row.holdRate)],
                ["CTR", formatPercent(row.ctr, 2)],
                ["CVR", formatPercent(row.cvr, 2)],
                ["CPA", formatCompactCurrency(row.cpa)],
                ["Freq.", formatRatio(row.frequency)],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/40 rounded-lg p-2">
                  <p className="text-muted-foreground text-xs font-semibold uppercase">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>Fadiga criativa</span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    row.fatigue > 0.72
                      ? "text-destructive"
                      : row.fatigue > 0.5
                        ? "text-warning"
                        : "text-success",
                  )}
                >
                  {formatPercent(row.fatigue)}
                </span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.fatigue > 0.72
                      ? "bg-destructive"
                      : row.fatigue > 0.5
                        ? "bg-warning"
                        : "bg-success",
                  )}
                  style={{ width: `${row.fatigue * 100}%` }}
                />
              </div>
              <p
                className={cn(
                  "pt-1 text-xs font-semibold tabular-nums",
                  row.contribution >= 0 ? "text-success" : "text-destructive",
                )}
              >
                Contribuição estimada: {formatCompactCurrency(row.contribution)}
              </p>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function AttributionConfidence({ snapshot }: { snapshot: ExecutiveSnapshot }) {
  const platform = snapshot.receitaAprovada * 1.13;
  const firstParty = snapshot.receitaAprovada;
  const assisted = snapshot.receitaAprovada * 0.21;
  const incremental = snapshot.receitaAprovada * 0.79;
  const max = Math.max(platform, firstParty, incremental, 1);
  const rows = [
    {
      label: "Reportado pelas plataformas",
      value: platform,
      color: "#f5f5f5",
      status: "Atribuído",
    },
    {
      label: "Receita first-party",
      value: firstParty,
      color: "#c2c2c2",
      status: "Observado",
    },
    {
      label: "Conversões assistidas",
      value: assisted,
      color: "#909090",
      status: "Sobreposição",
    },
    {
      label: "Receita incremental estimada",
      value: incremental,
      color: "#6a6a6a",
      status: "Modelado",
    },
  ];

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Atribuição e confiança</CardTitle>
            <CardDescription className="mt-1">
              A divergência entre plataforma, first-party e incrementalidade
              permanece visível em vez de ser escondida por um único número.
            </CardDescription>
          </div>
          <StatusBadge
            variant={snapshot.dataQuality >= 0.9 ? "success" : "warning"}
          >
            Confiança {formatPercent(snapshot.dataQuality)}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {rows.map((row) => (
          <div
            key={row.label}
            /* minmax(0,…) nas duas primeiras colunas: com um mínimo fixo
               (150px + 180px) elas não encolhiam e o valor da direita
               escapava do cartão em colunas estreitas. */
            className="grid gap-2 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)_auto] sm:items-center"
          >
            <div>
              <p className="text-sm font-semibold">{row.label}</p>
              <p className="text-muted-foreground text-xs">{row.status}</p>
            </div>
            <div className="bg-muted h-2.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>
            <p className="text-right text-sm font-bold tabular-nums">
              {formatCompactCurrency(row.value)}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-info/20 bg-info/[0.045] p-3 text-sm leading-6">
          <strong>Regra de decisão:</strong> use first-party para operação,
          assistências para entender jornada e incrementalidade validada por
          testes ou MMM para grandes realocações de orçamento.
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelDiagnostic({
  stages,
}: {
  snapshot: ExecutiveSnapshot;
  stages: FunnelStage[];
}) {
  const max = stages[0]?.volume ?? 1;
  const opportunities = stages
    .map((stage, index) => ({ ...stage, index }))
    .filter((stage) => stage.index > 0)
    .sort((a, b) => b.dinheiroNaMesa - a.dinheiroNaMesa);
  const top = opportunities[0];

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-lg">Funil e perdas por etapa</CardTitle>
        <CardDescription className="mt-1">
          Benchmarks internos demonstrativos; substitua pelos históricos da
          empresa quando os dados reais estiverem conectados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {stages.map((stage, index) => {
          const width = (stage.volume / max) * 100;
          const isTop = stage.label === top?.label && stage.dinheiroNaMesa > 0;
          return (
            <div key={stage.label} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  {stage.label}
                  {isTop && <Badge variant="warning">Maior perda</Badge>}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatInteger(stage.volume)}
                  {index > 0 &&
                    ` · ${stage.conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </span>
              </div>
              <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isTop ? "bg-warning" : "bg-foreground/55",
                  )}
                  style={{ width: `${Math.max(width, 2)}%` }}
                />
              </div>
              {index > 0 && (
                <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    Referência interna:{" "}
                    {stage.benchmarkInterno.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    %
                  </span>
                  <span
                    className={
                      stage.dinheiroNaMesa > 0
                        ? "text-destructive"
                        : "text-success"
                    }
                  >
                    {stage.dinheiroNaMesa > 0
                      ? `${formatCompactCurrency(stage.dinheiroNaMesa)} de oportunidade estimada`
                      : "Dentro da referência"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CustomerCohorts({
  rows,
}: {
  snapshot: ExecutiveSnapshot;
  rows: CohortRow[];
}) {
  const maxLtv = Math.max(...rows.map((row) => row.ltv90), 1);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-lg">
          Clientes e qualidade da receita
        </CardTitle>
        <CardDescription className="mt-1">
          Coortes demonstrativas para separar aquisição barata de aquisição
          valiosa.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="px-2 py-2 text-left">Coorte</th>
                <th className="px-2 py-2 text-right">Novos</th>
                <th className="px-2 py-2 text-right">1ª compra</th>
                <th className="px-2 py-2 text-right">LTV 30d</th>
                <th className="px-2 py-2 text-right">LTV 60d</th>
                <th className="px-2 py-2 text-right">LTV 90d</th>
                <th className="px-2 py-2 text-right">Retenção 90d</th>
                <th className="px-2 py-2 text-right">Margem 90d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="bg-muted/40 rounded-l-lg px-2 py-3 font-semibold">
                    {row.label}
                  </td>
                  <td className="bg-muted/30 px-2 py-3 text-right tabular-nums">
                    {formatInteger(row.customers)}
                  </td>
                  {[row.ltv0, row.ltv30, row.ltv60, row.ltv90].map(
                    (value, index) => (
                      <td
                        key={`${row.label}-${index}`}
                        className="rounded px-2 py-3 text-right font-semibold tabular-nums"
                        style={{
                          backgroundColor: `color-mix(in oklch, var(--success) ${Math.max(5, (value / maxLtv) * 24)}%, transparent)`,
                        }}
                      >
                        {formatCompactCurrency(value)}
                      </td>
                    ),
                  )}
                  <td className="bg-muted/30 px-2 py-3 text-right tabular-nums">
                    {formatPercent(row.retention90)}
                  </td>
                  <td className="bg-muted/30 rounded-r-lg px-2 py-3 text-right tabular-nums">
                    {formatPercent(row.margin90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RiskCard({ risk }: { risk: ExecutiveRisk }) {
  return (
    <article className={cn("rounded-xl border p-4", toneBorder[risk.tone])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <StatusBadge variant={toneVariant[risk.tone]}>
            {risk.severity}
          </StatusBadge>
          <h3 className="mt-2 text-base leading-snug font-bold">
            {risk.title}
          </h3>
        </div>
        <p
          className={cn(
            "text-lg font-extrabold tabular-nums",
            risk.impact >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {formatCompactCurrency(risk.impact)}
        </p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs font-semibold uppercase">
            Evidência
          </dt>
          <dd className="mt-1 leading-5">{risk.evidence}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-semibold uppercase">
            Causa provável
          </dt>
          <dd className="mt-1 leading-5">{risk.cause}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-semibold uppercase">
            Ação
          </dt>
          <dd className="mt-1 leading-5 font-semibold">{risk.action}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs font-semibold uppercase">
            Responsável e prazo
          </dt>
          <dd className="mt-1 leading-5">
            {risk.owner} · {risk.horizon} · confiança {risk.confidence}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function DecisionCenter({
  risks,
}: {
  snapshot: ExecutiveSnapshot;
  risks: ExecutiveRisk[];
}) {
  return (
    <Card id="decision-center" className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Notificações do negócio</CardTitle>
            <CardDescription className="mt-1">
              O que mais mexe no dinheiro aparece primeiro.
            </CardDescription>
          </div>
          <Badge
            variant={
              risks.some((risk) => risk.severity === "Crítico")
                ? "destructive"
                : "outline"
            }
          >
            {risks.length} prioridades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 xl:grid-cols-2">
        {risks.map((risk) => (
          <RiskCard key={risk.id} risk={risk} />
        ))}
      </CardContent>
    </Card>
  );
}

function DataQuality({
  model,
  demoMode,
}: {
  model: ExecutiveDashboardModel;
  demoMode: boolean;
}) {
  const { snapshot, freshness } = model;
  const checks = freshness.map((source) => ({
    label: source.label,
    value: Math.round(source.completeness * 100),
    state: `${source.note}${source.latencyMinutes !== null ? ` · latência ${source.latencyMinutes}min` : ""}`,
  }));

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              Qualidade e linhagem dos dados
            </CardTitle>
            <CardDescription className="mt-1">
              Um número preciso ainda pode estar errado se a fonte estiver
              atrasada ou incompleta.
            </CardDescription>
          </div>
          <StatusBadge
            variant={snapshot.dataQuality >= 0.9 ? "success" : "warning"}
          >
            {formatPercent(snapshot.dataQuality)} de confiança
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {checks.map((check) => (
          <div
            key={check.label}
            className="grid gap-2 sm:grid-cols-[130px_1fr_auto] sm:items-center"
          >
            <p className="text-sm font-semibold">{check.label}</p>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full",
                  check.value >= 95
                    ? "bg-success"
                    : check.value >= 85
                      ? "bg-warning"
                      : "bg-destructive",
                )}
                style={{ width: `${check.value}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {check.state} · {check.value}%
            </p>
          </div>
        ))}
        <div className="bg-muted/50 mt-4 rounded-xl p-3 text-sm leading-6">
          <strong>Modo atual:</strong>{" "}
          {demoMode ? "demonstração" : "dados reais em preparação"}. Métricas de
          custos, coortes, mROAS e incrementalidade estão identificadas como
          estimativas; não devem acionar automações financeiras sem validação.
        </div>
      </CardContent>
    </Card>
  );
}

export function ExecutiveOverview({
  days,
  anchorDays,
  demoMode,
  operationMinMonth,
  operationMaxMonth,
  dailyGoal,
  hourlyByDay,
  sections,
  bare = false,
  kpiGroup,
}: ExecutiveOverviewProps) {
  const [period, setPeriod] = React.useState<ExecutivePeriod>("30d");
  const [selectedDates, setSelectedDates] = React.useState<string[] | null>(
    null,
  );
  const [filters, setFilters] = React.useState<ExecutiveFilterState>({
    comparison: "previous",
    granularity: "day",
    network: "all",
    product: "all",
    offer: "all",
    customerType: "all",
    paymentStatus: "all",
    dataStatus: "all",
  });

  /** A página mostra a sessão? Sem lista explícita, mostra todas. */
  const show = React.useCallback(
    (key: ExecutiveSectionKey) => !sections || sections.includes(key),
    [sections],
  );

  /**
   * Numeração posicional: as sessões são numeradas pela ordem em que
   * aparecem NESTA página, sem buracos quando a página exibe só parte
   * delas.
   */
  const numberOf = React.useCallback(
    (key: ExecutiveSectionKey) => {
      const visible = SECTION_RENDER_ORDER.filter(
        (item) => !sections || sections.includes(item),
      );
      return String(visible.indexOf(key) + 1).padStart(2, "0");
    },
    [sections],
  );

  // Recupera os filtros globais salvos ao montar (assíncrono para o HTML do
  // servidor e do cliente coincidirem) e persiste a cada mudança — assim o
  // contexto acompanha o CEO entre as páginas do dashboard. A flag impede
  // que o salvamento inicial (com os padrões) atropele o valor guardado
  // antes de ele ser lido.
  const filtersHydrated = React.useRef(false);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            period?: ExecutivePeriod;
            filters?: Partial<ExecutiveFilterState>;
            selectedDates?: string[] | null;
          };
          if (parsed.period) setPeriod(parsed.period);
          if (parsed.filters)
            setFilters((current) => ({ ...current, ...parsed.filters }));
          // Os dias escolhidos no calendário também acompanham a navegação:
          // o calendário mora numa página e a leitura do dia, em outras.
          if (parsed.selectedDates !== undefined)
            setSelectedDates(parsed.selectedDates);
        }
      } catch {
        // Storage indisponível ou corrompido: segue com os padrões.
      } finally {
        filtersHydrated.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Último conteúdo já sincronizado, em texto. Sem esta comparação, dois
  // blocos da mesma página ficariam se avisando em círculo: um salva, avisa
  // o outro, que salva de novo e avisa de volta, sem fim.
  const lastSyncedFilters = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!filtersHydrated.current) return;
    const payload = { period, filters: { ...filters }, selectedDates };
    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedFilters.current) return;
    lastSyncedFilters.current = serialized;
    writeStoredFilters(payload);
  }, [period, filters, selectedDates]);

  // Os blocos da página são independentes: quando um deles muda o período,
  // os outros precisam acompanhar sem esperar uma recarga.
  React.useEffect(() => {
    function onExternalChange(event: Event) {
      const detail = (event as CustomEvent<StoredGlobalFilters>).detail;
      if (!detail) return;
      lastSyncedFilters.current = JSON.stringify(detail);
      if (detail.period) setPeriod(detail.period as ExecutivePeriod);
      if (detail.filters)
        setFilters(
          (current) =>
            ({ ...current, ...detail.filters }) as ExecutiveFilterState,
        );
      if (detail.selectedDates !== undefined)
        setSelectedDates(detail.selectedDates);
    }
    window.addEventListener(FILTERS_EVENT, onExternalChange);
    return () => window.removeEventListener(FILTERS_EVENT, onExternalChange);
  }, []);

  const model = React.useMemo(
    () =>
      buildExecutiveDashboardModel({
        days,
        anchorDays,
        period,
        selectedDates: selectedDates ?? undefined,
      }),
    [days, anchorDays, period, selectedDates],
  );
  const { snapshot } = model;
  const activeKpiGroup = kpiGroup ? KPI_GROUPS[kpiGroup] : null;
  const visibleKpis = activeKpiGroup
    ? snapshot.kpis.filter((kpi) => activeKpiGroup.keys.has(kpi.key))
    : snapshot.kpis;
  const effectiveSelectedDates =
    selectedDates ?? snapshot.days.map((day) => day.date);
  const acquisitionRows = React.useMemo(
    () =>
      filters.network === "all"
        ? model.acquisition
        : model.acquisition.filter((row) => row.name === filters.network),
    [filters.network, model.acquisition],
  );
  const campaignRows = React.useMemo(
    () =>
      filters.network === "all"
        ? model.campaigns
        : model.campaigns.filter((row) => row.channel === filters.network),
    [filters.network, model.campaigns],
  );
  const creativeRows = React.useMemo(
    () =>
      filters.network === "all"
        ? model.creatives
        : model.creatives.filter((row) => row.channel === filters.network),
    [filters.network, model.creatives],
  );

  return (
    <div className="executive-dashboard space-y-5 sm:space-y-6">
      {/* Os KPIs abrem a página: o CEO vê caixa, lucro e margem antes de
          qualquer configuração de recorte. */}
      {show("financial-truth") && (
        <ExecutiveSection
          id={`section-financial-truth${kpiGroup ? `-${kpiGroup}` : ""}`}
          bare={bare}
          number={numberOf("financial-truth")}
          eyebrow="O dinheiro desta operação"
          title={activeKpiGroup?.title ?? "Como a operação está de dinheiro"}
          description={
            activeKpiGroup?.description ??
            "Seis números respondem tudo: quanto entrou, quanto sobrou e quanto custa trazer um cliente. São os números desta operação — o total somado da empresa fica na área Empresa. Toque no ⓘ de qualquer um para ver o nome técnico e como a conta é feita."
          }
          icon={CircleDollarSign}
          tone="success"
        >
          <div className="executive-kpi-grid grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleKpis.map((kpi) => (
              <ExecutiveKpiCard key={kpi.key} kpi={kpi} />
            ))}
          </div>
        </ExecutiveSection>
      )}

      {show("context") && (
        <ExecutiveSection
          id="section-context"
          bare={bare}
          number={numberOf("context")}
          eyebrow="Escopo da análise"
          title="Contexto e filtros globais"
          description="Defina primeiro o período, a comparação, a granularidade e o recorte da análise. Tudo abaixo deve respeitar este contexto."
          icon={Target}
          tone="neutral"
          aside={<Badge variant="outline">Filtros antes dos resultados</Badge>}
        >
          <ExecutiveFilterSystem
            period={period}
            onPeriodChange={(nextPeriod) => {
              setPeriod(nextPeriod);
              setSelectedDates(null);
            }}
            filters={filters}
            onFiltersChange={setFilters}
            selectedDates={selectedDates}
            onSelectedDatesChange={setSelectedDates}
            onClearDates={() => setSelectedDates(null)}
          />
        </ExecutiveSection>
      )}

      {show("confidence") && (
        <ExecutiveSection
          id="section-confidence"
          bare={bare}
          number={numberOf("confidence")}
          eyebrow="Validação"
          title="Confiança e disponibilidade dos dados"
          description="Antes de interpretar qualquer KPI, confirme completude, latência, divergências e natureza demonstrativa ou real das fontes."
          icon={ShieldCheck}
          tone={snapshot.dataQuality >= 0.9 ? "success" : "warning"}
        >
          <ExecutiveDataConfidence model={model} demoMode={demoMode} />
        </ExecutiveSection>
      )}

      {show("result") && (
        <ExecutiveSection
          id="section-result"
          bare={bare}
          number={numberOf("result")}
          eyebrow="Decisão imediata"
          title="Veredito executivo do período"
          description="Concentra o resultado, a mudança, a causa provável, o impacto financeiro e a ação mais importante neste momento."
          icon={Gauge}
          tone={
            snapshot.verdict.tone === "success"
              ? "success"
              : snapshot.verdict.tone === "destructive"
                ? "destructive"
                : "warning"
          }
        >
          <ExecutiveVerdict snapshot={snapshot} />
        </ExecutiveSection>
      )}

      {show("financial-composition") && (
        <ExecutiveSection
          id="section-financial-composition"
          bare={bare}
          number={numberOf("financial-composition")}
          eyebrow="Explicação do resultado"
          title="Composição financeira e ritmo de orçamento"
          description="Mostra para onde foi o dinheiro e se a operação está gastando no ritmo adequado para fechar o período com qualidade."
          icon={WalletCards}
          tone="info"
        >
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <FinancialBridge snapshot={snapshot} steps={model.bridge} />
            <BudgetPacing snapshot={snapshot} />
          </div>
        </ExecutiveSection>
      )}

      {show("trends") && (
        <ExecutiveSection
          id="section-trends"
          bare={bare}
          number={numberOf("trends")}
          eyebrow="Evolução e diagnóstico"
          title="Tendência, previsão e preparação analítica"
          description="Separa a leitura temporal do diagnóstico de maturidade analítica, distinguindo resultado observado de previsão ou estimativa."
          icon={TrendingUp}
          tone="neutral"
        >
          <TrendChart
            snapshot={snapshot}
            data={model.trend}
            granularity={filters.granularity}
          />
          <AdvancedAnalyticsReadiness model={model} />
        </ExecutiveSection>
      )}

      {show("acquisition") && (
        <ExecutiveSection
          id="section-acquisition"
          bare={bare}
          number={numberOf("acquisition")}
          eyebrow="De onde vêm os clientes"
          title="Tráfego, criativos e atribuição"
          description="Desempenho de cada canal, retorno do próximo real investido, qualidade dos criativos e a diferença entre o que a plataforma diz que vendeu e o que caiu no caixa."
          icon={BadgeDollarSign}
          tone="info"
        >
          {/* O caminho completo do dinheiro: rede → campanha → criativo. */}
          <AcquisitionPerformance snapshot={snapshot} rows={acquisitionRows} />
          <CampaignBreakdown
            networks={acquisitionRows}
            campaigns={campaignRows}
          />
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
            <CreativeIntelligence snapshot={snapshot} rows={creativeRows} />
            <AttributionConfidence snapshot={snapshot} />
          </div>
        </ExecutiveSection>
      )}

      {show("funnel") && (
        <ExecutiveSection
          id="section-funnel"
          bare={bare}
          number={numberOf("funnel")}
          eyebrow="Conversão"
          title="Funil e perdas por etapa"
          description="Isola as perdas de conversão para identificar onde o volume deixa de virar pagamento aprovado, liquidado e cliente retido."
          icon={BarChart3}
          tone="warning"
        >
          <FunnelDiagnostic snapshot={snapshot} stages={model.funnel} />
        </ExecutiveSection>
      )}

      {show("customers") && (
        <ExecutiveSection
          id="section-customers"
          bare={bare}
          number={numberOf("customers")}
          eyebrow="Qualidade da receita"
          title="Clientes, retenção e coortes"
          description="Separa aquisição de curto prazo da qualidade econômica dos clientes ao longo de 30, 60 e 90 dias."
          icon={Users}
          tone="neutral"
        >
          <CustomerCohorts snapshot={snapshot} rows={model.cohorts} />
        </ExecutiveSection>
      )}

      {show("timeline") && (
        <ExecutiveSection
          id="section-timeline"
          bare={bare}
          number={numberOf("timeline")}
          eyebrow="O dia a dia"
          title="Resultado e horários do período escolhido"
          description="Quanto sobrou no período e em que horas do dia as vendas aconteceram. Para trocar o período, use a área Calendário."
          icon={Clock3}
          tone="info"
        >
          <ExecutiveOperationalTimeline
            days={days}
            fallbackWeek={anchorDays}
            analysisDates={effectiveSelectedDates}
            selectedDates={selectedDates}
            onSelectedDatesChange={setSelectedDates}
            minMonth={operationMinMonth}
            maxMonth={operationMaxMonth}
            dailyGoal={dailyGoal}
            hourlyByDay={hourlyByDay}
          />
        </ExecutiveSection>
      )}

      {show("calendar") && (
        <ExecutiveSection
          id="section-calendar"
          bare={bare}
          number={numberOf("calendar")}
          eyebrow="Escolha do período"
          title="Calendário do mês"
          description="Clique num dia ou selecione uma semana. A escolha fica guardada e vale nas outras áreas do dashboard."
          icon={CalendarDays}
          tone="neutral"
        >
          <ExecutiveCalendar
            days={days}
            fallbackWeek={anchorDays}
            analysisDates={effectiveSelectedDates}
            selectedDates={selectedDates}
            onSelectedDatesChange={setSelectedDates}
            minMonth={operationMinMonth}
            maxMonth={operationMaxMonth}
            dailyGoal={dailyGoal}
            hourlyByDay={hourlyByDay}
          />
        </ExecutiveSection>
      )}

      {show("decisions") && (
        <ExecutiveSection
          id="section-decisions"
          bare={bare}
          number={numberOf("decisions")}
          eyebrow="O que precisa de atenção"
          title="Notificações sobre o negócio"
          description="Avisos do que saiu do normal e do que virou oportunidade. Cada um mostra quanto dinheiro está em jogo, por que aconteceu e o que fazer."
          icon={AlertTriangle}
          tone={
            model.risks.some((risk) => risk.severity === "Crítico")
              ? "destructive"
              : "warning"
          }
          aside={
            <Badge
              variant={
                model.risks.some((risk) => risk.severity === "Crítico")
                  ? "destructive"
                  : "outline"
              }
            >
              {model.risks.length} prioridades
            </Badge>
          }
        >
          <DecisionCenter snapshot={snapshot} risks={model.risks} />
          <ExecutiveActionPlan risks={model.risks} />
        </ExecutiveSection>
      )}

      {show("governance") && (
        <ExecutiveSection
          id="section-governance"
          bare={bare}
          number={numberOf("governance")}
          eyebrow="Governança e auditoria"
          title="Qualidade técnica, linhagem e próximos níveis"
          description="Mantém informações técnicas fora do fluxo principal de decisão, mas disponíveis para auditoria, validação e aprofundamento operacional."
          icon={Database}
          tone="neutral"
        >
          <DataQuality model={model} demoMode={demoMode} />

          <section className="bg-muted/40 rounded-2xl border p-4 text-sm leading-6 sm:p-5">
            <div className="flex items-start gap-3">
              <CircleDollarSign className="text-success mt-0.5 size-5 shrink-0" />
              <div>
                <h3 className="font-bold">Áreas de investigação detalhada</h3>
                <p className="text-muted-foreground mt-1">
                  Use as abas <strong>Operação e calendário</strong>,{" "}
                  <strong>Funil</strong>, <strong>Crescimento</strong>,{" "}
                  <strong>Vendas</strong>, <strong>Empresa</strong> e{" "}
                  <strong>Radar</strong> para análises especializadas. A visão
                  executiva permanece organizada por sessões e preserva os
                  resultados críticos antes dos detalhes técnicos.
                </p>
              </div>
            </div>
          </section>
        </ExecutiveSection>
      )}
    </div>
  );
}
