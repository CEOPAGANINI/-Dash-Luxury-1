import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  aggregateDays,
  aggregateMetrics,
  analyzeSalesPatterns,
  monthRange,
} from "@/features/unified-dashboard/acquisition-analytics";
import { createAcquisitionDemoSource } from "@/features/unified-dashboard/acquisition-demo-data";

describe("explicit acquisition demo data", () => {
  it("marks the source as a demo without claiming real attribution or freshness", () => {
    const source = createAcquisitionDemoSource(2026, 10);
    expect(source).toMatchObject({
      operationId: "alpha",
      status: "ready",
      mode: "demo",
      demoAsOf: "2026-11-30",
      attributionVerified: false,
      sourceName: "Dados de exemplo",
      timeZone: "America/Sao_Paulo",
      roasTarget: 2,
    });
    expect(source.updatedAt).toBeUndefined();
    expect(source.attributionModel).toContain("não representa atribuição real");
    expect(createAcquisitionDemoSource(2026, 10, "beta").operationId).toBe(
      "beta",
    );
  });

  it.each([
    [2026, 1, 28],
    [2024, 1, 29],
    [2026, 10, 30],
    [2026, 11, 31],
  ])(
    "covers all days in %i/%i plus exactly 90 preceding days",
    (year, month, length) => {
      const source = createAcquisitionDemoSource(year, month);
      const selected = monthRange(year, month);
      const days = aggregateDays(source.records);
      expect(source.records).toHaveLength((length + 90) * 3);
      expect(days).toHaveLength(length + 90);
      expect(days[0].date).toBe(addDays(selected.start, -90));
      expect(days.at(-1)?.date).toBe(selected.end);
      expect(days.every((day) => day.records.length === 3)).toBe(true);
      expect(
        new Set(
          source.records.map((record) => `${record.date}:${record.networkId}`),
        ).size,
      ).toBe(source.records.length);
    },
  );

  it("is deterministic across calls, system clocks and overlapping month windows", () => {
    const expected = createAcquisitionDemoSource(2026, 10);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
      expect(createAcquisitionDemoSource(2026, 10)).toEqual(expected);
    } finally {
      vi.useRealTimers();
    }
    const next = createAcquisitionDemoSource(2026, 11);
    expect(
      next.records.filter((record) => record.date === "2026-11-15"),
    ).toEqual(
      expected.records.filter((record) => record.date === "2026-11-15"),
    );
    expected.records[0].received = -1;
    expect(
      createAcquisitionDemoSource(2026, 10).records[0].received,
    ).toBeGreaterThan(0);
  });

  it("keeps finite nonnegative metrics, integer conversions and exact hourly allocations", () => {
    const source = createAcquisitionDemoSource(2026, 10);
    for (const record of source.records) {
      for (const key of [
        "received",
        "pending",
        "refused",
        "spend",
        "orders",
        "newCustomers",
      ] as const) {
        expect(Number.isFinite(record[key])).toBe(true);
        expect(record[key]).toBeGreaterThanOrEqual(0);
      }
      expect(Number.isInteger(record.orders)).toBe(true);
      expect(Number.isInteger(record.newCustomers)).toBe(true);
      expect(record.newCustomers).toBeLessThanOrEqual(record.orders!);
      expect(record.hourly).toHaveLength(24);
      expect(record.hourlyOrders).toHaveLength(24);
      expect(record.hourlyOrders!.every(Number.isInteger)).toBe(true);
      expect(record.hourlyOrders!.reduce((sum, count) => sum + count, 0)).toBe(
        record.orders,
      );
      expect(
        record.hourly!.reduce((sum, value) => sum + Math.round(value * 100), 0),
      ).toBe(Math.round(record.received! * 100));
      expect(record.hourly!.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
        record.received!,
        9,
      );
      expect(
        record.hourly!.every(
          (value, hour) =>
            Number.isFinite(value) &&
            value >= 0 &&
            (record.hourlyOrders![hour] > 0 || value === 0),
        ),
      ).toBe(true);
    }
  });

  it("supports totals, channel comparisons and all recurring pattern evidence", () => {
    const source = createAcquisitionDemoSource(2026, 10);
    const selected = source.records.filter((record) =>
      record.date.startsWith("2026-11"),
    );
    const totals = aggregateMetrics(selected);
    expect(totals.received).toBeGreaterThan(0);
    expect(totals.roas).toBeCloseTo(totals.received! / totals.spend!);
    expect(totals.cac).toBeCloseTo(totals.spend! / totals.newCustomers!);
    expect(new Set(selected.map((record) => record.status))).toEqual(
      new Set(["consolidated", "partial"]),
    );
    const patterns = analyzeSalesPatterns(source.records, {
      year: 2026,
      month: 10,
      networkId: "all",
      today: source.demoAsOf,
    });
    expect(patterns.hourly.sufficient).toBe(true);
    expect(patterns.weekday.sufficient).toBe(true);
    expect(patterns.week.sufficient).toBe(true);
    expect(patterns.fortnight.sufficient).toBe(true);
    expect(patterns.bestDays.every((result) => result.sufficient)).toBe(true);
  });

  it.each([
    [NaN, 0],
    [2026, -1],
    [2026, 12],
    [2026, 1.5],
    [2026.5, 1],
    [99, 0],
  ])("rejects invalid period %s/%s", (year, month) => {
    expect(() => createAcquisitionDemoSource(year, month)).toThrow(RangeError);
  });
});
