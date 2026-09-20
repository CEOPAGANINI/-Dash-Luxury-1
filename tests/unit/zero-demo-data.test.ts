import { describe, expect, it } from "vitest";

import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import {
  demoDailyRevenueGoal,
  demoLedger,
  demoProfitSummary,
  demoRecentOrders,
  demoRevenueByDayHour,
  demoRevenueByYear,
  demoTopProducts,
} from "@/lib/demo-data";

describe("fallback sem dados", () => {
  it("preserva o calendário com todas as métricas zeradas", () => {
    expect(demoRevenueByYear.length).toBeGreaterThan(0);
    expect(demoDailyRevenueGoal).toBe(0);
    expect(
      demoRevenueByYear.every(
        (day) =>
          day.aprovada === 0 &&
          day.pendente === 0 &&
          day.recusada === 0 &&
          day.pedidos === 0 &&
          day.tempoAprovacaoSeg === 0,
      ),
    ).toBe(true);
    expect(
      Object.values(demoRevenueByDayHour)
        .flat()
        .every((point) => point.valor === 0),
    ).toBe(true);
  });

  it("remove registros fictícios e zera os resumos", () => {
    expect(demoTopProducts).toEqual([]);
    expect(demoRecentOrders).toEqual([]);
    expect(demoLedger).toEqual([]);
    expect(demoProfitSummary.every((item) => item.value === "R$ 0,00")).toBe(
      true,
    );
  });

  it("zera aquisição, campanhas e funis sem remover sua estrutura", () => {
    for (const operation of Object.values(unifiedDemoData.operations)) {
      expect(Object.values(operation.kpis).every((value) => value === 0)).toBe(
        true,
      );
      expect(
        operation.networks.every((network) =>
          Object.entries(network)
            .filter(([, value]) => typeof value === "number")
            .every(([, value]) => value === 0),
        ),
      ).toBe(true);
      expect(
        Object.values(operation.funnels).every(
          (funnel) =>
            funnel.stages.every((stage) =>
              stage.slice(1).every((value) => value === 0),
            ) &&
            funnel.demographics.every((value) => value === 0) &&
            funnel.video.every((value) => value === 0),
        ),
      ).toBe(true);
    }

    expect(unifiedDemoData.products).toEqual([]);
    expect(unifiedDemoData.orders).toEqual([]);
    expect(unifiedDemoData.customers).toEqual([]);
    expect(unifiedDemoData.transactions).toEqual([]);
    expect(unifiedDemoData.notifications).toEqual([]);
  });
});
