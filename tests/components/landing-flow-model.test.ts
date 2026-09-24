import { describe, expect, it } from "vitest";
import {
  connectPages,
  createFlowPage,
  createFlowTemplate,
  FLOW_LIMITS,
  FLOW_TEMPLATE_LABELS,
  INITIAL_FLOW,
  PAGE_KIND_LABELS,
  parseFlow,
  removeFlowPage,
  validateDestinationUrl,
  type FlowPage,
  type FlowTemplateKind,
  type LandingFlow,
  type PageKind,
} from "@/features/landing-editor/flow-model";

const draft = (): LandingFlow => JSON.parse(JSON.stringify(INITIAL_FLOW));

describe("store and funnel templates", () => {
  it.each(Object.keys(FLOW_TEMPLATE_LABELS) as FlowTemplateKind[])(
    "creates a valid, explicitly simulated %s template without destinations",
    (kind) => {
      const template = createFlowTemplate(kind);
      expect(template.version).toBe(1);
      expect(template.name).toContain("simulação");
      expect(parseFlow(template)).toEqual(template);
      expect(parseFlow(JSON.stringify(template))).toEqual(template);
      for (const page of template.pages) {
        expect(page.url).toBe("");
        expect(page.imageUrl).toBe("");
        expect(page.headline).toContain("rascunho");
        expect(page.description).toContain("simulação");
        expect(page.id).toMatch(new RegExp(`^template-${kind}-`));
        expect(page.x).toBeGreaterThanOrEqual(0);
        expect(page.x).toBeLessThanOrEqual(2000);
        expect(page.y).toBeGreaterThanOrEqual(0);
        expect(page.y).toBeLessThanOrEqual(2000);
      }
      expect(
        template.connections.every((edge) => edge.label.includes("simulação")),
      ).toBe(true);
      const ids = [...template.pages, ...template.connections].map(
        (item) => item.id,
      );
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("keeps the original three-page version1 draft unchanged and readable", () => {
    const before = JSON.stringify(INITIAL_FLOW);
    const template = createFlowTemplate("basic");
    expect(template.pages.map((page) => page.kind)).toEqual([
      "landing",
      "checkout",
      "thank-you",
    ]);
    expect(template.pages.map(({ x, y }) => [x, y])).toEqual([
      [60, 120],
      [420, 260],
      [780, 120],
    ]);
    expect(template.connections).toHaveLength(2);
    expect(JSON.stringify(INITIAL_FLOW)).toBe(before);
    expect(parseFlow(before)).toEqual(INITIAL_FLOW);
    expect(INITIAL_FLOW.pages.map((page) => page.id)).toEqual([
      "page-landing",
      "page-checkout",
      "page-thank-you",
    ]);
  });

  it("builds the seven-stage store chain from home to thank-you", () => {
    const flow = createFlowTemplate("store");
    const kinds: PageKind[] = [
      "home",
      "collection",
      "category",
      "product",
      "cart",
      "checkout",
      "thank-you",
    ];
    expect(flow.pages.map((page) => page.kind)).toEqual(kinds);
    expect(flow.connections).toHaveLength(6);
    expect(
      flow.connections.map((edge) => [
        flow.pages.find((page) => page.id === edge.source)?.kind,
        flow.pages.find((page) => page.id === edge.target)?.kind,
      ]),
    ).toEqual(
      kinds.slice(0, -1).map((kind, index) => [kind, kinds[index + 1]]),
    );
  });

  it("offers explicit acceptance and rejection branches in the six-page upsell model", () => {
    const flow = createFlowTemplate("upsell");
    expect(flow.pages.map((page) => page.kind)).toEqual([
      "landing",
      "product",
      "checkout",
      "upsell",
      "downsell",
      "thank-you",
    ]);
    expect(flow.connections).toHaveLength(6);
    const id = (kind: PageKind) =>
      flow.pages.find((page) => page.kind === kind)!.id;
    expect(flow.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: id("product"),
          target: id("checkout"),
        }),
        expect.objectContaining({
          source: id("checkout"),
          target: id("upsell"),
        }),
        expect.objectContaining({
          source: id("upsell"),
          target: id("thank-you"),
          label: "Aceitou a oferta (simulação)",
        }),
        expect.objectContaining({
          source: id("upsell"),
          target: id("downsell"),
          label: "Recusou a oferta (simulação)",
        }),
        expect.objectContaining({
          source: id("downsell"),
          target: id("thank-you"),
          label: "Continuar (simulação)",
        }),
      ]),
    );
    expect(
      connectPages(flow, id("thank-you"), id("product"), "Retornar").error,
    ).toContain("ciclo");
    flow.connections.push({
      id: "back-edge",
      source: id("thank-you"),
      target: id("upsell"),
      label: "Voltar",
    });
    expect(parseFlow(flow)).toBeNull();
  });

  it.each(Object.keys(FLOW_TEMPLATE_LABELS) as FlowTemplateKind[])(
    "returns independent copies with stable IDs for %s",
    (kind) => {
      const first = createFlowTemplate(kind);
      const second = createFlowTemplate(kind);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(first.pages[0]).not.toBe(second.pages[0]);
      expect(first.connections[0]).not.toBe(second.connections[0]);
      first.pages[0].headline = "Edição de teste";
      first.connections[0].label = "Edição de teste";
      expect(createFlowTemplate(kind)).toEqual(second);
      expect(INITIAL_FLOW.pages[0].headline).toContain("rascunho");
    },
  );

  it("rejects unknown template names at runtime", () => {
    expect(() => createFlowTemplate("unknown" as FlowTemplateKind)).toThrow(
      "Modelo de fluxo inválido",
    );
  });
});

