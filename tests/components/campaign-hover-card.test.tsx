import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };
const campanha = tree.campanhas.find((c) => c.network === "meta")!;

const megafone = (nome: string) => screen.getByRole("button", { name: `Detalhes de ${nome}` });
const card = () => screen.queryByRole("dialog", { name: /^Detalhes da campanha/ });

describe("card dos números da campanha no quadro por classe", () => {
  beforeEach(() => {
    // jsdom não tem ResizeObserver; o card só mede posição.
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("abre só ao clicar no megafone — passar o mouse no cartão não abre", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    fireEvent.mouseEnter(cartao);
    fireEvent.focus(cartao);
    expect(card()).toBeNull();

    fireEvent.click(megafone(campanha.name));
    const aberto = card()!;
    expect(aberto.getAttribute("aria-label")).toBe(`Detalhes da campanha: ${campanha.name}`);
    expect(megafone(campanha.name).getAttribute("aria-expanded")).toBe("true");
    // Gráfico e números: sem nome, sem estado, sem veredito, sem título,
    // sem fechar. O nome só existe nos rótulos de leitor de tela do
    // gráfico, e os únicos botões são os períodos dele.
    expect(aberto.textContent).toContain("Retorno total");
    expect(aberto.textContent).toContain("Lucro");
    expect(aberto.textContent).toContain("ROAS");
    const visivel = [...aberto.querySelectorAll("*")].filter((el) => !el.closest(".sr-only") && el.children.length === 0).map((el) => el.textContent).join(" ");
    expect(visivel).not.toContain(campanha.name);
    expect(visivel).not.toMatch(/Ativa|Pausada|Desativada|escalar|conjunto/i);
    expect(within(aberto).getAllByRole("button").map((b) => b.textContent)).toEqual(["15m", "1h", "3h", "6h"]);
    expect(within(aberto).queryByRole("heading")).toBeNull();
    // Fica fora do quadro (portal no body), nunca dentro da coluna.
    expect(aberto.closest("section[aria-label]")).toBeNull();
    expect(aberto.parentElement).toBe(document.body);

    // Sair com o mouse não fecha; clicar de novo no megafone fecha.
    fireEvent.mouseLeave(cartao);
    expect(card()).not.toBeNull();
    fireEvent.click(megafone(campanha.name));
    expect(card()).toBeNull();
  });

  it("fecha com Esc (devolvendo o foco ao megafone) e ao clicar fora", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(megafone(campanha.name));
    expect(card()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(megafone(campanha.name));

    fireEvent.click(megafone(campanha.name));
    expect(card()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(card()).toBeNull();
  });

  it("só existe um card por vez: abrir outro fecha o primeiro", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const [a, b] = tree.campanhas.filter((c) => c.network === "meta");
    fireEvent.click(megafone(a.name));
    fireEvent.click(megafone(b.name));
    const cards = screen.getAllByRole("dialog", { name: /^Detalhes da campanha/ });
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("aria-label")).toBe(`Detalhes da campanha: ${b.name}`);
  });
});
