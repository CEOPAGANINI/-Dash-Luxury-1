// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strToU8, Zip, ZipDeflate, zipSync, type Zippable } from "fflate";

import {
  formatBytes,
  getHtmlEntries,
  importSiteFiles,
  SITE_PACKAGE_LIMITS,
} from "@/features/landing-editor/site-package";

const html = "<!doctype html><html><body>Landing page</body></html>";
const file = (name: string, text = html) => new File([text], name);
const archive = (bytes: Uint8Array) =>
  new File([Uint8Array.from(bytes).buffer], "loja.zip");
const zip = (files: Record<string, string>, level: 0 | 6 = 0) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ) as Zippable,
    { level },
  );
const firstCentral = (bytes: Uint8Array) =>
  new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
function patch(
  bytes: Uint8Array,
  change: (view: DataView, central: number) => void,
) {
  const result = bytes.slice();
  change(new DataView(result.buffer), firstCentral(result));
  return result;
}

describe("site package importer", () => {
  it("imports loose HTML/CSS/JS without interpreting their contents", async () => {
    const javascript = "throw new Error('must never execute')";
    const result = await importSiteFiles([
      file("index.html"),
      file("style.css", "body{color:black}"),
      file("app.js", javascript),
    ]);
    expect(result.version).toBe(1);
    expect(result.entryPath).toBe("index.html");
    expect(result.files.map(({ mime }) => mime)).toEqual([
      "text/html",
      "text/css",
      "text/javascript",
    ]);
    expect(new TextDecoder().decode(result.files[2].data)).toBe(javascript);
    expect(Number.isNaN(Date.parse(result.importedAt))).toBe(false);
  });

  it("imports stored ZIP, strips common wrapper folders, ignores Mac metadata and chooses index", async () => {
    const result = await importSiteFiles([
      archive(
        zip({
          "export/loja/about.html": html,
          "export/loja/index.html": html,
          "export/loja/assets/app.js": "alert('not run')",
          "__MACOSX/._index.html": "metadata",
          "export/loja/.DS_Store": "metadata",
        }),
      ),
    ]);
    expect(result.name).toBe("loja");
    expect(result.entryPath).toBe("index.html");
    expect(getHtmlEntries(result)).toEqual(["about.html", "index.html"]);
    expect(result.files.map(({ path }) => path)).toEqual([
      "about.html",
      "index.html",
      "assets/app.js",
    ]);
  });

  it("asynchronously inflates Deflate ZIP and keeps bytes intact", async () => {
    // Enough compressed bytes to exercise more than one 1 KB worker chunk.
    const content =
      html +
      Array.from(
        { length: 3000 },
        (_, i) => `${i}:${Math.imul(i, 1597334677) >>> 0}`,
      ).join(" ");
    const result = await importSiteFiles([
      archive(zip({ "index.html": content }, 6)),
    ]);
    expect(new TextDecoder().decode(result.files[0].data)).toBe(content);
  });

  it("normalizes a selected directory and uses another HTML when index is absent", async () => {
    const page = file("offer.htm");
    Object.defineProperty(page, "webkitRelativePath", {
      value: "shop/pages/offer.htm",
    });
    const result = await importSiteFiles([page]);
    expect(result.entryPath).toBe("offer.htm");
  });

  it("supports UTF-8 filenames and explicit empty directory entries", async () => {
    const result = await importSiteFiles([
      archive(zip({ "loja/": "", "loja/ação.html": html })),
    ]);
    expect(result.entryPath).toBe("ação.html");
  });

  it("accepts standard streamed ZIP data descriptors", async () => {
    const chunks: Uint8Array[] = [];
    const stream = new Zip((error, data) => {
      if (error) throw error;
      chunks.push(data);
    });
    const entry = new ZipDeflate("index.html");
    stream.add(entry);
    entry.push(strToU8(html), true);
    stream.end();
    const data = new Uint8Array(
      chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const result = await importSiteFiles([archive(data)]);
    expect(new TextDecoder().decode(result.files[0].data)).toBe(html);
  });

  it("rejects empty selection, mixed ZIP and loose files, and packages without HTML", async () => {
    await expect(importSiteFiles([])).rejects.toThrow("Selecione");
    await expect(
      importSiteFiles([
        archive(zip({ "index.html": html })),
        file("extra.html"),
      ]),
    ).rejects.toThrow("um ZIP por vez");
    await expect(importSiteFiles([file("style.css", "")])).rejects.toThrow(
      "Nenhuma página HTML",
    );
  });

  it.each(["server.php", "plugin.phtml", "index.phar"])(
    "explains static-only support for %s",
    async (name) => {
      await expect(
        importSiteFiles([
          archive(zip({ "index.html": html, [name]: "<?php echo 1;" })),
        ]),
      ).rejects.toThrow("WordPress/PHP");
    },
  );

  it.each([
    "app.exe",
    "app.sh",
    "backup.zip",
    "file.constructor",
    "file.__proto__",
  ])("rejects non-static file type %s", async (name) => {
    await expect(
      importSiteFiles([archive(zip({ "index.html": html, [name]: "x" }))]),
    ).rejects.toThrow("Tipo de arquivo não permitido");
  });

  it.each([
    ".env",
    ".env.production",
    ".envrc.txt",
    ".git/config.json",
    "private-key.txt",
    "credentials.json",
    "id_rsa.txt",
  ])("rejects secret-like path %s", async (name) => {
    await expect(
      importSiteFiles([archive(zip({ "index.html": html, [name]: "secret" }))]),
    ).rejects.toThrow("segredos");
  });

  it.each([
    "../index.html",
    "/index.html",
    "C:/index.html",
    "foo\\index.html",
    "foo/../index.html",
    "foo//index.html",
    "./index.html",
    "bad\u0001.html",
    "foo./index.html",
  ])("rejects unsafe path %s", async (name) => {
    await expect(
      importSiteFiles([archive(zip({ [name]: html }))]),
    ).rejects.toThrow(/caminho/);
  });

  it("rejects duplicate and case-colliding loose paths instead of replacing files", async () => {
    await expect(
      importSiteFiles([file("index.html"), file("index.html")]),
    ).rejects.toThrow("duplicado");
    await expect(
      importSiteFiles([
        archive(zip({ "index.html": html, "INDEX.HTML": "different" })),
      ]),
    ).rejects.toThrow("duplicado");
  });

  it("rejects paths used as both files and parent directories", async () => {
    await expect(
      importSiteFiles([
        archive(zip({ "assets.html": html, "assets.html/index.html": html })),
      ]),
    ).rejects.toThrow("arquivo e pasta");
  });

  it("checks ZIP input limit before reading bytes", async () => {
    const oversized = file("site.zip", "");
    Object.defineProperty(oversized, "size", {
      value: SITE_PACKAGE_LIMITS.archiveBytes + 1,
    });
    await expect(importSiteFiles([oversized])).rejects.toThrow("20 MB");
  });

  it("checks loose file and selection limits", async () => {
    const oversized = file("index.html", "");
    Object.defineProperty(oversized, "size", {
      value: SITE_PACKAGE_LIMITS.fileBytes + 1,
    });
    await expect(importSiteFiles([oversized])).rejects.toThrow("10 MB");
    await expect(
      importSiteFiles(
        Array.from({ length: 401 }, (_, i) => file(`${i}.html`, "")),
      ),
    ).rejects.toThrow("400");
  });

  it("checks count and declared size limits before decompression", async () => {
    const source = zip({ "index.html": html }, 6);
    const tooMany = patch(source, (view) => {
      view.setUint16(source.length - 14, 401, true);
      view.setUint16(source.length - 12, 401, true);
    });
    await expect(importSiteFiles([archive(tooMany)])).rejects.toThrow("400");
    const tooLarge = patch(source, (view, central) =>
      view.setUint32(central + 24, SITE_PACKAGE_LIMITS.fileBytes + 1, true),
    );
    await expect(importSiteFiles([archive(tooLarge)])).rejects.toThrow("10 MB");
  });

  it("checks total declared expansion size before decompressing", async () => {
    const source = zip(
      Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [`${i}.html`, html]),
      ),
      6,
    );
    const tooLarge = patch(source, (view, start) => {
      let central = start;
      for (let i = 0; i < 5; i++) {
        view.setUint32(central + 24, SITE_PACKAGE_LIMITS.fileBytes, true);
        const local = view.getUint32(central + 42, true);
        view.setUint32(local + 22, SITE_PACKAGE_LIMITS.fileBytes, true);
        central +=
          46 +
          view.getUint16(central + 28, true) +
          view.getUint16(central + 30, true) +
          view.getUint16(central + 32, true);
      }
    });
    await expect(importSiteFiles([archive(tooLarge)])).rejects.toThrow("40 MB");
  });

  it("stops a lying compressed stream as soon as expansion exceeds its declaration", async () => {
    const source = zip({ "index.html": html.repeat(2000) }, 6);
    const bomb = patch(source, (view, central) => {
      view.setUint32(central + 24, 1, true);
      view.setUint32(22, 1, true);
    });
    await expect(importSiteFiles([archive(bomb)])).rejects.toThrow(
      "excedeu o tamanho declarado",
    );
  });

  it("verifies decompressed content CRC", async () => {
    const corrupt = patch(zip({ "index.html": html }), (view, central) => {
      view.setUint32(central + 16, 0, true);
      view.setUint32(14, 0, true);
    });
    await expect(importSiteFiles([archive(corrupt)])).rejects.toThrow(
      "CRC/tamanho",
    );
  });

  it("rejects local/central filename and size mismatch", async () => {
    const source = zip({ "index.html": html });
    await expect(
      importSiteFiles([
        archive(patch(source, (view) => view.setUint8(30, 120))),
      ]),
    ).rejects.toThrow("inconsistentes");
    await expect(
      importSiteFiles([
        archive(patch(source, (view) => view.setUint32(22, 1, true))),
      ]),
    ).rejects.toThrow("inconsistentes");
  });

  it("rejects encryption, symlinks, unsupported compression and ZIP64", async () => {
    const source = zip({ "index.html": html });
    await expect(
      importSiteFiles([
        archive(
          patch(source, (view, central) =>
            view.setUint16(central + 8, 1, true),
          ),
        ),
      ]),
    ).rejects.toThrow("criptografado");
    await expect(
      importSiteFiles([
        archive(
          patch(source, (view, central) =>
            view.setUint32(central + 38, 0xa1ff0000, true),
          ),
        ),
      ]),
    ).rejects.toThrow("simbólicos");
    await expect(
      importSiteFiles([
        archive(
          patch(source, (view, central) =>
            view.setUint16(central + 10, 12, true),
          ),
        ),
      ]),
    ).rejects.toThrow("compressão");
    await expect(
      importSiteFiles([
        archive(
          patch(source, (view, central) =>
            view.setUint32(central + 24, 0xffffffff, true),
          ),
        ),
      ]),
    ).rejects.toThrow("ZIP64");
  });

  it("rejects corrupt or incomplete ZIP files", async () => {
    await expect(
      importSiteFiles([file("site.zip", "not a zip")]),
    ).rejects.toThrow("ZIP inválido");
    const source = zip({ "index.html": html });
    await expect(
      importSiteFiles([archive(source.subarray(0, source.length - 1))]),
    ).rejects.toThrow("ZIP inválido");
  });

  it("formats sizes with bounded precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(NaN)).toBe("0 B");
  });
});