describe("landing flow destinations", () => {
  it.each([
    "https://example.com",
    "http://localhost:3100/checkout",
    "HTTPS://EXAMPLE.COM/path?q=yes#checkout",
    "/",
    "/checkout?offer=1#payment",
    "/produto/edi%C3%A7%C3%A3o",
    "https://example.com/%F0%9F%9A%80",
    "https://example.com/a%20b",
    "https://example.com/?ref=hello%40example.com",
  ])(
    "accepts safe HTTP(S) and single-slash internal destinations: %s",
    (url) => {
      expect(validateDestinationUrl(url)).toBe(true);
    },
  );

  it.each([
    "",
    " ",
    "https://",
    "example.com",
    "checkout",
    "#checkout",
    "?offer=1",
    "//example.com",
    "///example.com",
    "/\\example.com",
    "\\example.com",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,hello",
    "vbscript:msgbox(1)",
    "file:///tmp/example",
    "blob:https://example.com/id",
    "ftp://example.com",
    "mailto:hello@example.com",
    "https:example.com",
    " https://example.com",
    "https://example.com ",
    "https://example.com/a b",
    "https://user:password@example.com",
    "https://user@example.com",
    "https://@example.com",
    "https://user%40host@example.com",
    "https://example.com\\@evil.com",
    "https://example.com/\ncheckout",
    "https://example.com/\rcheckout",
    "https://example.com/\u0000",
    "https://example.com/\u007f",
    "/\u009f",
    "/%2fexample.com",
    "/%2F%2fexample.com",
    "/%5Cexample.com",
    "/hello%0aworld",
    "/hello%00world",
    "/hello%7fworld",
    "/hello%5cworld",
    "/broken%escape",
    "https://example.com/%FF",
    "/" + "x".repeat(FLOW_LIMITS.url),
  ])("rejects unsafe or incomplete destinations: %s", (url) => {
    expect(validateDestinationUrl(url)).toBe(false);
  });
});

