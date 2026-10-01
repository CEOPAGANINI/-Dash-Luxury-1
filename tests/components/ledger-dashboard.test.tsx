import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyDashboardData } from "@/features/unified-dashboard/empty-data";
import type { UnifiedDashboardData } from "@/features/unified-dashboard/types";

const state = vi.hoisted(() => ({ data: null as UnifiedDashboardData | null }));
vi.mock("@/features/unified-dashboard/operation-provider", () => ({
  useUnifiedDashboard: () => ({ data: state.data }),
}));

import { LedgerDashboard } from "@/features/unified-dashboard/ledger-dashboard";

beforeEach(() => {
  state.data = emptyDashboardData("unavailable");
});
afterEach(cleanup);
describe("livro-caixa real", () => {
  it("não apresenta valores zerados quando a fonte está indisponível", () => {
    render(<LedgerDashboard />);
    expect(screen.getByRole("status").textContent).toContain(
      "Valores indisponíveis",
    );
    expect(screen.queryByText("Entradas na lista")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Ver diagnóstico" })
        .getAttribute("href"),
    ).toBe("/configuracoes/diagnosticos");
  });

  it("formata EUR, indica limite da lista e não chama diferença de saldo disponível", () => {
    state.data!.source.status = "ready";
    state.data!.source.currency = "EUR";
    state.data!.source.timeZone = "Europe/Lisbon";
    state.data!.transactions = [
      {
        date: "2026-10-01T12:00:00Z",
        description: "Entrada registrada",
        category: "Venda",
        type: "entrada",
        value: 100,
      },
      {
        date: "2026-10-01T11:00:00Z",
        description: "Despesa registrada",
        category: "Entrega",
        type: "saida",
        value: 20,
      },
    ];
    render(<LedgerDashboard />);
    expect(
      screen.getByRole("heading", { name: "Diferença da lista" }),
    ).toBeTruthy();
    expect(screen.getByText(/80,00/).textContent).toContain("€");
    expect(screen.getByText(/Até 100 lançamentos/).textContent).toContain(
      "Totais apenas desta lista",
    );
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.getByText("Entrada registrada")).toBeTruthy();
  });
});
