import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageExportPanel } from "@/features/landing-editor/page-export-panel";
import { INITIAL_FLOW, parseFlow } from "@/features/landing-editor/flow-model";
import {
  importSiteFiles,
  type SitePackage,
} from "@/features/landing-editor/site-package";
import { exportFlowPage } from "@/features/landing-editor/static-page-export";

vi.mock("@/features/landing-editor/site-package", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/landing-editor/site-package")
    >();
  return { ...actual, importSiteFiles: vi.fn() };
});
vi.mock("@/features/landing-editor/static-page-export", () => ({
  exportFlowPage: vi.fn(),
}));

const flow = parseFlow(INITIAL_FLOW)!;
const page = flow.pages[0];
const changed = vi.fn<(site: SitePackage | null) => void>();
const createObjectURL = vi.fn<(blob: Blob) => string>(
  () => "blob:local-page-download",
);
const revokeObjectURL = vi.fn();
const fetchMock = vi.fn();
const downloads: { filename: string; href: string }[] = [];

function siteFixture(name = "Minha página"): SitePackage {
  const data = (value: string) => new TextEncoder().encode(value);
  return {
    version: 1,
    name,
    entryPath: "index.html",
    importedAt: "2026-09-23T12:00:00.000Z",
    files: [
      {
        path: "index.html",
        data: data('<script>alert("not executed")</script><h1>Oferta</h1>'),
        mime: "text/html",
      },
      {
        path: "pages/oferta.html",
        data: data("<h1>Outra oferta</h1>"),
        mime: "text/html",
      },
      {
        path: "assets/style.css",
        data: data("body{color:black}"),
        mime: "text/css",
      },
    ],
  };
}

function Harness({ initialSite = null }: { initialSite?: SitePackage | null }) {
  const [site, setSite] = React.useState(initialSite);
  return (
    <PageExportPanel
      flow={flow}
      page={page}
      site={site}
      onSiteChange={(next) => {
        changed(next);
        setSite(next);
      }}
    />
  );
}

function chooseFiles(name = "pagina.zip") {
  const files = [new File(["zip contents"], name, { type: "application/zip" })];
  fireEvent.change(screen.getByLabelText("Arquivos desta página"), {
    target: { files },
  });
  return files;
}