describe("landing flow validation", () => {
  it("starts with three draft pages, empty destinations and two real connections", () => {
    expect(INITIAL_FLOW.pages.map((page) => page.name)).toEqual([
      "Landing page",
      "Checkout",
      "Obrigado",
    ]);
    expect(INITIAL_FLOW.pages.map(({ x, y }) => [x, y])).toEqual([
      [60, 120],
      [420, 260],
      [780, 120],
    ]);
    expect(
      INITIAL_FLOW.pages.every(
        (page) =>
          page.url === "" &&
          page.imageUrl === "" &&
          page.headline.includes("rascunho"),
      ),
    ).toBe(true);
    expect(INITIAL_FLOW.connections).toHaveLength(2);
    expect(parseFlow(INITIAL_FLOW)).toEqual(INITIAL_FLOW);
  });

  it.each(Object.keys(PAGE_KIND_LABELS) as PageKind[])(
    "creates unique draft pages for %s",
    (kind) => {
      const a = createFlowPage(kind, 3);
      const b = createFlowPage(kind, 3);
      expect(a.id).not.toBe(b.id);
      expect(a.kind).toBe(kind);
      expect(a.name).toContain(PAGE_KIND_LABELS[kind]);
      expect(a.url).toBe("");
      expect(
        parseFlow({
          version: 1,
          name: "Teste",
          pages: [a, b],
          connections: [],
        }),
      ).not.toBeNull();
    },
  );

  it("bounds creation positions even for malformed index inputs", () => {
    for (const index of [-100, NaN, Infinity, 9999, 2.5]) {
      const page = createFlowPage("landing", index);
      expect(page.x).toBeGreaterThanOrEqual(0);
      expect(page.x).toBeLessThanOrEqual(2000);
      expect(page.y).toBeGreaterThanOrEqual(0);
      expect(page.y).toBeLessThanOrEqual(2000);
    }
  });

  it("reads JSON text and returns independent objects without unknown fields", () => {
    const input = {
      ...draft(),
      extra: "discard",
      pages: draft().pages.map((page) => ({ ...page, extra: "discard" })),
    };
    const result = parseFlow(JSON.stringify(input))!;
    expect(result).toEqual(INITIAL_FLOW);
    result.pages[0].name = "Alterado";
    expect(INITIAL_FLOW.pages[0].name).toBe("Landing page");
    expect(result.pages[0]).not.toHaveProperty("extra");
  });

  it("allows an empty board and optional draft content", () => {
    expect(
      parseFlow({ version: 1, name: "Vazio", pages: [], connections: [] }),
    ).not.toBeNull();
    const flow = draft();
    Object.assign(flow.pages[0], {
      headline: "",
      description: "",
      buttonLabel: "",
    });
    expect(parseFlow(flow)).not.toBeNull();
  });

  it("clamps finite canvas coordinates without modifying the input", () => {
    const flow = draft();
    flow.pages[0].x = -15;
    flow.pages[0].y = 8000;
    expect(parseFlow(flow)?.pages[0]).toMatchObject({ x: 0, y: 2000 });
    expect(flow.pages[0]).toMatchObject({ x: -15, y: 8000 });
  });

  it.each([
    null,
    undefined,
    [],
    1,
    true,
    "not json",
    "null",
    {},
    { ...INITIAL_FLOW, version: 2 },
    { ...INITIAL_FLOW, name: "" },
    { ...INITIAL_FLOW, name: "x".repeat(121) },
  ])("rejects malformed envelopes %#", (raw) => {
    expect(parseFlow(raw)).toBeNull();
  });

  it.each([
    ["kind", "other"],
    ["kind", "__proto__"],
    ["id", ""],
    ["id", "has spaces"],
    ["name", ""],
    ["name", "x".repeat(121)],
    ["headline", "x".repeat(241)],
    ["description", "x".repeat(2001)],
    ["buttonLabel", "x".repeat(81)],
    ["url", "javascript:alert(1)"],
    ["imageUrl", "data:image/svg+xml,<svg />"],
    ["x", NaN],
    ["x", Infinity],
    ["y", -Infinity],
    ["x", "100"],
  ])("rejects malformed page %s", (key, value) => {
    const flow = draft();
    Object.assign(flow.pages[0], { [key as string]: value });
    expect(parseFlow(flow)).toBeNull();
  });

  it("rejects duplicate page IDs and oversized page lists", () => {
    const flow = draft();
    flow.pages[1].id = flow.pages[0].id;
    expect(parseFlow(flow)).toBeNull();
    flow.pages = Array.from({ length: 21 }, (_, i) => ({
      ...INITIAL_FLOW.pages[0],
      id: `page-${i}`,
    }));
    flow.connections = [];
    expect(parseFlow(flow)).toBeNull();
  });

  it("accepts exactly 20 pages and 40 distinct acyclic connections", () => {
    const flow: LandingFlow = {
      version: 1,
      name: "Limites",
      pages: Array.from({ length: 20 }, (_, i) => ({
        ...INITIAL_FLOW.pages[0],
        id: `page-${i}`,
      })),
      connections: [],
    };
    for (
      let source = 0;
      source < 20 && flow.connections.length < 40;
      source++
    ) {
      for (
        let target = source + 1;
        target < 20 && flow.connections.length < 40;
        target++
      ) {
        flow.connections.push({
          id: `edge-${source}-${target}`,
          source: `page-${source}`,
          target: `page-${target}`,
          label: "",
        });
      }
    }
    expect(parseFlow(flow)).not.toBeNull();
    flow.connections.push({
      id: "extra",
      source: "page-18",
      target: "page-19",
      label: "",
    });
    expect(parseFlow(flow)).toBeNull();
  });

  it.each([
    { source: "missing" },
    { target: "missing" },
    { source: "page-checkout" },
    { id: "connection-thanks" },
    { id: "page-landing" },
    { label: "x".repeat(101) },
  ])("rejects invalid connection %#", (change) => {
    const flow = draft();
    Object.assign(flow.connections[0], change);
    expect(parseFlow(flow)).toBeNull();
  });

  it("rejects duplicate pairs and indirect cycles regardless of edge order", () => {
    const flow = draft();
    flow.connections.push({ ...flow.connections[0], id: "duplicate-pair" });
    expect(parseFlow(flow)).toBeNull();
    flow.connections.pop();
    flow.connections.push({
      id: "cycle",
      source: "page-thank-you",
      target: "page-landing",
      label: "",
    });
    expect(parseFlow(flow)).toBeNull();
    flow.connections.reverse();
    expect(parseFlow(flow)).toBeNull();
  });
});

