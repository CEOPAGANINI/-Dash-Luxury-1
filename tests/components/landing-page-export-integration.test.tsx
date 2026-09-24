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
  createFlowTemplate,
  INITIAL_FLOW,
  parseFlow,
  type FlowPage,
  type LandingFlow,
} from "@/features/landing-editor/flow-model";
import { useLandingFlowDraft } from "@/features/landing-editor/flow-store";
import type { SitePackage } from "@/features/landing-editor/site-package";

vi.mock("@/features/landing-editor/flow-store", () => ({
  useLandingFlowDraft: vi.fn(),
}));

vi.mock("@/features/landing-editor/page-export-panel", () => ({
  PageExportPanel: ({
    flow,
    page,
    site,
    onSiteChange,
  }: {
    flow: LandingFlow;
    page: FlowPage;
    site: SitePackage | null;
    onSiteChange: (site: SitePackage | null) => void;
  }) => {
    const instance = React.useId();
    return (
      <section aria-label="Painel ZIP de teste" data-instance={instance}>
        <h2>ZIP selecionado: {page.name}</h2>
        <output aria-label="Página recebida">{page.id}</output>
        <output aria-label="Pacote recebido">
          {site?.name ?? "Sem pacote"}
        </output>
        <output aria-label="Fluxo recebido">{JSON.stringify(flow)}</output>
        <button
          type="button"
          onClick={() =>
            onSiteChange({
              version: 1,
              name: `Pacote de ${page.id}`,
              entryPath: "index.html",
              importedAt: "2026-09-23T12:00:00.000Z",
              files: [
                {
                  path: "private-asset-name.html",
                  data: new TextEncoder().encode(
                    "asset-bytes-not-a-flow-field",
                  ),
                  mime: "text/html",
                },
              ],
            })
          }
        >
          Associar pacote de teste
        </button>
        <button type="button" onClick={() => onSiteChange(null)}>
          Remover pacote de teste
        </button>
      </section>
    );
  },
}));

const save = vi.fn<(flow: LandingFlow) => boolean>(() => true);
const createObjectURL = vi.fn<(blob: Blob) => string>(
  () => "blob:local-flow-json",
);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  save.mockReset().mockReturnValue(true);
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.mocked(useLandingFlowDraft).mockReturnValue({
    ready: true,
    flow: parseFlow(INITIAL_FLOW)!,
    notice: "",
    save,
  });
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openZip() {
  fireEvent.click(screen.getByRole("button", { name: "ZIP de cada página" }));
}

function selectPage(id: string) {
  fireEvent.change(
    screen.getByRole("combobox", { name: "Página para exportar" }),
    {
      target: { value: id },
    },
  );
}

function packageName() {
  return screen.getByLabelText("Pacote recebido").textContent;
}

function associatePackage() {
  fireEvent.click(
    screen.getByRole("button", { name: "Associar pacote de teste" }),
  );
}

