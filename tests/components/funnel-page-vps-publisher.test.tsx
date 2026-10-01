import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageVpsPublisher } from "@/features/funnel/page-vps-publisher";
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

beforeEach(() => {
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
    expect(lerEstado).toHaveBeenLastCalledWith({ siteId });
  });
});
