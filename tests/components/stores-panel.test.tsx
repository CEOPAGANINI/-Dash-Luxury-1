import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StoresPanel } from "@/features/stores/stores-panel";
import type { PanoramaDasLojas } from "@/features/stores/queries";

afterEach(cleanup);

const panorama: PanoramaDasLojas = {
  bancoConfigurado: true,
  dias: 30,
  lojas: [
    {
      id: "l1",
      nome: "Dash Store",
      slug: "dash-store",
      ativa: true,
      moeda: "BRL",
      ofertas: [
        {
          id: "p1",
          nome: "Sérum Anti-Idade",
          slug: "serum-anti-idade",
          precoCents: 197_00,
          ativa: true,
          visitas: 420,
          pedidos: 12,
          receitaCents: 2_364_00,
          campanhas: [
            { id: "c1", nome: "Escala — Serum Anti Idade", rede: "meta", status: "active", spendCents: 800_00, revenueCents: 2_400_00 },
            { id: "c2", nome: "Pausada — Serum", rede: "meta", status: "paused", spendCents: 900_00, revenueCents: 0 },
          ],
        },
        {
          id: "p2",
          nome: "Kit Shampoo",
          slug: "kit-shampoo",
          precoCents: 97_00,
          ativa: true,
          visitas: 30,
          pedidos: 0,
          receitaCents: 0,
          campanhas: [],
        },
        {
          id: "p3",
          nome: "Creme Parado",
          slug: "creme-parado",
          precoCents: 57_00,
          ativa: true,
          visitas: 0,
          pedidos: 0,
          receitaCents: 0,
          campanhas: [],
        },
      ],
    },
  ],
};

describe("a página das lojas conectadas", () => {
  it("sem banco, diz que não há o que mostrar em vez de inventar", () => {
    render(<StoresPanel panorama={{ bancoConfigurado: false, lojas: [], dias: 30 }} />);
    expect(screen.getByText(/Sem banco ligado/)).toBeTruthy();
  });

  it("lista as ofertas que recebem tráfego, com o sinal que acendeu e os números da campanha", () => {
    render(<StoresPanel panorama={panorama} />);
    const loja = screen.getByRole("region", { name: "Loja Dash Store" });
    expect(loja.textContent).toContain("2 de 3 ofertas ativas a receber tráfego");

    const comTrafego = [...loja.querySelectorAll(".dash-ofertas .dash-oferta")];
    // A que gasta vem primeiro; a que só tem visitas depois; a parada fica fora.
    expect(comTrafego.map((o) => o.querySelector("b")?.textContent)).toEqual(["Sérum Anti-Idade", "Kit Shampoo"]);
    expect(comTrafego[0].getAttribute("data-sinal")).toBe("campanha");
    expect(comTrafego[1].getAttribute("data-sinal")).toBe("visitas");

    // Só a campanha acesa entra na conta: R$ 800 investidos, R$ 2.400 de retorno, 3,00x.
    const numeros = Object.fromEntries(
      [...comTrafego[0].querySelectorAll(".dash-oferta-numeros > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]),
    );
    expect(numeros.ROAS).toBe("3,00x");
    expect(numeros.Visitas).toBe("420");
    expect(numeros.Pedidos).toBe("12");
    // A campanha pausada não aparece na lista de campanhas da oferta.
    const campanhas = within(comTrafego[0] as HTMLElement).getByRole("list", { name: "Campanhas de Sérum Anti-Idade" });
    expect(campanhas.querySelectorAll("li")).toHaveLength(1);
    expect(campanhas.textContent).toContain("Escala — Serum Anti Idade");
  });

  it("as ofertas paradas ficam guardadas atrás de um botão", () => {
    render(<StoresPanel panorama={panorama} />);
    expect(screen.queryByText("Creme Parado")).toBeNull();
    const botao = screen.getByRole("button", { name: /1 oferta parada/ });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botao);
    expect(screen.getByText("Creme Parado")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Esconder/ }).getAttribute("aria-expanded")).toBe("true");
  });
});
