import {
  getPreparedPageZip,
  preparePageZip,
  type PageZipScope,
} from "./page-zip";
import { funnelIdentityHeaders } from "./editor-identity";

const endpoint = "/api/editor/funil/pacotes";
function query(scope: PageZipScope) {
  return new URLSearchParams({
    funnelId: scope.funnelId,
    nodeId: scope.nodeId,
    productId: scope.productId ?? "",
  });
}
export async function savePackage(
  scope: PageZipScope,
  file: File,
): Promise<void> {
  if (scope.storageId === "demo-user") return;
  const response = await fetch(`${endpoint}?${query(scope)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      ...funnelIdentityHeaders(scope.storageId),
      "x-file-name": encodeURIComponent(file.name),
      "Content-Type": "application/zip",
    },
    body: file,
  });
  if (response.redirected)
    throw new Error(
      "Sessão expirada. O ZIP não foi salvo na conta; entre novamente.",
    );
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(
      result.error ||
        "Não foi possível guardar o ZIP na sua conta. Mantenha a cópia original e tente novamente.",
    );
}
export async function deletePackage(scope: PageZipScope): Promise<void> {
  if (scope.storageId === "demo-user") return;
  const response = await fetch(`${endpoint}?${query(scope)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: funnelIdentityHeaders(scope.storageId),
  });
  if (!response.ok || response.redirected)
    throw new Error(
      "Não foi possível remover o ZIP da sua conta. Tente novamente.",
    );
}
/** Download only this funnel's assets, serially, keeping peak memory bounded. */
export async function restorePackages(
  storageId: string,
  funnelId: string,
  references: string[] = [],
): Promise<void> {
  if (storageId === "demo-user") return;
  const headers = funnelIdentityHeaders(storageId);
  const response = await fetch(endpoint, {
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok || response.redirected)
    throw new Error(
      "Não foi possível carregar os arquivos da sua conta. Tente novamente antes de publicar.",
    );
  const result = (await response.json()) as {
    ok: boolean;
    items: {
      funnelId: string;
      nodeId: string;
      productId: string;
      filename: string;
      sizeBytes: number;
    }[];
  };
  if (!result.ok || !Array.isArray(result.items))
    throw new Error("Resposta de arquivos inválida.");
  for (const item of result.items.filter(
    (item) => item.funnelId === funnelId || references.includes(item.funnelId),
  )) {
    const scope = {
      storageId,
      funnelId: item.funnelId,
      nodeId: item.nodeId,
      productId: item.productId || undefined,
    };
    if (getPreparedPageZip(scope)) continue;
    if (
      !Number.isSafeInteger(item.sizeBytes) ||
      item.sizeBytes < 1 ||
      item.sizeBytes > 3_000_000
    )
      throw new Error("Um pacote salvo excede os limites. Nada foi publicado.");
    const download = await fetch(`${endpoint}?${query(scope)}`, {
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!download.ok || download.redirected)
      throw new Error(
        "Um arquivo do funil não pôde ser carregado. Nada foi publicado.",
      );
    const blob = await download.blob();
    if (blob.size !== item.sizeBytes)
      throw new Error(
        "O arquivo salvo não está completo. Anexe novamente a cópia original.",
      );
    await preparePageZip(
      scope,
      new File([blob], item.filename, { type: "application/zip" }),
      { restoring: true },
    );
  }
}
