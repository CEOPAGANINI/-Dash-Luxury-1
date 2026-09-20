import { describe, expect, it } from "vitest";

import type { DemoRevenueDay } from "@/lib/demo-data";
import {
  acquisitionRows,
  buildExecutiveSnapshot,
  buildExecutiveSnapshotForSelection,
  financialBridge,
  selectExecutivePeriod,
} from "@/domain/analytics";

const days: DemoRevenueDay[] = Array.from({ length: 40 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, index + 1));
  const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return {
    date: iso,
    day: `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    aprovada: 4_000 + index * 20,
    pendente: 350,
    recusada: 180,
    pedidos: 45,
    tempoAprovacaoSeg: 120,
  };
});

describe("selectExecutivePeriod", () => {
  it("separa período atual e anterior com o mesmo tamanho", () => {
    const result = selectExecutivePeriod(days, "2026-02-09", "7d");
    expect(result.current).toHaveLength(7);
    expect(result.previous).toHaveLength(7);
    expect(result.current[0].date).toBe("2026-02-03");
    expect(result.previous[0].date).toBe("2026-01-27");
  });
});

describe("buildExecutiveSnapshot", () => {
  it("mantém ROI, ROAS e margem como conceitos separados", () => {
    const snapshot = buildExecutiveSnapshot(days, "2026-02-09", "30d");
    expect(snapshot.mer).toBeGreaterThan(0);
    expect(snapshot.margemContribuicao).toBeLessThan(1);
    expect(snapshot.kpis.map((kpi) => kpi.key)).toEqual([
      "cash",
      "net",
      "contribution",
      "margin",
      "mer",
      "nc-cac",
    ]);
  });

  it("não mistura volume processado com receita aprovada", () => {
    const snapshot = buildExecutiveSnapshot(days, "2026-02-09", "7d");
    expect(snapshot.volumeProcessado).toBe(
      snapshot.receitaAprovada +
        snapshot.receitaPendente +
        snapshot.receitaRecusada,
    );
    expect(snapshot.volumeProcessado).toBeGreaterThan(snapshot.receitaAprovada);
  });

  it("preserva seleções do calendário que atravessam meses", () => {
    const selected = [
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
    ];
    const snapshot = buildExecutiveSnapshotForSelection(days, selected);
    expect(snapshot.days.map((day) => day.date)).toEqual(selected);
    expect(snapshot.previousDays).toHaveLength(7);
    expect(snapshot.label).toBe("29/01–04/02");
  });
  it("fecha a ponte financeira no lucro de contribuição", () => {
    const snapshot = buildExecutiveSnapshot(days, "2026-02-09", "7d");
    const bridge = financialBridge(snapshot);
    const result = bridge.at(-1);
    expect(result?.label).toBe("Lucro de contribuição");
    expect(result?.value).toBe(snapshot.lucroContribuicao);
  });
});

describe("acquisitionRows", () => {
  it("gera uma leitura por canal com ROAS e ROI explícitos", () => {
    const rows = acquisitionRows(days.slice(-30));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.roas).toBeGreaterThan(0);
      expect(Number.isFinite(row.roi)).toBe(true);
      expect(["Escalar", "Manter", "Reduzir", "Validar"]).toContain(row.action);
    }
  });
});
