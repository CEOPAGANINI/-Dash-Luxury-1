import { describe, expect, it } from "vitest";
import {
  cloneFunnelGraph,
  parseFunnelClipboard,
  removeFunnelNodesGraph,
} from "@/features/funnel/funnel-graph";
import type { FunnelEdge, FunnelNode } from "@/features/funnel/funnel-model";

function fixture(): { nodes: FunnelNode[]; edges: FunnelEdge[] } {
  return {
    nodes: [
      {
        id: "redirect",
        type: "redirect",
        title: "Redirect",
        x: 10,
        y: 20,
        redir: {
          regras: [
            {
              id: "rule",
              tipo: "regiao",
              paises: ["BR"],
              dispositivos: [],
              percentual: 100,
              ativo: true,
              destino: "/oferta",
              destinoNoId: "offer",
              estilo: { forma: "livre", pontos: [{ x: 50, y: 60 }] },
            },
          ],
        },
      },
      {
        id: "page",
        type: "page_v3",
        title: "Página",
        x: 100,
        y: 200,
        pagina: {
          caminho: "/inicio",
          meta: {},
          saidas: {
            comprar: { etapaId: "offer" },
            manual: { url: "https://example.com/manual" },
          },
          backRedirect: {
            ligado: true,
            destinoEtapaId: "offer",
            url: "/oferta",
          },
        },
      },
      { id: "offer", type: "sales", title: "Oferta", x: 300, y: 400 },
    ],
    edges: [
      {
        id: "edge",
        source: "page",
        target: "offer",
        rotulo: "Comprou",
        estilo: {
          cor: "#fff",
          forma: "livre",
          tracejada: true,
          pontos: [{ x: 150, y: 250 }],
        },
      },
    ],
  };
}

const createId = (kind: "node" | "edge", id: string) => `${kind}-${id}-copy`;

describe("funnel clipboard graph", () => {
  it("rejects conflicting generated IDs instead of merging another node's destinations", () => {
    expect(() =>
      cloneFunnelGraph({
        ...fixture(),
        createId: () => "same",
        offset: { x: 0, y: 0 },
      }),
    ).toThrow(/Identificadores/);
    expect(() =>
      cloneFunnelGraph({
        ...fixture(),
        createId,
        offset: { x: 0, y: 0 },
        existingNodeIds: ["node-page-copy"],
      }),
    ).toThrow(/Identificadores/);
  });

  it("remaps every nested destination to the copied node, retaining edge metadata", () => {
    const input = fixture();
    const before = structuredClone(input);
    const copy = cloneFunnelGraph({
      ...input,
      createId,
      offset: { x: 40, y: -20 },
    });
    expect(copy.nodes[0].redir?.regras[0]).toMatchObject({
      destinoNoId: "node-offer-copy",
      ativo: true,
      estilo: { pontos: [{ x: 90, y: 40 }] },
    });
    expect(copy.nodes[1]).toMatchObject({
      id: "node-page-copy",
      x: 140,
      y: 180,
      pagina: {
        saidas: {
          comprar: { etapaId: "node-offer-copy" },
          manual: { url: "https://example.com/manual" },
        },
        backRedirect: { destinoEtapaId: "node-offer-copy", ligado: true },
      },
    });
    expect(copy.edges).toEqual([
      {
        id: "edge-edge-copy",
        source: "node-page-copy",
        target: "node-offer-copy",
        rotulo: "Comprou",
        estilo: {
          cor: "#fff",
          forma: "livre",
          tracejada: true,
          pontos: [{ x: 190, y: 230 }],
        },
      },
    ]);
    copy.nodes[1].pagina!.meta.titulo = "Alterado";
    copy.nodes[0].redir!.regras[0].paises.push("PT");
    expect(input).toEqual(before);
  });

  it("preserves external destinations only when they exist in the receiving board", () => {
    const { nodes, edges } = fixture();
    const copy = cloneFunnelGraph({
      nodes: nodes.slice(0, 2),
      edges,
      createId,
      offset: { x: 0, y: 0 },
      existingNodeIds: ["offer"],
    });
    expect(copy.nodes[0].redir?.regras[0].destinoNoId).toBe("offer");
    expect(copy.nodes[1].pagina?.saidas.comprar.etapaId).toBe("offer");
    expect(copy.nodes[1].pagina?.backRedirect?.destinoEtapaId).toBe("offer");
    expect(copy.edges[0].target).toBe("offer");
  });

  it("clears orphan destinations and stale URLs when pasting into a different board", () => {
    const { nodes, edges } = fixture();
    const copy = cloneFunnelGraph({
      nodes: nodes.slice(0, 2),
      edges,
      createId,
      offset: { x: 0, y: 0 },
    });
    const rule = copy.nodes[0].redir!.regras[0];
    expect(rule.destinoNoId).toBeUndefined();
    expect(rule.destino).toBe("");
    expect(rule.ativo).toBe(false);
    expect(copy.nodes[1].pagina?.saidas.comprar).toEqual({});
    expect(copy.nodes[1].pagina?.backRedirect).toEqual({ ligado: false });
    expect(copy.edges).toEqual([]);
  });

  it("does not retain a previous clone's nested object references", () => {
    const input = fixture();
    const first = cloneFunnelGraph({
      ...input,
      createId,
      offset: { x: 0, y: 0 },
    });
    const second = cloneFunnelGraph({
      ...input,
      createId,
      offset: { x: 100, y: 100 },
    });
    first.edges[0].estilo!.pontos![0].x = 999;
    expect(second.edges[0].estilo?.pontos?.[0].x).toBe(250);
  });

  it("deletes blocks without leaving nested destinations or mutating the original graph", () => {
    const input = fixture();
    const remaining = removeFunnelNodesGraph(input, ["offer"]);
    expect(remaining.nodes.map((node) => node.id)).toEqual([
      "redirect",
      "page",
    ]);
    expect(remaining.edges).toEqual([]);
    expect(remaining.nodes[0].redir?.regras[0]).toMatchObject({
      ativo: false,
      destino: "",
    });
    expect(remaining.nodes[0].redir?.regras[0].destinoNoId).toBeUndefined();
    expect(remaining.nodes[1].pagina?.saidas.comprar).toEqual({});
    expect(remaining.nodes[1].pagina?.backRedirect).toEqual({ ligado: false });
    expect(input.nodes[0].redir?.regras[0].destinoNoId).toBe("offer");
  });

  it("preserves receiver identity and nested references when unrelated blocks are removed", () => {
    const input = fixture();
    const remaining = removeFunnelNodesGraph(input, ["redirect"]);
    expect(remaining.edges).toEqual(input.edges);
    expect(remaining.nodes[0].pagina?.saidas.comprar).toEqual({
      etapaId: "offer",
    });
  });

  it("parses clipboard JSON while retaining a validated origin", () => {
    const input = { ...fixture(), originFunnelId: "funil-1" };
    expect(parseFunnelClipboard(input)).toEqual(input);
  });

  it.each([
    null,
    [],
    {},
    { nodes: {}, edges: [] },
    { nodes: [{ id: "x" }], edges: [] },
    {
      ...fixture(),
      edges: [{ id: "edge", source: "page", target: "missing" }],
    },
  ])("rejects malformed clipboard state without throwing", (input) => {
    expect(parseFunnelClipboard(input)).toBeNull();
  });
});
