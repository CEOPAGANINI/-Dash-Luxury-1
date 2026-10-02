import {
  funnelNodeAddress,
  normalizeFunnelAddress,
  pageAddress,
} from "./funnel-address";
import { TIPOS_PAGINA, type FunnelEdge, type FunnelNode } from "./funnel-model";

export type NodePreparation = {
  items: { label: string; done: boolean }[];
  completed: number;
  total: number;
  state: "draft" | "pending" | "ready" | "error";
  label: string;
};

function configuredAddress(node: FunnelNode) {
  return node.pagina
    ? pageAddress(node.pagina)
    : node.url?.trim()
      ? normalizeFunnelAddress(node.url)
      : funnelNodeAddress(node);
}

/** Informational editing checklist. Publication remains validated by the exporter/API. */
export function nodePreparation(
  node: FunnelNode,
  nodes: FunnelNode[],
  edges: FunnelEdge[],
  zipReady = false,
): NodePreparation {
  let items: NodePreparation["items"] = [];
  const address = configuredAddress(node);
  const outgoing = edges.filter((edge) => edge.source === node.id);
  const validTarget = (id: string) =>
    nodes.some(
      (target) => target.id === id && Boolean(configuredAddress(target)),
    );
  const connected = outgoing.some((edge) => validTarget(edge.target));
  let invalid = outgoing.some((edge) => !validTarget(edge.target));
  if (node.type === "redirect") {
    const active = (node.redir?.regras ?? []).filter((rule) => rule.ativo);
    const sliceTotal = active
      .filter((rule) => rule.tipo === "fatia")
      .reduce((sum, rule) => sum + rule.percentual, 0);
    const validRule = (rule: (typeof active)[number]) =>
      rule.destinoNoId
        ? rule.destinoNoId !== node.id && validTarget(rule.destinoNoId)
        : Boolean(normalizeFunnelAddress(rule.destino)) &&
          normalizeFunnelAddress(rule.destino)?.replace(/\/$/, "") !==
            address?.replace(/\/$/, "");
    invalid ||= active.some((rule) => !validRule(rule));
    items = [
      { label: "Regras revisadas", done: Boolean(node.redir) },
      {
        label: "Regras exportáveis",
        done:
          sliceTotal <= 100 &&
          !active.some(
            (rule) => rule.tipo === "regiao" || rule.tipo === "rede",
          ),
      },
      { label: "Destinos válidos", done: active.every(validRule) },
      {
        label: "Alternativa ligada",
        done:
          (outgoing.length === 1 &&
            connected &&
            outgoing[0].target !== node.id) ||
          (outgoing.length === 0 && sliceTotal === 100),
      },
    ];
  } else if (TIPOS_PAGINA.has(node.type)) {
    const outputs = Object.values(node.pagina?.saidas ?? {});
    const validOutputs = outputs.some((output) =>
      output.etapaId
        ? validTarget(output.etapaId)
        : Boolean(normalizeFunnelAddress(output.url)),
    );
    const content =
      zipReady ||
      Boolean(node.headline?.trim()) ||
      (node.type === "store" && Boolean(node.loja?.produtos.length));
    items = [
      { label: "Conteúdo", done: content },
      { label: "Endereço", done: Boolean(address) },
      { label: "ZIP nesta aba", done: zipReady },
      {
        label: node.type === "thanks" ? "Conclusão" : "Próxima etapa",
        done: node.type === "thanks" || connected || validOutputs,
      },
    ];
    invalid ||= !address;
  }
  const completed = items.filter((item) => item.done).length;
  const state = invalid
    ? "error"
    : items.length && completed === items.length
      ? "ready"
      : completed
        ? "pending"
        : "draft";
  return {
    items,
    completed,
    total: items.length,
    state,
    label: invalid
      ? "Destino inválido"
      : state === "ready"
        ? "Pronto"
        : state === "pending"
          ? "Em preparação"
          : "Rascunho",
  };
}
