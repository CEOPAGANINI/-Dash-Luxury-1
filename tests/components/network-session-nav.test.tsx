import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkSessionNav } from "@/features/ads/network-session-nav";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("modo=real"),
}));

afterEach(cleanup);

function abrirMenu() {
  render(<NetworkSessionNav rede="meta" sessao="tabela" title="Meta Ads" ariaLabel="Páginas do Meta Ads" />);
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Abrir menu de sessões desta página" }));
  return screen.getByRole("navigation", { name: "Páginas do Meta Ads" });
}

describe("o menu da direita nas páginas de rede: pastas como o menu da esquerda", () => {
  it("abre com as pastas das redes; a da página atual é marcada; nenhuma página aparece ainda", () => {
    const nav = abrirMenu();
    expect(nav.getAttribute("data-folder-open")).toBe("false");
    expect(nav.textContent).toContain("Redes de tráfego");
    const pastas = within(nav).getAllByRole("button", { name: /^Abrir pasta / });
    expect(pastas.map((b) => b.getAttribute("aria-label"))).toEqual(["Abrir pasta Meta Ads", "Abrir pasta Google Ads", "Abrir pasta YouTube Ads", "Abrir pasta Todas as redes"]);
    expect(pastas[0].getAttribute("aria-current")).toBe("true");
    expect(pastas[0].className).toContain("is-current");
    expect(pastas[0].textContent).toContain("Página atual nesta pasta");
    expect(pastas[1].textContent).toContain("5 páginas");
    expect(pastas[3].textContent).toContain("1 página");
    expect(within(nav).queryAllByRole("link")).toHaveLength(0);
  });

  it("abrir a pasta Meta Ads mostra só as cinco páginas dela, numeradas, com a atual marcada, e 'Sair da pasta' volta", () => {
    const nav = abrirMenu();
    fireEvent.click(within(nav).getByRole("button", { name: "Abrir pasta Meta Ads" }));
    expect(nav.getAttribute("data-folder-open")).toBe("true");
    expect(within(nav).queryAllByRole("button", { name: /^Abrir pasta / })).toHaveLength(0);
    expect(within(nav).getByRole("heading", { level: 2 }).textContent).toBe("Meta Ads");
    const paginas = within(nav).getAllByRole("link");
    expect(paginas.map((a) => a.textContent)).toEqual([
      "01Por classeQuadro por classe de trabalho",
      "02TabelaTabela com estado e freio em blocos",
      "03GerenciadorGerenciador em colunas de estado",
      "04MétricasTabela de métricas do gerenciador",
      "05CalculadoraCalculadora e diagnóstico",
    ]);
    expect(paginas.map((a) => a.getAttribute("href"))).toEqual([
      "/campanhas/meta/classes?modo=real",
      "/campanhas/meta/tabela?modo=real",
      "/campanhas/meta/gerenciador?modo=real",
      "/campanhas/meta/metricas?modo=real",
      "/campanhas/meta/calculadora?modo=real",
    ]);
    expect(paginas[1].getAttribute("aria-current")).toBe("page");
    expect(paginas[1].className).toContain("is-active");
    expect(paginas[0].getAttribute("aria-current")).toBeNull();
    // O foco vai para "Sair da pasta"; clicar nele volta às pastas, com o foco na pasta.
    const sair = within(nav).getByRole("button", { name: "Todas as pastas" });
    expect(document.activeElement).toBe(sair);
    expect(sair.textContent).toContain("Sair da pasta · Meta Ads");
    fireEvent.click(sair);
    expect(nav.getAttribute("data-folder-open")).toBe("false");
    expect(document.activeElement).toBe(within(nav).getByRole("button", { name: "Abrir pasta Meta Ads" }));
  });

  it("outra rede é uma pasta com as páginas dela; 'Todas as redes' leva ao quadro geral; Esc dentro da pasta volta", () => {
    const nav = abrirMenu();
    fireEvent.click(within(nav).getByRole("button", { name: "Abrir pasta Google Ads" }));
    const paginas = within(nav).getAllByRole("link");
    expect(paginas).toHaveLength(5);
    expect(paginas[0].getAttribute("href")).toBe("/campanhas/google/classes?modo=real");
    expect(paginas.every((a) => a.getAttribute("aria-current") === null)).toBe(true);
    fireEvent.keyDown(paginas[0], { key: "Escape" });
    expect(nav.getAttribute("data-folder-open")).toBe("false");
    fireEvent.click(within(nav).getByRole("button", { name: "Abrir pasta Todas as redes" }));
    const quadro = within(nav).getByRole("link", { name: "Abrir página 1: Quadro geral com as três redes" });
    expect(quadro.getAttribute("href")).toBe("/campanhas/quadro?modo=real");
  });
});
