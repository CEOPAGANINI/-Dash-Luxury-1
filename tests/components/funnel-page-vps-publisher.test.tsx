import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageVpsPublisher } from "@/features/funnel/page-vps-publisher";
import { FunnelSitePublisher } from "@/features/funnel/funnel-site-publisher";
import { exportFunnelSite } from "@/features/funnel/funnel-site-export";
import { restorePackages } from "@/features/funnel/package-cloud";
import type { FunnelData } from "@/features/funnel/funnel-model";
import {
  enviarZip,
  lerEstado,
  type EstadoDaTela,
} from "@/features/vps/vps-cliente";
import type { PreparedPageZip } from "@/features/funnel/page-zip";

vi.mock("@/features/vps/vps-cliente", () => ({
  lerEstado: vi.fn(),
  enviarZip: vi.fn(),
}));
vi.mock("@/features/funnel/funnel-site-export", () => ({
  exportFunnelSite: vi.fn(),
}));
vi.mock("@/features/funnel/package-cloud", () => ({
  restorePackages: vi.fn(),
}));

const siteId = "11111111-1111-4111-8111-111111111111";
const state = {
  podeAlterar: true,
  sites: [
    {
      id: siteId,
      nome: "Site principal",
      servidorNome: "Minha VPS",
      estado: "ativo",
      dominios: [{ hostname: "loja.example.com", principal: true }],
    },
  ],
} as unknown as EstadoDaTela;
const zip: PreparedPageZip = {
  file: new File(["validated bytes"], "landing.zip"),
  metadata: { nome: "landing.zip", tamanho: 15, ok: true },
  fileCount: 1,
};
const funnel: FunnelData = {
  id: "publication-fixture",
  nome: "Site de teste",
  projeto: "Loja",
  nodes: [],
  edges: [],
};
const exported = {
  bytes: new Uint8Array([1, 2, 3]),
  filename: "site-completo.zip",
  fileCount: 2,
  routes: ["/", "/obrigado"],
  warnings: ["Aviso do pacote preparado"],
} as Awaited<ReturnType<typeof exportFunnelSite>>;

function Harness({
  path = "/",
  prepared = zip,
}: {
  path?: string;
  prepared?: PreparedPageZip | null;
}) {
  const [domain, setDomain] = React.useState("");
  return (
    <PageVpsPublisher
      zip={prepared}
      path={path}
      domain={domain}
      onDomainChange={setDomain}
    />
  );
}

async function chooseSite() {
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar meus sites da VPS" }),
  );
  await screen.findByRole("combobox", { name: "Site que receberá o ZIP" });
  fireEvent.change(
    screen.getByRole("combobox", { name: "Site que receberá o ZIP" }),
    { target: { value: siteId } },
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Domínio do site selecionado" }),
    { target: { value: "loja.example.com" } },
  );
}

async function submitPackage() {
  await chooseSite();
  fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
  );
  await screen.findByRole("button", { name: "Verificar publicação" });
}

function activeRelease() {
  return {
    ...state,
    site: {
      servidorInforma: "release-new",
      versoes: [{ id: "release-new", estado: "no_servidor", ativa: true }],
    },
  } as unknown as EstadoDaTela;
}

function publicationStatus() {
  return screen.getByRole("status", { name: "Estado da publicação" });
}

beforeEach(() => {
  vi.mocked(restorePackages).mockReset().mockResolvedValue(undefined);
  vi.mocked(exportFunnelSite).mockReset().mockResolvedValue(exported);
  vi.mocked(lerEstado).mockReset().mockResolvedValue(state);
  vi.mocked(enviarZip)
    .mockReset()
    .mockResolvedValue({
      ok: true,
      versao: { id: "release-new" },
      tarefa: {},
      avisos: [],
    } as unknown as Awaited<ReturnType<typeof enviarZip>>);
});
afterEach(cleanup);

