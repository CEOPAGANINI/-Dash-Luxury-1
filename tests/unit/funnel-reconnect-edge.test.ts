import { describe, expect, it } from "vitest";
import { contentFlowForPage } from "@/features/funnel/content-flow";
import type {
  FunnelData,
  FunnelNode,
  PaginaSaida,
} from "@/features/funnel/funnel-model";
import {
  addFunnelEdge,
  reconnectFunnelEdge,
} from "@/features/funnel/reconnect-edge";
import { funilSemArquivosTemporarios } from "@/features/funnel/funnel-validation";

const page = (
  id: string,
  outputs: Record<string, PaginaSaida> = {},
): FunnelNode => ({
  id,
  type: "page_v3",
  title: id,
  x: 0,
  y: 0,
  pagina: {
    caminho: `/${id}`,
    dominio: "example.com",
    meta: {},
    saidas: outputs,
  },
});
const fixture = (): FunnelData => ({
  id: "funnel",
  nome: "Teste",
  projeto: "",
  nodes: [
    page("source", {
      Comprar: { etapaId: "old-target", url: "/stale-target" },
      Oferta: { etapaId: "old-target" },
      WhatsApp: { url: "https://example.com/whatsapp" },
      Outra: { etapaId: "other-target" },
    }),
    page("new-source", {
      Comprar: { url: "https://example.com/existing-manual" },
    }),
    page("old-target"),
    page("new-target"),
    page("other-target"),
  ],
  edges: [
    {
      id: "edge",
      source: "source",
      target: "old-target",
      rotulo: "Comprar",
      estilo: {
        cor: "#ff9900",
        forma: "livre",
        pontos: [{ x: 40, y: 70 }],
        fluxo: false,
      },
    },
  ],
});
const outputsOf = (data: { nodes: FunnelNode[] }, id: string) =>
  data.nodes.find((node) => node.id === id)!.pagina!.saidas;
const exportFlow = (data: FunnelData, node: string) =>
  contentFlowForPage(data, node);

describe("manual wire reconnection", () => {
  it("retargets all explicit outputs represented by a wire and exports the new destination while preserving other routes", () => {
    const input = fixture();
    const before = structuredClone(input);
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "source",
      target: "new-target",
      targetAnchor: { side: "top", offset: 0.2 },
    });
    expect(outputsOf(graph, "source")).toEqual({
      Comprar: { etapaId: "new-target" },
      Oferta: { etapaId: "new-target" },
      WhatsApp: { url: "https://example.com/whatsapp" },
      Outra: { etapaId: "other-target" },
    });
    const flow = exportFlow({ ...input, ...graph }, "source");
    expect(
      flow.pages.filter(
        (node) => node.url === "https://example.com/new-target",
      ),
    ).toHaveLength(2);
    expect(
      flow.pages.some((node) => node.url === "https://example.com/old-target"),
    ).toBe(false);
    expect(
      flow.pages.some((node) => node.url === "https://example.com/whatsapp"),
    ).toBe(true);
    expect(graph.edges[0].estilo).toMatchObject({
      cor: "#ff9900",
      forma: "livre",
      pontos: [{ x: 40, y: 70 }],
      fluxo: false,
      targetAnchor: { side: "top", offset: 0.2 },
    });
    expect(input).toEqual(before);
  });

  it("moves corresponding output names to a different source without overwriting that source's manual URLs", () => {
    const input = fixture();
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "new-source",
      target: "old-target",
      sourceAnchor: { side: "bottom", offset: 0.77 },
    });
    expect(outputsOf(graph, "source")).toEqual({
      WhatsApp: { url: "https://example.com/whatsapp" },
      Outra: { etapaId: "other-target" },
    });
    expect(outputsOf(graph, "new-source")).toEqual({
      Comprar: { url: "https://example.com/existing-manual" },
      "Comprar (2)": { etapaId: "old-target" },
      Oferta: { etapaId: "old-target" },
    });
    expect(graph.edges[0]).toMatchObject({
      source: "new-source",
      target: "old-target",
      rotulo: "Comprar (2)",
    });
    const newFlow = exportFlow({ ...input, ...graph }, "new-source");
    expect(newFlow.connections.map((connection) => connection.label)).toEqual([
      "Comprar",
      "Comprar (2)",
      "Oferta",
    ]);
    expect(
      exportFlow({ ...input, ...graph }, "source").pages.some(
        (node) => node.url === "https://example.com/old-target",
      ),
    ).toBe(false);
  });

  it("does not mutate explicit routes when moving only the anchor position", () => {
    const input = fixture();
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "source",
      target: "old-target",
      targetAnchor: { side: "right", offset: 1 },
    });
    expect(graph.nodes).toBe(input.nodes);
    expect(graph.edges[0].estilo?.targetAnchor).toEqual({
      side: "right",
      offset: 1,
    });
    expect(outputsOf(graph, "source").Comprar.url).toBe("/stale-target");
  });

  it("keeps the new wire represented when its new source already has unrelated explicit outputs", () => {
    const input = fixture();
    input.nodes[0].pagina!.saidas = {};
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "new-source",
      target: "new-target",
    });
    const flow = exportFlow({ ...input, ...graph }, "new-source");
    expect(outputsOf(graph, "new-source")).toEqual({
      Comprar: { url: "https://example.com/existing-manual" },
      "Comprar (2)": { etapaId: "new-target" },
    });
    expect(flow.pages.map((node) => node.url)).toContain(
      "https://example.com/new-target",
    );
  });

  it("uses graph destinations for a source without explicit outputs, including nodes without page settings", () => {
    const input = fixture();
    input.nodes[0].pagina!.saidas = {};
    input.nodes.push({
      id: "brand",
      type: "brand",
      title: "brand",
      x: 0,
      y: 0,
      url: "https://example.com/brand",
    });
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "brand",
      target: "new-target",
    });
    expect(graph.nodes).toBe(input.nodes);
    expect(exportFlow({ ...input, ...graph }, "brand").pages[1].url).toBe(
      "https://example.com/new-target",
    );
  });

  it("preserves synchronized output destinations and anchor/style metadata after JSON reload", () => {
    const input = fixture();
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "new-source",
      target: "old-target",
      sourceAnchor: { side: "top", offset: 0.125 },
    });
    const restored = funilSemArquivosTemporarios(
      JSON.parse(JSON.stringify({ ...input, ...graph })),
    );
    expect(restored.edges).toEqual(graph.edges);
    expect(outputsOf(restored, "new-source")).toEqual(
      outputsOf(graph, "new-source"),
    );
    expect(
      exportFlow(restored, "new-source").pages.map((node) => node.url),
    ).toContain("https://example.com/old-target");
  });

  it("rejects invalid or duplicate destinations atomically without changing the source's explicit outputs", () => {
    const input = fixture();
    input.edges.push({ id: "other", source: "source", target: "new-target" });
    expect(
      reconnectFunnelEdge(input, "edge", {
        source: "source",
        target: "new-target",
      }),
    ).toBe(input);
    expect(
      reconnectFunnelEdge(input, "edge", {
        source: "source",
        target: "source",
      }),
    ).toBe(input);
    expect(
      reconnectFunnelEdge(input, "edge", {
        source: "missing",
        target: "new-target",
      }),
    ).toBe(input);
  });

  it("stores a wire label as a literal output key without assigning an object prototype", () => {
    const input = fixture();
    input.nodes[0].pagina!.saidas = {};
    input.edges[0].rotulo = "__proto__";
    const graph = reconnectFunnelEdge(input, "edge", {
      source: "new-source",
      target: "new-target",
    });
    const outputs = outputsOf(graph, "new-source");
    expect(Object.hasOwn(outputs, "__proto__")).toBe(true);
    expect(outputs["__proto__"]).toEqual({ etapaId: "new-target" });
    expect(Object.getPrototypeOf(outputs)).toBeNull();
    expect({}).not.toHaveProperty("etapaId");
  });
});

