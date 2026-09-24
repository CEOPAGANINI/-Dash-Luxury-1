import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PainelDoBloco, campanhasDaPagina, valoresDasMetricas } from "@/features/ads/block-metrics-panel";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { ORDEM_METRICAS_KEY, ORDEM_PADRAO, completarOrdem, moverNaOrdem, restoreMetricsOrder } from "@/features/ads/metrics-order-store";
import type { CampaignRow } from "@/features/ads/types";

afterEach(cleanup);

const base = demoCampaignRows().find((c) => c.network === "meta")!;
function linha(id: string, spend: number, revenue: number): CampaignRow {
  return { ...base, id, name: id, metrics: { ...base.metrics, spendCents: spend, revenueCents: revenue } };
}
const cinco = [linha("a", 100_00, 300_00), linha("b", 100_00, 100_00), linha("c", 200_00, 800_00), linha("d", 50_00, 50_00), linha("e", 10_00, 90_00)];

function abrir(campanhas: CampaignRow[], porPagina?: number) {
  const ancora = document.createElement("header");
  document.body.appendChild(ancora);
  const onClose = vi.fn();
  render(<PainelDoBloco ancora={ancora} rotulo="Escala" campanhas={campanhas} amostras={[]} porPagina={porPagina} onClose={onClose} />);
  return screen.getByRole("dialog", { name: "Números do bloco Escala" });
}
const chaves = (painel: HTMLElement) => [...painel.querySelectorAll("dl > div")].map((d) => d.getAttribute("data-metrica"));
const valor = (painel: HTMLElement, id: string) => painel.querySelector(`dl > div[data-metrica="${id}"] dd`)!.textContent;

describe("o painel do bloco: gráfico primeiro, filtro por página e métricas arrastáveis", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => {
    // Desmonta o painel antes de tirar a âncora do corpo da página.
    cleanup();
    document.querySelectorAll("body > header").forEach((h) => h.remove());
    vi.unstubAllGlobals();
  });

  it("o gráfico vem antes das métricas; são doze, com o lucro (retorno − gateway − tráfego)", () => {
    const painel = abrir(cinco);
    const figura = painel.querySelector("figure")!;
    const grade = painel.querySelector("dl")!;
    expect(figura.compareDocumentPosition(grade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chaves(painel)).toEqual([...ORDEM_PADRAO]);
    expect(chaves(painel)).toHaveLength(12);
    expect(valor(painel, "investimento")).toMatch(/^R\$\s460$/);
    expect(valor(painel, "receita")).toMatch(/^R\$\s1\.340$/);
    // Lucro sem taxa de gateway: 1.340 − 460 = 880, em verde.
    expect(valor(painel, "lucro")).toMatch(/^R\$\s880$/);
    expect(painel.querySelector('dl > div[data-metrica="lucro"] dd')?.getAttribute("data-lucro")).toBe("positivo");
    expect(valoresDasMetricas([linha("x", 900_00, 300_00)], 10).lucro).toMatch(/^−R\$\s630$/);
  });

  it("o filtro por página soma só as campanhas daquela página do bloco (a mesma paginação das faixas)", () => {
    const painel = abrir(cinco, 2);
    const paginas = within(painel).getByRole("group", { name: "Página do bloco" });
    expect(within(paginas).getAllByRole("button").map((b) => b.textContent)).toEqual(["Todas", "1", "2", "3"]);
    expect(within(paginas).getByRole("button", { name: "Todas" }).getAttribute("aria-pressed")).toBe("true");
    expect(painel.querySelector(".class-board-bloco-numeros-titulo")?.textContent).toContain("5 campanhas somadas");

    fireEvent.click(within(paginas).getByRole("button", { name: "Página 1" }));
    expect(painel.querySelector(".class-board-bloco-numeros-titulo")?.textContent).toContain("2 campanhas somadas · página 1");
    expect(valor(painel, "investimento")).toMatch(/^R\$\s200$/);
    expect(valor(painel, "receita")).toMatch(/^R\$\s400$/);
    fireEvent.click(within(paginas).getByRole("button", { name: "Página 3" }));
    expect(painel.querySelector(".class-board-bloco-numeros-titulo")?.textContent).toContain("1 campanha somada · página 3");
    expect(valor(painel, "investimento")).toMatch(/^R\$\s10,00$/);
    expect(campanhasDaPagina(cinco, 2, 2).map((c) => c.id)).toEqual(["c", "d"]);
    expect(campanhasDaPagina(cinco, undefined, 2)).toBe(cinco);
    // Com uma página só, não há filtro.
    cleanup();
    const outro = abrir(cinco.slice(0, 2), 4);
    expect(within(outro).queryByRole("group", { name: "Página do bloco" })).toBeNull();
  });

  it("arrastar um quadradinho para cima de outro troca a ordem ao vivo e guarda no navegador; as setas também", async () => {
    const painel = abrir(cinco);
    const tile = (id: string) => painel.querySelector<HTMLElement>(`dl > div[data-metrica="${id}"]`)!;
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(tile("receita"), { dataTransfer });
    expect(tile("receita").getAttribute("data-arrastando")).toBe("true");
    // Pousa sobre "cpm" (o último): indo para a frente, entra depois dele.
    fireEvent.dragOver(tile("cpm"), { dataTransfer });
    expect(chaves(painel)[1]).toBe("receita");
    await new Promise((r) => setTimeout(r, 140));
    fireEvent.dragOver(tile("cpm"), { dataTransfer });
    expect(chaves(painel).at(-1)).toBe("receita");
    expect(localStorage.getItem(ORDEM_METRICAS_KEY)).toBeNull();
    fireEvent.drop(tile("cpm"), { dataTransfer });
    fireEvent.dragEnd(tile("receita"), { dataTransfer });
    expect(chaves(painel).at(-1)).toBe("receita");
    expect(restoreMetricsOrder(localStorage.getItem(ORDEM_METRICAS_KEY)!)!.at(-1)).toBe("receita");

    // Soltar rápido, sem pousar, também troca.
    fireEvent.dragStart(tile("cpm"), { dataTransfer });
    fireEvent.drop(tile("investimento"), { dataTransfer });
    fireEvent.dragEnd(tile("cpm"), { dataTransfer });
    expect(chaves(painel)[0]).toBe("cpm");

    // Setas pelo teclado.
    fireEvent.keyDown(tile("cpm"), { key: "ArrowRight" });
    expect(chaves(painel).slice(0, 2)).toEqual(["investimento", "cpm"]);
    expect(restoreMetricsOrder(localStorage.getItem(ORDEM_METRICAS_KEY)!)!.slice(0, 2)).toEqual(["investimento", "cpm"]);
  });

  it("a ordem guardada é completada e limpa; mover na ordem segue a regra dos blocos", () => {
    expect(completarOrdem(["cpm", "banana", "cpm", "roas"])).toEqual(["cpm", "roas", ...ORDEM_PADRAO.filter((m) => m !== "cpm" && m !== "roas")]);
    expect(restoreMetricsOrder("{")).toBeNull();
    expect(moverNaOrdem(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moverNaOrdem(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moverNaOrdem(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});
