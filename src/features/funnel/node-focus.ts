import type { FunnelNode } from "./funnel-model";

/** Fits the complete card beneath the canvas controls, beside its inspector. */
export function nodeFocusViewport(
  node: Pick<FunnelNode, "x" | "y">,
  size: { w: number; h: number },
  canvas: { width: number; height: number },
  split: boolean,
) {
  if (canvas.width <= 0 || canvas.height <= 0 || size.w <= 0 || size.h <= 0)
    return null;
  const width = split ? canvas.width / 2 : canvas.width;
  const margin = Math.min(24, width / 8);
  // Keep the card and its floating toolbar away from the view/zoom controls.
  const top = Math.min(168, canvas.height / 3);
  const bottom = Math.min(72, canvas.height / 8);
  const availableWidth = Math.max(1, width - margin * 2);
  const availableHeight = Math.max(1, canvas.height - top - bottom);
  const k = Math.min(1.5, availableWidth / size.w, availableHeight / size.h);
  return {
    k,
    x: width / 2 - (node.x + size.w / 2) * k,
    y: top + availableHeight / 2 - (node.y + size.h / 2) * k,
  };
}
