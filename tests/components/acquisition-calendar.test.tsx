import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AcquisitionCalendar,
  type AcquisitionCalendarProps,
} from "@/features/unified-dashboard/acquisition-calendar";
import type { AcquisitionDailyRecord } from "@/features/unified-dashboard/acquisition-analytics";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const record = (
  overrides: Partial<AcquisitionDailyRecord> = {},
): AcquisitionDailyRecord => ({
  date: "2026-09-01",
  networkId: "meta",
  received: 150,
  pending: 0,
  refused: 0,
  spend: 100,
  orders: 3,
  status: "consolidated",
  ...overrides,
});

function Calendar(props: Partial<AcquisitionCalendarProps> = {}) {
  const [day, setDay] = React.useState<number | null>(props.day ?? null);
  return (
    <AcquisitionCalendar
      records={[]}
      year={2026}
      month={8}
      networkId="all"
      timeZone="America/Sao_Paulo"
      today="2026-09-08"
      view="month"
      {...props}
      day={day}
      onSelectDay={(next) => {
        setDay(next);
        props.onSelectDay?.(next);
      }}
    />
  );
}

function grid() {
  return screen.getByRole("region", { name: "Calendário de aquisição" });
}
function cell(date: string) {
  return grid().querySelector<HTMLButtonElement>(
    `button[data-date="${date}"]`,
  )!;
}
function segment(date: string) {
  return screen
    .getByRole("group", { name: "Selecionar dia pela eficiência" })
    .querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
}
function panel() {
  return screen.getByRole("dialog", { name: "Detalhes do dia" });
}

describe("acquisition calendar dates and honest data states", () => {
  it.each([
    [2026, 1, 28, "2026-01-26", 35],
    [2024, 1, 29, "2024-01-29", 35],
    [2026, 3, 30, "2026-03-30", 35],
    [2026, 7, 31, "2026-07-27", 42],
  ])(
    "positions month %i/%i with %i days from Monday",
    (year, month, count, first, totalCells) => {
      render(<Calendar year={year} month={month} />);
      const buttons =
        grid().querySelectorAll<HTMLButtonElement>("button[data-date]");
      expect(buttons).toHaveLength(totalCells);
      expect(buttons.length % 7).toBe(0);
      expect(Array.from(buttons).every((button) => !button.disabled)).toBe(
        true,
      );
      expect(buttons[0].getAttribute("data-date")).toBe(first);
      expect(
        grid().querySelectorAll('button[data-outside="false"]'),
      ).toHaveLength(count);
      expect(
        screen
          .getByRole("group", { name: "Selecionar dia pela eficiência" })
          .querySelectorAll("button"),
      ).toHaveLength(count);
    },
  );

  it("handles the December–January boundary without carrying the previous month week", () => {
    const { rerender } = render(
      <Calendar year={2026} month={11} view="week" />,
    );
    expect(cell("2026-11-30")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
    rerender(<Calendar year={2027} month={0} view="week" />);
    expect(cell("2026-12-28")).not.toBeNull();
    expect(cell("2027-01-01")).not.toBeNull();
    expect(screen.getByText("Semana 1 de 5")).toBeTruthy();
  });

  it("distinguishes an explicit zero, absent, partial and future day", () => {
    render(
      <Calendar
        records={[
          record({ received: 0, orders: 0 }),
          record({ date: "2026-09-02", status: "partial" }),
          record({ date: "2026-09-30" }),
        ]}
      />,
    );
    expect(cell("2026-09-01").textContent).toContain("R$");
    expect(cell("2026-09-01").getAttribute("data-status")).toBe("Consolidado");
    expect(cell("2026-09-02").getAttribute("data-status")).toBe("Parcial");
    expect(cell("2026-09-03").textContent).toContain("Sem dados");
    expect(cell("2026-09-03").textContent).not.toContain("R$");
    expect(cell("2026-09-30").getAttribute("data-status")).toBe("Futuro");
    expect(cell("2026-09-30").textContent).not.toContain("R$");
    expect(segment("2026-09-30").getAttribute("aria-label")).toContain(
      "Futuro",
    );
  });

  it("uses the account timezone to decide whether the date is future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T01:00:00Z"));
    render(
      <Calendar
        today={undefined}
        timeZone="America/Sao_Paulo"
        records={[record({ date: "2026-09-09" })]}
      />,
    );
    expect(cell("2026-09-09").getAttribute("data-status")).toBe("Futuro");
    expect(cell("2026-09-08").getAttribute("data-status")).toBe("Sem dados");
  });

  it("labels adjacent dates with their month and shows available data without adding them to monthly efficiency counts", () => {
    render(
      <Calendar
        records={[
          record({ date: "2026-08-31", received: 400 }),
          record(),
          record({ date: "2026-10-01", received: 900 }),
        ]}
      />,
    );
    const previousMonth = cell("2026-08-31");
    expect(previousMonth.disabled).toBe(false);
    expect(previousMonth.textContent).toMatch(/31\s*ago/i);
    expect(previousMonth.textContent).toMatch(/R\$\s*400/);
    expect(previousMonth.textContent).toContain("4,00x");
    expect(previousMonth.getAttribute("data-status")).toBe("Consolidado");
    expect(previousMonth.getAttribute("aria-label")).toContain(
      "31 de agosto de 2026",
    );
    const nextMonth = cell("2026-10-01");
    expect(nextMonth.disabled).toBe(false);
    expect(nextMonth.textContent).toMatch(/1\s*out/i);
    expect(nextMonth.getAttribute("data-status")).toBe("Futuro");
    expect(nextMonth.textContent).not.toContain("R$");
    expect(segment("2026-08-31")).toBeNull();
    expect(segment("2026-10-01")).toBeNull();
    expect(
      screen.getByRole("group", { name: "Selecionar dia pela eficiência" })
        .children,
    ).toHaveLength(30);
    const legend = screen.getByLabelText("Legenda de eficiência");
    const highestBand = Array.from(legend.children).find((item) =>
      item.textContent?.includes("ROAS de 1,80 ou mais"),
    );
    expect(highestBand?.textContent).toContain("0 dias");
  });
});

