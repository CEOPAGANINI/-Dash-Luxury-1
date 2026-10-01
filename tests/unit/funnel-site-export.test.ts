// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  configurePageHtml,
  exportFunnelSite,
  staticRoute,
} from "@/features/funnel/funnel-site-export";
import {
  forgetOtherUsersPageZips,
  preparePageZip,
} from "@/features/funnel/page-zip";
import { inspecionarZip } from "@/features/vps/pacote-zip";
import {
  staticRedirectHtml,
  assertNoRedirectCycles,
} from "@/features/funnel/static-redirect";
import type { FunnelData, FunnelNode } from "@/features/funnel/funnel-model";

function node(id: string, path: string): FunnelNode {
  return {
    id,
    type: "sales",
    title: id,
    headline: `Oferta ${id}`,
    x: 0,
    y: 0,
    pagina: { caminho: path, meta: {}, saidas: {} },
  };
}
function data(): FunnelData {
  return {
    id: "funil",
    nome: "Funil",
    projeto: "Loja",
    nodes: [
      node("home", "/"),
      node("upsell", "/upsell"),
      node("thanks", "/obrigado"),
    ],
    edges: [
      { id: "e1", source: "home", target: "upsell", rotulo: "Comprar" },
      { id: "e2", source: "upsell", target: "thanks", rotulo: "Continuar" },
    ],
  };
}
const zip = (files: Record<string, string>) =>
  new File(
    [
      Uint8Array.from(
        zipSync(
          Object.fromEntries(
            Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
          ),
        ),
      ).buffer,
    ],
    "site.zip",
  );
afterEach(() => forgetOtherUsersPageZips("cleanup"));

