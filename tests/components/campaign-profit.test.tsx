import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { TAXAS_KEY, lucroDaCampanha, normalizarGateway, restoreTaxas } from "@/features/ads/fees-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { formatCurrency } from "@/features/unified-dashboard/formatters";
import type { CampaignTree } from "@/features/ads/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };
const campanha = tree.campanhas.find((c) => c.network === "meta" && c.metrics.spendCents > 0)!;
const reais = (cents: number) => formatCurrency(cents / 100, Math.abs(cents) < 10_000 ? 2 : 0);

describe("o lucro da campanha no card dos números", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lucro = retorno − taxa do gateway sobre o retorno − tráfego; a taxa fica entre 0 e 100 com duas casas", () => {
    const m = { spendCents: 850_00, revenueCents: 1_530_00, impressions: 0, clicks: 0, purchases: 0 };
    expect(lucroDaCampanha(m, 0)).toEqual({ retornoCents: 1_530_00, gatewayCents: 0, trafegoCents: 850_00, lucroCents: 680_00 });
    expect(lucroDaCampanha(m, 4.99)).toEqual({ retornoCents: 1_530_00, gatewayCents: 7_635, trafegoCents: 850_00, lucroCents: 1_530_00 - 7_635 - 850_00 });
    expect(lucroDaCampanha({ ...m, revenueCents: 500_00 }, 10).lucroCents).toBe(500_00 - 50_00 - 850_00);
    expect(normalizarGateway(4.999)).toBe(5);
    expect(normalizarGateway(-3)).toBe(0);
    expect(normalizarGateway(250)).toBe(100);
    expect(normalizarGateway(Number.NaN)).toBe(0);
    expect(restoreTaxas(JSON.stringify({ version: 1, gatewayPercentual: 4.99 }))).toEqual({ version: 1, gatewayPercentual: 4.99 });
    expect(restoreTaxas(JSON.stringify({ version: 1, gatewayPercentual: 120 }))).toBeNull();
    expect(restoreTaxas("{")).toBeNull();
  });

  it("o card mostra o lucro em destaque, investimento total, retorno total, ROAS, CPA, CPM e CTR, com a conta escrita e a taxa do gateway editável", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: `Detalhes de ${campanha.name}` }));
    const card = screen.getByRole("dialog", { name: /^Detalhes da campanha/ });
    const pares = Object.fromEntries([...card.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(Object.keys(pares)).toEqual(["Lucro", "Investimento total", "Retorno total", "ROAS", "CPA", "CPM", "CTR"]);
    expect(pares.CTR).toMatch(/%$/);
    expect(pares.CPM).toMatch(/^R\$/);
    // Sem taxa definida, o lucro é o retorno menos o tráfego.
    const semTaxa = lucroDaCampanha(campanha.metrics, 0);
    expect(pares.Lucro).toBe(reais(semTaxa.lucroCents));
    expect(card.querySelector('[data-lucro="positivo"], [data-lucro="negativo"], [data-lucro="zero"]')).toBeTruthy();
    const conta = within(card).getByLabelText("Conta do lucro");
    expect(conta.textContent).toContain("gateway 0%");
    expect(conta.textContent).toContain("tráfego");

    // Definir a taxa do gateway recalcula na hora e guarda no navegador.
    const taxa = within(card).getByLabelText("Taxa do gateway em porcentagem") as HTMLInputElement;
    fireEvent.change(taxa, { target: { value: "4.99" } });
    const comTaxa = lucroDaCampanha(campanha.metrics, 4.99);
    const paresDepois = Object.fromEntries([...card.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(paresDepois.Lucro).toBe(comTaxa.lucroCents < 0 ? `−${reais(-comTaxa.lucroCents)}` : reais(comTaxa.lucroCents));
    expect(within(card).getByLabelText("Conta do lucro").textContent).toContain(`gateway 4,99% (${reais(comTaxa.gatewayCents)})`);
    expect(restoreTaxas(localStorage.getItem(TAXAS_KEY)!)).toEqual({ version: 1, gatewayPercentual: 4.99 });
    // O card continua sem botões, nome ou estado.
    expect(within(card).queryByRole("button")).toBeNull();
    expect(card.textContent).not.toContain(campanha.name);
  });

  it("um retorno menor que o tráfego dá lucro negativo, marcado em vermelho", () => {
    const fraca = { ...campanha, id: "x-fraca", name: "Fraca", campaignClass: undefined, source: "manual" as const, metrics: { ...campanha.metrics, spendCents: 900_00, revenueCents: 300_00 } };
    render(<ClassBoard tree={{ ...tree, modo: "banco", campanhas: [fraca] }} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Detalhes de Fraca" }));
    const card = screen.getByRole("dialog", { name: /^Detalhes da campanha/ });
    const lucro = card.querySelector('[data-lucro="negativo"]')!;
    expect(lucro.querySelector("dd")!.textContent).toBe(`−${reais(600_00)}`);
  });
});
