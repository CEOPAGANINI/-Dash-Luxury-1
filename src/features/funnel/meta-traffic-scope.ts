import type { FunnelNode, FunnelEdge } from "./funnel-model";

export const isFacebookTraffic = (node: FunnelNode) =>
  node.type === "brand" &&
  (node.marcaId === "facebook" ||
    (!node.marcaId &&
      (node.sigla === "f" || /^facebook(?:\s|$)/i.test(node.title))));

/** Explicit selection wins. Infer only when exactly one downstream store exists. */
export function trafficStoreId(
  source: FunnelNode,
  nodes: FunnelNode[],
  edges: FunnelEdge[],
): string {
  const stores = nodes.filter((node) => node.type === "store");
  if (
    source.trafficStoreNodeId &&
    stores.some((store) => store.id === source.trafficStoreNodeId)
  )
    return source.trafficStoreNodeId;
  const seen = new Set<string>([source.id]);
  const pending = [source.id];
  while (pending.length) {
    const id = pending.shift()!;
    for (const edge of edges.filter((edge) => edge.source === id)) {
      if (!seen.has(edge.target)) {
        seen.add(edge.target);
        pending.push(edge.target);
      }
    }
  }
  const linked = stores.filter((store) => seen.has(store.id));
  return linked.length === 1
    ? linked[0].id
    : linked.length === 0 && stores.length === 1
      ? stores[0].id
      : "";
}

export function toggleStoreBusiness(
  ids: string[],
  id: string,
  checked: boolean,
): string[] {
  if (!/^\d+$/.test(id)) throw new Error("BM inválida.");
  const next = checked
    ? [...new Set([...ids, id])]
    : ids.filter((value) => value !== id);
  if (next.length > 5)
    throw new Error("Cada loja pode ter no máximo 5 BMs vinculadas.");
  return next;
}
