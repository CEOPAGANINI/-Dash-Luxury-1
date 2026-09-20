import { describe, expect, it } from "vitest";

import { buildExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";
import type { DemoRevenueDay } from "@/lib/demo-data";

const days: DemoRevenueDay[] = Array.from({ length: 45 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, index + 1));
  return {
    date: date.toISOString().slice(0, 10),
    day: `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    aprovada: 4_000 + index * 35,
    pendente: 320,
    recusada: 170,
    pedidos: 44,
    tempoAprovacaoSeg: 120,
  };
});

describe("buildExecutiveDashboardModel", () => {
  it("calcula as camadas executivas uma única vez em um view model", () => {
    const model = buildExecutiveDashboardModel({
      days,
      anchorDate: days.at(-1)?.date,
      period: "30d",
    });

    expect(model.snapshot.kpis).toHaveLength(6);
    expect(model.acquisition).toHaveLength(3);
    expect(model.creatives).toHaveLength(6);
    expect(model.bridge.at(-1)?.value).toBe(model.snapshot.lucroContribuicao);
    expect(model.funnel).toHaveLength(8);
    expect(model.freshness).toHaveLength(4);
  });
});