describe("landing flow graph operations", () => {
  it("adds an acyclic connection without mutating the input", () => {
    const flow = draft();
    const result = connectPages(
      flow,
      "page-landing",
      "page-thank-you",
      "Pular checkout",
    );
    expect(result.error).toBeUndefined();
    expect(result.flow.connections).toHaveLength(3);
    expect(flow.connections).toHaveLength(2);
    expect(parseFlow(result.flow)).not.toBeNull();
  });

  it.each([
    ["missing", "page-checkout"],
    ["page-landing", "missing"],
    ["page-landing", "page-landing"],
    ["page-landing", "page-checkout"],
    ["page-thank-you", "page-landing"],
  ])("rejects invalid connection from %s to %s", (source, target) => {
    const flow = draft();
    const result = connectPages(flow, source, target, "Continuar");
    expect(result.error).toBeTruthy();
    expect(result.flow).toBe(flow);
  });

  it("rejects oversized labels and malformed input flows", () => {
    const flow = draft();
    expect(
      connectPages(flow, "page-landing", "page-thank-you", "x".repeat(101))
        .error,
    ).toBeTruthy();
    flow.pages[0].url = "javascript:alert(1)";
    expect(
      connectPages(flow, "page-landing", "page-thank-you", "").error,
    ).toBeTruthy();
  });

  it("removes all incident edges and preserves unrelated pages", () => {
    const flow = draft();
    const result = removeFlowPage(flow, "page-checkout");
    expect(result.pages.map((page: FlowPage) => page.id)).toEqual([
      "page-landing",
      "page-thank-you",
    ]);
    expect(result.connections).toEqual([]);
    expect(flow.pages).toHaveLength(3);
    expect(flow.connections).toHaveLength(2);
    expect(parseFlow(result)).not.toBeNull();
    expect(removeFlowPage(flow, "missing")).toEqual(flow);
  });
});
