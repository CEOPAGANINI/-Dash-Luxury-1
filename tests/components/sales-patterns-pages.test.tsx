import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { pick, picked } from "../helpers/block-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SalesPatterns,
  type SalesPatternSection,
} from "@/features/unified-dashboard/sales-patterns";
import type { AcquisitionDailyRecord } from "@/features/unified-dashboard/acquisition-analytics";

afterEach(cleanup);

const records: AcquisitionDailyRecord[] = [
  {
    date: "2026-08-03",
    networkId: "meta",
    received: 100,
    spend: 50,
    orders: 10,
    pending: 0,
    refused: 0,
    newCustomers: 2,
  },
];
const props = {
  records,
  year: 2026,
  month: 7,
  networkId: "all" as const,
  today: "2026-09-01",
};
const cases: [SalesPatternSection, string][] = [
  ["hourly", "Horário de pico recorrente"],
  ["weekday", "Melhor dia da semana"],
  ["week", "Melhor semana"],
  ["fortnight", "Melhor quinzena"],
  ["bestDays", "Melhor dia de cada quinzena"],
];

describe("independent sales-pattern pages", () => {
  it.each(cases)("renders only the requested %s element", (section, title) => {
    render(<SalesPatterns {...props} section={section} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
    expect(screen.getByLabelText("Definir melhor por")).toBeTruthy();
    if (section === "hourly" || section === "weekday")
      expect(screen.getByLabelText("Histórico recorrente")).toBeTruthy();
    else expect(screen.queryByLabelText("Histórico recorrente")).toBeNull();
  });

  it("uses shared controlled metric and historical window across page changes", () => {
    const onMetricChange = vi.fn(),
      onHistoryDaysChange = vi.fn();
    const { rerender } = render(
      <SalesPatterns
        {...props}
        section="hourly"
        metric="received"
        historyDays={60}
        onMetricChange={onMetricChange}
        onHistoryDaysChange={onHistoryDaysChange}
      />,
    );
    pick("Definir melhor por", "orders");
    pick("Histórico recorrente", "90");
    expect(onMetricChange).toHaveBeenCalledWith("orders");
    expect(onHistoryDaysChange).toHaveBeenCalledWith(90);
    rerender(
      <SalesPatterns
        {...props}
        section="weekday"
        metric="orders"
        historyDays={90}
        onMetricChange={onMetricChange}
        onHistoryDaysChange={onHistoryDaysChange}
      />,
    );
    expect(picked("Definir melhor por")).toBe("orders");
    expect(picked("Histórico recorrente")).toBe("90");
    expect(
      screen.queryByRole("heading", {
        level: 3,
        name: "Horário de pico recorrente",
      }),
    ).toBeNull();
  });
});
