import type { NetworkId } from "./types";

/** One deduplicated, checkout-attributed channel/day, in the account's timezone. */
export interface AcquisitionDailyRecord {
  date: string;
  networkId: Exclude<NetworkId, "all">;
  received: number | null;
  pending: number | null;
  refused: number | null;
  spend: number | null;
  orders: number | null;
  newCustomers?: number | null;
  /** Exactly 24 attributed-revenue buckets, already converted to account time. */
  hourly?: number[] | null;
  /** Exactly 24 sales-count buckets, already converted to account time. */
  hourlyOrders?: number[] | null;
  status?: "consolidated" | "partial";
  campaignIds?: string[];
}

export interface AcquisitionMetrics {
  received: number | null;
  pending: number | null;
  refused: number | null;
  spend: number | null;
  orders: number | null;
  newCustomers: number | null;
  roas: number | null;
  cpa: number | null;
  cac: number | null;
  recordCount: number;
  days: number;
  partial: boolean;
}

export interface AcquisitionDay extends AcquisitionMetrics {
  date: string;
  hourly: number[] | null;
  hourlyOrders: number[] | null;
  records: AcquisitionDailyRecord[];
}

export type AcquisitionMetric = "received" | "orders" | "roas" | "cpa" | "cac";
export const ACQUISITION_METRICS: Record<
  AcquisitionMetric,
  { label: string; lowerIsBetter: boolean }
> = {
  received: { label: "Receita", lowerIsBetter: false },
  orders: { label: "Vendas", lowerIsBetter: false },
  roas: { label: "ROAS", lowerIsBetter: false },
  cpa: { label: "CPA", lowerIsBetter: true },
  cac: { label: "CAC", lowerIsBetter: true },
};

export const EFFICIENCY_TIERS = [
  {
    id: "abaixo",
    label: "ROAS abaixo de 1",
    color: "#676767",
    min: 0,
    max: 1,
    range: "ROAS < 1,00x",
  },
  {
    id: "perto",
    label: "ROAS de 1 a 1,15",
    color: "#858585",
    min: 1,
    max: 1.15,
    range: "1,00x ≤ ROAS < 1,15x",
  },
  {
    id: "saudavel",
    label: "ROAS de 1,15 a 1,40",
    color: "#a3a3a3",
    min: 1.15,
    max: 1.4,
    range: "1,15x ≤ ROAS < 1,40x",
  },
  {
    id: "bom",
    label: "ROAS de 1,40 a 1,80",
    color: "#c7c7c7",
    min: 1.4,
    max: 1.8,
    range: "1,40x ≤ ROAS < 1,80x",
  },
  {
    id: "excelente",
    label: "ROAS de 1,80 ou mais",
    color: "#f5f5f5",
    min: 1.8,
    max: Infinity,
    range: "ROAS ≥ 1,80x",
  },
] as const;
export const NO_EFFICIENCY_DATA = {
  id: "sem-dados",
  label: "Sem dados de ROAS",
  color: "#8e8e8e",
  range: "Receita e investimento positivo necessários",
} as const;

/** Preserve the existing absolute bands; a configured goal does not redefine them. */
export function classifyEfficiency(
  day: { roas: number | null },
  target?: number | null,
) {
  const configuredTarget =
    target != null && Number.isFinite(target) && target > 0 ? target : null;
  if (day.roas == null || !Number.isFinite(day.roas) || day.roas < 0) {
    return { ...NO_EFFICIENCY_DATA, target: configuredTarget };
  }
  return {
    ...(EFFICIENCY_TIERS.find((tier) => day.roas! < tier.max) ??
      EFFICIENCY_TIERS[4]),
    target: configuredTarget,
  };
}

export function parseAccountDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}
export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function addDays(date: string, amount: number) {
  const parsed = parseAccountDate(date);
  if (!parsed || !Number.isFinite(amount))
    throw new Error("Data de aquisição inválida");
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return dateKey(parsed);
}
/** Month is zero based, like Date and the dashboard's shared filters. */
export function monthRange(year: number, month: number) {
  return {
    start: dateKey(new Date(Date.UTC(year, month, 1))),
    end: dateKey(new Date(Date.UTC(year, month + 1, 0))),
  };
}
export function accountToday(timeZone = "America/Sao_Paulo", now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return dateKey(now);
  }
}

