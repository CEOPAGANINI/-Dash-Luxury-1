import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import {
  AMOSTRAS_POR_CAMPANHA,
  CAMPANHAS_ROAS_KEY,
  INTERVALO_MINUTO_MS,
  chaveDaCampanhaNoHistorico,
  minutoDe,
  registrarAmostraPorMinuto,
  restoreCampaignRoasHistory,
} from "@/features/ads/campaign-roas-history-store";
import { JANELAS_MINUTO, leiturasDaJanela } from "@/features/ads/block-metrics-panel";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { derivadas, type CampaignRow, type CampaignTree } from "@/features/ads/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const base = demoCampaignRows().find((c) => c.network === "meta")!;
const linha = (id: string, spend: number, revenue: number): CampaignRow => ({ ...base, id, name: id, campaignClass: undefined, source: "manual", metrics: { ...base.metrics, spendCents: spend, revenueCents: revenue } });

describe("o gráfico do ROAS por minuto no card do megafone", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("guarda uma leitura por minuto: no mesmo minuto substitui, no minuto novo acrescenta, e nunca passa do limite", () => {
    expect(INTERVALO_MINUTO_MS).toBe(60_000);
    const t0 = 1_700_000_000_000 - (1_700_000_000_000 % INTERVALO_MINUTO_MS);
    let lista = registrarAmostraPorMinuto([], 1.2, t0);
    expect(lista).toEqual([{ t: t0, roas: 1.2 }]);
    lista = registrarAmostraPorMinuto(lista, 1.4, t0 + 20_000);
    expect(lista).toEqual([{ t: t0 + 20_000, roas: 1.4 }]);
    lista = registrarAmostraPorMinuto(lista, 2.1, t0 + INTERVALO_MINUTO_MS);
    expect(lista).toHaveLength(2);
    expect(minutoDe(t0 + INTERVALO_MINUTO_MS - 1)).toBe(minutoDe(t0));
    for (let i = 0; i < AMOSTRAS_POR_CAMPANHA + 10; i++) lista = registrarAmostraPorMinuto(lista, i, (i + 5) * INTERVALO_MINUTO_MS);
    expect(lista).toHaveLength(AMOSTRAS_POR_CAMPANHA);
    // O que está guardado vem em ordem e sem repetir minuto; lixo é ignorado.
    const guardado = restoreCampaignRoasHistory(JSON.stringify({ version: 1, campanhas: { "meta:abc": [{ t: 2 * INTERVALO_MINUTO_MS, roas: 2 }, { t: 0, roas: 1 }, { t: 30_000, roas: 9 }] } }))!;
    expect(guardado["meta:abc"].map((a) => a.roas)).toEqual([9, 2]);
    expect(restoreCampaignRoasHistory("{")).toBeNull();
    expect(restoreCampaignRoasHistory(JSON.stringify({ version: 1, campanhas: { x: [{ t: -1, roas: 1 }] } }))).toBeNull();
    expect(chaveDaCampanhaNoHistorico("meta", "abc")).toBe("meta:abc");
    // As janelas do card são curtas (o passo é de um minuto).
    expect(JANELAS_MINUTO.map((j) => j.id)).toEqual(["15m", "1h", "3h", "6h"]);
    const amostras = [{ t: 0, roas: 1 }, { t: 10 * 60_000, roas: 2 }, { t: 20 * 60_000, roas: 3 }];
    expect(leiturasDaJanela(amostras, "15m", JANELAS_MINUTO)).toHaveLength(2);
    expect(leiturasDaJanela(amostras, "6h", JANELAS_MINUTO)).toHaveLength(3);
  });

  it("o quadro grava o ROAS de cada campanha e o card do megafone mostra o gráfico antes das métricas", () => {
    const campanhas = [linha("boa", 1000_00, 2500_00), linha("fraca", 1000_00, 400_00)];
    const tree: CampaignTree = { modo: "banco", metaConectado: false, ultimaSync: null, campanhas };
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);

    // Uma leitura por campanha, com o ROAS derivado das métricas.
    const guardado = restoreCampaignRoasHistory(localStorage.getItem(CAMPANHAS_ROAS_KEY)!)!;
    expect(Object.keys(guardado).sort()).toEqual(["meta:boa", "meta:fraca"]);
    expect(guardado["meta:boa"][0].roas).toBeCloseTo(derivadas(campanhas[0].metrics).roas!, 6);

    fireEvent.click(screen.getByRole("button", { name: "Detalhes de boa" }));
    const card = screen.getByRole("dialog", { name: /^Detalhes da campanha/ });
    const figura = within(card).getByRole("figure", { name: /^ROAS de boa a cada 1 minuto$/ });
    const grade = card.querySelector("dl")!;
    expect(figura.compareDocumentPosition(grade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Os períodos do card são os de minuto, e o mais longo vem escolhido.
    const periodos = within(figura).getByRole("group", { name: "Período do gráfico" });
    expect(within(periodos).getAllByRole("button").map((b) => b.textContent)).toEqual(["15m", "1h", "3h", "6h"]);
    expect(within(periodos).getByRole("button", { name: "6h" }).getAttribute("aria-pressed")).toBe("true");
    // Com uma leitura só o gráfico existe, mas ainda sem linha.
    expect(figura.querySelector("svg")?.getAttribute("data-pontos")).toBe("1");

    // Mais leituras (minutos seguintes) desenham a linha.
    const agora = Date.now();
    act(() => {
      localStorage.setItem(CAMPANHAS_ROAS_KEY, JSON.stringify({ version: 1, campanhas: { "meta:boa": [1.1, 1.6, 2.4].map((roas, i) => ({ t: agora - (2 - i) * INTERVALO_MINUTO_MS, roas })) } }));
      window.dispatchEvent(new StorageEvent("storage", { key: CAMPANHAS_ROAS_KEY }));
    });
    const svg = screen.getByRole("dialog", { name: /^Detalhes da campanha/ }).querySelector("svg")!;
    expect(svg.getAttribute("data-pontos")).toBe("3");
    expect(svg.querySelector("path.class-board-grafico-linha")).toBeTruthy();
  });
});
