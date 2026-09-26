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
});
