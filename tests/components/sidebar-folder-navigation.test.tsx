import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SidebarFolderNavigation,
  sidebarPageTitle,
} from "@/components/layout/sidebar-folder-navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/campanhas/meta" }));
afterEach(cleanup);

function setup() {
  const onNavigate = vi.fn();
  render(<SidebarFolderNavigation unreadCount={12} onNavigate={onNavigate} />);
  return onNavigate;
}

describe("navigation folders", () => {
  it("starts with categories only, without a list of pages", () => {
    setup();
    expect(screen.getAllByRole("button", { name: /Abrir pasta/ })).toHaveLength(
      8,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(
      screen
        .getByText("Página atual nesta pasta")
        .closest("button")
        ?.getAttribute("aria-label"),
    ).toBe("Abrir pasta Meta Ads");
  });

  it.each([
    ["Geral", ["Visão geral"]],
    ["Operação", ["Monitor ao vivo", "Pedidos", "Transações", "Gateways", "Lojas conectadas"]],
    ["Meta Ads", ["Por classe", "Tabela", "Gerenciador", "Métricas", "Calculadora"]],
    ["Google Ads", ["Por classe", "Tabela", "Gerenciador", "Métricas", "Calculadora"]],
    ["YouTube Ads", ["Por classe", "Tabela", "Gerenciador", "Métricas", "Calculadora"]],
    ["Campanhas", ["Todas as redes", "Calculadora", "Análise"]],
    ["Gestão", ["Financeiro", "Aquisição", "CRM", "Alertas", "Notificações"]],
    [
      "Sistema",
      [
        "Segurança",
        "Integrações",
        "Qualidade dos dados",
        "Logs",
        "Configurações",
        "Ver loja",
      ],
    ],
  ])("shows only the pages in %s", (folder, expected) => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: `Abrir pasta ${folder}` }),
    );
    expect(
      screen.queryAllByRole("button", { name: /Abrir pasta/ }),
    ).toHaveLength(0);
    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.querySelector("span")?.textContent),
    ).toEqual(expected);
    expect(screen.getByRole("heading", { name: folder })).not.toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Todas as pastas" }),
    );
  });

  it("returns focus to the folder and lets the user choose another category", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta Gestão" }));
    fireEvent.click(screen.getByRole("button", { name: "Todas as pastas" }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Abrir pasta Gestão" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Sistema" }),
    );
    expect(screen.queryByRole("link", { name: "Campanhas" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Configurações" }).getAttribute("href"),
    ).toBe("/configuracoes");
    expect(
      screen.getByRole("link", { name: "Ver loja" }).getAttribute("target"),
    ).toBe("_blank");
  });

  it("preserves destinations, unread count and active page when navigating", () => {
    const onNavigate = setup();
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta Gestão" }));
    expect(onNavigate).not.toHaveBeenCalled();

    expect(
      screen
        .getByRole("link", { name: /Notificações\s*9\+/ })
        .getAttribute("href"),
    ).toBe("/notificacoes");
    fireEvent.click(screen.getByRole("button", { name: "Todas as pastas" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Meta Ads" }),
    );
    // A pasta da rede lista todas as páginas daquela rede, cada uma com o seu endereço.
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/campanhas/meta/classes",
      "/campanhas/meta/tabela",
      "/campanhas/meta/gerenciador",
      "/campanhas/meta/metricas",
      "/campanhas/meta/calculadora",
    ]);
    const campaign = screen.getByRole("link", { name: "Tabela" });
    fireEvent.click(campaign);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("Escape returns to folders before escaping the entire menu", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta Gestão" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Todas as pastas" }), {
      key: "Escape",
    });
    expect(screen.getAllByRole("button", { name: /Abrir pasta/ })).toHaveLength(
      8,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("identifies a nested page with its shared category", () => {
    expect(sidebarPageTitle("/campanhas/google")).toBe("Google Ads");
    expect(sidebarPageTitle("/campanhas/youtube")).toBe("YouTube Ads");
    expect(sidebarPageTitle("/campanhas/meta/tabela")).toBe("Meta Ads");
    expect(sidebarPageTitle("/campanhas/quadro")).toBe("Todas as redes");
    expect(sidebarPageTitle("/campanhas/calculadora")).toBe("Calculadora");
    expect(sidebarPageTitle("/campanhas/analise")).toBe("Análise");
    expect(sidebarPageTitle("/clientes/pessoa-1")).toBe("CRM");
    expect(sidebarPageTitle("/dashboard/trafego")).toBe("Aquisição");
  });
});

describe("pastas abrem só no clique", () => {
  it("passar o mouse numa pasta não a abre; clicar abre", () => {
    vi.useFakeTimers();
    try {
      render(<SidebarFolderNavigation id="menu" unreadCount={0} onNavigate={() => {}} />);
      const pasta = screen.getAllByRole("button", { name: /^Abrir pasta/ })[0];
      fireEvent.pointerEnter(pasta);
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.queryByRole("button", { name: "Todas as pastas" })).toBeNull();
      fireEvent.click(pasta);
      expect(screen.getByRole("button", { name: "Todas as pastas" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
