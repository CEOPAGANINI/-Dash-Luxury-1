import { percentagensQueFecham } from "./creative-placements";
import {
  derivadas,
  METRICAS_ZERADAS,
  somarMetricas,
  type AdMetrics,
} from "./types";

/** The five placements in this panel, kept separate by publisher platform. */
export const PLACEMENT_DEFINITIONS = [
  {
    id: "instagram-feed",
    platform: "instagram",
    position: "feed",
    label: "Feed Instagram",
    color: "#EC1B72",
  },
  {
    id: "instagram-stories",
    platform: "instagram",
    position: "stories",
    label: "Stories Instagram",
    color: "#F36AB8",
  },
  {
    id: "instagram-explore",
    platform: "instagram",
    position: "explorar",
    label: "Explorar Instagram",
    color: "#E78AF2",
  },
  {
    id: "facebook-feed",
    platform: "facebook",
    position: "feed",
    label: "Feed Facebook",
    color: "#1877F2",
  },
  {
    id: "facebook-stories",
    platform: "facebook",
    position: "stories",
    label: "Stories Facebook",
    color: "#72A7FF",
  },
] as const;

export type PlacementDefinition = (typeof PLACEMENT_DEFINITIONS)[number];
export type PlacementId = PlacementDefinition["id"];

export interface PlacementDerivedMetrics {
  roas: number | null;
  /** Ratio, not percentage points: 0.01 means 1%. */
  ctr: number | null;
  cpcCents: number | null;
  cpaCents: number | null;
}

export type PlacementPerformanceCard = PlacementDefinition & {
  metrics: AdMetrics;
  derived: PlacementDerivedMetrics;
  /** Exact fraction for the bar width. */
  share: number;
  /** Integer display percentage; positive totals add up to 100. */
  percentage: number;
  hasData: boolean;
};

export interface PlacementPerformance {
  cards: PlacementPerformanceCard[];
  /** Only the accepted five placements contribute to these totals. */
  metrics: AdMetrics;
  derived: PlacementDerivedMetrics;
  totalSales: number;
  hasData: boolean;
}

export function normalizePlacement(
  platform: unknown,
  position: unknown,
): PlacementId | null {
  if (typeof platform !== "string" || typeof position !== "string") return null;
  const publisher = platform.trim().toLowerCase();
  const rawPosition = position.trim().toLowerCase();
  const normalizedPosition = rawPosition === "story" ? "stories" : rawPosition;
  if (publisher !== "instagram" && publisher !== "facebook") return null;
  if (normalizedPosition === "feed" || normalizedPosition === "stories") {
    return `${publisher}-${normalizedPosition}`;
  }
  if (
    publisher === "instagram" &&
    [
      "explorar",
      "explore",
      "instagram_explore",
      "instagram_explore_home",
    ].includes(normalizedPosition)
  ) {
    return "instagram-explore";
  }
  return null;
}

type Fields = Record<string, unknown>;
type NormalizedRecord = {
  id: PlacementId;
  metrics: AdMetrics;
  derived: PlacementDerivedMetrics;
};

function fields(value: unknown): Fields {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Fields)
    : {};
}

