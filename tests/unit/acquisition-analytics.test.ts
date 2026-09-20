import { describe, expect, it } from "vitest";
import {
  accountToday,
  addDays,
  aggregateDays,
  aggregateMetrics,
  analyzeSalesPatterns,
  classifyEfficiency,
  monthRange,
  normalizeAcquisitionRecords,
  parseAccountDate,
  percentageChange,
  type AcquisitionDailyRecord,
} from "@/features/unified-dashboard/acquisition-analytics";

function record(
  date: string,
  received: number | null = 100,
  fields: Partial<AcquisitionDailyRecord> = {},
): AcquisitionDailyRecord {
  return {
    date,
    networkId: "meta",
    received,
    pending: 0,
    refused: 0,
    spend: 50,
    orders: 10,
    status: "consolidated",
    ...fields,
  };
}
const options = {
  year: 2026,
  month: 7,
  networkId: "all" as const,
  today: "2026-09-01",
};

describe("acquisition calendar dates", () => {
  it("validates dates without local timezone shifts, including leap years", () => {
    expect(parseAccountDate("2024-02-29")?.getUTCDate()).toBe(29);
    expect(parseAccountDate("2026-02-29")).toBeNull();
    expect(parseAccountDate("2026-13-01")).toBeNull();
    expect(parseAccountDate("2026-09-01T03:00:00Z")).toBeNull();
    expect(monthRange(2024, 1)).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(monthRange(2026, 1).end).toBe("2026-02-28");
    expect(monthRange(2026, 3).end).toBe("2026-04-30");
    expect(monthRange(2026, 7).end).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("uses account timezone for today near UTC midnight", () => {
    const now = new Date("2026-09-09T01:30:00Z");
    expect(accountToday("America/Sao_Paulo", now)).toBe("2026-09-08");
    expect(accountToday("Asia/Tokyo", now)).toBe("2026-09-09");
  });
});

describe("shared acquisition totals", () => {
  it("uses total numerators and denominators, not averages of daily ratios", () => {
    const result = aggregateMetrics([
      record("2026-08-01", 100, { spend: 10, orders: 1, newCustomers: 1 }),
      record("2026-08-02", 900, { spend: 450, orders: 99, newCustomers: 49 }),
    ]);
    expect(result.received).toBe(1000);
    expect(result.roas).toBeCloseTo(1000 / 460);
    expect(result.cpa).toBeCloseTo(4.6);
    expect(result.cac).toBeCloseTo(9.2);
  });
  it("keeps absence null and an explicitly measured zero at zero", () => {
    expect(aggregateMetrics([])).toMatchObject({
      received: null,
      orders: null,
      spend: null,
      roas: null,
      days: 0,
    });
    expect(
      aggregateMetrics([record("2026-08-01", 0, { spend: 0, orders: 0 })]),
    ).toMatchObject({
      received: 0,
      spend: 0,
      orders: 0,
      roas: null,
      cpa: null,
      cac: null,
    });
    expect(
      aggregateMetrics([
        record("2026-08-01"),
        record("2026-08-02", null, { spend: null }),
      ]),
    ).toMatchObject({ received: null, spend: null, roas: null });
  });
  it("deduplicates day/channel snapshots but retains separate channels", () => {
    const result = aggregateMetrics([
      record("2026-08-01", 100),
      record("2026-08-01", 120),
      record("2026-08-01", 80, { networkId: "google" }),
    ]);
    expect(result).toMatchObject({ received: 200, recordCount: 2, days: 1 });
  });
  it("rejects invalid dates and channels, sanitizes nonfinite or negative numbers", () => {
    const result = normalizeAcquisitionRecords([
      record("2026-02-30"),
      record("bad"),
      record("2026-08-01", Infinity, { spend: -1, orders: NaN }),
      record("2026-08-02", 100, { networkId: "bad" as "meta" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      received: null,
      spend: null,
      orders: null,
    });
  });
  it("shares filtering and partial flags across dates and channels", () => {
    const result = aggregateDays(
      [
        record("2026-08-01"),
        record("2026-08-01", 90, { networkId: "google", status: "partial" }),
        record("2026-08-02"),
      ],
      {
        networkId: "google",
        start: "2026-08-01",
        end: "2026-08-31",
        today: "2026-08-01",
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2026-08-01",
      received: 90,
      partial: true,
    });
  });
  it("does not sum incomplete or malformed hourly measurements", () => {
    const hours = Array(24).fill(1);
    expect(
      aggregateDays([record("2026-08-01", 100, { hourly: hours })])[0].hourly,
    ).toEqual(hours);
    expect(
      aggregateDays([
        record("2026-08-01", 100, { hourly: hours }),
        record("2026-08-01", 100, { networkId: "google" }),
      ])[0].hourly,
    ).toBeNull();
    expect(
      aggregateDays([record("2026-08-01", 100, { hourly: [1] })])[0].hourly,
    ).toBeNull();
  });
  it("does not show infinite or misleading percentage changes", () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(0, 0)).toBeNull();
    expect(percentageChange(null, 100)).toBeNull();
    expect(percentageChange(150, 100)).toBe(50);
  });
});

describe("one efficiency classification", () => {
  it("has exact nonoverlapping legacy ROAS boundaries and no invented goal", () => {
    expect(
      [0, 0.999, 1, 1.15, 1.4, 1.8].map(
        (roas) => classifyEfficiency({ roas }).id,
      ),
    ).toEqual(["abaixo", "abaixo", "perto", "saudavel", "bom", "excelente"]);
    expect(classifyEfficiency({ roas: null }).id).toBe("sem-dados");
    expect(classifyEfficiency({ roas: Infinity }).id).toBe("sem-dados");
    expect(classifyEfficiency({ roas: 1.4 }).target).toBeNull();
    expect(classifyEfficiency({ roas: 1.4 }, 2)).toMatchObject({
      id: "bom",
      target: 2,
    });
    expect(
      classifyEfficiency({
        roas: aggregateMetrics([record("2026-08-01", 100, { spend: 0 })]).roas,
      }).id,
    ).toBe("sem-dados");
  });
});

describe("sales pattern evidence", () => {
  it("does not invent winners from empty or all-zero measurements", () => {
    for (const records of [
      [],
      Array.from({ length: 31 }, (_, i) =>
        record(addDays("2026-08-01", i), 0, { orders: 0, spend: 0 }),
      ),
    ]) {
      const result = analyzeSalesPatterns(records, options);
      expect(result.hourly.winners).toEqual([]);
      expect(result.weekday.winners).toEqual([]);
      expect(result.week.winners).toEqual([]);
      expect(result.fortnight.winners).toEqual([]);
      expect(result.bestDays.flatMap((group) => group.winners)).toEqual([]);
    }
  });
  it("requires independent repeated weeks for hourly patterns and shows ties", () => {
    const hourly = Array(24).fill(0);
    hourly[18] = 100;
    expect(
      analyzeSalesPatterns(
        [
          record("2026-08-03", 100, { hourly }),
          record("2026-08-04", 100, { hourly }),
        ],
        options,
      ).hourly.sufficient,
    ).toBe(false);
    const repeated = analyzeSalesPatterns(
      [
        record("2026-08-03", 100, { hourly }),
        record("2026-08-10", 100, { hourly }),
      ],
      options,
    ).hourly;
    expect(repeated.winners[0]).toMatchObject({
      label: "18h–21h",
      value: 2,
      observations: 2,
    });
    const tied = [...hourly];
    tied[9] = 100;
    expect(
      analyzeSalesPatterns(
        [
          record("2026-08-03", 100, { hourly: tied }),
          record("2026-08-10", 100, { hourly: tied }),
        ],
        options,
      ).hourly.winners,
    ).toHaveLength(2);
  });
  it("requires recurrence for weekdays and respects the channel filter", () => {
    const records = [
      record("2026-08-03", 200),
      record("2026-08-10", 200),
      record("2026-08-04", 100),
      record("2026-08-11", 100),
      record("2026-08-04", 1000, { networkId: "google" }),
      record("2026-08-11", 1000, { networkId: "google" }),
    ];
    expect(
      analyzeSalesPatterns(records, { ...options, networkId: "meta" }).weekday
        .winners[0].label,
    ).toBe("Segunda-feira");
    expect(
      analyzeSalesPatterns(records, options).weekday.winners[0].label,
    ).toBe("Terça-feira");
    expect(
      analyzeSalesPatterns(records.slice(0, 1), options).weekday.sufficient,
    ).toBe(false);
  });
  it("compares unequal weeks and fortnights by average daily volume", () => {
    const records = Array.from({ length: 31 }, (_, i) =>
      record(addDays("2026-08-01", i), i < 15 ? 100 : 95),
    );
    const result = analyzeSalesPatterns(records, options);
    expect(result.fortnight.winners[0].key).toBe("first");
    expect(result.fortnight.evidence.map((item) => item.value)).toEqual([
      100, 95,
    ]);
    expect(result.fortnight.evidence.map((item) => item.observations)).toEqual([
      15, 16,
    ]);
    expect(result.fortnightDifference).toBe(-5);
    expect(result.week.evidence[0]).toMatchObject({
      label: "27/07–02/08",
      value: 100,
      observations: 2,
      expectedDays: 7,
      complete: false,
    });
  });
  it("uses weighted ratios within weekly evidence and minimizes cost with conversions", () => {
    const records = [
      record("2026-08-03", 100, { spend: 10, orders: 1 }),
      record("2026-08-04", 900, { spend: 450, orders: 99 }),
      record("2026-08-10", 100, { spend: 100, orders: 10 }),
      record("2026-08-11", 100, { spend: 100, orders: 10 }),
    ];
    const roas = analyzeSalesPatterns(records, { ...options, metric: "roas" });
    expect(
      roas.week.evidence.find((item) => item.key === "2026-08-03")?.value,
    ).toBeCloseTo(1000 / 460);
    const cpa = analyzeSalesPatterns(records, { ...options, metric: "cpa" });
    expect(cpa.week.winners[0].key).toBe("2026-08-03");
    expect(cpa.week.winners[0].value).toBeCloseTo(4.6);
    expect(cpa.hourly.unsupported).toBe(true);
  });
  it("retains spend on days with zero conversions and revenue on days with zero spend", () => {
    const records = [
      record("2026-08-03", 100, { spend: 50, orders: 10 }),
      record("2026-08-04", 0, { spend: 50, orders: 0 }),
      record("2026-08-05", 100, { spend: 0, orders: 10 }),
    ];
    const cpa = analyzeSalesPatterns(records, { ...options, metric: "cpa" });
    expect(
      cpa.week.evidence.find((item) => item.key === "2026-08-03"),
    ).toMatchObject({ value: 5, observations: 3 });
    const roas = analyzeSalesPatterns(records, { ...options, metric: "roas" });
    expect(
      roas.week.evidence.find((item) => item.key === "2026-08-03"),
    ).toMatchObject({ value: 2, observations: 3 });
  });
  it("excludes partial and future days and keeps real zeros in observed-day averages", () => {
    const records = [
      record("2026-08-03", 100),
      record("2026-08-04", 0, { orders: 0 }),
      record("2026-08-10", 40),
      record("2026-08-11", 40),
      record("2026-08-12", 99999, { status: "partial" }),
      record("2026-08-20", 99999),
    ];
    const result = analyzeSalesPatterns(records, {
      ...options,
      today: "2026-08-12",
    });
    expect(result.week.winners[0]).toMatchObject({
      key: "2026-08-03",
      value: 50,
      observations: 2,
    });
    expect(result.excludedPartialDays).toBe(1);
    expect(result.bestDays[1].sufficient).toBe(false);
  });
  it("keeps explicit ties and does not compare a single quinzena against missing data", () => {
    const result = analyzeSalesPatterns(
      [
        record("2026-08-01"),
        record("2026-08-02"),
        record("2026-08-16"),
        record("2026-08-17"),
      ],
      options,
    );
    expect(result.fortnight.winners).toHaveLength(2);
    expect(result.bestDays[0].winners).toHaveLength(2);
    expect(
      analyzeSalesPatterns(
        [record("2026-08-01"), record("2026-08-02")],
        options,
      ).fortnight.sufficient,
    ).toBe(false);
  });
});
