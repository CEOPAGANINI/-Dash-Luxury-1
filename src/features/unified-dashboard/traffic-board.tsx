"use client";

import * as React from "react";
import Link from "next/link";
import { BoardPager } from "@/components/dashboard/board-pager";
import { BlockPicker } from "@/components/ui/block-picker";
import { useUnifiedDashboard } from "./operation-provider";
import { AcquisitionCalendar } from "./acquisition-calendar";
import { SalesPatterns } from "./sales-patterns";
import { TrafficDiagnostics } from "./traffic-diagnostics";
import { AcquisitionDemoDiagnostics } from "./acquisition-demo-diagnostics";
import {
  aggregateDays,
  aggregateMetrics,
  accountToday,
  monthRange,
  parseAccountDate,
  percentageChange,
  type AcquisitionDailyRecord,
  type AcquisitionMetric,
} from "./acquisition-analytics";
import {
  UNAVAILABLE_ACQUISITION_SOURCE,
  type AcquisitionDataSource,
} from "./acquisition-source";
import {
  formatCurrency,
  formatInteger,
  formatRatio,
  formatPercent,
} from "./formatters";
import type { NetworkId } from "./types";
import styles from "./acquisition-pages.module.css";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const PATTERN_PAGES = [
  { label: "Horário de pico", section: "hourly" },
  { label: "Dia da semana", section: "weekday" },
  { label: "Melhor semana", section: "week" },
  { label: "Melhor quinzena", section: "fortnight" },
  { label: "Dias das quinzenas", section: "bestDays" },
] as const;
const PAGES = [
  "Calendário",
  ...PATTERN_PAGES.map((page) => page.label),
  "Canais",
  "Resumo",
  "Funil de tráfego",
  "Público",
  "Criativos",
];
const TITLES = [
  "Calendário de aquisição",
  ...PATTERN_PAGES.map((page) => page.label),
  "Canais de aquisição",
  "Resumo do período",
  "Funil de tráfego",
  "Público",
  "Criativos",
];
const SUBTITLES = [
  "Entenda quando suas vendas performam melhor.",
  ...PATTERN_PAGES.map(
    () => "Evidências, recorrência e comparações sem resultados inventados.",
  ),
  "Compare receita atribuída, investimento e eficiência por origem.",
  "Resultados consolidados e comparação entre períodos.",
  "Etapas do caminho até a compra.",
  "Perfil e comportamento do público.",
  "Análise de campanhas e peças de aquisição.",
];
const NO_RECORDS: AcquisitionDailyRecord[] = [];
const CHANNELS = [
  { id: "meta", name: "Meta Ads" },
  { id: "google", name: "Google Ads" },
  { id: "youtube", name: "YouTube Ads" },
] as const;

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function daysBetween(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
        86400000,
    ) + 1
  );
}
function valueOrMissing(
  value: number | null,
  kind: "money" | "count" | "ratio" | "average" = "money",
) {
  if (value === null || !Number.isFinite(value)) return "Sem dados";
  return kind === "ratio"
    ? formatRatio(value)
    : kind === "average"
      ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : kind === "count"
        ? formatInteger(value)
        : formatCurrency(value, 2);
}

