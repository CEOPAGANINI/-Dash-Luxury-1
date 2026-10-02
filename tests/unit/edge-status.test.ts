import { describe, expect, it } from "vitest";
import { edgePreparation } from "@/features/funnel/edge-status";
import type { FunnelEdge, FunnelNode } from "@/features/funnel/funnel-model";

const source: FunnelNode = {
  id: "checkout",
  type: "checkout",
  title: "Checkout",
  headline: "Seu pedido",
  url: "/checkout",
  x: 0,
  y: 0,
};
const target: FunnelNode = {
  id: "thanks",
  type: "thanks",
  title: "Obrigado",
  headline: "Pedido confirmado",
  url: "/obrigado",
  x: 400,
  y: 0,
};
const connection: FunnelEdge = {
  id: "purchase",
  source: source.id,
  target: target.id,
};
const input = {
  source: source.id,
  target: target.id,
  nodes: [source, target],
  edges: [connection],
};

describe("wire configuration signal", () => {
  it("requires prepared content at both ends and identifies the incomplete side", () => {
    const pendingSource = edgePreparation({ ...input, targetZipReady: true });
    expect(pendingSource.ready).toBe(false);
    expect(pendingSource.reasons).toEqual(["Origem (Checkout): ZIP nesta aba"]);
    const pendingTarget = edgePreparation({ ...input, sourceZipReady: true });
    expect(pendingTarget.ready).toBe(false);
    expect(pendingTarget.reasons).toEqual([
      "Destino (Obrigado): ZIP nesta aba",
    ]);
    expect(
      edgePreparation({
        ...input,
        sourceZipReady: true,
        targetZipReady: true,
      }),
    ).toMatchObject({ ready: true, state: "ready", reasons: [] });
  });

  it("does not turn green from persisted ZIP metadata or a publication marker", () => {
    const saved = {
      ...target,
      pagina: {
        caminho: "/obrigado",
        meta: {},
        saidas: {},
        zip: { nome: "pagina.zip", tamanho: 123, ok: true },
      },
    };
    expect(
      edgePreparation({
        ...input,
        nodes: [source, saved],
        sourceZipReady: true,
      }),
    ).toMatchObject({ ready: false, state: "pending" });
  });

  it("keeps missing endpoints and unsafe addresses red even when ZIPs are ready", () => {
    expect(
      edgePreparation({ ...input, nodes: [source], sourceZipReady: true }),
    ).toMatchObject({
      ready: false,
      state: "error",
      reasons: [
        "Origem (Checkout): Destino inválido",
        "Destino não encontrado",
      ],
    });
    // A stale wire still refers to its original destination; both absence and
    // dangling configured outputs are retained by the real node checklist.
    const unsafe = { ...target, url: "javascript:alert(1)" };
    expect(
      edgePreparation({
        ...input,
        nodes: [source, unsafe],
        sourceZipReady: true,
        targetZipReady: true,
      }).state,
    ).toBe("error");
  });

  it("allows brand transit without inventing a ZIP checklist, but catches broken outputs", () => {
    const brand: FunnelNode = {
      id: "facebook",
      type: "brand",
      title: "Facebook",
      x: 0,
      y: 0,
    };
    const edge = { ...connection, source: brand.id };
    const transit = {
      ...input,
      source: brand.id,
      nodes: [brand, target],
      edges: [edge],
      targetZipReady: true,
    };
    expect(edgePreparation(transit).ready).toBe(true);
    expect(
      edgePreparation({
        ...transit,
        edges: [edge, { ...edge, id: "broken", target: "missing" }],
      }).state,
    ).toBe("error");
  });

  it("uses routing validation rather than treating every connected router as configured", () => {
    const router: FunnelNode = {
      id: "router",
      type: "redirect",
      title: "Roteador",
      x: 0,
      y: 0,
      redir: {
        regras: [
          {
            id: "regional",
            tipo: "regiao",
            paises: ["BR"],
            dispositivos: [],
            percentual: 100,
            destino: target.url!,
            destinoNoId: target.id,
            ativo: true,
          },
        ],
      },
    };
    const result = edgePreparation({
      ...input,
      source: router.id,
      nodes: [router, target],
      edges: [{ ...connection, source: router.id }],
      targetZipReady: true,
    });
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("Origem (Roteador): Regras exportáveis");
  });
});
