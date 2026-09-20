import {
  addDays,
  monthRange,
  parseAccountDate,
  type AcquisitionDailyRecord,
} from "./acquisition-analytics";
import type { AcquisitionDataSource } from "./acquisition-source";
import type { NetworkId, OperationId } from "./types";

/** Opt-in presentation data. This module must never be used as a live-data fallback. */
const CHANNEL_PROFILES: {
  id: Exclude<NetworkId, "all">;
  orders: number;
  ticketCents: number;
  roas: number;
}[] = [
  { id: "meta", orders: 24, ticketCents: 21990, roas: 1.85 },
  { id: "google", orders: 17, ticketCents: 17990, roas: 2.3 },
  { id: "youtube", orders: 11, ticketCents: 14990, roas: 1.45 },
];
const WEEKDAY_WEIGHTS = [0.77, 0.84, 1.18, 1.12, 1.24, 1.3, 0.95];
const HOUR_WEIGHTS = [
  1, 1, 1, 1, 1, 2, 4, 6, 8, 10, 12, 14, 15, 12, 11, 13, 16, 22, 38, 48, 42, 20,
  8, 4,
];

/** Stable per-record seed; identical dates keep their values in overlapping windows. */
function seedFor(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed = Math.imul(seed ^ value.charCodeAt(index), 16777619);
  }
  return seed >>> 0;
}

/** Largest-remainder allocation preserves integer order counts and currency cents. */
function allocate(total: number, weights: number[]) {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0 || weightTotal === 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / weightTotal);
  const values = exact.map(Math.floor);
  let remainder = total - values.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - values[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (remainder <= 0) break;
    values[item.index] += 1;
    remainder -= 1;
  }
  return values;
}

function dailyRecord(
  date: string,
  profile: (typeof CHANNEL_PROFILES)[number],
  operationId: OperationId,
): AcquisitionDailyRecord {
  const parsed = parseAccountDate(date)!;
  const seed = seedFor(`${operationId}:${date}:${profile.id}`);
  const weekdayWeight = WEEKDAY_WEIGHTS[parsed.getUTCDay()];
  const dailyVariation = 0.84 + (seed % 37) / 100;
  const fortnightWeight = parsed.getUTCDate() > 15 ? 1.08 : 1;
  const orders = Math.max(
    1,
    Math.round(
      profile.orders * weekdayWeight * dailyVariation * fortnightWeight,
    ),
  );
  const ticketCents = profile.ticketCents + (((seed >>> 9) % 21) - 10) * 100;
  const receivedCents = orders * ticketCents;
  const roas = Math.max(
    0.65,
    profile.roas * weekdayWeight + (((seed >>> 15) % 41) - 20) / 100,
  );
  const spendCents = Math.round(receivedCents / roas);
  const pendingCents = Math.round(
    receivedCents * (0.025 + ((seed >>> 4) % 5) / 100),
  );
  const refusedCents = Math.round(
    receivedCents * (0.01 + ((seed >>> 7) % 4) / 100),
  );
  const weights = HOUR_WEIGHTS.map(
    (weight, hour) => weight + ((seed >>> (hour % 24)) % 4),
  );
  const hourlyOrders = allocate(orders, weights);
  const hourlyCents = allocate(receivedCents, hourlyOrders);

  return {
    date,
    networkId: profile.id,
    received: receivedCents / 100,
    pending: pendingCents / 100,
    refused: refusedCents / 100,
    spend: spendCents / 100,
    orders,
    newCustomers: Math.min(
      orders,
      Math.round(orders * (0.6 + (seed % 21) / 100)),
    ),
    hourly: hourlyCents.map((cents) => cents / 100),
    hourlyOrders,
    // Deliberate partial examples, stable across months and independent of the clock.
    status: parsed.getUTCDate() % 13 === 0 ? "partial" : "consolidated",
  };
}

/**
 * Demonstrates the selected month plus 90 preceding days. No current clock,
 * remote data, randomness, database writes, or claim of real attribution.
 * Month is zero based, matching the shared acquisition filters.
 */
export function createAcquisitionDemoSource(
  year: number,
  month: number,
  operationId: OperationId = "alpha",
): AcquisitionDataSource {
  if (
    !Number.isInteger(year) ||
    year < 1000 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  ) {
    throw new RangeError(
      "Informe um ano válido e um mês entre 0 e 11 para os dados de exemplo.",
    );
  }
  const selected = monthRange(year, month);
  const firstDate = addDays(selected.start, -90);
  const count =
    Math.round(
      (parseAccountDate(selected.end)!.getTime() -
        parseAccountDate(firstDate)!.getTime()) /
        86400000,
    ) + 1;
  const records = Array.from({ length: count }, (_, index) =>
    addDays(firstDate, index),
  ).flatMap((date) =>
    CHANNEL_PROFILES.map((profile) => dailyRecord(date, profile, operationId)),
  );

  return {
    operationId,
    status: "ready",
    mode: "demo",
    demoAsOf: selected.end,
    records,
    attributionVerified: false,
    attributionModel:
      "Distribuição demonstrativa por canal; não representa atribuição real",
    sourceName: "Dados de exemplo",
    timeZone: "America/Sao_Paulo",
    roasTarget: 2,
  };
}
