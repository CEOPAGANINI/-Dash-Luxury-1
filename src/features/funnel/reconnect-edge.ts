import type {
  FunnelConnectionAnchor,
  FunnelEdge,
  FunnelNode,
  PaginaSaida,
} from "./funnel-model";

type Graph = { nodes: FunnelNode[]; edges: FunnelEdge[] };
type Reconnect = {
  source: string;
  target: string;
  sourceAnchor?: FunnelConnectionAnchor;
  targetAnchor?: FunnelConnectionAnchor;
};
type Output = PaginaSaida;
const copyOutputs = (
  outputs: Record<string, Output> = {},
): Record<string, Output> =>
  Object.assign(Object.create(null) as Record<string, Output>, outputs);

function availableLabel(
  outputs: Record<string, Output>,
  requested: string,
): string {
  requested = requested.slice(0, 200) || "Saída";
  let label = requested;
  let index = 2;
  while (Object.hasOwn(outputs, label)) {
    const suffix = ` (${index++})`;
    label = requested.slice(0, 200 - suffix.length) + suffix;
  }
  return label;
}

/** Add a manual wire without hiding it behind an existing explicit output map.
 * A newly created target may be queued in the same React batch by the caller.
 */
export function addFunnelEdge(graph: Graph, edge: FunnelEdge): Graph {
  const source = graph.nodes.find((node) => node.id === edge.source);
  if (
    !source ||
    edge.source === edge.target ||
    graph.edges.some(
      (item) =>
        item.id === edge.id ||
        (item.source === edge.source && item.target === edge.target),
    )
  )
    return graph;
  const explicit = source.pagina?.saidas;
  const hasOutputs =
    explicit &&
    Object.values(explicit).some((output) => output.etapaId || output.url);
  const alreadyRepresented =
    explicit &&
    Object.values(explicit).some((output) => output.etapaId === edge.target);
  if (!hasOutputs || alreadyRepresented || !source.pagina)
    return { nodes: graph.nodes, edges: [...graph.edges, edge] };
  const outputs = copyOutputs(explicit);
  const target = graph.nodes.find((node) => node.id === edge.target);
  const label = availableLabel(
    outputs,
    edge.rotulo || target?.title || "Saída",
  );
  outputs[label] = { etapaId: edge.target };
  return {
    nodes: graph.nodes.map((node) =>
      node.id === source.id
        ? { ...node, pagina: { ...source.pagina!, saidas: outputs } }
        : node,
    ),
    edges: [...graph.edges, { ...edge, rotulo: label }],
  };
}

/** Reconnect a manual wire and the explicit page outputs represented by it. */
export function reconnectFunnelEdge(
  graph: Graph,
  edgeId: string,
  connection: Reconnect,
): Graph {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge || edgeId.startsWith("rr:")) return graph;
  const { source, target } = connection;
  if (
    source === target ||
    !graph.nodes.some((n) => n.id === source) ||
    !graph.nodes.some((n) => n.id === target)
  )
    return graph;
  const changedRoute = edge.source !== source || edge.target !== target;
  if (
    changedRoute &&
    graph.edges.some(
      (item) =>
        item.id !== edge.id && item.source === source && item.target === target,
    )
  )
    return graph;
  const sourceNode = graph.nodes.find((n) => n.id === edge.source);
  const matches = changedRoute
    ? Object.entries(sourceNode?.pagina?.saidas ?? {}).filter(
        ([, output]) => output.etapaId === edge.target,
      )
    : [];
  let nextLabel = edge.rotulo;
  let nodes = graph.nodes;
  if (matches.length) {
    if (source === edge.source) {
      const matchingLabels = new Set(matches.map(([label]) => label));
      nodes = graph.nodes.map((node) =>
        node.id === source && node.pagina
          ? {
              ...node,
              pagina: {
                ...node.pagina,
                saidas: Object.fromEntries(
                  Object.entries(node.pagina.saidas).map(([label, output]) => [
                    label,
                    matchingLabels.has(label) ? { etapaId: target } : output,
                  ]),
                ),
              },
            }
          : node,
      );
    } else {
      const matchingLabels = new Set(matches.map(([label]) => label));
      const destinationSource = graph.nodes.find((node) => node.id === source);
      const transferred = copyOutputs(destinationSource?.pagina?.saidas);
      for (const [label] of matches) {
        // Reuse an identical route; never overwrite an unrelated explicit URL.
        const sameRoute = transferred[label]?.etapaId === target;
        const newLabel = sameRoute ? label : availableLabel(transferred, label);
        if (!sameRoute) transferred[newLabel] = { etapaId: target };
        if (edge.rotulo === label) nextLabel = newLabel;
      }
      nodes = graph.nodes.map((node) => {
        if (node.id === edge.source && node.pagina)
          return {
            ...node,
            pagina: {
              ...node.pagina,
              saidas: Object.fromEntries(
                Object.entries(node.pagina.saidas).filter(
                  ([label]) => !matchingLabels.has(label),
                ),
              ),
            },
          };
        if (node.id === source && node.pagina)
          return { ...node, pagina: { ...node.pagina, saidas: transferred } };
        return node;
      });
    }
  }
  if (!matches.length && changedRoute) {
    // Explicit outputs take precedence over wires during export. A newly
    // connected wire must remain represented without replacing those outputs.
    const newSource = graph.nodes.find((node) => node.id === source);
    if (
      newSource?.pagina &&
      Object.values(newSource.pagina.saidas).some(
        (output) => output.etapaId || output.url,
      )
    ) {
      const outputs = copyOutputs(newSource.pagina.saidas);
      const matchingLabel = Object.entries(outputs).find(
        ([, output]) => output.etapaId === target,
      )?.[0];
      if (!matchingLabel) {
        const label = availableLabel(
          outputs,
          edge.rotulo ||
            graph.nodes.find((node) => node.id === target)!.title.slice(0, 200),
        );
        outputs[label] = { etapaId: target };
        nextLabel = label;
        nodes = graph.nodes.map((node) =>
          node.id === source
            ? { ...node, pagina: { ...newSource.pagina!, saidas: outputs } }
            : node,
        );
      }
    }
  }
  return {
    nodes,
    edges: graph.edges.map((item) =>
      item.id === edge.id
        ? {
            ...item,
            source,
            target,
            rotulo: nextLabel,
            estilo: {
              ...item.estilo,
              ...(connection.sourceAnchor
                ? { sourceAnchor: connection.sourceAnchor }
                : {}),
              ...(connection.targetAnchor
                ? { targetAnchor: connection.targetAnchor }
                : {}),
            },
          }
        : item,
    ),
  };
}