const NETWORKS = new Set(["meta", "google", "youtube"]);
const numericFields = [
  "received",
  "pending",
  "refused",
  "spend",
  "orders",
  "newCustomers",
] as const;
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function hourlyOrNull(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.length === 24 &&
    value.every((item) => numberOrNull(item) != null)
    ? [...value]
    : null;
}
/** Last valid snapshot wins for the same account date/channel; never sum duplicates. */
export function normalizeAcquisitionRecords(records: AcquisitionDailyRecord[]) {
  const unique = new Map<string, AcquisitionDailyRecord>();
  for (const record of records) {
    if (
      !record ||
      !parseAccountDate(record.date) ||
      !NETWORKS.has(record.networkId)
    )
      continue;
    const normalized = {
      ...record,
      hourly: hourlyOrNull(record.hourly),
      hourlyOrders: hourlyOrNull(record.hourlyOrders),
    };
    for (const field of numericFields)
      normalized[field] = numberOrNull(record[field]);
    unique.set(`${record.date}:${record.networkId}`, normalized);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.networkId.localeCompare(b.networkId),
  );
}
function total(
  records: AcquisitionDailyRecord[],
  field: (typeof numericFields)[number],
) {
  if (!records.length || records.some((record) => record[field] == null))
    return null;
  const result = records.reduce((sum, record) => sum + record[field]!, 0);
  return Number.isFinite(result) ? result : null;
}
function ratio(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}
export function aggregateMetrics(
  input: AcquisitionDailyRecord[],
): AcquisitionMetrics {
  const records = normalizeAcquisitionRecords(input);
  const received = total(records, "received"),
    spend = total(records, "spend"),
    orders = total(records, "orders"),
    newCustomers = total(records, "newCustomers");
  return {
    received,
    spend,
    orders,
    newCustomers,
    pending: total(records, "pending"),
    refused: total(records, "refused"),
    roas: ratio(received, spend),
    cpa: ratio(spend, orders),
    cac: ratio(spend, newCustomers),
    recordCount: records.length,
    days: new Set(records.map((record) => record.date)).size,
    partial: records.some((record) => record.status === "partial"),
  };
}
export interface AcquisitionSelection {
  networkId?: NetworkId;
  start?: string;
  end?: string;
  today?: string;
}
export function aggregateDays(
  input: AcquisitionDailyRecord[],
  selection: AcquisitionSelection = {},
): AcquisitionDay[] {
  const records = normalizeAcquisitionRecords(input).filter(
    (record) =>
      (!selection.networkId ||
        selection.networkId === "all" ||
        record.networkId === selection.networkId) &&
      (!selection.start || record.date >= selection.start) &&
      (!selection.end || record.date <= selection.end) &&
      (!selection.today || record.date <= selection.today),
  );
  const groups = new Map<string, AcquisitionDailyRecord[]>();
  records.forEach((record) =>
    groups.set(record.date, [...(groups.get(record.date) ?? []), record]),
  );
  const hours = (
    group: AcquisitionDailyRecord[],
    field: "hourly" | "hourlyOrders",
  ) =>
    group.every((record) => record[field] != null)
      ? Array.from({ length: 24 }, (_, hour) =>
          group.reduce((sum, record) => sum + record[field]![hour], 0),
        )
      : null;
  return [...groups.entries()].map(([date, group]) => ({
    date,
    ...aggregateMetrics(group),
    hourly: hours(group, "hourly"),
    hourlyOrders: hours(group, "hourlyOrders"),
    records: group,
  }));
}
/** Null means the percentage cannot be computed (including a zero baseline). */
export function percentageChange(
  current: number | null,
  previous: number | null,
) {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  )
    return null;
  const result = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(result) ? result : null;
}
export function metricValue(
  metrics: AcquisitionMetrics,
  metric: AcquisitionMetric,
  dailyAverage = false,
) {
  const value = metrics[metric];
  return dailyAverage && (metric === "received" || metric === "orders")
    ? ratio(value, metrics.days)
    : value;
}

