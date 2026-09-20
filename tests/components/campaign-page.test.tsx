import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CampaignDrilldown } from "@/features/ads/campaign-drilldown";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";

afterEach(cleanup);

const campanha = demoCampaignRows().find((c) => c.adSets.length > 1 && c.adSets[0].ads.length > 1)!;
const total = campanha.adSets.reduce((s, x) => s + x.ads.length, 0);
const linhas = (faixa: HTMLElement, tipo: string) => faixa.querySelectorAll(`[data-tipo="${tipo}"]`);
const celulas = (linha: Element) => linha.querySelectorAll(".campaign-drill-celula");

describe("as três faixas da campanha, cada uma abrindo dentro de si mesma", () => {
  it("faixa 1: abrir conjuntos mostra os conjuntos dentro da faixa da campanha", () => {
    render(<CampaignDrilldown campanha={campanha} />);
    const faixa = screen.getByRole("region", { name: "Campanha" });
    expect(linhas(faixa, "campanha")).toHaveLength(1);
    expect(linhas(faixa, "conjunto")).toHaveLength(0);

    fireEvent.click(within(faixa).getByRole("button", { name: `Abrir conjuntos de ${campanha.name}` }));
    expect(linhas(faixa, "conjunto")).toHaveLength(campanha.adSets.length);
    for (const s of campanha.adSets) expect(within(faixa).getByText(s.name)).toBeTruthy();

    fireEvent.click(within(faixa).getByRole("button", { name: `Fechar conjuntos de ${campanha.name}` }));
    expect(linhas(faixa, "conjunto")).toHaveLength(0);
  });

  it("faixa 2: abrir um conjunto mostra os anúncios dele logo abaixo, na mesma faixa", () => {
    render(<CampaignDrilldown campanha={campanha} />);
    const faixa = screen.getByRole("region", { name: "Conjuntos de anúncios" });
    const conjunto = campanha.adSets[0];
    expect(linhas(faixa, "conjunto")).toHaveLength(campanha.adSets.length);
    expect(linhas(faixa, "anuncio")).toHaveLength(0);

    const botao = within(faixa).getByRole("button", { name: `Abrir conjunto ${conjunto.name}` });
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    // Só os anúncios deste conjunto abrem; os do outro seguem fechados.
    expect(linhas(faixa, "anuncio")).toHaveLength(conjunto.ads.length);
    for (const a of conjunto.ads) expect(within(faixa).getByText(a.name)).toBeTruthy();

    fireEvent.click(within(faixa).getByRole("button", { name: `Fechar conjunto ${conjunto.name}` }));
    expect(linhas(faixa, "anuncio")).toHaveLength(0);
  });

  it("faixa 3: todos os anúncios agrupados por conjunto, com o criativo", () => {
    render(<CampaignDrilldown campanha={campanha} />);
    const faixa = screen.getByRole("region", { name: "Anúncios" });
    expect(linhas(faixa, "grupo")).toHaveLength(campanha.adSets.length);
    expect(linhas(faixa, "anuncio")).toHaveLength(total);
    for (const s of campanha.adSets) {
      expect(within(faixa).getByRole("heading", { level: 4, name: new RegExp(s.name) })).toBeTruthy();
    }
    const comCriativo = campanha.adSets.flatMap((s) => s.ads).find((a) => a.creative.title)!;
    expect(within(faixa).getAllByText(comCriativo.creative.title!).length).toBeGreaterThan(0);
  });

  it("cada linha tem as métricas em quadrados com rótulo e valor", () => {
    render(<CampaignDrilldown campanha={campanha} />);
    const faixa = screen.getByRole("region", { name: "Campanha" });
    const linha = linhas(faixa, "campanha")[0];
    // Estado + orçamento + 10 métricas = 12, para as linhas fecharem sempre
    expect(celulas(linha)).toHaveLength(12);
    const rotulos = [...celulas(linha)].map((c) => c.querySelector("span")!.textContent);
    expect(rotulos).toEqual(["Estado", "Orç./dia", "Gasto", "Impressões", "Cliques", "CTR", "CPC", "Compras", "CPA", "Receita", "ROAS", "Conversão"]);
  });
});
