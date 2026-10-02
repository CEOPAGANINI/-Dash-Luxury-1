import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SidebarFolderNavigation,
  sidebarPageTitle,
} from "@/components/layout/sidebar-folder-navigation";

// O caminho atual é trocável por teste (o menu do Servidor acende por regra).
const navegacao = vi.hoisted(() => ({ caminho: "/campanhas/meta/tabela" }));
vi.mock("next/navigation", () => ({ usePathname: () => navegacao.caminho }));
afterEach(() => {
  cleanup();
  navegacao.caminho = "/campanhas/meta/tabela";
});

function setup() {
  const onNavigate = vi.fn();
  render(<SidebarFolderNavigation unreadCount={12} onNavigate={onNavigate} />);
  return onNavigate;
}

/* As 14 pastas do menu e o título que cada página mostra de verdade: o
   nome no menu é o mesmo título da página (regra do dono). */
const PASTAS = [
  "Visão geral",
  "Vendas",
  "Financeiro",
  "Produtos",
  "Loja",
  "Clientes e comunicação",
  "Sites e páginas",
  "Funis e campanhas",
  "Tráfego e métricas",
  "Redes de tráfego",
  "Conexões e APIs",
  "Servidor",
  "Domínios",
  "Sistema",
];
const SESSOES = ["Por classe", "Tabela", "Gerenciador", "Métricas", "Calculadora"];