function nonnegative(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = nonnegative(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function cents(value: unknown): number | undefined {
  const parsed = nonnegative(value);
  return parsed !== undefined && Number.isFinite(parsed * 100)
    ? Math.round(parsed * 100)
    : undefined;
}

/** Meta can return the same event under multiple attribution aliases; select one, never add them. */
function actionValue(
  value: unknown,
  names: readonly string[],
): number | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const name of names) {
    const action = value.find((entry) => fields(entry).action_type === name);
    const parsed = nonnegative(fields(action).value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

const PURCHASE_ACTIONS = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
];
const CHECKOUT_ACTIONS = [
  "initiate_checkout",
  "omni_initiated_checkout",
  "offsite_conversion.fb_pixel_initiate_checkout",
];

function normalizeRecord(value: unknown): NormalizedRecord | null {
  const row = fields(value);
  const id = normalizePlacement(
    row.plataforma ?? row.publisher_platform ?? row.platform,
    row.platform_position ?? row.position ?? row.id,
  );
  if (!id) return null;
  const m = fields(row.metrics);
  const checkouts = firstNumber(
    m.checkouts,
    row.checkouts,
    row.initiate_checkout,
    actionValue(row.actions, CHECKOUT_ACTIONS),
  );
  const metrics: AdMetrics = {
    spendCents: Math.round(
      firstNumber(
        m.spendCents,
        row.spendCents,
        row.spend_cents,
        cents(row.spend),
      ) ?? 0,
    ),
    revenueCents: Math.round(
      firstNumber(
        m.revenueCents,
        row.revenueCents,
        row.revenue_cents,
        cents(row.revenue),
        cents(actionValue(row.action_values, PURCHASE_ACTIONS)),
      ) ?? 0,
    ),
    purchases: Math.round(
      firstNumber(
        m.purchases,
        row.purchases,
        actionValue(row.actions, PURCHASE_ACTIONS),
      ) ?? 0,
    ),
    impressions: Math.round(firstNumber(m.impressions, row.impressions) ?? 0),
    clicks: Math.round(firstNumber(m.clicks, row.clicks) ?? 0),
    ...(checkouts !== undefined ? { checkouts: Math.round(checkouts) } : {}),
  };
  const calculated = derivadas(metrics);
  const supplied = fields(row.derived);
  const rawCtr = nonnegative(row.ctr);
  return {
    id,
    metrics,
    derived: {
      roas: firstNumber(supplied.roas, m.roas, row.roas) ?? calculated.roas,
      ctr:
        firstNumber(
          supplied.ctr,
          m.ctr,
          rawCtr === undefined ? undefined : rawCtr / 100,
        ) ?? calculated.ctr,
      cpcCents:
        firstNumber(
          supplied.cpcCents,
          m.cpcCents,
          row.cpcCents,
          cents(row.cpc),
        ) ?? calculated.cpcCents,
      cpaCents:
        firstNumber(
          supplied.cpaCents,
          m.cpaCents,
          row.cpaCents,
          cents(row.cpa),
        ) ?? calculated.cpaCents,
    },
  };
}

function summarize(records: readonly NormalizedRecord[]): {
  metrics: AdMetrics;
  derived: PlacementDerivedMetrics;
} {
  if (records.length === 1)
    return {
      metrics: { ...records[0].metrics },
      derived: { ...records[0].derived },
    };
  const metrics = records.length
    ? somarMetricas(records.map((record) => record.metrics))
    : { ...METRICAS_ZERADAS, checkouts: 0 };
  const calculated = derivadas(metrics);
  return {
    metrics,
    derived: {
      roas: calculated.roas,
      ctr: calculated.ctr,
      cpcCents: calculated.cpcCents,
      cpaCents: calculated.cpaCents,
    },
  };
}

/** Pass placements for one creative, already scoped to the API's requested period. */
export function buildPlacementPerformance(
  rows: readonly unknown[] = [],
): PlacementPerformance {
  const records = rows
    .map(normalizeRecord)
    .filter((record): record is NormalizedRecord => record !== null);
  const totals = summarize(records);
  const cards = PLACEMENT_DEFINITIONS.map((definition) => {
    const matching = records.filter((record) => record.id === definition.id);
    const summary = summarize(matching);
    return {
      ...definition,
      ...summary,
      share: 0,
      percentage: 0,
      hasData: matching.length > 0,
    };
  });
  const percentages = percentagensQueFecham(
    cards.map((card) => card.metrics.purchases),
  );
  const totalSales = totals.metrics.purchases;
  return {
    ...totals,
    totalSales,
    hasData: records.length > 0,
    cards: cards.map((card, index) => ({
      ...card,
      share: totalSales > 0 ? card.metrics.purchases / totalSales : 0,
      percentage: percentages[index],
    })),
  };
}