describe("new manual wire", () => {
  it("exports and persists a new wire alongside explicit manual URLs without overwriting them", () => {
    const input = fixture();
    const graph = addFunnelEdge(input, {
      id: "new-edge",
      source: "new-source",
      target: "new-target",
      rotulo: "Comprar",
      estilo: {
        sourceAnchor: { side: "bottom", offset: 0.91 },
        targetAnchor: { side: "right", offset: 0.04 },
      },
    });
    expect(outputsOf(graph, "new-source")).toEqual({
      Comprar: { url: "https://example.com/existing-manual" },
      "Comprar (2)": { etapaId: "new-target" },
    });
    expect(graph.edges[1].rotulo).toBe("Comprar (2)");
    const persisted = funilSemArquivosTemporarios(
      JSON.parse(JSON.stringify({ ...input, ...graph })),
    );
    expect(
      exportFlow(persisted, "new-source").pages.map((node) => node.url),
    ).toEqual([
      "https://example.com/new-source",
      "https://example.com/existing-manual",
      "https://example.com/new-target",
    ]);
    expect(persisted.edges[1]).toEqual(graph.edges[1]);
    expect(input.edges).toHaveLength(1);
    expect(Object.keys(outputsOf(input, "new-source"))).toEqual(["Comprar"]);
  });

  it("preserves wire-only behavior when there are no explicit outputs", () => {
    const input = fixture();
    input.nodes[0].pagina!.saidas = {};
    const edge = { id: "new-edge", source: "source", target: "new-target" };
    const graph = addFunnelEdge(input, edge);
    expect(graph.nodes).toBe(input.nodes);
    expect(graph.edges[1]).toBe(edge);
    expect(
      exportFlow({ ...input, ...graph }, "source").pages.map(
        (node) => node.url,
      ),
    ).toContain("https://example.com/new-target");
  });

  it("does not duplicate an existing explicit destination or wire pair", () => {
    const input = fixture();
    const graph = addFunnelEdge(input, {
      id: "new-edge",
      source: "source",
      target: "other-target",
    });
    expect(graph.nodes).toBe(input.nodes);
    expect(outputsOf(graph, "source")).toBe(outputsOf(input, "source"));
    expect(
      addFunnelEdge(input, {
        id: "duplicate",
        source: "source",
        target: "old-target",
      }),
    ).toBe(input);
    expect(
      addFunnelEdge(input, {
        id: "edge",
        source: "new-source",
        target: "new-target",
      }),
    ).toBe(input);
    expect(
      addFunnelEdge(input, { id: "loop", source: "source", target: "source" }),
    ).toBe(input);
  });
});