describe("selection, filters and details", () => {
  it("previews an adjacent day on hover without selecting a date or changing the period", () => {
    const onSelectDate = vi.fn();
    const onSelectDay = vi.fn();
    render(
      <Calendar
        records={[record({ date: "2026-08-31", received: 400 })]}
        onSelectDate={onSelectDate}
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.mouseEnter(cell("2026-08-31"));
    expect(
      within(panel()).getByText("segunda-feira, 31 de agosto de 2026"),
    ).toBeTruthy();
    expect(within(panel()).getByText(/R\$\s*400,00/)).toBeTruthy();
    expect(onSelectDate).not.toHaveBeenCalled();
    expect(onSelectDay).not.toHaveBeenCalled();
    expect(cell("2026-08-31").getAttribute("data-outside")).toBe("true");
    expect(cell("2026-09-01").getAttribute("data-outside")).toBe("false");
  });

  it("passes the full adjacent date across a year boundary instead of selecting that day in the wrong month", () => {
    const onSelectDate = vi.fn();
    const onSelectDay = vi.fn();
    render(
      <Calendar
        year={2026}
        month={11}
        onSelectDate={onSelectDate}
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.click(cell("2027-01-01"));
    expect(onSelectDate).toHaveBeenLastCalledWith("2027-01-01");
    expect(onSelectDay).not.toHaveBeenCalled();
    fireEvent.click(cell("2026-12-01"));
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-12-01");
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("only previews an adjacent date when the host does not provide full-date navigation", () => {
    const onSelectDay = vi.fn();
    render(<Calendar onSelectDay={onSelectDay} />);
    fireEvent.click(cell("2026-08-31"));
    expect(onSelectDay).not.toHaveBeenCalled();
    expect(cell("2026-08-31").getAttribute("aria-pressed")).toBe("false");
    expect(
      within(panel()).getByText("segunda-feira, 31 de agosto de 2026"),
    ).toBeTruthy();
  });

  it("opens floating details on hover without selecting the day or creating a lateral panel", () => {
    const onSelectDay = vi.fn();
    const { container } = render(
      <Calendar records={[record()]} onSelectDay={onSelectDay} />,
    );
    fireEvent.mouseEnter(cell("2026-09-01"));
    expect(panel()).toBeTruthy();
    expect(container.contains(panel())).toBe(false);
    expect(onSelectDay).not.toHaveBeenCalled();
    expect(cell("2026-09-01").getAttribute("aria-pressed")).toBe("false");
    expect(segment("2026-09-01").getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.queryByRole("complementary", { name: "Detalhes do dia" }),
    ).toBeNull();
    expect(
      within(panel()).getByText("terça-feira, 1 de setembro de 2026"),
    ).toBeTruthy();
  });

  it("updates floating details when hovering another day without changing selection", () => {
    const onSelectDay = vi.fn();
    render(
      <Calendar
        records={[record(), record({ date: "2026-09-02", received: 300 })]}
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.mouseEnter(cell("2026-09-01"));
    fireEvent.mouseLeave(cell("2026-09-01"));
    fireEvent.mouseEnter(cell("2026-09-02"));
    expect(
      screen.getAllByRole("dialog", { name: "Detalhes do dia" }),
    ).toHaveLength(1);
    expect(
      within(panel()).getByText("quarta-feira, 2 de setembro de 2026"),
    ).toBeTruthy();
    expect(
      within(panel()).queryByText("terça-feira, 1 de setembro de 2026"),
    ).toBeNull();
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("closes after leaving the day with a short delay", async () => {
    render(<Calendar records={[record()]} />);
    fireEvent.mouseEnter(cell("2026-09-01"));
    fireEvent.mouseLeave(cell("2026-09-01"));
    expect(panel()).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
  });

  it("stays open when the pointer moves from a day into its floating details", () => {
    vi.useFakeTimers();
    render(<Calendar records={[record()]} />);
    fireEvent.mouseEnter(cell("2026-09-01"));
    fireEvent.mouseLeave(cell("2026-09-01"));
    fireEvent.mouseEnter(panel());
    act(() => vi.advanceTimersByTime(250));
    expect(panel()).toBeTruthy();
    fireEvent.mouseLeave(panel());
    act(() => vi.advanceTimersByTime(250));
    expect(
      screen.queryByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeNull();
  });

  it("keeps the preview open after pointer leave while the day still has keyboard focus", () => {
    vi.useFakeTimers();
    render(
      <>
        <Calendar records={[record()]} />
        <button type="button">Fora do calendário</button>
      </>,
    );
    const trigger = cell("2026-09-01");
    act(() => trigger.focus());
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(250));
    expect(document.activeElement).toBe(trigger);
    expect(panel()).toBeTruthy();

    act(() =>
      screen.getByRole("button", { name: "Fora do calendário" }).focus(),
    );
    act(() => vi.advanceTimersByTime(250));
    expect(
      screen.queryByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeNull();
  });

  it("does not replace the day being read when incidental hover crosses another day while focus is inside the dialog", () => {
    vi.useFakeTimers();
    const onSelectDay = vi.fn();
    render(
      <Calendar
        records={[record(), record({ date: "2026-09-02", received: 300 })]}
        onSelectDay={onSelectDay}
      />,
    );
    fireEvent.mouseEnter(cell("2026-09-01"));
    const closeButton = within(panel()).getByRole("button", {
      name: "Fechar detalhes do dia",
    });
    act(() => closeButton.focus());
    fireEvent.mouseLeave(cell("2026-09-01"));
    fireEvent.mouseEnter(cell("2026-09-02"));
    act(() => vi.advanceTimersByTime(250));
    expect(document.activeElement).toBe(closeButton);
    expect(
      within(panel()).getByText("terça-feira, 1 de setembro de 2026"),
    ).toBeTruthy();
    expect(
      within(panel()).queryByText("quarta-feira, 2 de setembro de 2026"),
    ).toBeNull();
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("returns focus from the first dialog button to its day with Shift+Tab without closing or selecting", () => {
    vi.useFakeTimers();
    const onSelectDay = vi.fn();
    render(<Calendar records={[record()]} onSelectDay={onSelectDay} />);
    const trigger = cell("2026-09-01");
    act(() => trigger.focus());
    const closeButton = within(panel()).getByRole("button", {
      name: "Fechar detalhes do dia",
    });
    act(() => closeButton.focus());
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    act(() => vi.advanceTimersByTime(250));
    expect(document.activeElement).toBe(trigger);
    expect(panel()).toBeTruthy();
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("opens from keyboard focus without selecting and dismisses with Escape", () => {
    const onSelectDay = vi.fn();
    render(<Calendar records={[record()]} onSelectDay={onSelectDay} />);
    act(() => cell("2026-09-01").focus());
    expect(panel()).toBeTruthy();
    expect(onSelectDay).not.toHaveBeenCalled();
    fireEvent.keyDown(cell("2026-09-01"), { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeNull();
  });

  it("supports hover and keyboard focus on efficiency segments without silently selecting them", () => {
    const onSelectDay = vi.fn();
    render(<Calendar records={[record()]} onSelectDay={onSelectDay} />);
    fireEvent.mouseEnter(segment("2026-09-01"));
    expect(
      within(panel()).getByText("terça-feira, 1 de setembro de 2026"),
    ).toBeTruthy();
    expect(onSelectDay).not.toHaveBeenCalled();
    fireEvent.mouseLeave(segment("2026-09-01"));
    fireEvent.focus(segment("2026-09-02"));
    expect(
      within(panel()).getByText("quarta-feira, 2 de setembro de 2026"),
    ).toBeTruthy();
    expect(onSelectDay).not.toHaveBeenCalled();
  });

  it("synchronizes calendar and efficiency selection and opens accessible details without hover", () => {
    const onSelectDay = vi.fn();
    render(<Calendar records={[record()]} onSelectDay={onSelectDay} />);
    fireEvent.click(cell("2026-09-01"));
    expect(onSelectDay).toHaveBeenLastCalledWith(1);
    expect(segment("2026-09-01").getAttribute("aria-pressed")).toBe("true");
    expect(panel()).toBeTruthy();
    expect(
      within(panel()).getByText("terça-feira, 1 de setembro de 2026"),
    ).toBeTruthy();
    fireEvent.click(segment("2026-09-02"));
    expect(onSelectDay).toHaveBeenLastCalledWith(2);
    expect(cell("2026-09-02").getAttribute("aria-pressed")).toBe("true");
    expect(cell("2026-09-01").getAttribute("aria-pressed")).toBe("false");
    expect(panel()).toBeTruthy();
  });

  it("closes details with Escape and returns focus to the selecting control", () => {
    render(<Calendar />);
    const trigger = segment("2026-09-01");
    fireEvent.click(trigger);
    const closeButton = within(panel()).getByRole("button", {
      name: "Fechar detalhes do dia",
    });
    act(() => closeButton.focus());
    fireEvent.keyDown(closeButton, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("uses the same efficiency classification in all three places and applies the channel filter", () => {
    render(
      <Calendar
        records={[record(), record({ networkId: "google", received: 1000 })]}
        networkId="meta"
      />,
    );
    fireEvent.click(cell("2026-09-01"));
    expect(cell("2026-09-01").textContent).toContain("1,50x");
    expect(segment("2026-09-01").getAttribute("aria-label")).toContain(
      "ROAS de 1,40 a 1,80",
    );
    expect(
      within(panel()).getByText(/Consolidado · ROAS de 1,40 a 1,80/),
    ).toBeTruthy();
    expect(within(panel()).queryByText(/R\$\s1.150/)).toBeNull();
  });

  it("shows CPA rather than inventing CAC or an hourly graph", () => {
    render(<Calendar records={[record()]} />);
    fireEvent.click(cell("2026-09-01"));
    expect(within(panel()).getByText("CPA", { exact: true })).toBeTruthy();
    expect(within(panel()).queryByText("CAC", { exact: true })).toBeNull();
    expect(within(panel()).queryByRole("img")).toBeNull();
    expect(within(panel()).getByText(/Sem dados por horário/)).toBeTruthy();
    expect(
      within(panel()).getByText(/Campanhas do dia não informadas/),
    ).toBeTruthy();
  });

  it("uses real hourly sales and new customers when available", () => {
    const hourlyOrders = Array.from({ length: 24 }, (_, hour) =>
      hour === 18 ? 3 : 0,
    );
    render(
      <Calendar
        records={[
          record({
            newCustomers: 2,
            hourlyOrders,
            campaignIds: ["campanha-real"],
          }),
        ]}
      />,
    );
    fireEvent.click(cell("2026-09-01"));
    expect(within(panel()).getByText("CAC", { exact: true })).toBeTruthy();
    expect(within(panel()).queryByText("CPA", { exact: true })).toBeNull();
    expect(
      within(panel()).getByRole("img", { name: /Vendas por hora.*18h–19h/ }),
    ).toBeTruthy();
    expect(
      within(panel()).getByText("Vendas · Fuso: America/Sao_Paulo"),
    ).toBeTruthy();
    expect(within(panel()).getByText("campanha-real")).toBeTruthy();
  });

  it("changes a week by keyboard or wheel and selects a different week from the efficiency strip", () => {
    render(<Calendar view="week" />);
    const firstDay = cell("2026-09-01");
    fireEvent.keyDown(firstDay, { key: "PageDown" });
    expect(cell("2026-09-07")).not.toBeNull();
    expect(cell("2026-09-01")).toBeNull();
    fireEvent.wheel(cell("2026-09-07"), { deltaY: 100 });
    expect(cell("2026-09-14")).not.toBeNull();
    fireEvent.click(segment("2026-09-02"));
    expect(cell("2026-09-02").getAttribute("aria-pressed")).toBe("true");
    expect(panel()).toBeTruthy();
  });
});
