// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OfferRouterPanel } from "@/features/offer-router/offer-router-panel";

afterEach(cleanup);

describe("Roteador de ofertas (demonstração)", () => {
  it("mostra as quatro partes", () => {
    render(<OfferRouterPanel />);
    expect(screen.getByText("Configurar oferta")).toBeTruthy();
    expect(screen.getByText("Páginas com redirecionamento")).toBeTruthy();
    expect(screen.getByText(/De onde vêm/)).toBeTruthy();
    expect(screen.getByText(/Redirecionados — região/)).toBeTruthy();
  });

  it("o simulador redireciona um visitante da Rússia", () => {
    render(<OfferRouterPanel />);
    // Abre com Rússia/celular; a regra de região manda para /indisponivel.
    expect(screen.getByText("Redirecionado")).toBeTruthy();
    expect(screen.getByText("→ /indisponivel")).toBeTruthy();
  });

  it("lista a Oferta principal e o Quiz, mas não a VIP, entre as com redirecionamento", () => {
    render(<OfferRouterPanel />);
    const bloco = screen.getByText("Páginas com redirecionamento").closest("section") as HTMLElement;
    expect(bloco.textContent).toMatch(/Oferta principal/);
    expect(bloco.textContent).toMatch(/Quiz de entrada/);
    expect(bloco.textContent).not.toMatch(/Página VIP/);
  });
});
