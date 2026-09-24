import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingFlowEditor } from "@/features/landing-editor/landing-flow-editor";
import {
  INITIAL_FLOW,
  parseFlow,
  type LandingFlow,
} from "@/features/landing-editor/flow-model";
import { useLandingFlowDraft } from "@/features/landing-editor/flow-store";

vi.mock("@/features/landing-editor/flow-store", () => ({
  useLandingFlowDraft: vi.fn(),
}));

const save = vi.fn<(flow: LandingFlow) => boolean>(() => true);

beforeEach(() => {
  save.mockReset().mockReturnValue(true);
  vi.mocked(useLandingFlowDraft).mockReturnValue({
    ready: true,
    flow: parseFlow(INITIAL_FLOW)!,
    notice: "",
    save,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor() {
  return render(<LandingFlowEditor storageId="editor-test-user" />);
}

/** A configuração mora dentro do cartão aberto; só um fica aberto por vez. */
function inspector() {
  return within(screen.getByRole("region", { name: /^Configuração de / }));
}

function connections() {
  return within(screen.getByRole("region", { name: "Ligações entre páginas" }));
}

function editField(name: string | RegExp, value: string) {
  fireEvent.change(inspector().getByRole("textbox", { name }), {
    target: { value },
  });
}

describe("Orbit landing-page flow editor", () => {
  it("announces loading before exposing editable controls", () => {
    vi.mocked(useLandingFlowDraft).mockReturnValue({
      ready: false,
      flow: parseFlow(INITIAL_FLOW)!,
      notice: "",
      save,
    });
    renderEditor();
    expect(screen.getByRole("status").textContent).toBe(
      "Abrindo seu espaço de páginas…",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps each page's settings inside its own card, one card open at a time", () => {
    renderEditor();
    // Não há mais painel lateral de configuração.
    expect(screen.queryByRole("complementary")).toBeNull();
    const landing = screen.getByRole("article", {
      name: "Página Landing page",
    });
    const checkout = screen.getByRole("article", { name: "Página Checkout" });
    // O primeiro cartão abre já com a configuração dentro dele.
    expect(
      within(landing).getByRole("region", {
        name: "Configuração de Landing page",
      }),
    ).toBeTruthy();
    expect(within(checkout).queryByRole("region")).toBeNull();

    const abrirCheckout = within(checkout).getByRole("button", {
      name: "Configurar Checkout",
    });
    fireEvent.click(abrirCheckout);
    expect(abrirCheckout.getAttribute("aria-expanded")).toBe("true");
    const config = within(checkout).getByRole("region", {
      name: "Configuração de Checkout",
    });
    expect(abrirCheckout.getAttribute("aria-controls")).toBe(config.id);
    for (const campo of [
      "Nome da página",
      "Título da landing page",
      "Descrição",
      "Texto do botão",
    ])
      expect(within(config).getByRole("textbox", { name: campo })).toBeTruthy();
    expect(
      within(config).getByRole("button", { name: "Pré-visualizar página" }),
    ).toBeTruthy();
    expect(
      within(config).getByRole("button", { name: "Criar ligação" }),
    ).toBeTruthy();
    expect(
      within(config).getByRole("button", { name: "Remover Checkout" }),
    ).toBeTruthy();
    // Abrir um fecha o outro; clicar de novo fecha o próprio.
    expect(within(landing).queryByRole("region")).toBeNull();
    fireEvent.click(abrirCheckout);
    expect(abrirCheckout.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByRole("region", { name: /^Configuração de / }),
    ).toBeNull();
  });

  it("selects and edits only the chosen page, saving solely on explicit request", () => {
    renderEditor();
    expect(useLandingFlowDraft).toHaveBeenCalledWith("editor-test-user");
    expect(
      screen.getByRole("region", { name: "Fluxo de páginas" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Configurar Checkout" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Configurar Checkout" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Configurar Landing page" })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    editField("Nome da página", "Pagamento seguro");
    editField(/^Endereço da página/, "/pagamento");
    editField("Título da landing page", "Finalize seu pedido");
    editField("Descrição", "Revise seus dados antes de continuar.");
    editField("Texto do botão", "Pagar agora");
    editField(/^Imagem de capa/, "https://example.com/capa.jpg");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do fluxo" }), {
      target: { value: "Jornada da coleção" },
    });

    expect(
      screen.getByRole("article", { name: "Página Pagamento seguro" }),
    ).toBeTruthy();
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      name: "Jornada da coleção",
      pages: [
        INITIAL_FLOW.pages[0],
        {
          id: "page-checkout",
          name: "Pagamento seguro",
          url: "/pagamento",
          headline: "Finalize seu pedido",
          description: "Revise seus dados antes de continuar.",
          buttonLabel: "Pagar agora",
          imageUrl: "https://example.com/capa.jpg",
        },
        INITIAL_FLOW.pages[2],
      ],
      connections: INITIAL_FLOW.connections,
    });
    expect(screen.queryByText("Alterações não salvas")).toBeNull();
    expect(
      screen.getByText(
        "Rascunho salvo neste navegador. Nenhuma página pública foi alterada.",
      ),
    ).toBeTruthy();
  });

  it("rejects unsafe destinations and announces invalid fields without saving", () => {
    renderEditor();
    editField(/^Endereço da página/, "javascript:alert(1)");
    expect(
      inspector()
        .getByRole("textbox", { name: /^Endereço da página/ })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Revise nomes e endereços antes de salvar/),
    ).toBeTruthy();
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();

    editField(/^Endereço da página/, "/oferta");
    expect(
      inspector()
        .getByRole("textbox", { name: /^Endereço da página/ })
        .getAttribute("aria-invalid"),
    ).toBe("false");
    editField("Nome da página", "");
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps unsaved edits visible when storage refuses the save", () => {
    save.mockReturnValue(false);
    vi.mocked(useLandingFlowDraft).mockReturnValue({
      ready: true,
      flow: parseFlow(INITIAL_FLOW)!,
      notice: "O armazenamento local está indisponível.",
      save,
    });
    renderEditor();
    expect(screen.getByRole("alert").textContent).toContain(
      "armazenamento local",
    );
    editField("Nome da página", "Oferta não salva");
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Não foi possível salvar neste navegador/),
    ).toBeTruthy();
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    expect(
      (
        inspector().getByRole("textbox", {
          name: "Nome da página",
        }) as HTMLInputElement
      ).value,
    ).toBe("Oferta não salva");
  });

  it("creates the chosen kind of page and can undo its removal and creation", () => {
    renderEditor();
    expect(
      (screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tipo de página para adicionar" }),
      {
        target: { value: "external" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(
      screen
        .getByRole("button", { name: "Configurar Página externa 4" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      (
        inspector().getByRole("textbox", {
          name: "Nome da página",
        }) as HTMLInputElement
      ).value,
    ).toBe("Página externa 4");
    fireEvent.click(
      screen.getByRole("button", { name: "Remover Página externa 4" }),
    );
    expect(
      screen.queryByRole("article", { name: "Página Página externa 4" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(
      screen.getByRole("article", { name: "Página Página externa 4" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      (screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("removes a page with its incoming and outgoing connections and restores all on undo", () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Configurar Checkout" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover Checkout" }));
    expect(
      screen.queryByRole("article", { name: "Página Checkout" }),
    ).toBeNull();
    expect(connections().queryAllByRole("listitem")).toHaveLength(0);
    expect(connections().getByText(/Nenhuma ligação ainda/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(
      screen.getByRole("article", { name: "Página Checkout" }),
    ).toBeTruthy();
    expect(connections().getAllByRole("listitem")).toHaveLength(2);
    expect(
      connections().getByRole("button", {
        name: "Remover ligação de Landing page para Checkout",
      }),
    ).toBeTruthy();
    expect(
      connections().getByRole("button", {
        name: "Remover ligação de Checkout para Obrigado",
      }),
    ).toBeTruthy();
  });

  it("validates duplicate connections, adds a destination and removes or restores the link", () => {
    renderEditor();
    const target = inspector().getByRole("combobox", { name: "Destino" });
    expect(
      within(target).queryByRole("option", { name: "Landing page" }),
    ).toBeNull();
    expect(
      (
        inspector().getByRole("button", {
          name: "Criar ligação",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(target, { target: { value: "page-checkout" } });
    fireEvent.click(inspector().getByRole("button", { name: "Criar ligação" }));
    expect(
      screen.getByText("Essas páginas já estão conectadas nessa direção."),
    ).toBeTruthy();
    expect(connections().getAllByRole("listitem")).toHaveLength(2);

    fireEvent.change(target, { target: { value: "page-thank-you" } });
    editField("Nome da ligação", "Ir ao agradecimento");
    fireEvent.click(inspector().getByRole("button", { name: "Criar ligação" }));
    expect(connections().getAllByRole("listitem")).toHaveLength(3);
    expect(connections().getByText("Ir ao agradecimento")).toBeTruthy();
    expect((target as HTMLSelectElement).value).toBe("");
    const removeName = "Remover ligação de Landing page para Obrigado";
    fireEvent.click(connections().getByRole("button", { name: removeName }));
    expect(connections().getAllByRole("listitem")).toHaveLength(2);
    expect(connections().queryByText("Ir ao agradecimento")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(
      connections().getByRole("button", { name: removeName }),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("simulates the journey inside the accessible preview without redirecting", () => {
    const flow = parseFlow(INITIAL_FLOW)!;
    flow.pages.forEach((page, index) => {
      page.url = ["/oferta", "/pagamento", "/obrigado"][index];
    });
    vi.mocked(useLandingFlowDraft).mockReturnValue({
      ready: true,
      flow,
      notice: "",
      save,
    });
    const initialUrl = window.location.href;
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderEditor();
    fireEvent.click(
      inspector().getByRole("button", { name: "Pré-visualizar página" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Prévia da página" });
    const preview = within(dialog);
    expect(
      preview.getByRole("heading", { name: INITIAL_FLOW.pages[0].headline }),
    ).toBeTruthy();
    const address = preview.getByRole("link", {
      name: "Abrir endereço configurado",
    });
    expect(address.getAttribute("href")).toBe("/oferta");
    expect(address.getAttribute("target")).toBe("_blank");
    expect(address.getAttribute("rel")).toContain("noopener");

    fireEvent.click(preview.getByRole("button", { name: "Prévia no celular" }));
    expect(
      preview
        .getByRole("button", { name: "Prévia no celular" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      preview
        .getByRole("button", { name: "Prévia no computador" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(
      preview.getByRole("button", { name: INITIAL_FLOW.pages[0].buttonLabel }),
    );
    expect(
      preview.getByRole("heading", { name: INITIAL_FLOW.pages[1].headline }),
    ).toBeTruthy();
    fireEvent.click(
      preview.getByRole("button", { name: INITIAL_FLOW.pages[1].buttonLabel }),
    );
    expect(
      preview.getByRole("heading", { name: INITIAL_FLOW.pages[2].headline }),
    ).toBeTruthy();
    expect(preview.getByText(/Fim desta etapa/)).toBeTruthy();
    expect(window.location.href).toBe(initialUrl);
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows moving a block with named keyboard controls and undoing the move", () => {
    renderEditor();
    const page = screen.getByRole("article", { name: "Página Landing page" });
    const handle = within(page).getByRole("button", {
      name: "Mover Landing page; use as setas",
    });
    expect(page.style.left).toBe("60px");
    expect(page.style.top).toBe("120px");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(page.style.left).toBe("80px");
    expect(page.style.top).toBe("140px");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(page.style.top).toBe("120px");
    expect(page.style.left).toBe("80px");
  });
});
