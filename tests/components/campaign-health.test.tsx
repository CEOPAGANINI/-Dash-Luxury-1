import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { BOLINHAS, Semaforo, TOLERANCIA_EMPATE, descricaoDaSaude, saudeDasMetricas, saudeDoConjunto } from "@/features/ads/campaign-health";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { TAXAS_KEY } from "@/features/ads/fees-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { AdMetrics, CampaignRow, CampaignTree } from "@/features/ads/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const m = (spend: number, revenue: number): AdMetrics => ({ spendCents: spend, revenueCents: revenue, impressions: 0, clicks: 0, purchases: 0 });
const base = demoCampaignRows().find((c) => c.network === "meta")!;
const linha = (id: string, spend: number, revenue: number): CampaignRow => ({ ...base, id, name: id, campaignClass: undefined, source: "manual", metrics: m(spend, revenue) });

describe("o semáforo de saúde da campanha", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("verde = lucro, laranja = empate (±5% do investimento), vermelha = prejuízo; sem investimento, nada", () => {
    expect(TOLERANCIA_EMPATE).toBe(0.05);
    expect(saudeDasMetricas(m(0, 0), 0)).toBe("sem");
    expect(saudeDasMetricas(m(0, 500_00), 0)).toBe("sem");
    expect(saudeDasMetricas(m(1000_00, 1300_00), 0)).toBe("lucro");
    // Lucro de +50 sobre 1.000 investidos: dentro da zona, empate. +51: lucro.
    expect(saudeDasMetricas(m(1000_00, 1050_00), 0)).toBe("empate");
    expect(saudeDasMetricas(m(1000_00, 1050_01), 0)).toBe("lucro");
    expect(saudeDasMetricas(m(1000_00, 950_00), 0)).toBe("empate");
    expect(saudeDasMetricas(m(1000_00, 949_99), 0)).toBe("prejuizo");
    expect(saudeDasMetricas(m(1000_00, 300_00), 0)).toBe("prejuizo");
    // O gateway entra na conta: 1.300 de retorno com 25% de taxa dá 975 − 1.000 = −25, empate.
    expect(saudeDasMetricas(m(1000_00, 1300_00), 25)).toBe("empate");
    expect(saudeDasMetricas(m(1000_00, 1300_00), 30)).toBe("prejuizo");
    // O bloco soma as campanhas antes de decidir.
    expect(saudeDoConjunto([m(100_00, 300_00), m(100_00, 20_00)], 0)).toBe("lucro");
    expect(saudeDoConjunto([m(100_00, 50_00), m(100_00, 60_00)], 0)).toBe("prejuizo");
    expect(descricaoDaSaude(m(1000_00, 1300_00), 0)).toMatch(/^Lucro · ROAS 1,30x · lucro R\$\s300/);
    expect(descricaoDaSaude(m(1000_00, 300_00), 0)).toMatch(/^Prejuízo · ROAS 0,30x · lucro −R\$\s700/);
    expect(descricaoDaSaude(m(0, 0), 0)).toBe("Sem investimento: semáforo apagado.");
  });

  it("três bolinhas na ordem vermelha, laranja, verde; só a da saúde acesa; apagadas sem investimento", () => {
    const { container, rerender } = render(<Semaforo saude="lucro" rotulo="Saúde de X" />);
    const semaforo = container.querySelector(".class-board-semaforo")!;
    expect(semaforo.getAttribute("role")).toBe("img");
    expect(semaforo.getAttribute("aria-label")).toBe("Saúde de X: lucro");
    expect([...semaforo.querySelectorAll("i")].map((i) => i.getAttribute("data-cor"))).toEqual([...BOLINHAS]);
    expect([...semaforo.querySelectorAll("i")].map((i) => i.getAttribute("data-acesa"))).toEqual(["false", "false", "true"]);
    rerender(<Semaforo saude="empate" rotulo="Saúde de X" />);
    expect([...container.querySelectorAll("i")].map((i) => i.getAttribute("data-acesa"))).toEqual(["false", "true", "false"]);
    rerender(<Semaforo saude="prejuizo" rotulo="Saúde de X" />);
    expect([...container.querySelectorAll("i")].map((i) => i.getAttribute("data-acesa"))).toEqual(["true", "false", "false"]);
    rerender(<Semaforo saude="sem" rotulo="Saúde de X" />);
    expect([...container.querySelectorAll("i")].map((i) => i.getAttribute("data-acesa"))).toEqual(["false", "false", "false"]);
    expect(container.querySelector(".class-board-semaforo")?.getAttribute("aria-label")).toBe("Saúde de X: sem investimento");
  });

  it("cada campanha do quadro tem o seu semáforo antes da seta, com o estado pelo lucro e a taxa do gateway guardada", () => {
    localStorage.setItem(TAXAS_KEY, JSON.stringify({ version: 1, gatewayPercentual: 25 }));
    const tree: CampaignTree = { modo: "banco", metaConectado: false, ultimaSync: null, campanhas: [linha("Boa", 1000_00, 2000_00), linha("Empate", 1000_00, 1300_00), linha("Ruim", 1000_00, 400_00), linha("Parada", 0, 0)] };
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const acesa = (nome: string) => {
      const cartao = screen.getByRole("article", { name: `Cartão ${nome}` });
      const semaforo = within(cartao).getByRole("img", { name: new RegExp(`^Saúde de ${nome}:`) });
      // Antes da seta que abre a campanha.
      expect(semaforo.nextElementSibling?.getAttribute("aria-label")).toBe(`Abrir campanha ${nome}`);
      expect(semaforo.querySelectorAll("i")).toHaveLength(3);
      return { cor: semaforo.querySelector('i[data-acesa="true"]')?.getAttribute("data-cor") ?? null, rotulo: semaforo.getAttribute("aria-label"), titulo: semaforo.getAttribute("title") };
    };
    expect(acesa("Boa")).toMatchObject({ cor: "verde", rotulo: "Saúde de Boa: lucro" });
    expect(acesa("Boa").titulo).toContain("gateway 25%");
    expect(acesa("Empate")).toMatchObject({ cor: "laranja", rotulo: "Saúde de Empate: empate" });
    expect(acesa("Ruim")).toMatchObject({ cor: "vermelha", rotulo: "Saúde de Ruim: prejuízo" });
    expect(acesa("Parada")).toMatchObject({ cor: null, rotulo: "Saúde de Parada: sem investimento" });
    // O bloco soma tudo: 3.700 de retorno − 25% − 3.000 = −225 (7,5% de 3.000): prejuízo.
    const bloco = screen.getByRole("region", { name: "Outras campanhas 1" });
    const numeros = within(bloco.querySelector("header")!).getByRole("button", { name: /^Números do bloco/ });
    expect(numeros.getAttribute("data-saude")).toBe("prejuizo");
    expect(numeros.querySelector('.class-board-semaforo > i[data-acesa="true"]')?.getAttribute("data-cor")).toBe("vermelha");
  });
});
