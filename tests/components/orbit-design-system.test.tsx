import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrbitDesignSystem } from "@/features/orbit/orbit-design-system";
import {
  CORES_BASE,
  CORES_SEMANTICAS,
  ORBIT_TOKENS,
  variaveisDoOrbit,
} from "@/features/orbit/orbit-tokens";

afterEach(cleanup);

describe("tokens do Orbit · Nebula", () => {
  it("o JSON que se descarrega é o mesmo que a página usa", () => {
    const doDisco = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/orbit-tokens.json"), "utf8"),
    );
    expect(doDisco).toEqual(JSON.parse(JSON.stringify(ORBIT_TOKENS)));
  });

  it("nenhuma cor vai para o CSS como hexadecimal: todas apontam para o Nebula", () => {
    const vars = variaveisDoOrbit();
    for (const [chave, token] of Object.entries(ORBIT_TOKENS.color)) {
      const valor = vars[`--orbit-${chave}`];
      expect(valor).toBe(`var(${token.variavel})`);
      expect(valor).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("os raios e os tempos viram variáveis com unidade", () => {
    const vars = variaveisDoOrbit();
    expect(vars["--orbit-raio-node"]).toBe("16px");
    expect(vars["--orbit-raio-control"]).toBe("11px");
    expect(vars["--orbit-texto-display"]).toBe("48px");
    expect(vars["--orbit-rapido"]).toBe("150ms");
    expect(vars["--orbit-suavizacao"]).toBe("ease-out");
  });

  it("o raio do bloco é o único valor em que os dois sistemas já concordavam", () => {
    // 16px: o "node" do Orbit e o "--nebula-radius" do Nebula.
    expect(ORBIT_TOKENS.radius.node).toBe(16);
  });
});

describe("página do design system", () => {
  it("tem as quatro seções, e o menu do topo leva a cada uma", () => {
    const { container } = render(<OrbitDesignSystem />);
    const ids = ["cores", "tipografia", "componentes", "estrutura"];
    for (const id of ids) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
    const ancoras = [
      ...container.querySelectorAll<HTMLAnchorElement>("nav a[href^='#']"),
    ].map((a) => a.getAttribute("href"));
    expect(ancoras).toEqual(ids.map((id) => `#${id}`));
  });

  it("mostra uma amostra por cor neutra e por cor com significado", () => {
    render(<OrbitDesignSystem />);
    for (const cor of [...CORES_BASE, ...CORES_SEMANTICAS]) {
      expect(screen.getAllByText(cor.nome).length).toBeGreaterThan(0);
    }
  });

  it("clicar numa amostra copia o nome da variável, não o hexadecimal", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const { container } = render(<OrbitDesignSystem />);
    // O nome da variável aparece na amostra e outra vez na lista de
    // elevação, por isso a busca é dentro da grelha de amostras.
    const amostra = container.querySelector<HTMLButtonElement>(
      "[class*='swatches'] button",
    )!;
    fireEvent.click(amostra);
    expect(writeText).toHaveBeenCalledWith("var(--nebula-bg)");
    expect(await screen.findByText("copiado")).toBeTruthy();
  });

  it("cada porta tem o rótulo ao lado da cor", () => {
    const { container } = render(<OrbitDesignSystem />);
    const portas = [...container.querySelectorAll("[style*='--porta']")];
    expect(portas.length).toBe(4);
    for (const porta of portas) {
      expect(porta.textContent?.trim()).not.toBe("");
    }
  });

  it("o botão principal é um só, e o desativado está mesmo desativado", () => {
    render(<OrbitDesignSystem />);
    expect(
      (screen.getByText("Desativado") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("Gerar")).toBeTruthy();
  });

  it("oferece o JSON dos tokens para descarregar", () => {
    const { container } = render(<OrbitDesignSystem />);
    const baixar = container.querySelector<HTMLAnchorElement>(
      "a[href='/orbit-tokens.json']",
    );
    expect(baixar).not.toBeNull();
    expect(baixar!.hasAttribute("download")).toBe(true);
  });
});
