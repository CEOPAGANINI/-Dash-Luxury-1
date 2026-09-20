import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionCenter } from "@/features/unified-dashboard/decision-center";
import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import type { NetworkId } from "@/features/unified-dashboard/types";

vi.mock("@/features/unified-dashboard/operation-provider", () => ({
  useUnifiedDashboard: vi.fn(),
}));

// These tests exercise the calendar's events and DOM lifecycle, not the portal.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

const selectedDay = vi.fn();
const operation = unifiedDemoData.operations.alpha;
const funnel = Object.values(operation.funnels)[0];
let calendarPeriod = { year: 2026, month: 10 };

function useTestDashboard(): ReturnType<typeof useUnifiedDashboard> {
  // November 2026 has six calendar weeks, including neighboring-month days.
  const [day, setDay] = React.useState(1);
  const [networkId, setNetworkId] = React.useState<NetworkId>("all");

  return {
    operationId: "alpha",
    operation,
    setOperationId: vi.fn(),
    networkId,
    setNetworkId,
    funnelId: funnel.id,
    funnel,
    setFunnelId: vi.fn(),
    campaignId: "all",
    setCampaignId: vi.fn(),
    year: calendarPeriod.year,
    setYear: vi.fn(),
    month: calendarPeriod.month,
    setMonth: vi.fn(),
    day,
    setDay: (next) => {
      selectedDay(next);
      setDay(next);
    },
    period: "30d",
    setPeriod: vi.fn(),
    resetFilters: vi.fn(),
  };
}

function setup() {
  render(<DecisionCenter>{({ calendar }) => calendar}</DecisionCenter>);
  return screen.getByRole("group", { name: "Semana do calendário" });
}

function daysFrame(viewport: HTMLElement) {
  const frame = viewport.querySelector<HTMLElement>("[data-direction]");
  if (!frame) throw new Error("The weekly day list is missing");
  return frame;
}

function dayNames(viewport: HTMLElement) {
  return Array.from(viewport.querySelectorAll('[aria-label^="Dia "]')).map(
    (day) => day.getAttribute("aria-label")?.split(",")[0],
  );
}