export interface PatternEvidence {
  key: string;
  label: string;
  value: number | null;
  observations: number;
  expectedDays: number;
  complete: boolean;
  eligible?: boolean;
}
export interface PatternResult {
  evidence: PatternEvidence[];
  winners: PatternEvidence[];
  sufficient: boolean;
}
export interface SalesPatternAnalysis {
  metric: AcquisitionMetric;
  history: { start: string; end: string; days: number };
  period: { start: string; end: string };
  hourly: PatternResult & {
    metric: "received" | "orders";
    weeks: number;
    dates: number;
    unsupported: boolean;
  };
  weekday: PatternResult;
  week: PatternResult;
  fortnight: PatternResult;
  bestDays: [PatternResult, PatternResult];
  periodAverage: number | null;
  fortnightDifference: number | null;
  excludedPartialDays: number;
}
const weekdays = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
function weekStart(date: string) {
  return addDays(date, -((parseAccountDate(date)!.getUTCDay() + 6) % 7));
}
function positiveVolume(day: AcquisitionDay, metric: AcquisitionMetric) {
  if (metric === "received") return day.received != null && day.received > 0;
  if (metric === "orders") return day.orders != null && day.orders > 0;
  if (metric === "roas")
    return (
      day.received != null &&
      day.received > 0 &&
      day.spend != null &&
      day.spend > 0
    );
  return metric === "cac"
    ? day.newCustomers != null && day.newCustomers > 0
    : day.orders != null && day.orders > 0;
}
function rank(
  evidence: PatternEvidence[],
  lowerIsBetter: boolean,
  minimumObservations: number,
  minimumGroups = 2,
): PatternResult {
  const valid = evidence.filter(
    (item) => item.value != null && item.observations >= minimumObservations,
  );
  if (valid.length < minimumGroups)
    return { evidence, winners: [], sufficient: false };
  const best = (lowerIsBetter ? Math.min : Math.max)(
    ...valid.map((item) => item.value!),
  );
  const winners = valid.filter(
    (item) =>
      item.eligible !== false &&
      Math.abs(item.value! - best) <= Math.max(1, Math.abs(best)) * 1e-9,
  );
  return { evidence, winners, sufficient: winners.length > 0 };
}
function groupedEvidence(
  days: AcquisitionDay[],
  metric: AcquisitionMetric,
  groups: {
    key: string;
    label: string;
    dates: string[];
    expectedDays: number;
  }[],
) {
  return groups.map((group): PatternEvidence => {
    const subset = days.filter(
      (day) => group.dates.includes(day.date) && hasMetricInputs(day, metric),
    );
    const metrics = aggregateMetrics(subset.flatMap((day) => day.records));
    return {
      key: group.key,
      label: group.label,
      value: metricValue(metrics, metric, true),
      eligible: subset.some((day) => positiveVolume(day, metric)),
      observations: subset.length,
      expectedDays: group.expectedDays,
      complete: subset.length === group.expectedDays,
    };
  });
}
function hasMetricInputs(day: AcquisitionDay, metric: AcquisitionMetric) {
  if (metric === "received" || metric === "orders") return day[metric] != null;
  if (metric === "roas") return day.received != null && day.spend != null;
  if (metric === "cpa") return day.spend != null && day.orders != null;
  return day.spend != null && day.newCustomers != null;
}
export function analyzeSalesPatterns(
  records: AcquisitionDailyRecord[],
  options: {
    year: number;
    month: number;
    networkId: NetworkId;
    metric?: AcquisitionMetric;
    historyDays?: 30 | 60 | 90;
    today?: string;
    timeZone?: string;
  },
): SalesPatternAnalysis {
  const metric = options.metric ?? "received",
    historyDays = options.historyDays ?? 60;
  const period = monthRange(options.year, options.month),
    today = options.today ?? accountToday(options.timeZone);
  const end = period.end < today ? period.end : today,
    history = { start: addDays(end, 1 - historyDays), end, days: historyDays };
  const all = aggregateDays(records, {
    networkId: options.networkId,
    today: end,
  });
  const historyDaysData = all.filter(
    (day) =>
      !day.partial && day.date >= history.start && day.date <= history.end,
  );
  const selectedDays = all.filter(
    (day) => !day.partial && day.date >= period.start && day.date <= period.end,
  );
  const lower = ACQUISITION_METRICS[metric].lowerIsBetter;
  const weekdayEvidence = groupedEvidence(
    historyDaysData,
    metric,
    [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      key: String(weekday),
      label: weekdays[weekday],
      dates: historyDaysData
        .filter((day) => parseAccountDate(day.date)!.getUTCDay() === weekday)
        .map((day) => day.date),
      expectedDays: historyDaysData.filter(
        (day) => parseAccountDate(day.date)!.getUTCDay() === weekday,
      ).length,
    })),
  );
  const weekGroups = [];
  for (
    let start = weekStart(period.start);
    start <= period.end;
    start = addDays(start, 7)
  ) {
    weekGroups.push({
      key: start,
      label: `${shortDate(start)}–${shortDate(addDays(start, 6))}`,
      dates: Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(
        (date) => date >= period.start && date <= period.end,
      ),
      expectedDays: 7,
    });
  }
  const lastDay = parseAccountDate(period.end)!.getUTCDate();
  const fortnightGroups = [
    {
      key: "first",
      label: "1ª quinzena · dias 1–15",
      dates: Array.from({ length: 15 }, (_, i) => addDays(period.start, i)),
      expectedDays: 15,
    },
    {
      key: "second",
      label: `2ª quinzena · dias 16–${lastDay}`,
      dates: Array.from({ length: lastDay - 15 }, (_, i) =>
        addDays(period.start, 15 + i),
      ),
      expectedDays: lastDay - 15,
    },
  ];
  const fortnight = rank(
    groupedEvidence(selectedDays, metric, fortnightGroups),
    lower,
    2,
  );
  const bestDays = fortnightGroups.map((group) =>
    rank(
      groupedEvidence(
        selectedDays,
        metric,
        group.dates.map((date) => ({
          key: date,
          label: shortDate(date),
          dates: [date],
          expectedDays: 1,
        })),
      ),
      lower,
      1,
    ),
  ) as [PatternResult, PatternResult];
  const hourlyMetric = metric === "orders" ? "orders" : "received";
  const hourlyField = hourlyMetric === "orders" ? "hourlyOrders" : "hourly";
  const hourlyDays = historyDaysData.filter((day) =>
    day[hourlyField]?.some((value) => value > 0),
  );
  const peaks = hourlyDays.map((day) => {
    const bands = Array.from({ length: 8 }, (_, i) =>
      day[hourlyField]!.slice(i * 3, i * 3 + 3).reduce(
        (sum, value) => sum + value,
        0,
      ),
    );
    const maximum = Math.max(...bands);
    return {
      date: day.date,
      week: weekStart(day.date),
      winners: bands.flatMap((value, i) => (value === maximum ? [i] : [])),
    };
  });
  const weeks = new Set(peaks.map((peak) => peak.week)).size;
  const hourlyEvidence = Array.from(
    { length: 8 },
    (_, index): PatternEvidence => {
      const matches = peaks.filter((peak) => peak.winners.includes(index));
      return {
        key: String(index),
        label: `${String(index * 3).padStart(2, "0")}h–${String((index + 1) * 3).padStart(2, "0")}h`,
        value: new Set(matches.map((peak) => peak.week)).size,
        observations: matches.length,
        expectedDays: hourlyDays.length,
        complete: true,
      };
    },
  );
  const rankedHours = rank(
    hourlyEvidence.filter((item) => item.value! >= 2),
    false,
    2,
    1,
  );
  const hourlyUnsupported = metric !== "received" && metric !== "orders";
  const hourly: SalesPatternAnalysis["hourly"] = {
    ...rankedHours,
    evidence: hourlyEvidence,
    metric: hourlyMetric,
    weeks,
    dates: hourlyDays.length,
    unsupported: hourlyUnsupported,
    sufficient: rankedHours.sufficient && !hourlyUnsupported,
    winners: hourlyUnsupported ? [] : rankedHours.winners,
  };
  const first = fortnight.evidence[0].value,
    second = fortnight.evidence[1].value;
  return {
    metric,
    history,
    period,
    hourly,
    weekday: rank(weekdayEvidence, lower, 2),
    week: rank(groupedEvidence(selectedDays, metric, weekGroups), lower, 2),
    fortnight,
    bestDays,
    periodAverage: metricValue(
      aggregateMetrics(selectedDays.flatMap((day) => day.records)),
      metric,
      true,
    ),
    fortnightDifference: fortnight.sufficient
      ? percentageChange(second, first)
      : null,
    excludedPartialDays: all.filter(
      (day) =>
        day.partial && day.date >= period.start && day.date <= period.end,
    ).length,
  };
}
