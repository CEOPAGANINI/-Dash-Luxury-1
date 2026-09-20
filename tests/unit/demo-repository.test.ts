import { describe, expect, it } from "vitest";

import { DemoExecutiveAnalyticsRepository } from "@/data/repositories/demo-executive-analytics-repository";
import type { DemoRevenueDay } from "@/lib/demo-data";

const rows: DemoRevenueDay[] = [
  {
    date: "2026-01-01",
    day: "01/01",
    aprovada: 1000,
    pendente: 100,
    recusada: 50,
    pedidos: 10,
    tempoAprovacaoSeg: 90,
  },
  {
    date: "2026-01-02",
    day: "02/01",
    aprovada: 1200,
    pendente: 80,
    recusada: 40,
    pedidos: 12,
    tempoAprovacaoSeg: 85,
  },
  {
    date: "2026-01-03",
    day: "03/01",
    aprovada: 900,
    pendente: 70,
    recusada: 60,
    pedidos: 9,
    tempoAprovacaoSeg: 100,
  },
];

describe("DemoExecutiveAnalyticsRepository", () => {
  it("isola a fonte de dados da camada visual", async () => {
    const repository = new DemoExecutiveAnalyticsRepository(rows);
    const result = await repository.getExecutiveData({
      workspaceId: "demo",
      startDate: "2026-01-02",
      endDate: "2026-01-03",
      timezone: "America/Sao_Paulo",
    });

    expect(result.revenueDays.map((day) => day.date)).toEqual([
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(result.demoMode).toBe(true);
    expect(
      result.freshness.some((source) => source.status === "estimated"),
    ).toBe(true);
  });
});
