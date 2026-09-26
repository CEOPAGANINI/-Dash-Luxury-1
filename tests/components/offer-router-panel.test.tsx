// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OfferRouterPanel } from "@/features/offer-router/offer-router-panel";

afterEach(cleanup);

describe("Roteador de ofertas (quadro com views)", () => {
  it("o menu do quadro tem as quatro views", () => {
    render(<OfferRouterPanel />);
    expect(screen.getByRole("button", { name: "Configurar" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Páginas com redirecionamento" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "De onde vêm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redirecionados" })).toBeTruthy();
  });

  it("abre na view Configurar e o simulador redireciona um visitante da Rússia", () => {
    render(<OfferRouterPanel />);
    expect(screen.getByText("Redirecionado")).toBeTruthy();
    expect(screen.getByText("→ /indisponivel")).toBeTruthy();
  });

  it("a view Páginas lista a Oferta principal e o Quiz, mas não a VIP", () => {
    render(<OfferRouterPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Páginas com redirecionamento" }),
    );
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/Oferta principal/);
    expect(texto).toMatch(/Quiz de entrada/);
    expect(texto).not.toMatch(/Página VIP/);
  });

  it("conecta com o funil: dá para escolher um destino do funil numa regra", () => {
    render(<OfferRouterPanel />);
    // A ponte com o funil aparece na view Configurar (uma por regra).
    expect(
      screen.getAllByText("ou escolha do funil:", { exact: false }).length,
    ).toBeGreaterThan(0);
    // Escolher "Oferta" (uma página do funil) preenche o destino da regra.
    const chip = screen.getAllByRole("button", { name: "Oferta" })[0];
    fireEvent.click(chip);
    expect(chip.getAttribute("data-on")).toBe("true");
  });

  it("conecta com o funil: dá para puxar uma origem do funil para a Fonte", () => {
    render(<OfferRouterPanel />);
    const btn = screen.getByRole("button", { name: "+ Captura" });
    fireEvent.click(btn);
    // Vira uma origem selecionável na Fonte (pílula com o nome da página).
    expect(screen.getAllByRole("button", { name: "Captura" }).length).toBeGreaterThan(0);
  });
});
