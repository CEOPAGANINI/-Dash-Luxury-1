// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AccessFilterPanel } from "@/features/access-filter/access-filter-panel";

afterEach(cleanup);

describe("Filtro de acesso (demonstração)", () => {
  it("abre com o visitante da Rússia barrado e libera ao trocar para o Brasil no celular", () => {
    render(<AccessFilterPanel />);
    // Regra de exemplo: só Brasil, só celular. Visitante inicial: Rússia/desktop.
    expect(screen.getByRole("status").textContent).toMatch(/Não vê/);

    fireEvent.change(screen.getByLabelText("País do visitante"), {
      target: { value: "BR" },
    });
    fireEvent.change(screen.getByLabelText("Aparelho do visitante"), {
      target: { value: "mobile" },
    });
    expect(screen.getByRole("status").textContent).toMatch(/Vê a página/);
  });

  it("deixa claro que a regra vale igual para o revisor de anúncio", () => {
    render(<AccessFilterPanel />);
    expect(screen.getAllByText(/revisor de anúncio/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/só a interface/i)).toBeTruthy();
  });
});
