// @vitest-environment node
import { randomFillSync } from "node:crypto";
// @ts-expect-error jsdom is an existing test runtime dependency without bundled declarations.
import { JSDOM } from "jsdom";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import {
  INITIAL_FLOW,
  type LandingFlow,
} from "@/features/landing-editor/flow-model";
import {
  importSiteFiles,
  type SitePackage,
} from "@/features/landing-editor/site-package";
import {
  exportFlowPage,
  STATIC_EXPORT_MAX_BYTES,
} from "@/features/landing-editor/static-page-export";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const flow = (): LandingFlow => ({
  ...structuredClone(INITIAL_FLOW),
  pages: INITIAL_FLOW.pages.map((page) => ({
    ...page,
    url:
      page.kind === "checkout"
        ? "https://checkout.example/buy?product=1&offer=2"
        : "/obrigado",
  })),
});
const site = (
  entries: Record<string, string | Uint8Array>,
  entryPath = "index.html",
): SitePackage => ({
  version: 1,
  name: "Meu pacote",
  importedAt: new Date().toISOString(),
  entryPath,
  files: Object.entries(entries).map(([path, content]) => ({
    path,
    data:
      typeof content === "string" ? new TextEncoder().encode(content) : content,
    mime: "untrusted/hint",
  })),
});

