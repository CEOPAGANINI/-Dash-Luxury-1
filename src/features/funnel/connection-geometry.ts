import type { EstiloLinha, FunnelConnectionAnchor } from "./funnel-model";

export type ConnectionPoint = { x: number; y: number };
export type ConnectionBounds = ConnectionPoint & { w: number; h: number };
export const SOURCE_ANCHOR: FunnelConnectionAnchor = {
  side: "right",
  offset: 0.5,
};
export const TARGET_ANCHOR: FunnelConnectionAnchor = {
  side: "left",
  offset: 0.5,
};
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function anchorPoint(
  bounds: ConnectionBounds,
  anchor: FunnelConnectionAnchor,
): ConnectionPoint {
  const t = clamp(anchor.offset);
  switch (anchor.side) {
    case "top":
      return { x: bounds.x + bounds.w * t, y: bounds.y };
    case "bottom":
      return { x: bounds.x + bounds.w * t, y: bounds.y + bounds.h };
    case "left":
      return { x: bounds.x, y: bounds.y + bounds.h * t };
    case "right":
      return { x: bounds.x + bounds.w, y: bounds.y + bounds.h * t };
  }
}

/** Projeta o ponteiro na borda mais próxima; o offset independe do tamanho/zoom. */
export function perimeterAnchor(
  bounds: ConnectionBounds,
  point: ConnectionPoint,
  side?: FunnelConnectionAnchor["side"],
): FunnelConnectionAnchor {
  const candidates = (
    side ? [side] : (["top", "right", "bottom", "left"] as const)
  ).map((s) => {
    const offset =
      s === "top" || s === "bottom"
        ? clamp((point.x - bounds.x) / Math.max(1, bounds.w))
        : clamp((point.y - bounds.y) / Math.max(1, bounds.h));
    const anchor = { side: s, offset };
    const projected = anchorPoint(bounds, anchor);
    return {
      anchor,
      distance: Math.hypot(point.x - projected.x, point.y - projected.y),
    };
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0].anchor;
}

const normal = (side: FunnelConnectionAnchor["side"]): ConnectionPoint =>
  ({
    top: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  })[side];

export function connectionControls(
  start: ConnectionPoint,
  end: ConnectionPoint,
  style?: EstiloLinha,
): ConnectionPoint[] {
  if (style?.forma === "livre" && style.pontos?.length)
    return style.pontos.slice(0, 2);
  if (style?.forma === "reta" || style?.forma === "cotovelo")
    return [{ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }];
  const distance = Math.max(
    40,
    (!style?.sourceAnchor && !style?.targetAnchor
      ? Math.abs(end.x - start.x)
      : Math.hypot(end.x - start.x, end.y - start.y)) / 2,
  );
  const source = normal(style?.sourceAnchor?.side ?? "right");
  const target = normal(style?.targetAnchor?.side ?? "left");
  return [
    { x: start.x + source.x * distance, y: start.y + source.y * distance },
    { x: end.x + target.x * distance, y: end.y + target.y * distance },
  ];
}

export function connectionMidpoint(
  start: ConnectionPoint,
  end: ConnectionPoint,
  style?: EstiloLinha,
): ConnectionPoint {
  if (style?.forma === "reta" || style?.forma === "cotovelo")
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const points = connectionControls(start, end, style);
  if (points.length === 1)
    return {
      x: (start.x + end.x) / 4 + points[0].x / 2,
      y: (start.y + end.y) / 4 + points[0].y / 2,
    };
  return {
    x: (start.x + end.x) / 8 + (3 * (points[0].x + points[1].x)) / 8,
    y: (start.y + end.y) / 8 + (3 * (points[0].y + points[1].y)) / 8,
  };
}

/** O ponto visível no meio acompanha o deslocamento do ponteiro exatamente. */
export function moveConnectionControls(
  points: ConnectionPoint[],
  delta: ConnectionPoint,
): ConnectionPoint[] {
  const weight = points.length === 1 ? 2 : 4 / 3;
  return points.map((p) => ({
    x: p.x + delta.x * weight,
    y: p.y + delta.y * weight,
  }));
}

export function connectionPath(
  start: ConnectionPoint,
  end: ConnectionPoint,
  style?: EstiloLinha,
  offset = 0,
): string {
  const p = (point: ConnectionPoint) =>
    `${point.x + offset} ${point.y + offset}`;
  if (style?.forma === "reta") return `M ${p(start)} L ${p(end)}`;
  if (style?.forma === "cotovelo") {
    const vertical =
      style.sourceAnchor?.side === "top" ||
      style.sourceAnchor?.side === "bottom";
    return vertical
      ? `M ${p(start)} V ${(start.y + end.y) / 2 + offset} H ${end.x + offset} V ${end.y + offset}`
      : `M ${p(start)} H ${(start.x + end.x) / 2 + offset} V ${end.y + offset} H ${end.x + offset}`;
  }
  const controls = connectionControls(start, end, style);
  return controls.length === 1
    ? `M ${p(start)} Q ${p(controls[0])} ${p(end)}`
    : `M ${p(start)} C ${p(controls[0])}, ${p(controls[1])}, ${p(end)}`;
}
