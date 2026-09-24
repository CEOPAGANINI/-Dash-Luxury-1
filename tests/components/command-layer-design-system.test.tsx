import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DesignSystemPage, { metadata } from "@/app/(painel)/design-system/page";
import { CommandLayerDesignSystem } from "@/features/command-layer/command-layer-design-system";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "preto", setTheme }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setTheme.mockClear();
});

describe("CommandLayer live design system", () => {
  it("routes to the current design system and keeps demonstrations explicit", () => {
    const { container } = render(<DesignSystemPage />);
    expect(metadata.title).toBe("Design system · CommandLayer");
    expect(
      screen.getByRole("heading", { name: "CommandLayer", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText(/Demonstrações locais/)).toBeTruthy();
    expect(screen.queryByText("Orbit · Nebula")).toBeNull();
    expect(
      container.querySelectorAll('[data-slot="card"]').length,
    ).toBeGreaterThan(0);
    expect(
      screen
        .getByRole("button", { name: "Testar ação" })
        .getAttribute("data-slot"),
    ).toBe("button");
    for (const link of screen
      .getByRole("navigation", { name: "Seções do design system" })
      .querySelectorAll("a")) {
      expect(
        container.querySelector(link.getAttribute("href")!),
      ).not.toBeNull();
    }
  });

  it("renders color samples from shared semantic variables", () => {
    const { container } = render(<CommandLayerDesignSystem />);
    const sample = screen.getByRole("button", { name: "Copiar --cl-canvas" });
    expect(sample.querySelector('[style*="var(--cl-canvas)"]')).not.toBeNull();
    expect(
      container.querySelector('[style*="var(--cl-danger)"]'),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Tema preto ativo. Trocar para o tema branco.",
      }),
    );
    expect(setTheme).toHaveBeenCalledWith("branco");
  });

  it("copies token names only after clipboard confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<CommandLayerDesignSystem />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar --cl-screen" }));
    await waitFor(() =>
      expect(screen.getByText("Variável --cl-screen copiada.")).toBeTruthy(),
    );
    expect(writeText).toHaveBeenCalledWith("var(--cl-screen)");
    vi.unstubAllGlobals();
  });

  it("does not claim success when copying is denied", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<CommandLayerDesignSystem />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar --cl-accent" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Não foi possível copiar. Selecione o texto: var(--cl-accent).",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Variável --cl-accent copiada.")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("validates locally without persisting the example", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CommandLayerDesignSystem />);
    fireEvent.click(screen.getByRole("button", { name: "Validar exemplo" }));
    const input = screen.getByRole("textbox", { name: "Nome de exemplo" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("Digite um nome para testar a validação."),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "Página de teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Validar exemplo" }));
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(
      screen.getByText("Exemplo validado. Nenhum dado foi salvo."),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("provides actual local action feedback and disabled loading examples", () => {
    render(<CommandLayerDesignSystem />);
    fireEvent.click(screen.getByRole("button", { name: "Testar ação" }));
    expect(
      screen.getByText(
        "Ação demonstrativa concluída. Nenhum dado foi alterado.",
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Indisponível",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const loading = screen.getByRole("button", {
      name: "Carregando · exemplo",
    });
    expect((loading as HTMLButtonElement).disabled).toBe(true);
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("switches between meaningful, explicitly demonstrative states", () => {
    render(<CommandLayerDesignSystem />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Erro" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("tab", { name: "Erro" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText(/Este não é um erro real do painel/)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Loading" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("status", { name: "Exemplo de carregamento" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Carregamento ilustrativo; nenhuma operação em andamento.",
      ),
    ).toBeTruthy();
  });
});