describe("static page ZIP export", () => {
  it("exports root index and responsive monochrome CSS with real outgoing links", async () => {
    const result = await exportFlowPage(flow(), "page-landing");
    const files = unzipSync(result.bytes);
    expect(result.filename).toBe("landing-page.zip");
    expect(result.fileCount).toBe(2);
    expect(Object.keys(files).sort()).toEqual(["index.html", "orbit-page.css"]);
    const document = new JSDOM(decode(files["index.html"])).window.document;
    expect(document.querySelector("a")?.getAttribute("href")).toBe(
      "https://checkout.example/buy?product=1&offer=2",
    );
    expect(decode(files["orbit-page.css"])).toContain("border-radius:0");
    expect(decode(files["orbit-page.css"])).toContain(
      "@media(max-width:480px)",
    );
  });

  it("escapes text and attribute injection without creating executable markup", async () => {
    const draft = flow();
    Object.assign(draft.pages[0], {
      name: "</title><script>alert(1)</script>",
      headline: '<img src=x onerror="alert(1)">',
      description: "\"/><script>bad()</script>&'test",
      buttonLabel: '<svg onload="bad()">',
    });
    draft.pages[1].url = 'https://checkout.example/"onmouseover="bad()';
    const result = await exportFlowPage(draft, "page-landing");
    const html = decode(unzipSync(result.bytes)["index.html"]);
    const document = new JSDOM(html).window.document;
    expect(document.querySelectorAll("script,img,svg")).toHaveLength(0);
    expect(document.querySelector("a")?.hasAttribute("onmouseover")).toBe(
      false,
    );
    expect(document.querySelector("h1")?.textContent).toBe(
      draft.pages[0].headline,
    );
    expect(document.querySelector("a")?.textContent).toBe(
      draft.pages[0].buttonLabel,
    );
  });

  it("requires an actual destination for every generated outgoing edge", async () => {
    await expect(exportFlowPage(INITIAL_FLOW, "page-landing")).rejects.toThrow(
      /URL real/,
    );
    const draft = flow();
    draft.pages[1].url = "javascript:alert(1)";
    await expect(exportFlowPage(draft, "page-landing")).rejects.toThrow(
      /dados inválidos/,
    );
    await expect(exportFlowPage(flow(), "missing")).rejects.toThrow(
      /Selecione/,
    );
  });

  it("emits no fake purchase button on a terminal page", async () => {
    const files = unzipSync(
      (await exportFlowPage(flow(), "page-thank-you")).bytes,
    );
    expect(
      new JSDOM(decode(files["index.html"])).window.document.querySelector("a"),
    ).toBeNull();
  });

  it.each(["https://images.example/product.png", "/assets/product.png"])(
    "does not pretend an image is bundled: %s",
    async (imageUrl) => {
      const draft = flow();
      draft.pages[0].imageUrl = imageUrl;
      await expect(exportFlowPage(draft, "page-landing")).rejects.toThrow(
        /não baixa imagens/,
      );
    },
  );

  it("preserves imported HTML and all asset bytes without executing code or fetching", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("must not fetch"));
    const html =
      '<!doctype html><html><head><link href="style.css" rel="stylesheet"></head><body><script src="app.js"></script><a href="/existing">Original</a></body></html>';
    const input = site({
      "index.html": html,
      "style.css": "@font-face{src:url(font.woff2)}",
      "app.js": "throw new Error('must never execute')",
      "font.woff2": new Uint8Array([1, 2, 3]),
      "images/a.png": new Uint8Array([4, 5]),
    });
    const result = await exportFlowPage(INITIAL_FLOW, "page-landing", input);
    const files = unzipSync(result.bytes);
    expect(decode(files["index.html"])).toBe(html);
    for (const entry of input.files)
      expect(files[entry.path]).toEqual(entry.data);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("preserves nested relative HTML/CSS/JS URLs via a local base and keeps the old index", async () => {
    const input = site(
      {
        "index.html": "<h1>Original home</h1>",
        "ofertas/verão/oferta.html":
          '<!doctype html><html><head><link rel="stylesheet" href="../../assets/style.css"></head><body><img src="./photo.png"><script src="../../assets/app.js"></script><a id="faq" href="#faq">FAQ</a><a id="query" href="?offer=2">Oferta</a></body></html>',
        "ofertas/verão/photo.png": new Uint8Array([1]),
        "assets/style.css": 'body{background:url("./bg.png")}',
        "assets/app.js": "void 0",
        "assets/bg.png": new Uint8Array([2]),
      },
      "ofertas/verão/oferta.html",
    );
    const files = unzipSync(
      (await exportFlowPage(flow(), "page-landing", input)).bytes,
    );
    const document = new JSDOM(decode(files["index.html"]), {
      url: "https://example.test/site/index.html",
    }).window.document;
    expect(document.compatMode).toBe("CSS1Compat");
    expect(document.querySelector("link")?.href).toBe(
      "https://example.test/site/assets/style.css",
    );
    expect(document.querySelector("img")?.src).toBe(
      "https://example.test/site/ofertas/ver%C3%A3o/photo.png",
    );
    expect(document.querySelector("script")?.src).toBe(
      "https://example.test/site/assets/app.js",
    );
    expect(document.querySelector("#faq")?.href).toBe(
      "https://example.test/site/ofertas/ver%C3%A3o/oferta.html#faq",
    );
    expect(document.querySelector("#query")?.href).toBe(
      "https://example.test/site/ofertas/ver%C3%A3o/oferta.html?offer=2",
    );
    expect(decode(files["orbit-original-index.html"])).toBe(
      "<h1>Original home</h1>",
    );
    expect(files[input.entryPath]).toEqual(input.files[1].data);
  });

  it("retains common directory paths and avoids backup filename collisions", async () => {
    const nested = site(
      {
        "only/pages/offer.html": "<h1>Offer</h1>",
        "only/pages/style.css": "body{}",
      },
      "only/pages/offer.html",
    );
    const files = unzipSync(
      (await exportFlowPage(flow(), "page-landing", nested)).bytes,
    );
    expect(files["only/pages/style.css"]).toBeDefined();
    expect(decode(files["index.html"])).toContain("./only/pages/");
    const conflict = site(
      {
        "index.html": "old",
        "other.html": "new",
        "orbit-original-index.html": "existing",
      },
      "other.html",
    );
    const conflictFiles = unzipSync(
      (await exportFlowPage(flow(), "page-landing", conflict)).bytes,
    );
    expect(decode(conflictFiles["orbit-original-index.html"])).toBe("existing");
    expect(decode(conflictFiles["orbit-original-index-1.html"])).toBe("old");
  });

  it.each([
    "index.php",
    ".htaccess",
    ".env.txt",
    "keys/private-key.txt",
    "../out.html",
    "/absolute.html",
    "styles\\evil.css",
  ])("revalidates forged package path %s", async (path) => {
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": "safe", [path]: "bad" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects invalid package data, duplicates, unsupported entry, and ambiguous base", async () => {
    const malformed = site({ "index.html": "safe" });
    malformed.files[0].data = "not bytes" as unknown as Uint8Array;
    await expect(
      exportFlowPage(flow(), "page-landing", malformed),
    ).rejects.toThrow(/arquivo inválido/);
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": "x", "INDEX.HTML": "y" }),
      ),
    ).rejects.toThrow(/duplicado/);
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": "x", "app.js": "x" }, "app.js"),
      ),
    ).rejects.toThrow(/entrada/);
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": '<base href="https://other.test/">' }),
      ),
    ).rejects.toThrow(/<base>/);
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": '<base/href="https://other.test/">' }),
      ),
    ).rejects.toThrow(/<base>/);
  });

  it("round-trips exported ZIP through the same safe importer", async () => {
    const result = await exportFlowPage(
      flow(),
      "page-landing",
      site(
        {
          "pages/offer.html": "<!doctype html><h1>Hello</h1>",
          "pages/app.js": "void 0",
        },
        "pages/offer.html",
      ),
    );
    const imported = await importSiteFiles([
      new File([Uint8Array.from(result.bytes).buffer], result.filename),
    ]);
    expect(imported.entryPath).toBe("index.html");
    expect(imported.files).toHaveLength(result.fileCount);
  });

  it("enforces the compressed 3 MB output cap", async () => {
    expect(STATIC_EXPORT_MAX_BYTES).toBe(3_000_000);
    const random = randomFillSync(new Uint8Array(3_001_000));
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "index.html": "<h1>Hello</h1>", "image.png": random }),
      ),
    ).rejects.toThrow(/excede 3 MB/);
  });

  it("rejects output count overflow after adding a root index", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 399 }, (_, index) => [`assets/${index}.txt`, "x"]),
    );
    await expect(
      exportFlowPage(
        flow(),
        "page-landing",
        site({ "pages/page.html": "hi", ...entries }, "pages/page.html"),
      ),
    ).rejects.toThrow(/400 arquivos/);
  });
});
