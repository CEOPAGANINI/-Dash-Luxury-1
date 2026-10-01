import { FLOW_LIMITS, type FlowPage, type LandingFlow, type PageKind } from "@/features/landing-editor/flow-model";
import { funnelNodeAddress, normalizeFunnelAddress, pageAddress } from "./funnel-address";
import type { FunnelData, FunnelNode } from "./funnel-model";

const KIND: Partial<Record<FunnelNode["type"], PageKind>> = {
  store: "home", checkout: "checkout", upsell: "upsell", downsell: "downsell", thanks: "thank-you",
};

/** Never invent a live destination from a node title or its visual position. */
function configuredAddress(node: FunnelNode): string {
  if (node.pagina) return pageAddress(node.pagina) ?? "";
  if (node.loja?.dominio) return funnelNodeAddress(node);
  return normalizeFunnelAddress(node.url ?? "") ?? "";
}

function asPage(node: FunnelNode): FlowPage {
  return {
    id: node.id,
    kind: KIND[node.type] ?? "landing",
    name: node.title.slice(0, FLOW_LIMITS.name),
    headline: node.headline ?? node.title,
    description: node.descricao ?? "",
    buttonLabel: node.buttonLabel ?? "",
    imageUrl: node.imageUrl ?? "",
    url: configuredAddress(node),
    x: 0,
    y: 0,
  };
}

/** One page and its destinations; never overwrites the standalone editor draft. */
export function contentFlowForPage(data: FunnelData, nodeId: string): LandingFlow {
  const node = data.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("A página não existe mais neste funil.");
  const page = asPage(node);
  const flow: LandingFlow = { version: 1, name: data.nome.slice(0, FLOW_LIMITS.name), pages: [page], connections: [] };
  const outputs = Object.entries(node.pagina?.saidas ?? {}).filter(([, output]) => output.etapaId || output.url);
  const add = (target: FlowPage, label: string) => {
    if (target.id === node.id) throw new Error("Uma saída desta página aponta para ela mesma. Escolha outro destino antes de exportar.");
    if (flow.connections.some((item) => item.target === target.id)) {
      let alias = `output-target-${flow.connections.length}`;
      while (data.nodes.some((item) => item.id === alias) || flow.pages.some((item) => item.id === alias)) alias = `x-${alias}`;
      target = { ...target, id: alias };
    }
    if (!flow.pages.some((item) => item.id === target.id)) flow.pages.push(target);
    let id = `output-${flow.connections.length}`;
    while (data.nodes.some((item) => item.id === id) || flow.pages.some((item) => item.id === id)) id = `x-${id}`;
    flow.connections.push({ id, source: node.id, target: target.id, label: label.slice(0, FLOW_LIMITS.label) });
  };
  if (outputs.length) {
    for (const [label, output] of outputs) {
      if (output.etapaId) {
        const target = data.nodes.find((item) => item.id === output.etapaId);
        if (!target) throw new Error(`A saída “${label}” aponta para um bloco removido. Corrija a ligação antes de exportar.`);
        add(asPage(target), label);
      } else {
        const url = normalizeFunnelAddress(output.url ?? "");
        if (!url) throw new Error(`Informe um endereço válido para a saída “${label}”.`);
        let id = `manual-output-${flow.connections.length}`;
        while (data.nodes.some((item) => item.id === id) || flow.pages.some((item) => item.id === id)) id = `x-${id}`;
        add({ ...page, id, kind: "external", name: label.slice(0, FLOW_LIMITS.name), url }, label);
      }
    }
  } else {
    for (const edge of data.edges.filter((item) => item.source === node.id)) {
      const target = data.nodes.find((item) => item.id === edge.target);
      if (!target) throw new Error("Uma ligação aponta para um bloco removido. Corrija-a antes de exportar.");
      add(asPage(target), edge.rotulo || target.title);
    }
  }
  if (flow.pages.length > FLOW_LIMITS.pages || flow.connections.length > FLOW_LIMITS.connections)
    throw new Error("Esta página excede o limite de destinos do exportador. Reduza as ligações antes de exportar.");
  return flow;
}
