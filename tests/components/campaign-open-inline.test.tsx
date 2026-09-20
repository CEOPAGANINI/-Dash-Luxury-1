import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { CAMPANHAS_ROAS_KEY, INTERVALO_MINUTO_MS } from "@/features/ads/campaign-roas-history-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { TAXAS_KEY } from "@/features/ads/fees-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { formatCurrency } from "@/features/unified-dashboard/formatters";
import type { CampaignRow, CampaignTree } from "@/features/ads/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const base = demoCampaignRows().find((c) => c.network === "meta")!;
const linha = (id: string, spend: number, revenue: number): CampaignRow => ({
  ...base,
  id,
  name: id,
  campaignClass: undefined,
  source: "manual",
  objective: "Vendas",
  status: "active",
  dailyBudgetCents: 200_00,
  syncedAt: "2026-09-20T12:00:00.000Z",
  metrics: { spendCents: spend, revenueCents: revenue, impressions: 100_000, clicks: 2_500, purchases: 50 },
});

const tree: CampaignTree = { modo: "banco", metaConectado: false, ultimaSync: null, campanhas: [linha("Alfa", 1000_00, 2500_00), linha("Beta", 500_00, 200_00)] };

describe("a seta abre os dados da campanha embaixo da faixa, dentro do bloco", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("clicar na seta mostra o gráfico e todos os números da campanha; clicar de novo fecha e devolve a lista", () => {
    localStorage.setItem(TAXAS_KEY, JSON.stringify({ version: 1, gatewayPercentual: 10 }));
    const agora = Date.now();
    localStorage.setItem(CAMPANHAS_ROAS_KEY, JSON.stringify({ version: 1, campanhas: { "meta:Alfa": [1.8, 2.2, 2.5].map((roas, i) => ({ t: agora - (2 - i) * INTERVALO_MINUTO_MS, roas })) } }));
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const bloco = screen.getByRole("region", { name: "Outras campanhas 1" });
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);

    const seta = within(bloco).getByRole("button", { name: "Abrir campanha Alfa" });
    fireEvent.click(seta);

    // Só a campanha aberta fica no bloco, e os dados vêm depois da faixa dela.
    expect(within(bloco).getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(["Cartão Alfa"]);
    const dados = within(bloco).getByRole("group", { name: "Dados de Alfa" });
    const faixa = bloco.querySelector(".class-board-cartao-linha")!;
    expect(faixa.compareDocumentPosition(dados) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(bloco).getByRole("button", { name: "Fechar campanha Alfa" }).getAttribute("aria-expanded")).toBe("true");

    // O gráfico por minuto e o lucro com a taxa do gateway.
    expect(within(dados).getByRole("figure", { name: "ROAS de Alfa a cada 1 minuto" }).querySelector("svg")?.getAttribute("data-pontos")).toBe("3");
    // 2.500 − 10% (250) − 1.000 = 1.250.
    expect(dados.querySelector(".class-board-dados-lucro > b")?.textContent).toBe(formatCurrency(1250, 0));
    expect(dados.querySelector(".class-board-dados-lucro")?.getAttribute("data-lucro")).toBe("positivo");

    // Todos os números e as fichas da campanha.
    const pares = Object.fromEntries([...dados.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(Object.keys(pares)).toEqual([
      "Investimento", "Retorno", "ROAS", "Margem", "Compras", "CPA", "Impressões", "Cliques", "CTR", "CPC", "CPM", "Orçamento diário",
      "Estado", "Rede", "Objetivo", "Conjuntos", "Origem", "Sincronizada",
    ]);
    expect(pares.ROAS).toBe("2,50x");
    expect(pares.Compras).toBe("50");
    expect(pares.CTR).toBe("2,50%");
    expect(pares.Estado).toBe("Ativa");
    expect(pares.Rede).toBe("Meta Ads");
    expect(pares.Objetivo).toBe("Vendas");
    // O atalho para a página inteira continua ali.
    expect(within(dados).getByRole("link", { name: "Abrir a página da campanha" }).getAttribute("href")).toBe("/campanhas/campanha/Alfa?modo=real");

    // Fechar devolve as duas campanhas.
    fireEvent.click(within(bloco).getByRole("button", { name: "Fechar campanha Alfa" }));
    expect(within(bloco).queryByRole("group", { name: "Dados de Alfa" })).toBeNull();
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);
  });

  it("abrir uma campanha de outro bloco fecha a anterior: uma de cada vez no quadro", () => {
    // Alfa no bloco Escala, Beta no bloco das outras: blocos diferentes.
    const emBlocos: CampaignTree = { ...tree, campanhas: [{ ...tree.campanhas[0], campaignClass: "scale" }, tree.campanhas[1]] };
    render(<ClassBoard tree={emBlocos} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    expect(screen.getByRole("group", { name: "Dados de Alfa" })).toBeTruthy();
    // A outra campanha continua visível no bloco dela.
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Beta" }));
    expect(screen.queryByRole("group", { name: "Dados de Alfa" })).toBeNull();
    const dados = screen.getByRole("group", { name: "Dados de Beta" });
    // Beta perde dinheiro: o lucro fica negativo e em vermelho.
    expect(dados.querySelector(".class-board-dados-lucro")?.getAttribute("data-lucro")).toBe("negativo");
    expect(dados.querySelector(".class-board-dados-lucro > b")?.textContent).toMatch(/^−R\$\s/);
  });
});
