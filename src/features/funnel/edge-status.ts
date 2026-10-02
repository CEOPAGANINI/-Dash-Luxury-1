import type { FunnelEdge, FunnelNode } from "./funnel-model";
import { nodePreparation, type NodePreparation } from "./node-readiness";

export type EdgePreparation = {
  ready: boolean;
  state: "ready" | "pending" | "error";
  label: string;
  reasons: string[];
  source: NodePreparation | null;
  target: NodePreparation | null;
};

type EdgePreparationInput = {
  source: string;
  target: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  sourceZipReady?: boolean;
  targetZipReady?: boolean;
};

/** Configuration signal only; no traffic or publication state is inferred. */
export function edgePreparation({
  source,
  target,
  nodes,
  edges,
  sourceZipReady = false,
  targetZipReady = false,
}: EdgePreparationInput): EdgePreparation {
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  const sourceStatus = sourceNode
    ? nodePreparation(sourceNode, nodes, edges, sourceZipReady)
    : null;
  const targetStatus = targetNode
    ? nodePreparation(targetNode, nodes, edges, targetZipReady)
    : null;
  const reasons: string[] = [];

  function inspect(
    side: "Origem" | "Destino",
    node: FunnelNode | undefined,
    status: NodePreparation | null,
  ) {
    if (!node || !status) {
      reasons.push(
        side === "Origem" ? "Origem não encontrada" : "Destino não encontrado",
      );
      return false;
    }
    if (status.state === "error") {
      reasons.push(`${side} (${node.title}): ${status.label}`);
      return false;
    }
    for (const item of status.items) {
      if (!item.done) reasons.push(`${side} (${node.title}): ${item.label}`);
    }
    // Brand/campaign nodes have no publication checklist and permit transit.
    return status.total === 0 || status.state === "ready";
  }

  const sourceReady = inspect("Origem", sourceNode, sourceStatus);
  const targetReady = inspect("Destino", targetNode, targetStatus);
  const ready = sourceReady && targetReady;
  const state = ready
    ? "ready"
    : !sourceStatus ||
        !targetStatus ||
        sourceStatus.state === "error" ||
        targetStatus.state === "error"
      ? "error"
      : "pending";
  return {
    ready,
    state,
    label: ready ? "Percurso configurado" : "Configuração pendente",
    reasons,
    source: sourceStatus,
    target: targetStatus,
  };
}
