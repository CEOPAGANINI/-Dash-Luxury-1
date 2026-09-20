import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { pick, picked } from "../helpers/block-picker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcquisitionDailyRecord } from "@/features/unified-dashboard/acquisition-analytics";
import type { AcquisitionDataSource } from "@/features/unified-dashboard/acquisition-source";
import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import { TrafficBoard } from "@/features/unified-dashboard/traffic-board";
import type { NetworkId } from "@/features/unified-dashboard/types";

vi.mock("@/features/unified-dashboard/operation-provider", () => ({
  useUnifiedDashboard: vi.fn(),
}));

// Deliberately keep BoardPager, PageSessionMenu, calendar and analyses real.
// Rendering every page through a navigation mock hid the previous stacking bug.
const operation = unifiedDemoData.operations.alpha;
const funnel = Object.values(operation.funnels)[0];
const PAGE_NAMES = [
  "Calendário",
  "Horário de pico",
  "Dia da semana",
  "Melhor semana",
  "Melhor quinzena",
  "Dias das quinzenas",
  "Canais",
  "Resumo",
  "Funil de tráfego",
  "Público",
  "Criativos",
];
const PATTERN_PAGES = [
  ["Horário de pico", "Horário de pico recorrente"],
  ["Dia da semana", "Melhor dia da semana"],
  ["Melhor semana", "Melhor semana"],
  ["Melhor quinzena", "Melhor quinzena"],
  ["Dias das quinzenas", "Melhor dia de cada quinzena"],
] as const;

function useTestDashboard(): ReturnType<typeof useUnifiedDashboard> {
  const [day, setDay] = React.useState(1);
  const [month, setMonth] = React.useState(7);
  const [year, setYear] = React.useState(2026);
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
    year,
    setYear,
    month,
    setMonth,
    day,
    setDay,
    period: "30d",
    setPeriod: vi.fn(),
    resetFilters: vi.fn(),
  };
}

// Fixtures live exclusively in tests. Production must never import them.
function record(
  date: string,
  received: number,
  spend: number,
  orders: number,
  networkId: Exclude<NetworkId, "all"> = "meta",
): AcquisitionDailyRecord {
  return {
    date,
    received,
    spend,
    orders,
    networkId,
    pending: 0,
    refused: 0,
    status: "consolidated",
  };
}
function source(
  records: AcquisitionDailyRecord[] = [],
  overrides: Partial<AcquisitionDataSource> = {},
): AcquisitionDataSource {
  return {
    operationId: "alpha",
    status: "ready",
    records,
    attributionVerified: true,
    attributionModel: "Checkout exclusivo por canal",
    sourceName: "Fonte de teste",
    timeZone: "America/Sao_Paulo",
    roasTarget: 2,
    ...overrides,
  };
}

function openPage(name: string) {
  fireEvent.pointerEnter(
    screen.getByRole("button", { name: "Abrir menu de sessões desta página" }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: `Abrir sessão ${PAGE_NAMES.indexOf(name) + 1}: ${name}`,
    }),
  );
}
function metricCard(region: HTMLElement, label: string) {
  const card = within(region)
    .getByRole("heading", { name: (name) => name.startsWith(label) })
    .closest("article");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}
