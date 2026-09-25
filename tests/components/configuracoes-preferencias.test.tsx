// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "preto", setTheme }),
}));

import {
  CartaoDaTaxa,
  CartaoDosDadosLocais,
  CartaoDoTema,
} from "@/features/settings/preferencias";
import { COFRES_LOCAIS } from "@/features/settings/servicos";

/*
  Os três cartões de preferências das Configurações: o tema troca pelo
  next-themes, a taxa persiste no mesmo cofre das campanhas e a limpeza
  só apaga depois da confirmação — e apaga só os cofres do painel.
*/

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  setTheme.mockClear();
});

describe("preferências das Configurações", () => {
  it("o tema é um switch e troca para o branco", () => {
    render(<CartaoDoTema />);
    const botao = screen.getByRole("switch");
    fireEvent.click(botao);
    expect(setTheme).toHaveBeenCalledWith("branco");
  });

  it("a taxa persiste no cofre das campanhas ao confirmar", () => {
    render(<CartaoDaTaxa />);
    const campo = screen.getByLabelText(/Porcentagem sobre o retorno/);
    fireEvent.change(campo, { target: { value: "4,99" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(JSON.parse(localStorage.getItem("dash-luxury:taxas:v1")!)).toEqual({
      version: 1,
      gatewayPercentual: 4.99,
    });
  });

  it("limpar pede confirmação e apaga só os cofres do painel", () => {
    localStorage.setItem(COFRES_LOCAIS[0].chave, "{}");
    localStorage.setItem(COFRES_LOCAIS[1].chave, "{}");
    localStorage.setItem("de-outro-site", "fica");
    render(<CartaoDosDadosLocais />);
    expect(screen.getByText(/2 de \d+ cofres em uso/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Limpar arrumações" }));
    // Ainda nada foi apagado: apareceu a confirmação.
    expect(localStorage.getItem(COFRES_LOCAIS[0].chave)).toBe("{}");

    fireEvent.click(screen.getByRole("button", { name: "Apagar mesmo" }));
    expect(localStorage.getItem(COFRES_LOCAIS[0].chave)).toBeNull();
    expect(localStorage.getItem(COFRES_LOCAIS[1].chave)).toBeNull();
    expect(localStorage.getItem("de-outro-site")).toBe("fica");
    expect(screen.getByRole("status").textContent).toMatch(/apagadas/);
  });
});