describe("deliberate funnel publication", () => {
  it("does not call any API until explicitly asked and never publishes on site selection", async () => {
    render(<Harness />);
    expect(lerEstado).not.toHaveBeenCalled();
    expect(enviarZip).not.toHaveBeenCalled();
    await chooseSite();
    expect(lerEstado).toHaveBeenCalledWith({});
    expect(enviarZip).not.toHaveBeenCalled();
  });

  it.each(["/oferta", "", "//", "/../"])(
    "blocks whole-site upload for non-root planned path %s",
    async (path) => {
      render(<Harness path={path} />);
      await chooseSite();
      expect(
        (
          screen.getByRole("button", {
            name: "Revisar publicação",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(enviarZip).not.toHaveBeenCalled();
    },
  );

  it("does not treat persisted metadata as a ready package", async () => {
    render(<Harness prepared={null} />);
    await chooseSite();
    expect(
      (
        screen.getByRole("button", {
          name: "Revisar publicação",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(/O nome salvo no rascunho não contém os arquivos/),
    ).toBeTruthy();
  });

  it("requires a separate whole-site replacement confirmation and reports queued, not live", async () => {
    render(<Harness />);
    await chooseSite();
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    expect(
      screen.getByRole("group", { name: "Confirmar substituição do site" })
        .textContent,
    ).toContain("Páginas que não estiverem neste ZIP");
    expect(enviarZip).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancelar" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    await waitFor(() => expect(enviarZip).toHaveBeenCalledTimes(1));
    expect(enviarZip).toHaveBeenCalledWith(siteId, zip.file);
    await screen.findByText(/ZIP enviado\. Aguardando o agente/);
    expect(publicationStatus().textContent).toContain(
      "Aguardando agente da VPS",
    );
    expect(screen.queryByText(/^Publicado|^No ar/)).toBeNull();
  });

  it("cancels without sending and rejects stale package confirmations", async () => {
    const view = render(<Harness />);
    await chooseSite();
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(enviarZip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    view.rerender(
      <Harness
        prepared={{ ...zip, file: new File(["new bytes"], "new.zip") }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    await screen.findByRole("alert");
    expect(enviarZip).not.toHaveBeenCalled();
  });

  it("shows server refusal and validation problems instead of success", async () => {
    vi.mocked(enviarZip).mockResolvedValue({
      ok: false,
      mensagem: "O ZIP tem problemas",
      codigo: "zip_com_problemas",
      problemas: [{ arquivo: "index.html", motivo: "inválido" }],
    });
    render(<Harness />);
    await chooseSite();
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "index.html: inválido",
    );
    expect(screen.queryByText(/ZIP enviado/)).toBeNull();
  });

  it("does not expose success when the session/API fails", async () => {
    vi.mocked(lerEstado).mockRejectedValue(
      new Error("Sessão vencida. Entre novamente."),
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Carregar meus sites da VPS" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Sessão vencida",
    );
    expect(enviarZip).not.toHaveBeenCalled();
  });

  it("shows missing setup requirements without exposing or requesting secret values", async () => {
    vi.mocked(lerEstado).mockResolvedValue({
      ...state,
      podeAlterar: false,
      pendencias: [
        {
          chave: "chave",
          ok: false,
          texto: "Chave mestra não configurada",
          ondePegar: "Configuração do projeto na Vercel",
        },
      ],
    });
    render(<Harness />);
    await chooseSite();
    expect(screen.getByRole("alert").textContent).toContain(
      "Chave mestra não configurada",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Revisar publicação",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(enviarZip).not.toHaveBeenCalled();
  });

  it("only confirms active version after the agent reports the same release", async () => {
    render(<Harness />);
    await chooseSite();
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    await screen.findByRole("button", { name: "Verificar publicação" });
    vi.mocked(lerEstado).mockResolvedValue({
      ...state,
      site: {
        servidorInforma: "old-release",
        versoes: [{ id: "release-new", estado: "no_servidor", ativa: true }],
      },
    } as unknown as EstadoDaTela);
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar publicação" }),
    );
    await screen.findByText(/ainda não foi confirmada como ativa/);
    expect(publicationStatus().textContent).toContain(
      "Aguardando agente da VPS",
    );
    vi.mocked(lerEstado).mockResolvedValue({
      ...state,
      site: {
        servidorInforma: "release-new",
        versoes: [{ id: "release-new", estado: "no_servidor", ativa: true }],
      },
    } as unknown as EstadoDaTela);
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar publicação" }),
    );
    await screen.findByText(/Versão confirmada pelo agente e ativa/);
    expect(publicationStatus().textContent).toContain("Confirmado na VPS");
    expect(lerEstado).toHaveBeenLastCalledWith({ siteId });
  });

  it.each([
    { estado: "enviando", ativa: true, servidorInforma: "release-new" },
    { estado: "no_servidor", ativa: false, servidorInforma: "release-new" },
    { estado: "no_servidor", ativa: true, servidorInforma: "old-release" },
  ])(
    "keeps the waiting status without complete agent evidence: %j",
    async ({ estado, ativa, servidorInforma }) => {
      render(<Harness />);
      await submitPackage();
      vi.mocked(lerEstado).mockResolvedValue({
        ...state,
        site: {
          servidorInforma,
          versoes: [{ id: "release-new", estado, ativa }],
        },
      } as unknown as EstadoDaTela);
      fireEvent.click(
        screen.getByRole("button", { name: "Verificar publicação" }),
      );
      await screen.findByText(/ainda não foi confirmada como ativa/);
      expect(publicationStatus().textContent).toContain(
        "Aguardando agente da VPS",
      );
      expect(screen.queryByText("Confirmado na VPS")).toBeNull();
    },
  );

  it.each(["package", "domain", "destination", "path"])(
    "does not attribute an old confirmed release to a new %s, while retaining its site link",
    async (change) => {
      const secondSiteId = "22222222-2222-4222-8222-222222222222";
      vi.mocked(lerEstado).mockResolvedValue({
        ...state,
        sites: [
          {
            ...state.sites[0],
            dominios: [
              ...state.sites[0].dominios,
              { hostname: "other.example.com", principal: false },
            ],
          },
          { ...state.sites[0], id: secondSiteId, nome: "Outro site" },
        ],
      } as EstadoDaTela);
      const view = render(<Harness />);
      await submitPackage();
      vi.mocked(lerEstado).mockResolvedValue(activeRelease());
      fireEvent.click(
        screen.getByRole("button", { name: "Verificar publicação" }),
      );
      await screen.findByText("Confirmado na VPS");

      if (change === "package")
        view.rerender(
          <Harness
            prepared={{ ...zip, file: new File(["next package"], "next.zip") }}
          />,
        );
      else if (change === "domain")
        fireEvent.change(
          screen.getByRole("combobox", { name: "Domínio do site selecionado" }),
          { target: { value: "other.example.com" } },
        );
      else if (change === "destination")
        fireEvent.change(
          screen.getByRole("combobox", { name: "Site que receberá o ZIP" }),
          { target: { value: secondSiteId } },
        );
      else view.rerender(<Harness path="/outra-pagina" />);

      expect(screen.queryByText("Confirmado na VPS")).toBeNull();
      expect(
        screen.queryByText(/Versão confirmada pelo agente e ativa/),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Verificar publicação" }),
      ).toBeNull();
      expect(
        screen
          .getByRole("link", { name: "Ver versão anterior em Site principal" })
          .getAttribute("href"),
      ).toBe(`/servidor/sites/${siteId}`);
      expect(enviarZip).toHaveBeenCalledTimes(1);
    },
  );

  it("shows an upload in progress and does not confirm the package before the server responds", async () => {
    let finish!: (value: Awaited<ReturnType<typeof enviarZip>>) => void;
    vi.mocked(enviarZip).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<Harness />);
    await chooseSite();
    expect(publicationStatus().textContent).toContain("Pronto para revisar");
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    expect(publicationStatus().textContent).toContain("Enviando ZIP…");
    expect(screen.queryByText("Confirmado na VPS")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Enviando ZIP…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      finish({
        ok: true,
        versao: { id: "release-new" },
        tarefa: {},
        avisos: [],
      } as unknown as Awaited<ReturnType<typeof enviarZip>>);
    });
    expect(publicationStatus().textContent).toContain(
      "Aguardando agente da VPS",
    );
  });

  it("does not apply a late check response to a replacement package", async () => {
    const view = render(<Harness />);
    await submitPackage();
    let finish!: (value: EstadoDaTela) => void;
    vi.mocked(lerEstado).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar publicação" }),
    );
    expect(publicationStatus().textContent).toContain("Conferindo publicação…");
    view.rerender(
      <Harness
        prepared={{ ...zip, file: new File(["new package"], "new.zip") }}
      />,
    );
    expect(publicationStatus().textContent).toContain(
      "Concluindo operação anterior…",
    );
    await act(async () => finish(activeRelease()));
    expect(publicationStatus().textContent).toContain("Pronto para revisar");
    expect(screen.queryByText("Confirmado na VPS")).toBeNull();
    expect(
      screen.queryByText(/Versão confirmada pelo agente e ativa/),
    ).toBeNull();
  });

  it("reports agent failure and clears the former waiting message", async () => {
    render(<Harness />);
    await submitPackage();
    vi.mocked(lerEstado).mockResolvedValue({
      ...state,
      site: {
        servidorInforma: null,
        versoes: [
          {
            id: "release-new",
            estado: "falhou",
            ativa: false,
            erro: "Falha ao aplicar o pacote.",
          },
        ],
      },
    } as unknown as EstadoDaTela);
    fireEvent.click(
      screen.getByRole("button", { name: "Verificar publicação" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao aplicar o pacote",
    );
    expect(publicationStatus().textContent).toContain("Ação não concluída");
    expect(screen.queryByText(/ZIP enviado\. Aguardando o agente/)).toBeNull();
    expect(screen.queryByText("Confirmado na VPS")).toBeNull();
  });

  it("retains the previous site link when uploading a replacement package is refused", async () => {
    const view = render(<Harness />);
    await submitPackage();
    view.rerender(
      <Harness prepared={{ ...zip, file: new File(["next"], "next.zip") }} />,
    );
    vi.mocked(enviarZip).mockResolvedValue({
      ok: false,
      mensagem: "O novo pacote foi recusado.",
      codigo: null,
      problemas: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Revisar publicação" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar substituição e enviar" }),
    );
    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("link", { name: "Ver versão anterior em Site principal" })
        .getAttribute("href"),
    ).toBe(`/servidor/sites/${siteId}`);
    expect(screen.queryByText("Confirmado na VPS")).toBeNull();
  });
});

describe("complete funnel package preparation", () => {
  it("prepares locally and invalidates the review and warnings when its domain changes", async () => {
    render(
      <FunnelSitePublisher data={funnel} storageId="user" onClose={vi.fn()} />,
    );
    expect(screen.getByText("Rascunho — prepare o pacote")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Domínio do site na VPS" }),
      { target: { value: "loja.example.com" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preparar ZIP único (até 3 MB)" }),
    );
    await screen.findByText("ZIP pronto para revisão");
    expect(exportFunnelSite).toHaveBeenCalledWith(
      funnel,
      "user",
      "loja.example.com",
    );
    expect(
      screen.getByRole("region", { name: "Revisão do site" }),
    ).toBeTruthy();
    expect(screen.getByText("Aviso do pacote preparado")).toBeTruthy();
    expect(enviarZip).not.toHaveBeenCalled();
    expect(lerEstado).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Domínio do site na VPS" }),
      { target: { value: "novo.example.com" } },
    );
    expect(screen.getByText("Preparação desatualizada")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Revisão do site" }),
    ).toBeNull();
    expect(screen.queryByText("Aviso do pacote preparado")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Revisar publicação",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("rejects a preparation completed after the funnel changed", async () => {
    let finish!: (value: Awaited<ReturnType<typeof exportFunnelSite>>) => void;
    vi.mocked(exportFunnelSite).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(
      <FunnelSitePublisher data={funnel} storageId="user" onClose={vi.fn()} />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Domínio do site na VPS" }),
      { target: { value: "loja.example.com" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preparar ZIP único (até 3 MB)" }),
    );
    await waitFor(() => expect(exportFunnelSite).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("status", { name: "Estado da preparação" }).textContent,
    ).toContain("Conferindo arquivos e ligações");
    view.rerender(
      <FunnelSitePublisher
        data={{ ...funnel, nome: "Funil alterado" }}
        storageId="user"
        onClose={vi.fn()}
      />,
    );
    await act(async () => finish(exported));
    expect(screen.getByText("Falha na preparação")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "O funil ou o domínio mudou",
    );
    expect(
      screen.queryByRole("region", { name: "Revisão do site" }),
    ).toBeNull();
    expect(enviarZip).not.toHaveBeenCalled();
  });
});
