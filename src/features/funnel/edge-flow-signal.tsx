"use client";

import { useSyncExternalStore } from "react";
import { edgePreparation } from "./edge-status";
import type { FunnelEdge, FunnelNode } from "./funnel-model";
import { usePageZip } from "./use-page-zip";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotionPreference(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const reducedMotionSnapshot = () =>
  typeof window.matchMedia === "function"
    ? window.matchMedia(motionQuery).matches
    : true;
const serverReducedMotionSnapshot = () => true;

export type FlowEdgeSignalProps = {
  path: string;
  tip: { x: number; y: number };
  source: string;
  target: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  storageId: string;
  funnelId: string;
  enabled?: boolean;
};

export type EdgePreparationScope = Pick<
  FlowEdgeSignalProps,
  "source" | "target" | "nodes" | "edges" | "storageId" | "funnelId"
>;

/** Reads the actual prepared ZIP cache; saved metadata alone is insufficient. */
export function useEdgePreparation({
  source,
  target,
  nodes,
  edges,
  storageId,
  funnelId,
}: EdgePreparationScope) {
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  const sourceZip = usePageZip({
    storageId,
    funnelId: sourceNode?.pagina?.zip?.sourceFunnelId ?? funnelId,
    nodeId: source,
  });
  const targetZip = usePageZip({
    storageId,
    funnelId: targetNode?.pagina?.zip?.sourceFunnelId ?? funnelId,
    nodeId: target,
  });
  return edgePreparation({
    source,
    target,
    nodes,
    edges,
    sourceZipReady: Boolean(sourceZip),
    targetZipReady: Boolean(targetZip),
  });
}

/** A moving configuration light, independent from the chosen wire color. */
export function FlowEdgeSignal({
  path,
  tip,
  enabled = true,
  ...scope
}: FlowEdgeSignalProps) {
  const status = useEdgePreparation(scope);
  const reducedMotion = useSyncExternalStore(
    subscribeMotionPreference,
    reducedMotionSnapshot,
    serverReducedMotionSnapshot,
  );

  return (
    <g
      className="funnel__edge-signal"
      data-ready={String(status.ready)}
      data-enabled={String(enabled)}
      data-state={status.state}
      data-reduced-motion={String(reducedMotion)}
      aria-hidden="true"
    >
      <title>
        {enabled ? status.label : "Fluxo desligado"}
        {enabled && status.reasons.length
          ? `: ${status.reasons.join("; ")}`
          : ""}
      </title>
      {enabled && (
        <>
          <g
            className="funnel__edge-signal-tip"
            transform={`translate(${tip.x} ${tip.y})`}
          >
            <circle className="funnel__edge-light-halo" r="8" />
            <circle className="funnel__edge-light" r="4" />
          </g>
          {!reducedMotion && (
            <g className="funnel__edge-pulse">
              <circle className="funnel__edge-light-halo" r="7" />
              <circle className="funnel__edge-light" r="3.5" />
              <animateMotion path={path} dur="2.4s" repeatCount="indefinite" />
            </g>
          )}
        </>
      )}
    </g>
  );
}