describe("one complete static funnel site", () => {
  it("exports all paths and assets together, with a root index accepted by the real VPS validator", async () => {
    const output = await exportFunnelSite(data(), "user", "example.com");
    const files = unzipSync(output.bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "index.html",
        "orbit-page.css",
        "upsell/index.html",
        "upsell/orbit-page.css",
        "obrigado/index.html",
      ]),
    );
    expect(new TextDecoder().decode(files["index.html"])).toContain(
      'href="/upsell/"',
    );
    expect(new TextDecoder().decode(files["upsell/index.html"])).toContain(
      'href="/obrigado/"',
    );
    expect(output.bytes.length).toBeLessThanOrEqual(3_000_000);
    expect(inspecionarZip(output.bytes).ok).toBe(true);
  });
  it("preserves imported layout and moves only known root-absolute assets into the page mount", async () => {
    const value = data();
    const prepared = await preparePageZip(
      { storageId: "user", funnelId: value.id, nodeId: "upsell" },
      zip({
        "index.html":
          '<html><head><link href="/assets/a.css" rel="stylesheet"></head><body><img src="/assets/a.png"><a data-saida="sim" href="#">Aceitar</a></body></html>',
        "assets/a.css": "body{color:#123}",
        "assets/a.png": "image",
      }),
    );
    value.nodes[1].pagina!.zip = { ...prepared.metadata, ok: false }; // Metadata after remount is never treated as a validated binary by itself.
    value.nodes[1].pagina!.saidas.sim = { etapaId: "thanks" };
    value.nodes[1].pagina!.meta.titulo = "Novo SEO";
    const output = await exportFunnelSite(value, "user", "example.com");
    const files = unzipSync(output.bytes);
    const content = new TextDecoder().decode(files["upsell/index.html"]);
    expect(content).toContain('href="/upsell/assets/a.css"');
    expect(content).toContain('src="/upsell/assets/a.png"');
    expect(content).toContain("<title>Novo SEO</title>");
    expect(content).toContain('"sim":"/obrigado/"');
    expect(output.warnings.join(" ")).not.toContain("Saída “sim”");
  });
  it("does not invent a replacement for a missing imported ZIP", async () => {
    const value = data();
    value.nodes[1].pagina!.zip = { nome: "lost.zip", tamanho: 100, ok: false };
    await expect(
      exportFunnelSite(value, "user", "example.com"),
    ).rejects.toThrow(/Reanexe|reanexe/);
  });
  it("rejects missing root, route collisions and asset collisions before publication", async () => {
    const missing = data();
    missing.nodes[0].pagina!.caminho = "/inicio";
    await expect(
      exportFunnelSite(missing, "user", "example.com"),
    ).rejects.toThrow(/página inicial/);
    const duplicate = data();
    duplicate.nodes[1].pagina!.caminho = "/";
    await expect(
      exportFunnelSite(duplicate, "user", "example.com"),
    ).rejects.toThrow(/Duas páginas/);
    const mixed = data();
    const packageFile = await preparePageZip(
      { storageId: "user", funnelId: mixed.id, nodeId: "home" },
      zip({
        "index.html": "<html>Home</html>",
        "upsell/index.html": "<html>Duplicado</html>",
      }),
    );
    mixed.nodes[0].pagina!.zip = packageFile.metadata;
    await expect(
      exportFunnelSite(mixed, "user", "example.com"),
    ).rejects.toThrow(/dois pacotes/);
  });
  it.each([
    "//evil.test/a",
    "/../outside",
    "/%2e%2e/x",
    "/a%2fb",
    "/a?x=1",
    "/a#b",
    "/index.html",
  ])("rejects ambiguous static route %s", (path) =>
    expect(() => staticRoute(path)).toThrow(),
  );
  it("escapes metadata and script configurations, rejects unsafe URLs and invalid tracking IDs", () => {
    const warnings: string[] = [];
    const html = configurePageHtml(
      "<html><head></head><body></body></html>",
      {
        caminho: "/",
        saidas: {},
        meta: {
          titulo: "</title><script>alert(1)</script>",
          ga4: "G-ABC1234",
          repassarUtm: true,
        },
      },
      { "</script><script>": "/obrigado" },
      "https://example.com/",
      warnings,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(warnings.join(" ")).toContain("após o visitante aceitar");
    const code = html.match(
      /<script data-orbit-funnel>([\s\S]*?)<\/script>/,
    )![1];
    expect(() => new Function(code)).not.toThrow(); // Syntax check only: never execute imported scripts.
    expect(() =>
      configurePageHtml(
        "",
        { caminho: "/", saidas: {}, meta: { metaPixel: '123\";alert(1)' } },
        {},
        "https://example.com/",
        [],
      ),
    ).toThrow(/Identificador/);
    expect(() =>
      configurePageHtml(
        "",
        { caminho: "/", saidas: {}, meta: {} },
        { sair: "javascript:alert(1)" },
        "https://example.com/",
        [],
      ),
    ).toThrow(/inválida/);
  });
  it("exports deterministic supported routing and blocks unavailable region rules and loops", () => {
    const value = data();
    const redir: FunnelNode = {
      id: "go",
      type: "redirect",
      title: "Router",
      url: "/go",
      x: 0,
      y: 0,
      redir: {
        regras: [
          {
            id: "r1",
            tipo: "fatia",
            percentual: 90,
            ativo: true,
            destino: "",
            destinoNoId: "home",
            dispositivos: [],
            paises: [],
          },
          {
            id: "r2",
            tipo: "fatia",
            percentual: 10,
            ativo: true,
            destino: "",
            destinoNoId: "thanks",
            dispositivos: [],
            paises: [],
          },
        ],
      },
    };
    value.nodes.push(redir);
    const html = staticRedirectHtml(
      value,
      redir,
      new Map([
        ["go", "/go"],
        ["home", "/"],
        ["thanks", "/obrigado"],
      ]),
      [],
    );
    const code = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(() => new Function(code)).not.toThrow();
    redir.redir!.regras[0].tipo = "regiao";
    expect(() =>
      staticRedirectHtml(value, redir, new Map([["go", "/go"]]), []),
    ).toThrow(/não podem ser executadas/);
    redir.redir!.regras[0].tipo = "fatia";
    redir.redir!.regras[0].destinoNoId = "go";
    expect(() => assertNoRedirectCycles(value)).toThrow(/ciclo/);
  });
});
