// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  forgetOtherUsersPageZips,
  forgetPreparedPageZip,
  getPreparedPageZip,
  hasPreparedPageZips,
  preparePageZip,
  subscribePageZips,
} from "@/features/funnel/page-zip";
import { inspecionarZip } from "@/features/vps/pacote-zip";

const scope = { storageId: "owner", funnelId: "funnel", nodeId: "landing" };
const html = "<!doctype html><html><body>Oferta</body></html>";
const file = (entries: Record<string, string> = { "index.html": html }) =>
  new File(
    [
      Uint8Array.from(
        zipSync(
          Object.fromEntries(
            Object.entries(entries).map(([name, content]) => [
              name,
              strToU8(content),
            ]),
          ),
          { level: 0 },
        ),
      ).buffer,
    ],
    "landing.zip",
    { type: "application/zip" },
  );

afterEach(() => {
  forgetOtherUsersPageZips("test-cleanup");
  vi.restoreAllMocks();
});

describe("validated funnel ZIP cache", () => {
  it("retains exact publishable bytes in memory and returns metadata only for persistence", async () => {
    const saved = await preparePageZip(
      scope,
      file({
        "index.html": html,
        "assets/main.css": "body{color:black}",
        "assets/app.js": "throw Error('must not run')",
      }),
    );
    expect(saved.metadata).toEqual({
      nome: "landing.zip",
      tamanho: saved.file.size,
      ok: true,
    });
    expect(saved.fileCount).toBe(3);
    expect(getPreparedPageZip(scope)).toBe(saved);
    expect(hasPreparedPageZips("owner")).toBe(true);
    const bytes = new Uint8Array(await saved.file.arrayBuffer());
    expect(inspecionarZip(bytes).ok).toBe(true);
    expect(new TextDecoder().decode(unzipSync(bytes)["assets/app.js"])).toBe(
      "throw Error('must not run')",
    );
    expect(JSON.stringify(saved.metadata)).not.toMatch(
      /body|must not run|bytes|data/,
    );
  });

  it("does not accept arbitrary content renamed to .zip, empty input or input over 3 MB", async () => {
    for (const input of [
      new File([html], "fake.zip"),
      new File([], "empty.zip"),
      new File([new Uint8Array(3_000_001)], "big.zip"),
      new File([html], "index.html"),
    ])
      await expect(preparePageZip(scope, input)).rejects.toThrow();
    expect(getPreparedPageZip(scope)).toBeNull();
  });

  it.each<Record<string, string>>([
    { "wrapper/index.html": html },
    { "about.html": html },
    { "INDEX.HTML": html },
    { "index.html": "" },
  ])("requires a nonempty exact root index.html: %j", async (entries) => {
    await expect(preparePageZip(scope, file(entries))).rejects.toThrow(
      /index\.html/,
    );
  });

  it.each([
    "evil.php",
    ".htaccess",
    "../secret.js",
    "/absolute.js",
    ".hidden.js",
    ".env",
    "dir/.git/config",
  ])("rejects unsafe or unsupported entry %s", async (path) => {
    await expect(
      preparePageZip(
        scope,
        file({ "index.html": html, [path]: "not allowed" }),
      ),
    ).rejects.toThrow();
  });

  it("isolates users, funnels, nodes and store products, and clears other identities", async () => {
    const result = await preparePageZip(scope, file());
    for (const other of [
      { ...scope, storageId: "other" },
      { ...scope, funnelId: "other" },
      { ...scope, nodeId: "other" },
      { ...scope, productId: "other" },
    ])
      expect(getPreparedPageZip(other)).toBeNull();
    expect(getPreparedPageZip(scope)).toBe(result);
    forgetOtherUsersPageZips("other");
    expect(getPreparedPageZip(scope)).toBeNull();
  });

  it("keeps the previous valid package when replacement fails", async () => {
    const result = await preparePageZip(scope, file());
    await expect(
      preparePageZip(scope, new File(["bad"], "bad.zip")),
    ).rejects.toThrow();
    expect(getPreparedPageZip(scope)).toBe(result);
  });

  it("notifies mounted panels when a package is prepared or forgotten", async () => {
    const changed = vi.fn();
    const unsubscribe = subscribePageZips(changed);
    await preparePageZip(scope, file());
    forgetPreparedPageZip(scope);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(getPreparedPageZip(scope)).toBeNull();
    unsubscribe();
  });

  it("never reads/writes localStorage or contacts a server", async () => {
    const network = vi.fn(() => {
      throw Error("Network must not be used");
    });
    vi.stubGlobal("fetch", network);
    try {
      await preparePageZip(scope, file());
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
