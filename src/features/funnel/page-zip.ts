import type { LandingFlow } from "@/features/landing-editor/flow-model";

export type PageZipScope = {
  storageId: string;
  funnelId: string;
  nodeId: string;
  productId?: string;
};

export type PreparedPageZip = {
  file: File;
  metadata: { nome: string; tamanho: number; ok: true };
  fileCount: number;
};

// Binary content never enters JSON, localStorage, query strings or logs. ZIPs
// are persisted by the authenticated package API. Identity is part of every
// key: changing accounts cannot expose another account's prepared package.
const prepared = new Map<string, PreparedPageZip>();
const listeners = new Set<() => void>();
const MAX_CACHED_BYTES = 48_000_000;
const MAX_ZIP_BYTES = 3_000_000;
const preparing = new Map<string, number>();

function key(scope: PageZipScope): string {
  if (
    ![scope.storageId, scope.funnelId, scope.nodeId].every((value) =>
      value?.trim(),
    )
  )
    throw new Error(
      "Identifique o usuário, o funil e a página antes de anexar o ZIP.",
    );
  return JSON.stringify([
    scope.storageId,
    scope.funnelId,
    scope.nodeId,
    scope.productId ?? null,
  ]);
}

export function subscribePageZips(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPreparedPageZip(
  scope: PageZipScope,
): PreparedPageZip | null {
  return prepared.get(key(scope)) ?? null;
}

export function hasPreparedPageZips(storageId: string): boolean {
  return [...prepared.keys()].some((id) => JSON.parse(id)[0] === storageId);
}

export function forgetPreparedPageZip(scope: PageZipScope): void {
  const id = key(scope);
  preparing.set(id, (preparing.get(id) ?? 0) + 1);
  if (prepared.delete(id)) listeners.forEach((listener) => listener());
}

/** Called on identity changes by the board, not when a configuration panel closes. */
export function forgetOtherUsersPageZips(storageId: string): void {
  let changed = false;
  for (const id of prepared.keys()) {
    if (JSON.parse(id)[0] !== storageId)
      changed = prepared.delete(id) || changed;
  }
  for (const id of preparing.keys()) {
    if (JSON.parse(id)[0] !== storageId)
      preparing.set(id, (preparing.get(id) ?? 0) + 1);
  }
  if (changed) listeners.forEach((listener) => listener());
}

// Run only AFTER importSiteFiles has checked the full ZIP structure, duplicate
// paths, CRC, local/central headers and expansion limits. The importer can strip
// wrapper folders, while this upload entrypoint explicitly requires root index.
function hasRootIndex(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (
    let end = bytes.length - 22;
    end >= Math.max(0, bytes.length - 65557);
    end--
  ) {
    if (
      view.getUint32(end, true) !== 0x06054b50 ||
      end + 22 + view.getUint16(end + 20, true) !== bytes.length
    )
      continue;
    let cursor = view.getUint32(end + 16, true);
    const count = view.getUint16(end + 10, true);
    for (let index = 0; index < count; index++) {
      const nameLength = view.getUint16(cursor + 28, true);
      const name = new TextDecoder().decode(
        bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      );
      if (name === "index.html") return true;
      cursor +=
        46 +
        nameLength +
        view.getUint16(cursor + 30, true) +
        view.getUint16(cursor + 32, true);
    }
    return false;
  }
  return false;
}

/** Validate and normalize locally, without executing HTML or uploading anything. */
export async function preparePageZip(
  scope: PageZipScope,
  source: File,
  options: { restoring?: boolean; persist?: boolean } = {},
): Promise<PreparedPageZip> {
  const id = key(scope);
  const revision = (preparing.get(id) ?? 0) + 1;
  preparing.set(id, revision);
  if (!/\.zip$/i.test(source.name)) throw new Error("Escolha um arquivo .zip.");
  if (source.size < 1) throw new Error("O ZIP está vazio.");
  if (source.size > MAX_ZIP_BYTES)
    throw new Error(
      "O ZIP passa de 3 MB (3.000.000 bytes). Comprima imagens e fontes.",
    );
  const [{ importSiteFiles }, { exportFlowPage }] = await Promise.all([
    import("@/features/landing-editor/site-package"),
    import("@/features/landing-editor/static-page-export"),
  ]);
  const site = await importSiteFiles([source]);
  if (!hasRootIndex(new Uint8Array(await source.arrayBuffer())))
    throw new Error(
      "O ZIP precisa conter index.html na raiz, fora de qualquer pasta.",
    );
  const index = site.files.find((file) => file.path === "index.html");
  if (!index?.data.byteLength)
    throw new Error("O index.html não pode estar vazio.");
  const flow: LandingFlow = {
    version: 1,
    name: "Conferência de pacote",
    pages: [
      {
        id: "package",
        kind: "landing",
        name: "Página",
        url: "",
        headline: "",
        description: "",
        buttonLabel: "",
        imageUrl: "",
        x: 0,
        y: 0,
      },
    ],
    connections: [],
  };
  // The existing static exporter shares filename/index limits with the VPS,
  // rejects unsafe files and produces the exact bytes subsequently uploaded.
  const output = await exportFlowPage(flow, "package", {
    ...site,
    entryPath: "index.html",
  });
  const file = new File([Uint8Array.from(output.bytes).buffer], source.name, {
    type: "application/zip",
  });
  if (preparing.get(id) !== revision)
    throw new Error(
      "A seleção do ZIP mudou durante a conferência. Use o arquivo selecionado mais recentemente.",
    );
  const used = [...prepared.entries()].reduce(
    (sum, [cacheKey, item]) => sum + (cacheKey === id ? 0 : item.file.size),
    0,
  );
  if (used + file.size > MAX_CACHED_BYTES)
    throw new Error(
      "O limite de arquivos nesta aba foi atingido. Remova um ZIP preparado antes de anexar outro.",
    );
  const result: PreparedPageZip = {
    file,
    metadata: { nome: file.name, tamanho: file.size, ok: true },
    fileCount: output.fileCount,
  };
  // Validate locally first; never store unsafe or partially prepared input.
  if (
    options.persist &&
    !options.restoring &&
    typeof window !== "undefined" &&
    scope.storageId !== "demo-user"
  ) {
    const { savePackage } = await import("./package-cloud");
    await savePackage(scope, file);
    if (preparing.get(id) !== revision)
      throw new Error(
        "A seleção mudou durante o salvamento. Prepare o arquivo atual novamente.",
      );
  }
  prepared.set(id, result);
  listeners.forEach((listener) => listener());
  return result;
}