beforeEach(() => {
  changed.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  fetchMock.mockReset();
  downloads.length = 0;
  vi.mocked(importSiteFiles).mockReset().mockResolvedValue(siteFixture());
  vi.mocked(exportFlowPage)
    .mockReset()
    .mockResolvedValue({
      bytes: new Uint8Array([80, 75, 3, 4]),
      filename: "landing-page.zip",
      fileCount: 2,
    });
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ filename: this.download, href: this.href });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Per-page ZIP export panel", () => {
  it("defaults to the selected page's editor content and explains publication limits", () => {
    render(<Harness />);
    expect(
      screen.getByRole("region", { name: "ZIP de Landing page" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Usar conteúdo do editor" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText(page.headline)).toBeTruthy();
    expect(screen.getByText("1 ligações")).toBeTruthy();
    expect(
      screen.getByText(/o ZIP não cobra pagamentos nem mantém um carrinho/),
    ).toBeTruthy();
    expect(screen.getByText(/Este botão não se conecta à VPS/)).toBeTruthy();
    expect(
      screen.getByText(/não entram no rascunho nem no JSON do funil/),
    ).toBeTruthy();
    expect(importSiteFiles).not.toHaveBeenCalled();
    expect(exportFlowPage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("downloads only the chosen page through a local ZIP Blob without storing or uploading it", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem");
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(exportFlowPage).toHaveBeenCalledExactlyOnceWith(
      flow,
      page.id,
      undefined,
    );
    expect(downloads[0]).toEqual({
      filename: "landing-page.zip",
      href: "blob:local-page-download",
    });
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBe(4);
    expect(document.querySelector('a[download="landing-page.zip"]')).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "O download foi solicitado",
    );
    expect(store).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revokes the download URL after the browser has been given time to consume it", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Baixar ZIP desta página" }),
      );
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
      "blob:local-page-download",
    );
  });

  it("requires an explicit import and keeps imported HTML inert", async () => {
    const { container } = render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Usar HTML importado" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Baixar ZIP desta página",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const files = chooseFiles();
    expect(importSiteFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    await screen.findByRole("combobox", { name: "HTML inicial" });
    expect(importSiteFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(changed).toHaveBeenCalledExactlyOnceWith(siteFixture());
    expect(screen.getByRole("status").textContent).toContain(
      "Arquivos associados a Landing page nesta aba",
    );
    expect(
      screen.getByText(
        /Os campos e ligações do editor não alteram esse código/,
      ),
    ).toBeTruthy();
    expect(container.querySelector("script, iframe, img")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves selected HTML and package assets when exporting imported mode, without changing the funnel", async () => {
    render(<Harness initialSite={siteFixture()} />);
    expect(
      screen
        .getByRole("button", { name: "Usar HTML importado" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "HTML inicial" }), {
      target: { value: "pages/oferta.html" },
    });
    const expectedSite = { ...siteFixture(), entryPath: "pages/oferta.html" };
    expect(changed).toHaveBeenCalledExactlyOnceWith(expectedSite);
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    await waitFor(() => expect(exportFlowPage).toHaveBeenCalled());
    expect(exportFlowPage).toHaveBeenCalledExactlyOnceWith(
      flow,
      page.id,
      expectedSite,
    );
    expect(flow).toEqual(parseFlow(INITIAL_FLOW));
    fireEvent.click(
      screen.getByRole("button", { name: "Usar conteúdo do editor" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    await waitFor(() => expect(exportFlowPage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(exportFlowPage).mock.calls[1]).toEqual([
      flow,
      page.id,
      undefined,
    ]);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("confirms replacing this page's files and preserves the previous package when import fails", async () => {
    render(<Harness initialSite={siteFixture()} />);
    chooseFiles("replacement.zip");
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const confirmation = screen.getByRole("group", {
      name: "Substituir arquivos desta página",
    });
    expect(document.activeElement).toBe(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    expect(importSiteFiles).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    expect(
      screen.queryByRole("group", { name: "Substituir arquivos desta página" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Arquivos desta página"),
    );
    vi.mocked(importSiteFiles).mockRejectedValueOnce(
      new Error("Nenhuma página HTML encontrada."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Substituir arquivos" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nenhuma página HTML encontrada.",
    );
    expect(changed).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("combobox", {
          name: "HTML inicial",
        }) as HTMLSelectElement
      ).value,
    ).toBe("index.html");
  });

  it("disables duplicate imports and mode changes while a package is being read", async () => {
    let resolve!: (site: SitePackage) => void;
    vi.mocked(importSiteFiles).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Usar HTML importado" }),
    );
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const importing = screen.getByRole("button", { name: "Importando…" });
    expect((importing as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Usar conteúdo do editor",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Arquivos desta página") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(importing);
    expect(importSiteFiles).toHaveBeenCalledOnce();
    await act(async () => resolve(siteFixture()));
    expect(changed).toHaveBeenCalledOnce();
  });

  it("surfaces export validation failures without creating a download and allows retry", async () => {
    vi.mocked(exportFlowPage).mockRejectedValueOnce(
      new Error("Configure o endereço do próximo destino."),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Configure o endereço do próximo destino.",
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
    expect(
      (
        screen.getByRole("button", {
          name: "Baixar ZIP desta página",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never assigns a late import to another page after the selected page unmounts", async () => {
    let resolve!: (site: SitePackage) => void;
    vi.mocked(importSiteFiles).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender } = render(
      <PageExportPanel
        key={page.id}
        flow={flow}
        page={page}
        site={null}
        onSiteChange={changed}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usar HTML importado" }),
    );
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const nextPage = flow.pages[1];
    rerender(
      <PageExportPanel
        key={nextPage.id}
        flow={flow}
        page={nextPage}
        site={null}
        onSiteChange={changed}
      />,
    );
    await act(async () => resolve(siteFixture("Pacote da página anterior")));
    expect(
      screen.getByRole("heading", { name: "ZIP de Checkout" }),
    ).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox", { name: "HTML inicial" })).toBeNull();
  });

  it("does not download a stale export after leaving the selected page", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof exportFlowPage>>) => void;
    vi.mocked(exportFlowPage).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar ZIP desta página" }),
    );
    await waitFor(() => expect(exportFlowPage).toHaveBeenCalledOnce());
    unmount();
    await act(async () =>
      resolve({
        bytes: new Uint8Array([80, 75]),
        filename: "old-page.zip",
        fileCount: 1,
      }),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });
});
