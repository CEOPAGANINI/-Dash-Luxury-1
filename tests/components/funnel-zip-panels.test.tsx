import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagePublisher } from "@/features/funnel/page-publisher";
import { StorePanel } from "@/features/funnel/store-panel";
import { paginaVazia, type FunnelNode } from "@/features/funnel/funnel-model";
import { preparePageZip } from "@/features/funnel/page-zip";

vi.mock("@/features/funnel/page-zip", () => ({
  preparePageZip: vi.fn(),
  forgetPreparedPageZip: vi.fn(),
}));
vi.mock("@/features/funnel/use-page-zip", () => ({ usePageZip: () => null }));
vi.mock("@/features/funnel/page-vps-publisher", () => ({
  PageVpsPublisher: () => <div>Publicação exige confirmação</div>,
}));
vi.mock("@/features/funnel/page-metrics-tab", () => ({
  MetricasAba: () => null,
}));
vi.mock("@/features/funnel/speed-test", () => ({ SpeedTest: () => null }));

const change = vi.fn();
const file = new File(["bad data"], "renamed.zip");
const metadata = { nome: "old.zip", tamanho: 100, ok: true };
beforeEach(() => {
  change.mockReset();
  vi.mocked(preparePageZip)
    .mockReset()
    .mockRejectedValue(new Error("ZIP inválido ou incompleto."));
});
afterEach(cleanup);

describe("funnel page and product ZIP panels", () => {
  it("shows the same canonical address as the board without lowercasing the path or doubling HTTPS", () => {
    const view = render(
      <PagePublisher
        storageId="user"
        funnelId="flow"
        nodeId="page"
        nome="Oferta"
        dados={{
          ...paginaVazia(),
          dominio: "https://example.com",
          caminho: "Oferta",
        }}
        onNome={vi.fn()}
        onChange={change}
        proximasEtapas={[]}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByTitle("https://example.com/Oferta")).toBeTruthy();
    view.rerender(
      <PagePublisher
        storageId="user"
        funnelId="flow"
        nodeId="page"
        nome="Oferta"
        dados={{
          ...paginaVazia(),
          dominio: "example.com",
          caminho: "//external.example",
        }}
        onNome={vi.fn()}
        onChange={change}
        proximasEtapas={[]}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByTitle("— endereço inválido")).toBeTruthy();
    expect(screen.queryByText("Caminho válido")).toBeNull();
  });
  it("does not show saved metadata as ready and exposes the linked content editor", () => {
    const edit = vi.fn();
    render(
      <PagePublisher
        storageId="user"
        funnelId="flow"
        nodeId="page"
        nome="Oferta"
        dados={{ ...paginaVazia(), zip: metadata }}
        onNome={vi.fn()}
        onChange={change}
        proximasEtapas={[]}
        onFechar={vi.fn()}
        onEditarConteudo={edit}
      />,
    );
    expect(screen.getByText("Rascunho")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Conteúdo" }));
    expect(
      screen.getByText(/Arquivos indisponíveis — anexe novamente/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Editar conteúdo e preparar ZIP desta página",
      }),
    );
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("validates the page File with its identity and preserves old metadata on failure", async () => {
    render(
      <PagePublisher
        storageId="user"
        funnelId="flow"
        nodeId="page"
        nome="Oferta"
        dados={{ ...paginaVazia(), zip: metadata }}
        onNome={vi.fn()}
        onChange={change}
        proximasEtapas={[]}
        onFechar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Conteúdo" }));
    fireEvent.change(screen.getByLabelText("ZIP da página"), {
      target: { files: [file] },
    });
    await screen.findByRole("alert");
    expect(preparePageZip).toHaveBeenCalledWith(
      { storageId: "user", funnelId: "flow", nodeId: "page" },
      file,
      { persist: true },
    );
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByText("old.zip")).toBeTruthy();
  });

  it("stores only prepared metadata after successful page validation", async () => {
    const result = {
      file,
      metadata: { nome: "normalized.zip", tamanho: 321, ok: true as const },
      fileCount: 2,
    };
    vi.mocked(preparePageZip).mockResolvedValue(result);
    render(
      <PagePublisher
        storageId="user"
        funnelId="flow"
        nodeId="page"
        nome="Oferta"
        dados={paginaVazia()}
        onNome={vi.fn()}
        onChange={change}
        proximasEtapas={[]}
        onFechar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Conteúdo" }));
    fireEvent.change(screen.getByLabelText("ZIP da página"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
    expect(change.mock.calls[0][0].zip).toEqual(result.metadata);
    expect(change.mock.calls[0][0].zip.file).toBeUndefined();
  });

  it("validates product ZIPs with a distinct product key and opens the complete site publisher", async () => {
    const publish = vi.fn();
    const node: FunnelNode = {
      id: "store",
      type: "store",
      title: "Loja",
      x: 0,
      y: 0,
      loja: {
        plataforma: "vps",
        moeda: "BRL",
        produtos: [
          {
            id: "product",
            nome: "Produto A",
            caminho: "/a",
            preco: 50,
            ativo: true,
            zip: metadata,
          },
        ],
      },
    };
    render(
      <StorePanel
        storageId="user"
        funnelId="flow"
        node={node}
        nodes={[node]}
        edges={[]}
        onNome={vi.fn()}
        onChange={change}
        onFechar={vi.fn()}
        onCriarCheckout={vi.fn()}
        onPublicarSite={publish}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publicar loja e funil" }),
    );
    expect(publish).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: /Produto A/ }));
    expect(
      screen.getByText(/Anexe novamente — o rascunho não contém os arquivos/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ZIP de Produto A"), {
      target: { files: [file] },
    });
    await screen.findByRole("alert");
    expect(preparePageZip).toHaveBeenCalledWith(
      {
        storageId: "user",
        funnelId: "flow",
        nodeId: "store",
        productId: "product",
      },
      file,
      { persist: true },
    );
    expect(change).not.toHaveBeenCalled();
  });
});
