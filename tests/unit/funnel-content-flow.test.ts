import { describe, expect, it } from "vitest";
import { contentFlowForPage } from "@/features/funnel/content-flow";
import { paginaVazia, type FunnelData } from "@/features/funnel/funnel-model";
import { parseFlow } from "@/features/landing-editor/flow-model";

const data = (): FunnelData => ({ id: "f1", nome: "Campanha", projeto: "Loja", nodes: [
  { id: "landing", type: "sales", title: "Oferta", headline: "Oferta real", descricao: "Descrição", buttonLabel: "Comprar", x: 20, y: 30, pagina: { ...paginaVazia(), dominio: "loja.example", caminho: "/oferta" } },
  { id: "checkout", type: "checkout", title: "Pagamento", x: 50, y: 70, pagina: { ...paginaVazia(), dominio: "pay.example", caminho: "checkout" } },
  { id: "thanks", type: "thanks", title: "Obrigado", x: 80, y: 100, url: "https://loja.example/obrigado" },
], edges: [{ id: "e1", source: "landing", target: "checkout", rotulo: "Comprar agora" }] });

describe("conteúdo ligado à mesma página do quadro", () => {
  it("keeps identity, content and canonical destinations without changing board data", () => {
    const board = data();
    const before = JSON.stringify(board);
    const flow = contentFlowForPage(board, "landing");
    expect(parseFlow(flow)).toEqual(flow);
    expect(flow.pages[0]).toMatchObject({ id: "landing", headline: "Oferta real", buttonLabel: "Comprar" });
    expect(flow.pages[1]).toMatchObject({ id: "checkout", kind: "checkout", url: "https://pay.example/checkout" });
    expect(flow.connections[0]).toMatchObject({ source: "landing", target: "checkout", label: "Comprar agora" });
    expect(JSON.stringify(board)).toBe(before);
  });
  it("explicit named outputs override diagram edges and support manual URLs", () => {
    const board = data();
    board.nodes[0].pagina!.saidas = { aceitar: { etapaId: "thanks" }, recusar: { url: "https://loja.example/alternativa" } };
    const flow = contentFlowForPage(board, "landing");
    expect(parseFlow(flow)).not.toBeNull();
    expect(flow.connections.map((item) => item.label)).toEqual(["aceitar", "recusar"]);
    expect(flow.pages.some((item) => item.id === "checkout")).toBe(false);
  });
  it("supports distinct named buttons going to the same destination", () => {
    const board = data();
    board.nodes[0].pagina!.saidas = { comprar: { etapaId: "checkout" }, continuar: { etapaId: "checkout" } };
    const flow = contentFlowForPage(board, "landing");
    expect(parseFlow(flow)).not.toBeNull();
    expect(flow.connections).toHaveLength(2);
    expect(flow.pages.slice(1).every((page) => page.url === "https://pay.example/checkout")).toBe(true);
  });
  it("rejects missing targets and unsafe manual addresses, without using a stale URL", () => {
    const board = data();
    board.nodes[0].pagina!.saidas = { comprar: { etapaId: "deleted" } };
    expect(() => contentFlowForPage(board, "landing")).toThrow(/removido/);
    board.nodes[0].pagina!.saidas = { comprar: { url: "javascript:alert(1)" } };
    expect(() => contentFlowForPage(board, "landing")).toThrow(/válido/);
    board.nodes[0].pagina!.saidas = {};
    board.nodes[1].pagina!.dominio = "bad.example/hidden/path";
    board.nodes[1].url = "https://old.example/";
    expect(contentFlowForPage(board, "landing").pages[1].url).toBe("");
  });
  it("does not invent a destination from a block title", () => {
    const board = data();
    delete board.nodes[1].pagina;
    expect(contentFlowForPage(board, "landing").pages[1].url).toBe("");
  });
});
