import { addDays, endOfMonth, getDay, startOfMonth, subDays } from "date-fns";

import type {
  Campaign,
  FunnelDefinition,
  FunnelStage,
  OperationDefinition,
} from "@/features/unified-dashboard/types";

function stringSeed(value: string) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 1);
}

export function seededRandom(seedValue: number) {
  let seed = Math.max(1, Math.round(seedValue)) % 2147483647;
  return () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
}

export function funnelResultIndex(stages: FunnelStage[]) {
  const patterns = [
    /compras?/i,
    /assinaturas?/i,
    /vendas?/i,
    /cadastros?/i,
    /leads?/i,
    /liquidadas?/i,
  ];
  for (const pattern of patterns) {
    const index = stages.findIndex((stage) => pattern.test(stage[0]));
    if (index >= 0) return index;
  }
  return Math.min(4, stages.length - 1);
}

export function funnelForDate(
  base: FunnelDefinition,
  date: Date,
  operation: OperationDefinition,
  campaign?: Campaign | null,
): FunnelDefinition {
  const hasData =
    operation.kpis.netRevenue !== 0 ||
    base.stages.some((stage) => stage[1] !== 0);
  if (!hasData) {
    return {
      ...base,
      stages: base.stages.map((stage) => [stage[0], 0, 0, 0]),
      demographics: base.demographics.map(() => 0),
      video: base.video.map(() => 0),
    };
  }

  const seed =
    date.getFullYear() * 372 +
    date.getMonth() * 31 +
    date.getDate() * 17 +
    stringSeed(`${operation.id}|${base.id}|${campaign?.id ?? "all"}`) * 101;
  const random = seededRandom(seed);
  const weekend = [0, 6].includes(date.getDay()) ? 0.66 : 1;
  const campaignScale = campaign
    ? Math.max(
        0.18,
        Math.min(1.15, campaign.checkoutRevenue / operation.kpis.netRevenue),
      )
    : 1;
  const factor = weekend * (0.72 + random() * 0.62) * campaignScale;

  const stages: FunnelStage[] = base.stages.map((stage, index) => {
    const previous = index === 0 ? null : base.stages[index - 1];
    const baseValue = Math.max(
      0,
      Math.round(stage[1] * factor * (1 - index * 0.015)),
    );
    const value =
      previous && baseValue > previous[1]
        ? Math.round(previous[1] * 0.94)
        : baseValue;
    const cost = stage[3] * (0.88 + random() * 0.26);
    return [stage[0], value, stage[2], cost];
  });

  const demographicShift = campaign ? (stringSeed(campaign.id) % 7) - 3 : 0;
  const demographics = base.demographics.map((value, index) =>
    Math.max(
      2,
      value +
        (index === 0 ? demographicShift : index === 2 ? -demographicShift : 0),
    ),
  );
  const total = demographics.reduce((sum, value) => sum + value, 0);
  const normalized = demographics.map((value) =>
    Math.round((value / total) * 100),
  );
  normalized[0] += 100 - normalized.reduce((sum, value) => sum + value, 0);

  return {
    ...base,
    stages,
    demographics: normalized,
    video: base.video.map((value) =>
      Math.max(0.004, value * (0.9 + random() * 0.2)),
    ),
  };
}

export interface CalendarCell {
  date: Date;
  isoDate: string;
  day: number;
  outside: boolean;
}

export function calendarCells(year: number, month: number): CalendarCell[] {
  const first = startOfMonth(new Date(year, month, 1));
  const last = endOfMonth(first);
  const mondayIndex = (getDay(first) + 6) % 7;
  const start = subDays(first, mondayIndex);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const isoDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    cells.push({
      date,
      isoDate,
      day: date.getDate(),
      outside: date < first || date > last,
    });
  }

  return cells;
}

export interface DailyRevenuePoint {
  date: string;
  day: number;
  received: number;
  pending: number;
  refused: number;
  orders: number;
  approval: number;
  ticket: number;
  peakHour: number;
  hourly: number[];
  total: number;
}

export function buildDailyRevenue(
  operation: OperationDefinition,
  year: number,
  month: number,
): DailyRevenuePoint[] {
  const days = endOfMonth(new Date(year, month, 1)).getDate();
  const baseDaily = operation.kpis.netRevenue / 30;
  const points: DailyRevenuePoint[] = [];
  const hasData = Object.values(operation.kpis).some((value) => value !== 0);

  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month, day);
    const seed =
      year * 372 + month * 31 + day * 17 + stringSeed(operation.id) * 101;
    const random = seededRandom(seed);
    const weekend = [0, 6].includes(date.getDay()) ? 0.68 : 1;
    const received = Math.round(baseDaily * weekend * (0.74 + random() * 0.64));
    const pending = Math.round(received * (0.06 + random() * 0.08));
    const refused = Math.round(received * (0.035 + random() * 0.06));
    const total = received + pending + refused;
    const orders =
      hasData && received > 0 && operation.kpis.ticket > 0
        ? Math.max(
            1,
            Math.round(
              received / (operation.kpis.ticket * (0.88 + random() * 0.22)),
            ),
          )
        : 0;
    const approval = received / Math.max(total, 1);
    const peakHour = hasData ? 17 + Math.floor(random() * 5) : 0;
    const shape = [
      0.08, 0.04, 0.03, 0.02, 0.02, 0.03, 0.06, 0.13, 0.23, 0.35, 0.46, 0.52,
      0.48, 0.43, 0.46, 0.52, 0.59, 0.67, 0.78, 0.92, 1, 0.84, 0.46, 0.2,
    ];
    const shifted = shape.map(
      (_, index) => shape[(index - peakHour + 20 + 24) % 24] ?? 0,
    );
    const shapeTotal = shifted.reduce((sum, value) => sum + value, 0);
    const hourly = shifted.map((value) =>
      Math.round((received * value) / shapeTotal),
    );

    points.push({
      date: [
        year,
        String(month + 1).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-"),
      day,
      received,
      pending,
      refused,
      orders,
      approval,
      ticket: received / Math.max(orders, 1),
      peakHour,
      hourly,
      total,
    });
  }

  return points;
}
