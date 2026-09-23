import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisualOverview } from "@/features/dashboard/visual-overview";
import type { DemoRevenueDay } from "@/lib/demo-data";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

beforeEach(() => {
  /* O painel pergunta pelo tamanho da tela e observa o próprio bloco; no
     jsdom nada disso existe, e sem estes dublês o componente nem chega a
     renderizar. */
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
  vi.unstubAllGlobals();
  cleanup();
});

/*
  Um período sem pedido e sem gasto não é "saudável" nem "crítico": não há
  o que julgar. Antes desta guarda o painel dizia "Payback 0 compras —
  Saudável", porque zero caía na faixa de "até 1 compra", e dizia
  "Receita R$ 0 — Crítico", que é um veredito sobre a ausência de dado.
*/
const diasVazios: DemoRevenueDay[] = Array.from({ length: 45 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, i + 1));
  return {
    date: d.toISOString().slice(0, 10),
    day: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    aprovada: 0,
    pendente: 0,
    recusada: 0,
    pedidos: 0,
    tempoAprovacaoSeg: 0,
  };
});

function painelVazio() {
  return render(
    <VisualOverview days={diasVazios} anchorDays={diasVazios} demoMode={false} />,
  );
}

describe("painel com o período vazio", () => {
  it("não emite veredito nenhum sobre nada", () => {
    painelVazio();
    for (const palavra of ["Saudável", "Crítico", "Atenção"]) {
      expect(screen.queryAllByText(palavra)).toHaveLength(0);
    }
  });

  it("diz, em vez disso, que não há dado", () => {
    painelVazio();
    expect(screen.getAllByText("Sem dado").length).toBeGreaterThan(0);
  });

  it("não repete a comparação com o período anterior", () => {
    painelVazio();
    expect(screen.queryAllByText("vs. período anterior")).toHaveLength(0);
    expect(
      screen.getAllByText("Sem movimento no período").length,
    ).toBeGreaterThan(0);
  });
});
