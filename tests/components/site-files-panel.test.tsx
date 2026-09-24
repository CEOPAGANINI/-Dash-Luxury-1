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

import { SiteFilesPanel } from "@/features/landing-editor/site-files-panel";
import {
  importSiteFiles,
  type SitePackage,
} from "@/features/landing-editor/site-package";

vi.mock("@/features/landing-editor/site-package", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/landing-editor/site-package")
    >();
  return { ...actual, importSiteFiles: vi.fn() };
});

function packageFixture(name = "Minha loja"): SitePackage {
  const encode = (text: string) => new TextEncoder().encode(text);
  return {
    version: 1,
    name,
    entryPath: "index.html",
    importedAt: "2026-09-23T12:00:00.000Z",
    files: [
      {
        path: "index.html",
        data: encode("<h1>Minha loja</h1>"),
        mime: "text/html",
      },
      {
        path: "pages/checkout.html",
        data: encode("<h1>Checkout</h1>"),
        mime: "text/html",
      },
      {
        path: "assets/style.css",
        data: encode("body{color:black}"),
        mime: "text/css",
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(importSiteFiles).mockReset().mockResolvedValue(packageFixture());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function chooseFiles(
  files = [new File(["zip contents"], "loja.zip", { type: "application/zip" })],
) {
  fireEvent.change(screen.getByLabelText("Selecionar arquivos do site"), {
    target: { files },
  });
  return files;
}

async function importPackage() {
  chooseFiles();
  fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
  await screen.findByRole("table", { name: "Arquivos importados" });
}

describe("Site files panel", () => {
  it("explains local-only storage and real limits before choosing files", () => {
    render(<SiteFilesPanel storageId="account-1" />);
    expect(
      screen.getByRole("region", { name: "Arquivos da loja" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Arquivos nesta aba; ainda não enviados à VPS"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Ao recarregar, sair desta área ou trocar de conta/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /ZIP até 20 MB; cada arquivo até 10 MB; site extraído até 40 MB/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Máximo de 400 arquivos e pastas/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Nenhum site importado" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Importar arquivos",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const input = screen.getByLabelText(
      "Selecionar arquivos do site",
    ) as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".zip,.html,.htm,.css,.js");
    expect(importSiteFiles).not.toHaveBeenCalled();
  });

  it("imports only on explicit request, then lists files, sizes and HTML entries without persisting", async () => {
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<SiteFilesPanel storageId="account-1" />);
    const files = chooseFiles([
      new File(["<h1>Loja</h1>"], "index.html", { type: "text/html" }),
      new File(["body{}"], "style.css", { type: "text/css" }),
    ]);
    expect(screen.getByText("2 arquivos selecionados")).toBeTruthy();
    expect(
      within(
        screen.getByRole("list", { name: "Arquivos selecionados" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(importSiteFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const table = await screen.findByRole("table", {
      name: "Arquivos importados",
    });
    expect(importSiteFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(
      within(table).getByRole("rowheader", { name: "assets/style.css" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Tamanho total").nextElementSibling?.textContent,
    ).toBe("53 B");
    expect(
      screen.getByText(
        "3 arquivos importados nesta aba. Nenhum arquivo foi enviado à VPS.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Arquivos selecionados" }),
    ).toBeNull();
    const picker = screen.getByRole("combobox", {
      name: "Página HTML inicial",
    }) as HTMLSelectElement;
    expect(picker.value).toBe("index.html");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["index.html", "pages/checkout.html"]);
    fireEvent.change(picker, { target: { value: "pages/checkout.html" } });
    expect(picker.value).toBe("pages/checkout.html");
    expect(
      within(table).getByRole("rowheader", {
        name: "pages/checkout.html Página inicial",
      }),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("announces async work and prevents duplicate imports while reading", async () => {
    let resolveImport!: (site: SitePackage) => void;
    vi.mocked(importSiteFiles).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );
    render(<SiteFilesPanel storageId="account-1" />);
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const button = screen.getByRole("button", {
      name: "Importando…",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      (screen.getByLabelText("Selecionar arquivos do site") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "Lendo e validando os arquivos. Aguarde…",
    );
    fireEvent.click(button);
    expect(importSiteFiles).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveImport(packageFixture());
    });
    expect(
      screen.getByRole("table", { name: "Arquivos importados" }),
    ).toBeTruthy();
  });

  it("requires confirmation before replacement, allowing cancellation without touching the current site", async () => {
    render(<SiteFilesPanel storageId="account-1" />);
    await importPackage();
    vi.mocked(importSiteFiles).mockResolvedValueOnce(
      packageFixture("Nova loja"),
    );
    chooseFiles([new File(["new zip"], "nova.zip")]);
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    const confirmation = screen.getByRole("group", {
      name: "Substituir arquivos atuais?",
    });
    expect(document.activeElement).toBe(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    expect(importSiteFiles).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Cancelar" }),
    );
    expect(
      screen.queryByRole("group", { name: "Substituir arquivos atuais?" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Importar arquivos" }),
    );
    expect(screen.getByRole("heading", { name: "Minha loja" })).toBeTruthy();
    expect(importSiteFiles).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Substituir arquivos" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Nova loja" }),
    ).toBeTruthy();
    expect(importSiteFiles).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("heading", { name: "Minha loja" })).toBeNull();
  });

  it("shows helper errors verbatim and preserves the existing package after an invalid replacement", async () => {
    render(<SiteFilesPanel storageId="account-1" />);
    await importPackage();
    vi.mocked(importSiteFiles).mockRejectedValueOnce(
      new Error("O ZIP pode ter no máximo 20 MB."),
    );
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Substituir arquivos" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "O ZIP pode ter no máximo 20 MB. O pacote anterior foi mantido.",
    );
    expect(screen.getByRole("heading", { name: "Minha loja" })).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Arquivos importados" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Importar arquivos",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("gives a retryable error when first import fails", async () => {
    vi.mocked(importSiteFiles).mockRejectedValueOnce(
      new Error("Nenhuma página HTML encontrada."),
    );
    render(<SiteFilesPanel storageId="account-1" />);
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nenhuma página HTML encontrada.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Importar arquivos",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    chooseFiles();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows HTML only as escaped text, bounds the displayed bytes and never mounts its executable markup", async () => {
    const html =
      '<script>window.alert("unsafe")</script><img src="https://example.com/track"><iframe src="https://example.com"></iframe>' +
      "a".repeat(100_010);
    const fixture = packageFixture();
    fixture.files[0].data = new TextEncoder().encode(html);
    vi.mocked(importSiteFiles).mockResolvedValueOnce(fixture);
    const { container } = render(<SiteFilesPanel storageId="account-1" />);
    await importPackage();
    expect(container.querySelector("pre")).toBeNull();
    const details = screen.getByText("Ver código HTML").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const code = await screen.findByLabelText("Código HTML da página inicial");
    expect(code.textContent).toBe(html.slice(0, 100_000));
    expect(container.querySelector("script, iframe, img")).toBeNull();
    expect(
      screen.getByText(/Exibindo apenas os primeiros 100 KB/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Somente leitura. O HTML e os scripts não são executados.",
      ),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Página HTML inicial" }),
      { target: { value: "pages/checkout.html" } },
    );
    expect(container.querySelector("pre")).toBeNull();
  });

  it("resets files on account change and never applies a late import from the previous account", async () => {
    const { rerender } = render(<SiteFilesPanel storageId="account-1" />);
    await importPackage();
    rerender(<SiteFilesPanel storageId="account-2" />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Nenhum site importado" }),
    ).toBeTruthy();
    let resolveImport!: (site: SitePackage) => void;
    vi.mocked(importSiteFiles).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );
    chooseFiles();
    fireEvent.click(screen.getByRole("button", { name: "Importar arquivos" }));
    rerender(<SiteFilesPanel storageId="account-3" />);
    await act(async () => {
      resolveImport(packageFixture("Conta anterior"));
    });
    await waitFor(() => expect(screen.queryByRole("table")).toBeNull());
    expect(
      screen.queryByRole("heading", { name: "Conta anterior" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