function wheel(viewport: HTMLElement, options: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  fireEvent(viewport, event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  calendarPeriod = { year: 2026, month: 10 };
  selectedDay.mockClear();
  vi.mocked(useUnifiedDashboard).mockImplementation(useTestDashboard);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("calendar week transitions", () => {
  it("renders seven unique days, including neighboring-month context, without an initial animation", () => {
    const viewport = setup();

    expect(daysFrame(viewport).dataset.direction).toBe("0");
    expect(dayNames(viewport)).toEqual([
      "Dia 26 de Outubro",
      "Dia 27 de Outubro",
      "Dia 28 de Outubro",
      "Dia 29 de Outubro",
      "Dia 30 de Outubro",
      "Dia 31 de Outubro",
      "Dia 1 de Novembro",
    ]);
    expect(new Set(dayNames(viewport)).size).toBe(7);
    expect(within(viewport).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();
  });

  it("replaces the day list once per next/previous action with the matching animation direction", () => {
    const viewport = setup();
    const initial = daysFrame(viewport);

    fireEvent.keyDown(viewport, { key: "PageDown" });
    const second = daysFrame(viewport);
    expect(second).not.toBe(initial);
    expect(second.dataset.direction).toBe("1");
    expect(dayNames(viewport)).toEqual(
      [2, 3, 4, 5, 6, 7, 8].map((day) => `Dia ${day} de Novembro`),
    );
    expect(within(viewport).getAllByRole("button")).toHaveLength(7);

    fireEvent.keyDown(viewport, { key: "PageUp" });
    expect(daysFrame(viewport)).not.toBe(second);
    expect(daysFrame(viewport).dataset.direction).toBe("-1");
    expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();
    expect(selectedDay).not.toHaveBeenCalled();
  });

  it("supports Page Down/Page Up from a focused day and keeps focus in the calendar", () => {
    const viewport = setup();
    const firstDay = within(viewport).getByRole("button", {
      name: /^Dia 1 de Novembro,/,
    });
    firstDay.focus();
    const outerKeyDown = vi.fn();
    window.addEventListener("keydown", outerKeyDown);

    try {
      fireEvent.keyDown(firstDay, { key: "PageDown" });
      expect(screen.getByText(/Semana 2 de 6/)).toBeTruthy();
      expect(daysFrame(viewport).dataset.direction).toBe("1");
      expect(document.activeElement).toBe(viewport);

      fireEvent.keyDown(viewport, { key: "PageUp" });
      expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();
      expect(daysFrame(viewport).dataset.direction).toBe("-1");
      expect(document.activeElement).toBe(viewport);
      expect(outerKeyDown).not.toHaveBeenCalled();
      expect(selectedDay).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", outerKeyDown);
    }
  });

  it("advances only one week per vertical wheel gesture and does not bubble into page navigation", () => {
    const viewport = setup();
    const outerWheel = vi.fn();
    window.addEventListener("wheel", outerWheel);

    try {
      const small = wheel(viewport, { deltaY: 12 });
      expect(small.defaultPrevented).toBe(true);
      expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();

      wheel(viewport, { deltaY: 12 });
      const second = daysFrame(viewport);
      expect(screen.getByText(/Semana 2 de 6/)).toBeTruthy();
      expect(second.dataset.direction).toBe("1");

      // Trackpad inertia in the same gesture must not replay the animation.
      wheel(viewport, { deltaY: 100 });
      wheel(viewport, { deltaY: 80 });
      expect(daysFrame(viewport)).toBe(second);

      act(() => vi.advanceTimersByTime(181));
      wheel(viewport, { deltaY: -30 });
      expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();
      expect(daysFrame(viewport).dataset.direction).toBe("-1");
      expect(outerWheel).not.toHaveBeenCalled();
      expect(selectedDay).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("wheel", outerWheel);
    }
  });

  it("preserves horizontal scrolling and browser zoom without changing the week", () => {
    const viewport = setup();
    const initial = daysFrame(viewport);

    expect(wheel(viewport, { deltaX: 80, deltaY: 5 }).defaultPrevented).toBe(
      false,
    );
    expect(
      wheel(viewport, { deltaY: 80, ctrlKey: true }).defaultPrevented,
    ).toBe(false);
    expect(daysFrame(viewport)).toBe(initial);
  });

  it("clamps both ends without replacing the list or replaying the last transition", () => {
    const viewport = setup();
    const initial = daysFrame(viewport);

    fireEvent.keyDown(viewport, { key: "PageUp" });
    expect(daysFrame(viewport)).toBe(initial);
    expect(daysFrame(viewport).dataset.direction).toBe("0");

    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(viewport, { key: "PageDown" });
    }
    expect(screen.getByText(/Semana 6 de 6/)).toBeTruthy();
    expect(dayNames(viewport)).toHaveLength(7);
    const last = daysFrame(viewport);
    fireEvent.keyDown(viewport, { key: "PageDown" });
    wheel(viewport, { deltaY: 100 });
    expect(daysFrame(viewport)).toBe(last);
    expect(daysFrame(viewport).dataset.direction).toBe("1");
  });

  it("selects a day without replacing or animating the visible week again", () => {
    const viewport = setup();
    fireEvent.keyDown(viewport, { key: "PageDown" });
    const second = daysFrame(viewport);
    const selected = within(viewport).getByRole("button", {
      name: /^Dia 4 de Novembro,/,
    });

    fireEvent.click(selected);
    expect(selectedDay).toHaveBeenCalledExactlyOnceWith(4);
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(daysFrame(viewport)).toBe(second);
    expect(daysFrame(viewport).dataset.direction).toBe("1");
  });

  it("resets to the first week without directional motion when the month or year changes", () => {
    const calendar = () => (
      <DecisionCenter>{({ calendar }) => calendar}</DecisionCenter>
    );
    const { rerender } = render(calendar());
    const viewport = screen.getByRole("group", {
      name: "Semana do calendário",
    });
    fireEvent.keyDown(viewport, { key: "PageDown" });
    const november = daysFrame(viewport);

    calendarPeriod = { year: 2026, month: 11 };
    rerender(calendar());
    expect(daysFrame(viewport)).not.toBe(november);
    expect(daysFrame(viewport).dataset.direction).toBe("0");
    expect(screen.getByText(/Semana 1 de 5/)).toBeTruthy();
    expect(dayNames(viewport)).toHaveLength(7);

    // A → B → A must not restore A's previously displayed second week.
    calendarPeriod = { year: 2026, month: 10 };
    rerender(calendar());
    expect(daysFrame(viewport).dataset.direction).toBe("0");
    expect(screen.getByText(/Semana 1 de 6/)).toBeTruthy();
    expect(dayNames(viewport)[0]).toBe("Dia 26 de Outubro");

    calendarPeriod = { year: 2026, month: 11 };
    rerender(calendar());
    fireEvent.keyDown(viewport, { key: "PageDown" });
    calendarPeriod = { year: 2027, month: 11 };
    rerender(calendar());
    expect(daysFrame(viewport).dataset.direction).toBe("0");
    expect(screen.getByText(/Semana 1 de 5/)).toBeTruthy();

    fireEvent.keyDown(viewport, { key: "PageDown" });
    calendarPeriod = { year: 2028, month: 0 };
    rerender(calendar());
    expect(daysFrame(viewport).dataset.direction).toBe("0");
    expect(screen.getByText(/Semana 1 de/)).toBeTruthy();
  });
});