function expectBefore(before: Element, after: Element) {
  expect(
    before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
}

function expectCalendarChromeRemoved(container: HTMLElement) {
  const title = screen.getByRole("heading", {
    name: "Calendário de aquisição",
    level: 1,
  });
  expect(title.classList.contains("sr-only")).toBe(true);
  for (const label of [
    "Filtros compartilhados da Aquisição",
    "Mês analisado",
    "Ano analisado",
    "Canal de aquisição",
    "Período de comparação",
    "Início da comparação",
    "Fim da comparação",
    "Visualização do calendário",
  ]) {
    expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull();
  }
  for (const name of [
    "Comparar período",
    "Mês anterior",
    "Mês atual",
    "Próximo mês",
    "Mês",
    "Semana",
  ]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  expect(container.querySelector(".board-pager-content > header")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.queryByText("Entenda quando suas vendas performam melhor."),
  ).toBeNull();
  expect(screen.queryByText(/Aquisição · 1 de 11/)).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T18:00:00Z"));
  vi.mocked(useUnifiedDashboard).mockImplementation(useTestDashboard);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal("scrollTo", vi.fn());
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

describe("independent acquisition pages", () => {
  it("opens Calendar by default with efficiency immediately after it, without stacking the other pages", () => {
    const { container } = render(<TrafficBoard />);
    expectCalendarChromeRemoved(container);
    expect(
      screen.getByRole("heading", {
        name: "Calendário de aquisição",
        level: 1,
      }),
    ).toBeTruthy();
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    const efficiency = screen.getByRole("region", {
      name: "Barra de eficiência dos dias",
    });
    expectBefore(calendar, efficiency);
    expect(calendar.nextElementSibling).toBe(efficiency);
    expect(
      calendar.querySelectorAll('button[data-outside="false"]'),
    ).toHaveLength(31);
    expect(
      within(efficiency).getByRole("group", {
        name: "Selecionar dia pela eficiência",
      }).children,
    ).toHaveLength(31);
    expect(
      screen.queryByRole("heading", { name: "Padrões de vendas" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Comparação dos canais" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Indicadores consolidados" }),
    ).toBeNull();
    expect(
      container.querySelectorAll(".board-pager-page:not([hidden])"),
    ).toHaveLength(1);
    expect(picked("Páginas da Aquisição")).toBe("0");

    fireEvent.pointerEnter(
      screen.getByRole("button", {
        name: "Abrir menu de sessões desta página",
      }),
    );
    const nav = screen.getByRole("navigation", {
      name: "Páginas da Aquisição",
    });
    expect(within(nav).getAllByRole("button")).toHaveLength(11);
    expect(
      within(nav)
        .getByRole("button", { name: "Abrir sessão 1: Calendário" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("navigates through eleven real pages while preserving month, year, channel and comparison filters", { timeout: 20000 }, () => {
    const { container } = render(
      <TrafficBoard
        source={source([
          record("2025-07-14", 100, 20, 1),
          record("2025-07-14", 300, 60, 3, "google"),
        ])}
      />,
    );
    openPage("Canais");
    pick("Mês analisado", "6");
    pick("Ano analisado", "2025");
    pick("Canal de aquisição", "google");
    fireEvent.click(screen.getByRole("button", { name: "Comparar período" }));
    fireEvent.change(screen.getByLabelText("Início da comparação"), {
      target: { value: "2025-05-03" },
    });
    fireEvent.change(screen.getByLabelText("Fim da comparação"), {
      target: { value: "2025-05-17" },
    });

    for (const name of [...PAGE_NAMES.slice(1), "Calendário"]) {
      openPage(name);
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
      expect(
        container
          .querySelector(".board-pager-page:not([hidden])")
          ?.getAttribute("aria-label"),
      ).toBe(name);
      if (name === "Calendário") {
        expectCalendarChromeRemoved(container);
        const calendar = screen.getByRole("region", {
          name: "Calendário de aquisição",
        });
        const filteredDay = calendar.querySelector('[data-date="2025-07-14"]');
        expect(filteredDay?.getAttribute("aria-label")).toMatch(
          /Receita: R\$\s*300,00/,
        );
        expect(filteredDay?.textContent).not.toMatch(/R\$\s*400/);
      } else {
        expect(picked("Mês analisado")).toBe("6");
        expect(picked("Ano analisado")).toBe("2025");
        expect(picked("Canal de aquisição")).toBe("google");
        expect(
          (screen.getByLabelText("Início da comparação") as HTMLInputElement)
            .value,
        ).toBe("2025-05-03");
        expect(
          (screen.getByLabelText("Fim da comparação") as HTMLInputElement)
            .value,
        ).toBe("2025-05-17");
        expect(
          within(
            container.querySelector<HTMLElement>(
              ".board-pager-content > header",
            )!,
          ).getByRole("status"),
        ).toBeTruthy();
      }
      expect(
        container.querySelectorAll(".board-pager-page:not([hidden])"),
      ).toHaveLength(1);
      expect(
        screen
          .getByRole("button", { name: "Abrir menu de sessões desta página" })
          .getAttribute("aria-expanded"),
      ).toBe("false");
    }
    openPage("Resumo");
    expect(
      (screen.getByLabelText("Início da comparação") as HTMLInputElement).value,
    ).toBe("2025-05-03");
    expect(
      (screen.getByLabelText("Fim da comparação") as HTMLInputElement).value,
    ).toBe("2025-05-17");
  });

  it("gives each sales analysis its own page instead of stacking the five analyses", () => {
    const { container } = render(<TrafficBoard />);

    for (const [page, heading] of PATTERN_PAGES) {
      openPage(page);
      const activePage = container.querySelector<HTMLElement>(
        ".board-pager-page:not([hidden])",
      )!;
      expect(
        within(activePage).getByRole("heading", { name: heading, level: 3 }),
      ).toBeTruthy();
      for (const [, otherHeading] of PATTERN_PAGES) {
        if (otherHeading === heading) continue;
        expect(
          within(activePage).queryByRole("heading", {
            name: otherHeading,
            level: 3,
          }),
        ).toBeNull();
      }
      expect(
        within(activePage).queryByRole("region", {
          name: "Calendário de aquisição",
        }),
      ).toBeNull();
      expect(
        within(activePage).queryByRole("region", {
          name: "Comparação dos canais",
        }),
      ).toBeNull();
      expect(
        within(activePage).queryByRole("region", {
          name: "Indicadores consolidados",
        }),
      ).toBeNull();
    }
  });

  it("preserves the selected analysis metric and recurring-history window across independent pattern pages", () => {
    render(
      <TrafficBoard source={source([record("2026-08-03", 400, 100, 4)])} />,
    );
    openPage("Horário de pico");
    pick("Definir melhor por", "orders");
    pick("Histórico recorrente", "90");

    for (const [page] of PATTERN_PAGES.slice(1)) {
      openPage(page);
      expect(picked("Definir melhor por")).toBe("orders");
      if (page === "Dia da semana") {
        expect(picked("Histórico recorrente")).toBe("90");
      }
    }
    openPage("Canais");
    openPage("Horário de pico");
    expect(picked("Definir melhor por")).toBe("orders");
    expect(picked("Histórico recorrente")).toBe("90");
  });

  it("keeps funnel, audience and creatives on independent menu pages", () => {
    const { container } = render(<TrafficBoard />);
    const diagnostics = [
      ["Funil de tráfego", "Funil do tráfego"],
      ["Público", "Público e demográficos"],
      ["Criativos", "Creative Intelligence"],
    ] as const;

    for (const [page, region] of diagnostics) {
      openPage(page);
      const activePage = container.querySelector<HTMLElement>(
        ".board-pager-page:not([hidden])",
      )!;
      expect(
        within(activePage).getByRole("region", { name: region }),
      ).toBeTruthy();
      for (const [, otherRegion] of diagnostics) {
        if (otherRegion === region) continue;
        expect(
          within(activePage).queryByRole("region", { name: otherRegion }),
        ).toBeNull();
      }
      expect(
        within(activePage).queryByRole("region", {
          name: "Comportamento do dia",
        }),
      ).toBeNull();
      expect(
        within(activePage).queryByRole("region", {
          name: "Calendário de aquisição",
        }),
      ).toBeNull();
    }
  });

  it("keeps the desktop monthly calendar and selected day while changing pages, and synchronizes the efficiency strip", async () => {
    render(
      <TrafficBoard
        source={source([
          record("2026-08-03", 400, 100, 4),
          record("2026-08-04", 600, 200, 6),
        ])}
      />,
    );
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    const third = calendar.querySelector<HTMLButtonElement>(
      '[data-date="2026-08-03"]',
    )!;
    fireEvent.click(third);
    const strip = screen.getByRole("group", {
      name: "Selecionar dia pela eficiência",
    });
    const fourth = strip.querySelector<HTMLButtonElement>(
      '[data-date="2026-08-04"]',
    )!;
    fireEvent.click(fourth);
    expect(fourth.getAttribute("aria-pressed")).toBe("true");
    expect(
      calendar
        .querySelector('[data-date="2026-08-04"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      calendar
        .querySelector('[data-date="2026-08-03"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    const detail = screen.getByRole("dialog", {
      name: "Detalhes do dia",
    });
    expect(
      within(detail).getByText(/terça-feira, 4 de agosto de 2026/),
    ).toBeTruthy();
    expect(within(detail).getByText(/^CPA$/)).toBeTruthy();
    expect(within(detail).getByText(/CAC indisponível/)).toBeTruthy();

    openPage("Canais");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
    openPage("Calendário");
    expect(calendar.querySelector('[data-view="month"]')).not.toBeNull();
    expect(
      calendar.querySelectorAll('button[data-outside="false"]'),
    ).toHaveLength(31);
    expect(
      calendar
        .querySelector('[data-date="2026-08-04"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.mouseEnter(
      calendar.querySelector<HTMLButtonElement>('[data-date="2026-08-04"]')!,
    );
    expect(
      screen.getByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeTruthy();
  });

  it("applies month and year filters from another page to Calendar, including year boundaries and leap February", () => {
    render(<TrafficBoard />);

    for (const [year, month, length] of [
      [2026, 11, 31],
      [2027, 0, 31],
      [2026, 11, 31],
      [2024, 1, 29],
      [2025, 1, 28],
      [2026, 3, 30],
      [2026, 6, 31],
    ]) {
      openPage("Resumo");
      pick("Ano analisado", String(year));
      pick("Mês analisado", String(month));
      openPage("Calendário");
      const calendar = screen.getByRole("region", {
        name: "Calendário de aquisição",
      });
      expect(
        calendar.querySelectorAll('button[data-outside="false"]'),
      ).toHaveLength(length);
      expect(
        calendar.querySelector(
          `[data-date="${year}-${String(month + 1).padStart(2, "0")}-01"]`,
        ),
      ).not.toBeNull();
    }
  });

  it("previews adjacent-month data without changing the shared month filter", async () => {
    render(
      <TrafficBoard source={source([record("2026-07-31", 750, 250, 5)])} />,
    );
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    const adjacentDay = calendar.querySelector<HTMLButtonElement>(
      '[data-date="2026-07-31"]',
    )!;
    expect(adjacentDay.disabled).toBe(false);
    expect(adjacentDay.textContent).toMatch(/31\s*jul/i);
    fireEvent.mouseEnter(adjacentDay);
    const details = screen.getByRole("dialog", { name: "Detalhes do dia" });
    expect(
      within(details).getByText(/sexta-feira, 31 de julho de 2026/),
    ).toBeTruthy();
    expect(within(details).getByText(/R\$\s*750,00/)).toBeTruthy();
    expect(adjacentDay.getAttribute("aria-pressed")).toBe("false");
    expect(
      calendar.querySelectorAll('button[data-outside="false"]'),
    ).toHaveLength(31);
    openPage("Canais");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
    expect(picked("Mês analisado")).toBe("7");
    expect(picked("Ano analisado")).toBe("2026");
  });

  it("selects the correct month, year and day when adjacent cells cross December and January", async () => {
    vi.setSystemTime(new Date("2027-02-01T18:00:00Z"));
    render(
      <TrafficBoard
        source={source([
          record("2026-12-31", 560, 140, 4),
          record("2027-01-01", 620, 155, 4),
        ])}
      />,
    );
    openPage("Canais");
    pick("Mês analisado", "11");
    openPage("Calendário");
    let calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    fireEvent.click(
      calendar.querySelector<HTMLButtonElement>('[data-date="2027-01-01"]')!,
    );
    const januaryDay = calendar.querySelector('[data-date="2027-01-01"]');
    expect(januaryDay?.getAttribute("data-outside")).toBe("false");
    expect(januaryDay?.getAttribute("aria-pressed")).toBe("true");
    openPage("Canais");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
    expect(picked("Ano analisado")).toBe("2027");
    expect(picked("Mês analisado")).toBe("0");
    openPage("Calendário");
    calendar = screen.getByRole("region", { name: "Calendário de aquisição" });
    fireEvent.click(
      calendar.querySelector<HTMLButtonElement>('[data-date="2026-12-31"]')!,
    );
    const decemberDay = calendar.querySelector('[data-date="2026-12-31"]');
    expect(decemberDay?.getAttribute("data-outside")).toBe("false");
    expect(decemberDay?.getAttribute("aria-pressed")).toBe("true");
    openPage("Resumo");
    expect(picked("Ano analisado")).toBe("2026");
    expect(picked("Mês analisado")).toBe("11");
    expect(
      within(
        metricCard(
          screen.getByRole("region", { name: "Indicadores consolidados" }),
          "Receita atribuída",
        ),
      ).getByText(/R\$\s*560,00/),
    ).toBeTruthy();
  });

  it("keeps navigation separate on mobile and opens floating details with the tap/click fallback", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { container } = render(<TrafficBoard />);
    expectCalendarChromeRemoved(container);
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    expect(calendar.querySelector('[data-view="week"]')).not.toBeNull();
    expect(calendar.querySelectorAll("button[data-date]")).toHaveLength(7);
    fireEvent.click(
      calendar.querySelector<HTMLButtonElement>('[data-date="2026-08-01"]')!,
    );
    expect(
      screen.getByRole("dialog", { name: "Detalhes do dia" }),
    ).toBeTruthy();
    expect(
      calendar
        .querySelector('[data-date="2026-08-01"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    pick("Páginas da Aquisição", String(PAGE_NAMES.indexOf("Resumo")));
    expect(
      screen.getByRole("heading", { name: "Resumo do período", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Calendário de aquisição" }),
    ).toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
    expect(
      container.querySelectorAll(".board-pager-page:not([hidden])"),
    ).toHaveLength(1);
    pick("Páginas da Aquisição", "0");
    expectCalendarChromeRemoved(container);
    expect(calendar.querySelector('[data-view="week"]')).not.toBeNull();
  });

  it("previews days and efficiency segments on hover without changing the selected day", async () => {
    const { container } = render(
      <TrafficBoard source={source([record("2026-08-03", 400, 100, 4)])} />,
    );
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    const third = calendar.querySelector<HTMLButtonElement>(
      '[data-date="2026-08-03"]',
    )!;
    fireEvent.mouseEnter(third);
    const dialog = screen.getByRole("dialog", { name: "Detalhes do dia" });
    expect(container.contains(dialog)).toBe(false);
    expect(third.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(dialog).getByText(/segunda-feira, 3 de agosto de 2026/),
    ).toBeTruthy();
    fireEvent.mouseLeave(third);
    const fourth = screen
      .getByRole("group", { name: "Selecionar dia pela eficiência" })
      .querySelector<HTMLButtonElement>('[data-date="2026-08-04"]')!;
    fireEvent.mouseEnter(fourth);
    expect(fourth.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(screen.getByRole("dialog", { name: "Detalhes do dia" })).getByText(
        /terça-feira, 4 de agosto de 2026/,
      ),
    ).toBeTruthy();
    fireEvent.mouseLeave(fourth);
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Detalhes do dia" }),
      ).toBeNull();
    });
  });
});

describe("honest acquisition data and aggregate comparisons", () => {
  it("shows explicitly labeled demonstration data without claiming verified live attribution", () => {
    const { container } = render(
      <TrafficBoard
        source={source([record("2026-11-04", 1234, 200, 3)], {
          mode: "demo",
          attributionVerified: false,
          demoAsOf: "2026-11-30",
        })}
      />,
    );
    openPage("Canais");
    pick("Mês analisado", "10");
    const channels = screen.getByRole("region", {
      name: "Comparação dos canais",
    });
    expect(within(channels).getByText(/Cenário demonstrativo:/)).toBeTruthy();
    expect(channels.textContent).not.toContain(
      "Atribuição: Checkout exclusivo por canal.",
    );
    expect(channels.textContent).not.toContain("Atribuição verificada");
    openPage("Calendário");
    expectCalendarChromeRemoved(container);
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    expect(
      within(calendar).getByText(/Dados de exemplo · Período simulado/),
    ).toBeTruthy();
    const day = calendar.querySelector('[data-date="2026-11-04"]');
    expect(day?.getAttribute("data-status")).toBe("Consolidado");
    expect(day?.getAttribute("aria-label")).toMatch(/Receita: R\$\s*1\.234,00/);
  });

  it("ignores demonstration dates for live sources and keeps real future days unavailable", () => {
    render(
      <TrafficBoard
        source={source([record("2026-11-04", 1234, 200, 3)], {
          mode: "live",
          demoAsOf: "2026-11-30",
        })}
      />,
    );
    openPage("Canais");
    pick("Mês analisado", "10");
    openPage("Calendário");
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    const day = calendar.querySelector('[data-date="2026-11-04"]');
    expect(day?.getAttribute("data-status")).toBe("Futuro");
    expect(day?.getAttribute("aria-label")).toContain(
      "Receita: não disponível",
    );
    expect(day?.textContent).not.toMatch(/1\.234/);
    expect(
      within(calendar).queryByText(/Dados de exemplo · Período simulado/),
    ).toBeNull();
    openPage("Resumo");
    expect(
      within(
        screen.getByRole("region", { name: "Indicadores consolidados" }),
      ).getAllByText("Sem dados"),
    ).toHaveLength(5);
  });

  it("does not present zero revenue or invented patterns when no source is available", () => {
    const { container } = render(<TrafficBoard />);
    expectCalendarChromeRemoved(container);
    const calendar = screen.getByRole("region", {
      name: "Calendário de aquisição",
    });
    expect(calendar.textContent).not.toMatch(/R\$\s*0/);
    for (const [page] of PATTERN_PAGES) {
      openPage(page);
      expect(screen.getByRole("status").textContent).toMatch(
        /Sem dados.*Integração diária/,
      );
      const activePage = container.querySelector<HTMLElement>(
        ".board-pager-page:not([hidden])",
      )!;
      expect(
        within(activePage).getAllByText("Histórico insuficiente").length,
      ).toBeGreaterThanOrEqual(1);
    }
    openPage("Resumo");
    const summary = screen.getByRole("region", {
      name: "Indicadores consolidados",
    });
    expect(within(summary).getAllByText("Sem dados")).toHaveLength(5);
    expect(summary.textContent).not.toMatch(/R\$\s*0|NaN|Infinity/);
  });

  it.each(["loading", "error", "unavailable"] as const)(
    "shows the %s state without using source records as a fallback",
    (status) => {
      const { container } = render(
        <TrafficBoard
          source={source([record("2026-08-01", 9999, 12, 3)], { status })}
        />,
      );
      expect(
        container
          .querySelector(".acquisition-board")
          ?.getAttribute("aria-busy"),
      ).toBe(String(status === "loading"));
      expectCalendarChromeRemoved(container);
      expect(
        screen.getByRole("region", { name: "Calendário de aquisição" })
          .textContent,
      ).not.toMatch(/9\.999|R\$\s*0/);
      openPage("Resumo");
      expect(
        screen.getByRole(status === "error" ? "alert" : "status").textContent,
      ).toMatch(
        status === "loading"
          ? /Carregando/
          : status === "error"
            ? /Não foi possível/
            : /Sem dados/,
      );
      expect(
        screen.getByRole("region", { name: "Indicadores consolidados" })
          .textContent,
      ).not.toMatch(/9\.999|R\$\s*0/);
    },
  );

  it.each([{ attributionVerified: false }, { operationId: "beta" as const }])(
    "rejects unverified or other-operation records: %j",
    (overrides) => {
      render(
        <TrafficBoard
          source={source([record("2026-08-01", 9999, 12, 3)], overrides)}
        />,
      );
      openPage("Resumo");
      const summary = screen.getByRole("region", {
        name: "Indicadores consolidados",
      });
      expect(within(summary).getAllByText("Sem dados")).toHaveLength(5);
      expect(summary.textContent).not.toContain("9.999");
    },
  );

  it("calculates consolidated ROAS and CPA from totals, and compares volume by observed daily average", () => {
    render(
      <TrafficBoard
        source={source([
          record("2026-08-01", 100, 10, 1),
          record("2026-08-02", 900, 300, 9),
          record("2026-07-01", 400, 100, 4),
        ])}
      />,
    );
    openPage("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Comparar período" }));
    const summary = screen.getByRole("region", {
      name: "Indicadores consolidados",
    });
    expect(
      within(metricCard(summary, "Receita atribuída")).getByText(
        /R\$\s*1\.000,00/,
      ),
    ).toBeTruthy();
    expect(
      within(metricCard(summary, "ROAS consolidado")).getByText("3,23x"),
    ).toBeTruthy();
    expect(
      within(metricCard(summary, "CPA")).getByText(/R\$\s*31,00/),
    ).toBeTruthy();
    const comparisons = screen.getByRole("region", {
      name: "Comparações entre períodos",
    });
    const revenue = metricCard(comparisons, "Receita atribuída");
    expect(within(revenue).getByText(/R\$\s*500,00/)).toBeTruthy();
    expect(within(revenue).getByText(/R\$\s*400,00/)).toBeTruthy();
    expect(within(revenue).getByText("+25,0%")).toBeTruthy();
    const roas = metricCard(comparisons, "ROAS consolidado");
    expect(within(roas).getByText("3,23x")).toBeTruthy();
    expect(within(roas).getByText("4,00x")).toBeTruthy();
    expect(within(roas).getByText("-19,4%")).toBeTruthy();
  });

  it("preserves explicit zero but never divides by a zero comparison baseline", () => {
    render(
      <TrafficBoard
        source={source([
          record("2026-08-01", 100, 20, 1),
          record("2026-07-01", 0, 0, 0),
        ])}
      />,
    );
    openPage("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Comparar período" }));
    const comparisons = screen.getByRole("region", {
      name: "Comparações entre períodos",
    });
    expect(
      within(comparisons).getAllByText("Base zero: variação não calculável"),
    ).toHaveLength(3);
    expect(
      within(comparisons).getAllByText("Histórico insuficiente"),
    ).toHaveLength(2);
    expect(comparisons.textContent).not.toMatch(/Infinity|NaN|∞/);
    const revenue = metricCard(comparisons, "Receita atribuída");
    expect(within(revenue).getByText(/R\$\s*0,00/)).toBeTruthy();
  });

  it("filters channels from their own comparison page and preserves access to diagnostics and campaigns", () => {
    render(
      <TrafficBoard
        source={source([
          record("2026-08-01", 200, 100, 2),
          record("2026-08-01", 600, 200, 6, "google"),
        ])}
      />,
    );
    openPage("Canais");
    const comparison = screen.getByRole("region", {
      name: "Comparação dos canais",
    });
    expect(within(comparison).getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.click(
      within(comparison).getByRole("checkbox", { name: "YouTube Ads" }),
    );
    expect(
      within(comparison).queryByRole("heading", { name: "YouTube Ads" }),
    ).toBeNull();
    fireEvent.click(
      within(comparison).getByRole("button", {
        name: "Filtrar por Google Ads",
      }),
    );
    expect(picked("Canal de aquisição")).toBe("google");
    expect(
      within(comparison).queryByRole("heading", { name: "Meta Ads" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Funil, público e criativos" })
        .getAttribute("href"),
    ).toBe("/dashboard/trafego/diagnosticos");
    expect(
      screen
        .getByRole("link", { name: "Gerenciar campanhas" })
        .getAttribute("href"),
    ).toBe("/campanhas");
    openPage("Resumo");
    expect(
      within(
        metricCard(
          screen.getByRole("region", { name: "Indicadores consolidados" }),
          "ROAS consolidado",
        ),
      ).getByText("3,00x"),
    ).toBeTruthy();
  });
});
