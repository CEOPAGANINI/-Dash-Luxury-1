import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunnelBoard } from "@/features/funnel/funnel-board";
import {
  criarCofreFunil,
  type CofreFunil,
} from "@/features/funnel/funil-store";
import { paginaVazia, type FunnelData } from "@/features/funnel/funnel-model";
import { contentFlowForPage } from "@/features/funnel/content-flow";

vi.mock("@/features/funnel/page-publisher", () => ({
  PagePublisher: ({
    nodeId,
    nome,
    onEditarConteudo,
  }: {
    nodeId: string;
    nome: string;
    onEditarConteudo: () => void;
  }) => (
    <section aria-label={`Publicador ${nome}`} data-page-id={nodeId}>
      <button type="button" onClick={onEditarConteudo}>
        Editar conteúdo de {nome}
      </button>
    </section>
  ),
}));

function fixture(): FunnelData {
  return {
    id: "board-fixture",
    nome: "Funil de teste",
    projeto: "Loja",
    nodes: [
      {
        id: "landing",
        type: "sales",
        title: "Oferta",
        headline: "Título original",
        x: 0,
        y: 0,
        pagina: {
          ...paginaVazia(),
          dominio: "example.com",
          caminho: "/oferta",
          saidas: { comprar: { etapaId: "checkout" } },
          backRedirect: { ligado: true, destinoEtapaId: "checkout" },
        },
      },
      {
        id: "checkout",
        type: "checkout",
        title: "Pagamento",
        x: 340,
        y: 0,
        pagina: { ...paginaVazia(), dominio: "pay.example.com", caminho: "/" },
      },
      {
        id: "redirect",
        type: "redirect",
        title: "Redirecionador",
        x: 0,
        y: 260,
        redir: {
          regras: [
            {
              id: "regra-br",
              tipo: "regiao",
              paises: ["BR"],
              dispositivos: [],
              percentual: 100,
              destino: "https://pay.example.com/",
              destinoNoId: "checkout",
              ativo: true,
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "landing",
        target: "checkout",
        rotulo: "Comprar",
        estilo: { forma: "livre", pontos: [{ x: 180, y: 80 }], cor: "#fff" },
      },
    ],
  };
}

let cofre: CofreFunil;
beforeEach(() => {
  window.localStorage.clear();
  cofre = criarCofreFunil("board-user");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(
  data = fixture(),
  save: (data: FunnelData) => void = (next) => cofre.salvarRascunho(next),
) {
  return render(
    <FunnelBoard
      storageId="board-user"
      cofre={cofre}
      inicial={data}
      onSalvar={save}
    />,
  );
}

function saveToVault(): FunnelData {
  fireEvent.click(screen.getByRole("button", { name: "Meus funis" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  return cofre.listarFunis()[0].data;
}

describe("funnel board page and graph integration", () => {
  it("opens the content editor for the page selected in its publisher and saves edits on that same node", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Configurar Oferta" }));
    expect(
      screen
        .getByRole("region", { name: "Publicador Oferta" })
        .getAttribute("data-page-id"),
    ).toBe("landing");
    fireEvent.click(
      screen.getByRole("button", { name: "Editar conteúdo de Oferta" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Editar conteúdo de Oferta",
    });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Título principal" }),
      { target: { value: "Título da oferta editado" } },
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Texto do botão principal" }),
      { target: { value: "Comprar oferta" } },
    );
    expect(
      within(dialog).getByRole("region", { name: "ZIP de Oferta" }),
    ).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Voltar à configuração da página",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Configurar Pagamento" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Editar conteúdo de Pagamento" }),
    );
    const checkout = screen.getByRole("dialog", {
      name: "Editar conteúdo de Pagamento",
    });
    expect(
      (
        within(checkout).getByRole("textbox", {
          name: "Título principal",
        }) as HTMLInputElement
      ).value,
    ).toBe("Pagamento");
    expect(
      within(checkout).getByRole("region", { name: "ZIP de Pagamento" }),
    ).toBeTruthy();
    fireEvent.change(
      within(checkout).getByRole("textbox", { name: "Descrição" }),
      { target: { value: "Descrição do pagamento" } },
    );
    fireEvent.click(
      within(checkout).getByRole("button", {
        name: "Voltar à configuração da página",
      }),
    );

    const saved = saveToVault();
    expect(saved.nodes.find((node) => node.id === "landing")).toMatchObject({
      headline: "Título da oferta editado",
      buttonLabel: "Comprar oferta",
    });
    expect(saved.nodes.find((node) => node.id === "checkout")).toMatchObject({
      descricao: "Descrição do pagamento",
    });
    expect(
      saved.nodes.find((node) => node.id === "checkout")?.headline,
    ).toBeUndefined();
  });

  it("reports storage errors without claiming the vault save succeeded or deleting edits", () => {
    vi.spyOn(cofre, "salvarFunil").mockImplementation(() => {
      throw new Error("Armazenamento cheio. Nada foi salvo.");
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Meus funis" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do funil" }), {
      target: { value: "Campanha não salva" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("status").textContent).toContain("Nada foi salvo");
    expect(screen.queryByText(/salvo no cofre deste navegador/)).toBeNull();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Nome do funil",
        }) as HTMLInputElement
      ).value,
    ).toBe("Campanha não salva");
    expect(cofre.listarFunis()).toEqual([]);
  });

  it("keeps the settings dialog open and reports errors if draft persistence fails", () => {
    const save = vi.fn(() => {
      throw new Error("Falha ao gravar o rascunho.");
    });
    mount(fixture(), save);
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do funil" }), {
      target: { value: "Mudança importante" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("Falha ao gravar");
    expect(screen.getByText("Configurações do Funil")).toBeTruthy();
    expect(screen.queryByText(/Rascunho salvo neste navegador/)).toBeNull();
  });

  it("duplicates a selected graph with new internal references and retains the connection label and control points", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "d", ctrlKey: true });
    const saved = saveToVault();
    expect(saved.nodes).toHaveLength(6);
    const copy = saved.nodes.filter(
      (node) => !fixture().nodes.some((original) => original.id === node.id),
    );
    const landing = copy.find((node) => node.type === "sales")!;
    const checkout = copy.find((node) => node.type === "checkout")!;
    const redirect = copy.find((node) => node.type === "redirect")!;
    expect(landing.pagina?.saidas.comprar.etapaId).toBe(checkout.id);
    expect(landing.pagina?.backRedirect?.destinoEtapaId).toBe(checkout.id);
    expect(redirect.redir?.regras[0].destinoNoId).toBe(checkout.id);
    expect(
      saved.edges.find((edge) => edge.source === landing.id),
    ).toMatchObject({
      target: checkout.id,
      rotulo: "Comprar",
      estilo: { pontos: [{ x: 220, y: 120 }], cor: "#fff" },
    });
  });

  it("does not bind clipboard destinations to unrelated same-ID nodes in a different funnel", () => {
    const board = fixture();
    window.localStorage.setItem(
      cofre.clipboardKey,
      JSON.stringify({
        nodes: [board.nodes[0]],
        edges: [],
        originFunnelId: "another-funnel",
      }),
    );
    mount(board);
    fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
    const saved = saveToVault();
    const copy = saved.nodes.find(
      (node) => !board.nodes.some((original) => original.id === node.id),
    )!;
    expect(copy.pagina?.saidas.comprar).toEqual({});
    expect(copy.pagina?.backRedirect).toEqual({ ligado: false });
  });

  it("exports an explicitly configured relative destination without falling back to an outdated legacy URL", () => {
    const board = fixture();
    board.nodes[1].pagina = { ...paginaVazia(), caminho: "/checkout-atual" };
    board.nodes[1].url = "/checkout-antigo";
    expect(
      contentFlowForPage(board, "landing").pages.find(
        (page) => page.id === "checkout",
      )?.url,
    ).toBe("/checkout-atual");
  });

  it("removes the underlying redirect rule when Delete is pressed on a derived rule line", () => {
    const { container } = mount();
    const paths = container.querySelectorAll(".funnel__edge-hit");
    expect(paths).toHaveLength(2);
    // Ordinary edges are rendered first, then lines derived from redirect rules.
    fireEvent.pointerDown(paths[1]);
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(container.querySelectorAll(".funnel__edge-hit")).toHaveLength(1);
    const saved = saveToVault();
    expect(
      saved.nodes.find((node) => node.id === "redirect")?.redir?.regras,
    ).toEqual([]);
    expect(saved.edges).toHaveLength(1);
  });

  it("clears dangling destinations when deleting a connected node", () => {
    const { container } = mount();
    const checkout = container.querySelector(
      '[data-in="checkout"].funnel__node',
    )!;
    fireEvent.contextMenu(checkout, { clientX: 50, clientY: 50 });
    fireEvent.keyDown(document.body, { key: "Delete" });
    const saved = saveToVault();
    expect(saved.nodes.map((node) => node.id)).not.toContain("checkout");
    expect(saved.edges).toEqual([]);
    expect(
      saved.nodes.find((node) => node.id === "landing")?.pagina?.saidas.comprar,
    ).toEqual({});
    expect(
      saved.nodes.find((node) => node.id === "redirect")?.redir?.regras[0],
    ).toMatchObject({ ativo: false, destino: "" });
  });
});