describe("navigation folders", () => {
  it("starts with categories only, without a list of pages", () => {
    setup();
    expect(
      screen
        .getAllByRole("button", { name: /Abrir pasta/ })
        .map((b) => b.getAttribute("aria-label")?.replace("Abrir pasta ", "")),
    ).toEqual(PASTAS);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(
      screen
        .getByText("Página atual nesta pasta")
        .closest("button")
        ?.getAttribute("aria-label"),
    ).toBe("Abrir pasta Redes de tráfego");
  });

  it.each([
    ["Visão geral", ["Visão geral"]],
    ["Vendas", ["Monitor ao vivo", "Pedidos", "Checkouts", "Carrinhos"]],
    [
      "Financeiro",
      [
        "Resumo financeiro",
        "Operação financeira",
        "Entradas e saídas",
        "Processador",
        "Repasses",
        "Links de pagamento",
      ],
    ],
    ["Produtos", ["Produtos", "Categorias", "Estoque", "Descontos e cupons"]],
    [
      "Loja",
      ["Lojas conectadas", "Editor da loja", "Editor de checkout", "Fretes", "Ver loja"],
    ],
    [
      "Clientes e comunicação",
      ["CRM", "E-mails", "Provas sociais", "Notificações"],
    ],
    [
      "Sites e páginas",
      [
        "Landing pages",
        "Editor de conteúdo",
        "Baixar site",
        "Filtro de acesso",
        "Roteador de ofertas",
      ],
    ],
    [
      "Funis e campanhas",
      ["Quadro do funil", "Calculadora de campanhas", "Análise de campanhas"],
    ],
    [
      "Tráfego e métricas",
      ["Gestão de tráfego", "Diagnósticos de aquisição", "Pixel"],
    ],
    [
      "Redes de tráfego",
      ["Meta Ads", "Google Ads", "YouTube Ads"].flatMap((rede) =>
        SESSOES.map((s) => `${rede} · ${s}`),
      ),
    ],
    ["Conexões e APIs", ["Integrações", "Gateways", "Webhooks"]],
    ["Servidor", ["Servidores", "Adicionar servidor"]],
    ["Domínios", ["Sites"]],
    [
      "Sistema",
      [
        "Segurança",
        "Design system",
        "Qualidade de dados",
        "Alertas",
        "Logs",
        "Configurações",
        "Equipe e permissões",
        "Configurar operação",
        "Pagamentos e conciliação",
        "Diagnóstico da operação",
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
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Clientes e comunicação" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Todas as pastas" }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Abrir pasta Clientes e comunicação" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Sistema" }),
    );
    expect(screen.queryByRole("link", { name: "CRM" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Configurações" }).getAttribute("href"),
    ).toBe("/configuracoes");
    fireEvent.click(screen.getByRole("button", { name: "Todas as pastas" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta Loja" }));
    expect(
      screen.getByRole("link", { name: "Ver loja" }).getAttribute("target"),
    ).toBe("_blank");
  });

  it("preserves destinations, unread count and active page when navigating", () => {
    const onNavigate = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Clientes e comunicação" }),
    );
    expect(onNavigate).not.toHaveBeenCalled();

    expect(
      screen
        .getByRole("link", { name: /Notificações\s*9\+/ })
        .getAttribute("href"),
    ).toBe("/notificacoes");
    fireEvent.click(screen.getByRole("button", { name: "Todas as pastas" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Redes de tráfego" }),
    );
    // A pasta das redes lista todas as páginas de cada rede, cada uma com o seu endereço.
    expect(
      screen
        .getAllByRole("link")
        .map((l) => l.getAttribute("href"))
        .slice(0, 5),
    ).toEqual([
      "/campanhas/meta/classes",
      "/campanhas/meta/tabela",
      "/campanhas/meta/gerenciador",
      "/campanhas/meta/metricas",
      "/campanhas/meta/calculadora",
    ]);
    const campaign = screen.getByRole("link", { name: "Meta Ads · Tabela" });
    expect(campaign.getAttribute("aria-current")).toBe("page");
    fireEvent.click(campaign);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("Escape returns to folders before escaping the entire menu", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Abrir pasta Vendas" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Todas as pastas" }), {
      key: "Escape",
    });
    expect(screen.getAllByRole("button", { name: /Abrir pasta/ })).toHaveLength(
      PASTAS.length,
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("names each page by the title the page itself shows", () => {
    expect(sidebarPageTitle("/campanhas/meta/tabela")).toBe("Meta Ads · Tabela");
    expect(sidebarPageTitle("/campanhas/quadro")).toBe("Quadro do funil");
    expect(sidebarPageTitle("/editor/landing-page")).toBe("Quadro do funil");
    expect(sidebarPageTitle("/campanhas/calculadora")).toBe(
      "Calculadora de campanhas",
    );
    expect(sidebarPageTitle("/campanhas/analise")).toBe("Análise de campanhas");
    expect(sidebarPageTitle("/clientes/pessoa-1")).toBe("CRM");
    expect(sidebarPageTitle("/checkouts")).toBe("Checkouts");
    expect(sidebarPageTitle("/dashboard/trafego")).toBe("Gestão de tráfego");
    expect(sidebarPageTitle("/dashboard/trafego/diagnosticos")).toBe(
      "Diagnósticos de aquisição",
    );
    expect(sidebarPageTitle("/landing-pages/minha-pagina")).toBe(
      "Landing pages",
    );
    expect(sidebarPageTitle("/captura")).toBe("Baixar site");
    expect(sidebarPageTitle("/servidor")).toBe("Servidores");
    expect(sidebarPageTitle(`/servidor/${UUID}`)).toBe("Servidores");
    expect(sidebarPageTitle("/servidor/novo")).toBe("Adicionar servidor");
    expect(sidebarPageTitle("/servidor/sites")).toBe("Sites");
    expect(sidebarPageTitle(`/servidor/sites/${UUID}`)).toBe("Sites");
    expect(sidebarPageTitle("/configuracoes/diagnosticos")).toBe(
      "Diagnóstico da operação",
    );
    expect(sidebarPageTitle("/dashboard/notificacoes")).toBe("Alertas");
  });

  it("names the pages that exist outside the menu instead of saying Painel", () => {
    expect(sidebarPageTitle("/financeiro/repasses")).toBe("Repasses");
    expect(sidebarPageTitle("/webhooks")).toBe("Webhooks");
    expect(sidebarPageTitle("/rota-que-nao-existe")).toBe("Painel");
  });

  it.each([
    ["/landing-pages", "Landing pages"],
    ["/editor/pagina", "Editor de conteúdo"],
  ])("marks Sites e páginas and the current destination at %s", (pathname, title) => {
    navegacao.caminho = pathname;
    const onNavigate = setup();
    const folder = screen.getByRole("button", {
      name: "Abrir pasta Sites e páginas",
    });
    expect(folder.getAttribute("aria-current")).toBe("true");
    fireEvent.click(folder);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/landing-pages",
      "/editor/pagina",
      "/captura",
      "/filtro-de-acesso",
      "/roteador-de-ofertas",
    ]);
    const current = screen.getByRole("link", { name: title });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("target")).toBeNull();
    fireEvent.click(current);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

const UUID = "3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f";

describe("pasta Servidor", () => {
  function acesos(caminho: string, pasta = "Servidor") {
    navegacao.caminho = caminho;
    render(<SidebarFolderNavigation unreadCount={0} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: `Abrir pasta ${pasta}` }));
    return screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.querySelector("span")?.textContent);
  }

  it("aponta cada página para o seu endereço", () => {
    acesos("/servidor");
    expect(
      screen.getAllByRole("link").map((l) => l.getAttribute("href")),
    ).toEqual(["/servidor", "/servidor/novo"]);
  });

  it("/servidor/sites acende Sites (pasta Domínios) e não Servidores", () => {
    expect(acesos("/servidor/sites")).toEqual([]);
    cleanup();
    expect(acesos("/servidor/sites", "Domínios")).toEqual(["Sites"]);
  });

  it("a página de um site também acende só Sites", () => {
    expect(acesos(`/servidor/sites/${UUID}`, "Domínios")).toEqual(["Sites"]);
  });

  it("/servidor/<uuid> acende Servidores", () => {
    expect(acesos(`/servidor/${UUID}`)).toEqual(["Servidores"]);
  });

  it("/servidor/novo acende só Adicionar servidor", () => {
    expect(acesos("/servidor/novo")).toEqual(["Adicionar servidor"]);
  });

  it("a pasta fica marcada como atual em qualquer página do Servidor", () => {
    navegacao.caminho = "/servidor/novo";
    render(<SidebarFolderNavigation unreadCount={0} onNavigate={() => {}} />);
    expect(
      screen
        .getByRole("button", { name: "Abrir pasta Servidor" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
});

describe("pastas abrem só no clique", () => {
  it("passar o mouse numa pasta não a abre; clicar abre", () => {
    vi.useFakeTimers();
    try {
      render(
        <SidebarFolderNavigation
          id="menu"
          unreadCount={0}
          onNavigate={() => {}}
        />,
      );
      const pasta = screen.getAllByRole("button", { name: /^Abrir pasta/ })[0];
      fireEvent.pointerEnter(pasta);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(
        screen.queryByRole("button", { name: "Todas as pastas" }),
      ).toBeNull();
      fireEvent.click(pasta);
      expect(
        screen.getByRole("button", { name: "Todas as pastas" }),
      ).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