/** The provider outlives every page; no page owns or resets shared filters. */
export function TrafficBoard({
  source = UNAVAILABLE_ACQUISITION_SOURCE,
}: {
  source?: AcquisitionDataSource;
}) {
  const {
    operationId,
    operation,
    year,
    month,
    day,
    setYear,
    setMonth,
    setDay,
    networkId,
    setNetworkId,
  } = useUnifiedDashboard();
  const [view, setView] = React.useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);
  const [compare, setCompare] = React.useState(false);
  const [patternMetric, setPatternMetric] =
    React.useState<AcquisitionMetric>("received");
  const [historyDays, setHistoryDays] = React.useState<30 | 60 | 90>(60);
  const [customComparison, setCustomComparison] = React.useState<{
    start: string;
    end: string;
  } | null>(null);
  const sourceMatches = source.operationId === operationId;
  const isDemo =
    sourceMatches && source.mode === "demo" && source.status === "ready";
  const ready =
    sourceMatches &&
    source.status === "ready" &&
    (source.attributionVerified || isDemo);
  const records = ready ? source.records : NO_RECORDS;
  let timeZone =
    (sourceMatches ? source.timeZone : undefined) ?? "America/Sao_Paulo";
  let hasAccountTimeZone = sourceMatches && Boolean(source.timeZone);
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone });
  } catch {
    timeZone = "America/Sao_Paulo";
    hasAccountTimeZone = false;
  }
  const today =
    isDemo && source.demoAsOf ? source.demoAsOf : accountToday(timeZone);
  const current = monthRange(year, month);
  const previousMonth = new Date(year, month - 1, 1);
  const comparison =
    customComparison ??
    monthRange(previousMonth.getFullYear(), previousMonth.getMonth());
  const validComparison = Boolean(
    comparison.start &&
    comparison.end &&
    comparison.start <= comparison.end &&
    daysBetween(comparison.start, comparison.end) <= 366,
  );
  const currentRecords = aggregateDays(records, {
    networkId,
    ...current,
    today,
  }).flatMap((item) => item.records);
  const previousRecords =
    compare && validComparison
      ? aggregateDays(records, { networkId, ...comparison, today }).flatMap(
          (item) => item.records,
        )
      : NO_RECORDS;
  const status = !sourceMatches ? "unavailable" : source.status;

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 47.99rem)");
    if (query.matches) setView("week");
  }, []);

  function changeMonth(nextYear: number, nextMonth: number) {
    const next = new Date(nextYear, nextMonth, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setDay(
      Math.min(
        day,
        new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
      ),
    );
    setSelectedDay(null);
  }

  const header = (active: number) =>
    active === 0 ? (
      <h2 className="sr-only">Calendário de aquisição</h2>
    ) : (
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>
            Aquisição · {active + 1} de {PAGES.length} · {PAGES[active]}
          </p>
          <h2>{TITLES[active]}</h2>
          <p>
            {isDemo
              ? "Explore esta análise com um cenário demonstrativo."
              : SUBTITLES[active]}
          </p>
        </div>
        <div
          className={styles.filters}
          role="group"
          aria-label="Filtros compartilhados da Aquisição"
        >
          <div className={styles.field}>
            <span>Mês</span>
            <BlockPicker
              ariaLabel="Mês analisado"
              size="sm"
              value={String(month)}
              onChange={(v) => changeMonth(year, Number(v))}
              options={MONTHS.map((name, index) => ({
                value: String(index),
                label: name.slice(0, 3),
                title: name,
              }))}
            />
          </div>
          <div className={styles.field}>
            <span>Ano</span>
            <BlockPicker
              ariaLabel="Ano analisado"
              size="sm"
              value={String(year)}
              onChange={(v) => changeMonth(Number(v), month)}
              options={Array.from(
                new Set([
                  year,
                  ...Array.from(
                    { length: 5 },
                    (_, index) => Number(today.slice(0, 4)) - 3 + index,
                  ),
                ]),
              )
                .sort()
                .map((value) => ({ value: String(value), label: String(value) }))}
            />
          </div>
          <div className={styles.field}>
            <span>Canal</span>
            <BlockPicker
              ariaLabel="Canal de aquisição"
              size="sm"
              value={networkId}
              onChange={(v) => setNetworkId(v as NetworkId)}
              options={[
                { value: "all", label: "Todos" },
                ...CHANNELS.map((channel) => ({
                  value: channel.id,
                  label: channel.name,
                })),
              ]}
            />
          </div>
          <button
            type="button"
            aria-expanded={compare}
            aria-controls="acquisition-comparison"
            onClick={() => setCompare(!compare)}
          >
            Comparar período
          </button>
        </div>
        {compare && (
          <div
            id="acquisition-comparison"
            className={styles.comparisonFilters}
            role="group"
            aria-label="Período de comparação"
          >
            <label>
              Comparar desde
              <input
                type="date"
                aria-label="Início da comparação"
                value={comparison.start}
                onChange={(event) =>
                  setCustomComparison({
                    ...comparison,
                    start: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Até
              <input
                type="date"
                aria-label="Fim da comparação"
                value={comparison.end}
                onChange={(event) =>
                  setCustomComparison({
                    ...comparison,
                    end: event.target.value,
                  })
                }
              />
            </label>
            <p>
              {validComparison
                ? "Comparação disponível na página Resumo. Volumes comparados por média diária."
                : "Informe um intervalo válido de até 366 dias."}
            </p>
          </div>
        )}
        <div
          className={styles.source}
          role={status === "error" ? "alert" : "status"}
        >
          <span>
            {isDemo
              ? "Dados de exemplo · Período simulado, sem conexão com resultados reais."
              : status === "loading"
                ? "Carregando dados de aquisição…"
                : status === "error"
                  ? "Não foi possível carregar os dados. Tente novamente após verificar a integração."
                  : !ready
                    ? "Sem dados · Integração diária de vendas e mídia ainda não disponível."
                    : currentRecords.length === 0
                      ? "Sem dados no período selecionado."
                      : `${operation.name} · ${source.sourceName ?? "Fonte de aquisição"}${aggregateMetrics(currentRecords).partial ? " · Dados parciais" : ""}`}
          </span>
          <small>
            {sourceMatches &&
            source.updatedAt &&
            Number.isFinite(Date.parse(source.updatedAt))
              ? `Atualizado em ${new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(source.updatedAt))} · `
              : ""}
            {isDemo
              ? "Fuso da demonstração"
              : hasAccountTimeZone
                ? "Fuso da conta"
                : "Fuso de referência"}
            : {timeZone}
          </small>
        </div>
      </header>
    );

  return (
    <div
      className={`${styles.root} acquisition-board`}
      aria-busy={status === "loading"}
    >
      <BoardPager
        ariaLabel="Páginas da Aquisição"
        menuTitle="Aquisição"
        paginateOnMobile
        renderHeader={header}
        pages={[
          {
            label: "Calendário",
            short: "Calendário",
            content: (
              <AcquisitionCalendar
                records={records}
                year={year}
                month={month}
                day={selectedDay}
                onSelectDay={(value) => {
                  setSelectedDay(value);
                  if (value !== null) setDay(value);
                }}
                onSelectDate={(value) => {
                  const date = parseAccountDate(value);
                  if (!date) return;
                  setYear(date.getUTCFullYear());
                  setMonth(date.getUTCMonth());
                  setDay(date.getUTCDate());
                  setSelectedDay(date.getUTCDate());
                }}
                view={view}
                networkId={networkId}
                timeZone={timeZone}
                roasTarget={sourceMatches ? source.roasTarget : undefined}
                today={today}
                demoMode={isDemo}
              />
            ),
          },
          ...PATTERN_PAGES.map((page) => ({
            label: page.label,
            short: page.label,
            content: (
              <SalesPatterns
                section={page.section}
                metric={patternMetric}
                onMetricChange={setPatternMetric}
                historyDays={historyDays}
                onHistoryDaysChange={setHistoryDays}
                records={records}
                year={year}
                month={month}
                networkId={networkId}
                timeZone={timeZone}
                today={today}
                demoMode={isDemo}
              />
            ),
          })),
          {
            label: "Canais",
            short: "Canais",
            content: (
              <ChannelComparison
                records={currentRecords}
                networkId={networkId}
                onSelectChannel={setNetworkId}
                attributionModel={ready ? source.attributionModel : undefined}
                attributionVerified={ready && !isDemo}
                demoMode={isDemo}
              />
            ),
          },
          {
            label: "Resumo",
            short: "Resumo",
            content: (
              <AcquisitionSummary
                records={currentRecords}
                previousRecords={previousRecords}
                compare={compare && validComparison}
                current={current}
                comparison={comparison}
              />
            ),
          },
          ...(
            [
              { label: "Funil de tráfego", section: "funnel" },
              { label: "Público", section: "audience" },
              { label: "Criativos", section: "creatives" },
            ] as const
          ).map((page) => ({
            label: page.label,
            short: page.label,
            content: isDemo ? (
              <AcquisitionDemoDiagnostics
                section={page.section}
                networkId={networkId}
                year={year}
                month={month}
              />
            ) : (
              <div className={styles.pageStack}>
                <p className={styles.note}>
                  Sem dados detalhados conectados. Este módulo aguarda eventos
                  reais de campanhas, funil e público; não calcula distribuições
                  a partir dos totais do calendário.
                </p>
                <TrafficDiagnostics section={page.section} unavailable />
              </div>
            ),
          })),
        ]}
      />
    </div>
  );
}

function ChannelComparison({
  records,
  networkId,
  onSelectChannel,
  attributionModel,
  attributionVerified,
  demoMode,
}: {
  records: AcquisitionDailyRecord[];
  networkId: NetworkId;
  onSelectChannel: (id: NetworkId) => void;
  attributionModel?: string;
  attributionVerified: boolean;
  demoMode: boolean;
}) {
  const [chosen, setChosen] = React.useState<string[]>([
    "meta",
    "google",
    "youtube",
  ]);
  const eligible = CHANNELS.filter(
    (channel) => networkId === "all" || channel.id === networkId,
  );
  const rows = eligible.map((channel) => ({
    ...channel,
    metrics: aggregateMetrics(
      records.filter((record) => record.networkId === channel.id),
    ),
  }));
  const visible = rows.filter((row) => chosen.includes(row.id));
  const max = Math.max(
    1,
    ...visible.flatMap((row) => [
      row.metrics.received ?? 0,
      row.metrics.spend ?? 0,
    ]),
  );
  return (
    <div className={styles.pageStack}>
      <section className={styles.panel} aria-label="Comparação dos canais">
        <div className={styles.sectionHead}>
          <h2>Desempenho por canal</h2>
          <p>Selecione os canais para comparar na mesma escala, em reais.</p>
        </div>
        <div className={styles.channelChoices}>
          {eligible.map((channel) => (
            <label key={channel.id}>
              <input
                type="checkbox"
                checked={chosen.includes(channel.id)}
                onChange={() =>
                  setChosen((current) =>
                    current.includes(channel.id)
                      ? current.filter((id) => id !== channel.id)
                      : [...current, channel.id],
                  )
                }
              />
              {channel.name}
            </label>
          ))}
        </div>
        {networkId !== "all" && (
          <button type="button" onClick={() => onSelectChannel("all")}>
            Mostrar todos os canais para comparar
          </button>
        )}
        {visible.length === 0 ? (
          <p className={styles.empty}>Selecione ao menos um canal.</p>
        ) : (
          <div className={styles.channelCharts}>
            {visible.map((row) => (
              <article key={row.id} className={styles.channelCard}>
                <h3>{row.name}</h3>
                {[
                  {
                    name: "Receita atribuída",
                    value: row.metrics.received,
                    color: "#f5f5f5",
                  },
                  {
                    name: "Investimento",
                    value: row.metrics.spend,
                    color: "#999999",
                  },
                ].map((metric) => (
                  <div key={metric.name} className={styles.chartRow}>
                    <div>
                      <span>{metric.name}</span>
                      <b>{valueOrMissing(metric.value)}</b>
                    </div>
                    <div className={styles.track}>
                      <span
                        style={{
                          width: `${((metric.value ?? 0) / max) * 100}%`,
                          backgroundColor: metric.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <dl className={styles.channelMetrics}>
                  <div>
                    <dt>Vendas</dt>
                    <dd>{valueOrMissing(row.metrics.orders, "count")}</dd>
                  </div>
                  <div>
                    <dt>ROAS</dt>
                    <dd>{valueOrMissing(row.metrics.roas, "ratio")}</dd>
                  </div>
                  <div>
                    <dt>{row.metrics.newCustomers !== null ? "CAC" : "CPA"}</dt>
                    <dd>
                      {valueOrMissing(
                        row.metrics.newCustomers !== null
                          ? row.metrics.cac
                          : row.metrics.cpa,
                      )}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => onSelectChannel(row.id)}
                  aria-pressed={networkId === row.id}
                >
                  Filtrar por {row.name}
                </button>
              </article>
            ))}
          </div>
        )}
        <p className={styles.note}>
          {demoMode
            ? "Cenário demonstrativo: receita e investimento simulados por canal."
            : attributionModel
              ? `Atribuição: ${attributionModel}.`
              : attributionVerified
                ? "Fonte de checkout verificada; modelo de atribuição não informado."
                : "Atribuição de checkout deduplicada ainda não conectada."}{" "}
          Não somamos as conversões reportadas pelas plataformas. ROAS = receita
          atribuída ÷ investimento.
        </p>
      </section>
      <div className={styles.links}>
        <Link href="/dashboard/trafego/diagnosticos">
          Funil, público e criativos
        </Link>
        <Link href="/campanhas">Gerenciar campanhas</Link>
      </div>
    </div>
  );
}

function AcquisitionSummary({
  records,
  previousRecords,
  compare,
  current,
  comparison,
}: {
  records: AcquisitionDailyRecord[];
  previousRecords: AcquisitionDailyRecord[];
  compare: boolean;
  current: { start: string; end: string };
  comparison: { start: string; end: string };
}) {
  const totals = aggregateMetrics(records);
  const previous = aggregateMetrics(previousRecords);
  const cac =
    totals.newCustomers !== null &&
    (!compare || previous.newCustomers !== null);
  const metrics = [
    {
      label: "Receita atribuída",
      value: totals.received,
      previous: previous.received,
      kind: "money" as const,
      volume: true,
    },
    {
      label: "Investimento em mídia",
      value: totals.spend,
      previous: previous.spend,
      kind: "money" as const,
      volume: true,
    },
    {
      label: "Vendas",
      value: totals.orders,
      previous: previous.orders,
      kind: "count" as const,
      volume: true,
    },
    {
      label: "ROAS consolidado",
      value: totals.roas,
      previous: previous.roas,
      kind: "ratio" as const,
      volume: false,
    },
    {
      label: cac ? "CAC" : "CPA",
      value: cac ? totals.cac : totals.cpa,
      previous: cac ? previous.cac : previous.cpa,
      kind: "money" as const,
      volume: false,
    },
  ];
  return (
    <div className={styles.pageStack}>
      <section className={styles.panel} aria-label="Indicadores consolidados">
        <div className={styles.sectionHead}>
          <h2>Resultados do período</h2>
          <p>
            {formatDate(current.start)} a {formatDate(current.end)} ·{" "}
            {totals.days} de {daysBetween(current.start, current.end)} dias com
            registros{totals.partial ? " · Parcial" : ""}
          </p>
        </div>
        <div className={styles.summaryGrid}>
          {metrics.map((metric) => (
            <article className={styles.summaryCard} key={metric.label}>
              <h3>{metric.label}</h3>
              <strong>{valueOrMissing(metric.value, metric.kind)}</strong>
              <span>
                {metric.volume
                  ? "Total do período"
                  : metric.label === "ROAS consolidado"
                    ? "Receita ÷ investimento"
                    : cac
                      ? "Investimento ÷ novos clientes"
                      : "Investimento ÷ vendas"}
              </span>
            </article>
          ))}
        </div>
        <p className={styles.note}>
          Ausência de registro não é zero. Só dias com registros entram nas
          médias. CPA mede o custo por venda; CAC exige novos clientes
          identificados.
        </p>
      </section>
      <section className={styles.panel} aria-label="Comparações entre períodos">
        <div className={styles.sectionHead}>
          <h2>Comparação entre períodos</h2>
          <p>
            {compare
              ? `${formatDate(comparison.start)} a ${formatDate(comparison.end)} · ${previous.days} dias com registros`
              : "Ative “Comparar período” nos filtros para escolher a base."}
          </p>
        </div>
        {compare && (
          <div className={styles.comparisonRows}>
            {metrics.map((metric) => {
              const now =
                metric.volume && metric.value !== null
                  ? totals.days
                    ? metric.value / totals.days
                    : null
                  : metric.value;
              const before =
                metric.volume && metric.previous !== null
                  ? previous.days
                    ? metric.previous / previous.days
                    : null
                  : metric.previous;
              const delta = percentageChange(now, before);
              const variation =
                now === null || before === null
                  ? "Histórico insuficiente"
                  : before === 0
                    ? "Base zero: variação não calculável"
                    : delta === null
                      ? "Variação não calculável"
                      : `${delta >= 0 ? "+" : ""}${formatPercent(delta / 100)}`;
              return (
                <article className={styles.comparisonRow} key={metric.label}>
                  <h3>
                    {metric.label}{" "}
                    <small>
                      {metric.volume
                        ? "Média por dia com registro"
                        : "Razão dos totais"}
                    </small>
                  </h3>
                  <div>
                    <span>Atual</span>
                    <b>
                      {valueOrMissing(
                        now,
                        metric.kind === "count" ? "average" : metric.kind,
                      )}
                    </b>
                  </div>
                  <div>
                    <span>Comparado</span>
                    <b>
                      {valueOrMissing(
                        before,
                        metric.kind === "count" ? "average" : metric.kind,
                      )}
                    </b>
                  </div>
                  <p>{variation}</p>
                </article>
              );
            })}
          </div>
        )}
        <p className={styles.note}>
          Períodos com durações diferentes usam médias diárias para volumes;
          ROAS, CPA e CAC são calculados pelos totais, nunca pela média das
          razões. Coberturas parciais podem alterar o resultado.
        </p>
      </section>
    </div>
  );
}
