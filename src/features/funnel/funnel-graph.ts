import type { EstiloLinha, FunnelEdge, FunnelNode } from "./funnel-model";
import { validarFunnelData } from "./funnel-validation";

export interface FunnelClipboard {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  originFunnelId?: string;
}

/** Clipboard JSON shares the same structural validation as saved funnels. */
export function parseFunnelClipboard(value: unknown): FunnelClipboard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  try {
    const data = validarFunnelData({
      id: "clipboard",
      nome: "Clipboard",
      projeto: "",
      nodes: record.nodes,
      edges: record.edges,
    });
    return {
      nodes: data.nodes,
      edges: data.edges,
      ...(typeof record.originFunnelId === "string" &&
      record.originFunnelId.length <= 300
        ? { originFunnelId: record.originFunnelId }
        : {}),
    };
  } catch {
    return null;
  }
}

export interface CloneFunnelGraphOptions {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  createId: (kind: "node" | "edge", oldId: string) => string;
  offset: { x: number; y: number };
  /** Only references to these existing receiver nodes survive outside the copied group. */
  existingNodeIds?: Iterable<string>;
}

/** Copy a graph without mutating the clipboard or retaining references to another board. */
export function cloneFunnelGraph({
  nodes,
  edges,
  createId,
  offset,
  existingNodeIds = [],
}: CloneFunnelGraphOptions): { nodes: FunnelNode[]; edges: FunnelEdge[] } {
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
    throw new Error("Posição inválida para colar os blocos.");
  }
  const receiver = new Set(existingNodeIds);
  const ids = new Map<string, string>();
  const usedIds = new Set(receiver);
  for (const node of nodes) {
    const id = createId("node", node.id);
    if (!id || ids.has(node.id) || usedIds.has(id)) {
      throw new Error("Identificadores repetidos ao copiar os blocos.");
    }
    ids.set(node.id, id);
    usedIds.add(id);
  }
  const target = (id: string) =>
    ids.get(id) ?? (receiver.has(id) ? id : undefined);
  const moveStyle = (style?: EstiloLinha): EstiloLinha | undefined =>
    style && {
      ...style,
      ...(style.pontos
        ? {
            pontos: style.pontos.map((point) => ({
              x: point.x + offset.x,
              y: point.y + offset.y,
            })),
          }
        : {}),
    };
  const copies = structuredClone(nodes).map((node) => {
    node.id = ids.get(node.id)!;
    node.x += offset.x;
    node.y += offset.y;
    if (node.redir) {
      node.redir.regras = node.redir.regras.map((rule) => {
        const next = {
          ...rule,
          ...(rule.estilo ? { estilo: moveStyle(rule.estilo) } : {}),
        };
        if (rule.destinoNoId) {
          next.destinoNoId = target(rule.destinoNoId);
          if (!next.destinoNoId) {
            // Do not convert an orphaned node reference into its stale cached URL.
            delete next.destinoNoId;
            next.destino = "";
            next.ativo = false;
          }
        }
        return next;
      });
    }
    if (node.pagina) {
      node.pagina.saidas = Object.fromEntries(
        Object.entries(node.pagina.saidas).map(([name, exit]) => {
          if (!exit.etapaId) return [name, exit];
          const etapaId = target(exit.etapaId);
          return [name, etapaId ? { ...exit, etapaId } : {}];
        }),
      );
      const back = node.pagina.backRedirect;
      if (back?.destinoEtapaId) {
        const destinoEtapaId = target(back.destinoEtapaId);
        if (destinoEtapaId) back.destinoEtapaId = destinoEtapaId;
        else {
          delete back.destinoEtapaId;
          delete back.url;
          back.ligado = false;
        }
      }
    }
    return node;
  });
  const copiedEdges = structuredClone(edges).flatMap((edge) => {
    const source = target(edge.source);
    const destination = target(edge.target);
    if (!source || !destination) return [];
    return [
      {
        ...edge,
        id: createId("edge", edge.id),
        source,
        target: destination,
        ...(edge.estilo ? { estilo: moveStyle(edge.estilo) } : {}),
      },
    ];
  });
  return { nodes: copies, edges: copiedEdges };
}

/** Delete blocks and clear all destinations referencing them, including generated rule lines. */
export function removeFunnelNodesGraph(
  graph: Pick<FunnelClipboard, "nodes" | "edges">,
  removedIds: Iterable<string>,
): { nodes: FunnelNode[]; edges: FunnelEdge[] } {
  const removed = new Set(removedIds);
  // Identity mapping reuses the same destination cleanup as paste without moving anything.
  return cloneFunnelGraph({
    nodes: graph.nodes.filter((node) => !removed.has(node.id)),
    edges: graph.edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target),
    ),
    createId: (_kind, id) => id,
    offset: { x: 0, y: 0 },
  });
}
