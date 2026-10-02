import { describe, expect, it } from "vitest";
import { nodePreparation } from "@/features/funnel/node-readiness";
import type { FunnelNode } from "@/features/funnel/funnel-model";

const page: FunnelNode = {
  id: "checkout",
  type: "checkout",
  title: "Checkout",
  x: 320,
  y: 0,
  url: "/checkout",
};
const router: FunnelNode = {
  id: "router",
  type: "redirect",
  title: "Roteador",
  x: 0,
  y: 0,
  redir: { regras: [] },
};

describe("editing preparation checklist", () => {
  it("rejects a fallback whose target exists but has an unsafe configured address", () => {
    const unsafe = { ...page, url: "javascript:alert(1)" };
    expect(
      nodePreparation(
        router,
        [router, unsafe],
        [{ id: "default", source: router.id, target: page.id }],
      ).state,
    ).toBe("error");
  });
  it("does not report a self redirect, ambiguous fallback or overallocated traffic as ready", () => {
    const rule = {
      id: "slice",
      tipo: "fatia" as const,
      paises: [],
      dispositivos: [],
      percentual: 100,
      destino: "/checkout",
      destinoNoId: page.id,
      ativo: true,
    };
    const self = {
      ...router,
      redir: { regras: [{ ...rule, destinoNoId: router.id }] },
    };
    expect(
      nodePreparation(
        self,
        [self, page],
        [{ id: "out", source: self.id, target: page.id }],
      ).state,
    ).toBe("error");
    const ambiguous = [
      { id: "out1", source: router.id, target: page.id },
      { id: "out2", source: router.id, target: page.id },
    ];
    expect(nodePreparation(router, [router, page], ambiguous).state).toBe(
      "pending",
    );
    const overloaded = {
      ...router,
      redir: { regras: [rule, { ...rule, id: "slice2", percentual: 1 }] },
    };
    expect(
      nodePreparation(overloaded, [overloaded, page], [ambiguous[0]]).state,
    ).toBe("pending");
    const complete = { ...router, redir: { regras: [rule] } };
    expect(nodePreparation(complete, [complete, page], []).state).toBe("ready");
  });
  it("allows a router with no active rules to use a valid default without inventing a rule requirement", () => {
    expect(
      nodePreparation(
        router,
        [router, page],
        [{ id: "default", source: router.id, target: page.id }],
      ).state,
    ).toBe("ready");
    expect(nodePreparation(router, [router, page], []).label).toBe(
      "Em preparação",
    );
  });
  it("reports broken connections rather than saying the node is ready", () => {
    expect(
      nodePreparation(
        router,
        [router, page],
        [{ id: "broken", source: router.id, target: "missing" }],
      ).state,
    ).toBe("error");
  });
  it("does not treat saved ZIP metadata as a prepared file in this browser", () => {
    const thanks: FunnelNode = {
      ...page,
      type: "thanks",
      headline: "Pedido recebido",
    };
    expect(nodePreparation(thanks, [thanks], [], false).completed).toBe(3);
    expect(nodePreparation(thanks, [thanks], [], false).state).toBe("pending");
    expect(nodePreparation(thanks, [thanks], [], true).state).toBe("ready");
  });
  it("rejects a configured unsafe address without substituting a generated slug", () => {
    const unsafe = { ...page, url: "javascript:alert(1)" };
    expect(nodePreparation(unsafe, [unsafe], []).state).toBe("error");
  });
  it("keeps unsupported active rules pending even with a valid default destination", () => {
    const regional: FunnelNode = {
      ...router,
      redir: {
        regras: [
          {
            id: "geo",
            tipo: "regiao",
            paises: ["BR"],
            dispositivos: [],
            percentual: 100,
            destino: "/checkout",
            ativo: true,
          },
        ],
      },
    };
    const status = nodePreparation(
      regional,
      [regional, page],
      [{ id: "default", source: router.id, target: page.id }],
    );
    expect(status.state).toBe("pending");
    expect(
      status.items.find((item) => item.label === "Regras exportáveis")?.done,
    ).toBe(false);
  });
});
