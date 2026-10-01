import { describe, expect, it } from "vitest";
import {
  funnelNodeAddress,
  normalizeFunnelAddress,
  pageAddress,
  pageSettingsForNode,
} from "@/features/funnel/funnel-address";
import {
  destinosDosNos,
  enderecoDoNo,
} from "@/features/offer-router/funnel-link";
import type { FunnelNode } from "@/features/funnel/funnel-model";

const node: FunnelNode = {
  id: "offer",
  type: "page_v3",
  title: "Minha página",
  x: 0,
  y: 0,
  url: "/antiga",
};

describe("canonical funnel destinations", () => {
  it("joins a bare path to the configured domain with exactly one slash", () => {
    expect(pageAddress({ dominio: "Example.com", caminho: "oferta" })).toBe(
      "https://example.com/oferta",
    );
    expect(
      pageAddress({
        dominio: "https://example.com/",
        caminho: "/oferta?utm_source=meta#comprar",
      }),
    ).toBe("https://example.com/oferta?utm_source=meta#comprar");
    expect(
      pageAddress({ dominio: "http://localhost:3000", caminho: "/" }),
    ).toBe("http://localhost:3000/");
    expect(pageAddress({ caminho: "oferta" })).toBe("/oferta");
    expect(pageAddress({ caminho: "" })).toBe("/");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://example.com",
    "//evil.test",
    "/\\evil.test",
    "/oferta\nredirect",
    "/%0d%0aevil",
    "/%2fevil.test",
    "/%C2%80bad",
    "/bad%input",
    "https://user:password@example.com",
  ])("rejects unsafe address %s", (address) => {
    expect(normalizeFunnelAddress(address)).toBeNull();
  });

  it.each([
    "//evil.test",
    "https://evil.test",
    "javascript:alert(1)",
    "\\evil.test",
  ])("never treats a path %s as another origin", (caminho) => {
    expect(pageAddress({ dominio: "example.com", caminho })).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "ftp://evil.test",
    "https://example.com/other",
    "https://user:pass@example.com",
    "//example.com",
    "example.com?next=evil",
  ])("rejects invalid domain %s", (dominio) => {
    expect(pageAddress({ dominio, caminho: "/offer" })).toBeNull();
  });

  it("uses publisher settings for router destinations rather than a stale legacy URL", () => {
    const page = {
      ...node,
      pagina: {
        dominio: "venda.example.com",
        caminho: "produto",
        meta: {},
        saidas: {},
      },
    };
    expect(enderecoDoNo(page)).toBe("https://venda.example.com/produto");
    expect(destinosDosNos([page])[0].url).toBe(
      "https://venda.example.com/produto",
    );
  });

  it("uses store settings before page defaults or legacy URLs", () => {
    const store: FunnelNode = {
      ...node,
      type: "store",
      loja: {
        dominio: "shop.example.com",
        plataforma: "vps",
        moeda: "BRL",
        produtos: [],
      },
      pagina: { caminho: "/nova-pagina", meta: {}, saidas: {} },
    };
    expect(funnelNodeAddress(store)).toBe("https://shop.example.com/");
  });

  it("keeps valid legacy links but safely derives an unset page path", () => {
    expect(funnelNodeAddress(node)).toBe("/antiga");
    expect(funnelNodeAddress({ ...node, url: "negócios" })).toBe(
      "/minha-pagina",
    );
    expect(
      funnelNodeAddress({ ...node, url: "https://example.com/oferta" }),
    ).toBe("https://example.com/oferta");
  });

  it("preserves a legacy address when opening page settings or preparing its ZIP", () => {
    expect(pageSettingsForNode(node).caminho).toBe("/antiga");
    const external = pageSettingsForNode({
      ...node,
      url: "https://example.com/checkout?utm_source=meta#comprar",
    });
    expect(pageAddress(external)).toBe(
      "https://example.com/checkout?utm_source=meta#comprar",
    );
    expect(pageSettingsForNode({ ...node, url: undefined }).caminho).toBe(
      "/minha-pagina",
    );
  });

  it("does not offer invalid configured destinations with a misleading fallback", () => {
    const invalid = {
      ...node,
      pagina: {
        dominio: "https://user:pass@example.com",
        caminho: "/offer",
        meta: {},
        saidas: {},
      },
    };
    expect(funnelNodeAddress(invalid)).toBe("");
    expect(destinosDosNos([invalid])).toEqual([]);
  });
});