function warnsBeforeLeaving() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("Landing editor per-page export integration", () => {
  it("opens the chosen block in ZIP view from its inspector", () => {
    render(<LandingFlowEditor storageId="account-a" />);
    expect(
      screen.queryByRole("region", { name: "Painel ZIP de teste" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Configurar Checkout" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar esta página (ZIP)" }),
    );
    expect(
      screen.getByRole("heading", { name: "ZIP selecionado: Checkout" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Página para exportar",
        }) as HTMLSelectElement
      ).value,
    ).toBe("page-checkout");
    expect(
      screen
        .getByRole("button", { name: "ZIP de cada página" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.queryByRole("region", { name: "Fluxo de páginas" }),
    ).toBeNull();
  });

  it("retains independent packages when switching pages and removes only the selected package", () => {
    render(<LandingFlowEditor storageId="account-a" />);
    openZip();
    expect(packageName()).toBe("Sem pacote");
    associatePackage();
    expect(packageName()).toBe("Pacote de page-landing");
    selectPage("page-checkout");
    expect(packageName()).toBe("Sem pacote");
    associatePackage();
    expect(packageName()).toBe("Pacote de page-checkout");
    selectPage("page-landing");
    expect(packageName()).toBe("Pacote de page-landing");
    fireEvent.click(
      screen.getByRole("button", { name: "Remover pacote de teste" }),
    );
    expect(packageName()).toBe("Sem pacote");
    selectPage("page-checkout");
    expect(packageName()).toBe("Pacote de page-checkout");
    expect(save).not.toHaveBeenCalled();
  });

  it("discards every in-memory package and pending unload warning when account identity changes", () => {
    const { rerender } = render(<LandingFlowEditor storageId="account-a" />);
    openZip();
    associatePackage();
    selectPage("page-checkout");
    associatePackage();
    expect(warnsBeforeLeaving()).toBe(true);
    rerender(<LandingFlowEditor storageId="account-b" />);
    expect(useLandingFlowDraft).toHaveBeenLastCalledWith("account-b");
    openZip();
    expect(screen.getByLabelText("Página recebida").textContent).toBe(
      "page-landing",
    );
    expect(packageName()).toBe("Sem pacote");
    selectPage("page-checkout");
    expect(packageName()).toBe("Sem pacote");
    expect(warnsBeforeLeaving()).toBe(false);
  });

  it("warns before flow replacement and resets package associations even when template page IDs are reused", () => {
    const initial = createFlowTemplate("store");
    vi.mocked(useLandingFlowDraft).mockReturnValue({
      ready: true,
      flow: initial,
      notice: "",
      save,
    });
    render(<LandingFlowEditor storageId="account-a" />);
    openZip();
    associatePackage();
    const oldId = screen.getByLabelText("Página recebida").textContent;
    const oldInstance = screen
      .getByRole("region", { name: "Painel ZIP de teste" })
      .getAttribute("data-instance");
    fireEvent.click(screen.getByRole("button", { name: "Funil de vendas" }));
    fireEvent.click(screen.getByRole("button", { name: "Carregar modelo" }));
    let confirmation = screen.getByRole("dialog", {
      name: "Substituir o fluxo em edição?",
    });
    expect(
      within(confirmation).getByText(
        /Os arquivos associados às páginas serão descartados/,
      ),
    ).toBeTruthy();
    expect(
      within(confirmation).getByText(/não são recuperados por Desfazer/),
    ).toBeTruthy();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    openZip();
    expect(packageName()).toBe(`Pacote de ${oldId}`);
    fireEvent.click(screen.getByRole("button", { name: "Funil de vendas" }));
    fireEvent.click(screen.getByRole("button", { name: "Carregar modelo" }));
    confirmation = screen.getByRole("dialog", {
      name: "Substituir o fluxo em edição?",
    });
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Importar fluxo" }),
    );
    openZip();
    expect(screen.getByLabelText("Página recebida").textContent).toBe(oldId);
    expect(packageName()).toBe("Sem pacote");
    expect(
      screen
        .getByRole("region", { name: "Painel ZIP de teste" })
        .getAttribute("data-instance"),
    ).not.toBe(oldInstance);
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps binary assets out of both saved drafts and exported flow JSON", async () => {
    render(<LandingFlowEditor storageId="account-a" />);
    openZip();
    associatePackage();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(save).toHaveBeenCalledExactlyOnceWith(parseFlow(INITIAL_FLOW));
    expect(JSON.stringify(save.mock.calls[0][0])).not.toContain(
      "private-asset-name",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar fluxo JSON" }),
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json");
    const raw = await readBlob(blob);
    expect(JSON.parse(raw)).toEqual(parseFlow(INITIAL_FLOW));
    expect(raw).not.toContain("private-asset-name");
    expect(raw).not.toContain("asset-bytes-not-a-flow-field");
    expect(raw).not.toContain("entryPath");
    expect(packageName()).toBe("Pacote de page-landing");
    expect(screen.getByText("Fluxo exportado em JSON.")).toBeTruthy();
  });

  it("warns before leaving with imported files even after a successful draft save", () => {
    render(<LandingFlowEditor storageId="account-a" />);
    expect(warnsBeforeLeaving()).toBe(false);
    openZip();
    associatePackage();
    expect(warnsBeforeLeaving()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(warnsBeforeLeaving()).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Remover pacote de teste" }),
    );
    expect(warnsBeforeLeaving()).toBe(false);
  });
});
