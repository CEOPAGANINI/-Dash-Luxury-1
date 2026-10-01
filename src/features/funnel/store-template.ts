import { lojaVazia } from "./store-model";
import type { FunnelData, FunnelNode } from "./funnel-model";

/** Editable structure, not a connected commerce platform or fake store data. */
export function createStoreFunnel(): FunnelData {
  const definitions: [FunnelNode["type"], string, string][] = [
    ["store", "Página inicial da loja", "/"],
    ["page_v3", "Coleções", "/colecoes"],
    ["page_v3", "Categorias", "/categorias"],
    ["sales", "Página de produto", "/produto"],
    ["page_v3", "Carrinho", "/carrinho"],
    ["checkout", "Checkout", "/checkout"],
    ["upsell", "Upsell", "/upsell"],
    ["downsell", "Downsell", "/downsell"],
    ["thanks", "Obrigado", "/obrigado"],
  ];
  const nodes: FunnelNode[] = definitions.map(([type, title, path], index) => ({
    id: `store-${index}`,
    type,
    title,
    url: path,
    x: 140 + (index % 3) * 360,
    y: 100 + Math.floor(index / 3) * 320,
    pagina: { caminho: path, meta: {}, saidas: {} },
    ...(type === "store" ? { loja: lojaVazia() } : {}),
  }));
  const connections = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [6, 7],
    [7, 8],
  ];
  return {
    id: crypto.randomUUID(),
    nome: "Minha loja e funil",
    projeto: "Minha loja",
    nodes,
    edges: connections.map(([source, target], index) => ({
      id: `store-edge-${index}`,
      source: nodes[source].id,
      target: nodes[target].id,
      rotulo:
        target === 7
          ? "Recusar oferta"
          : target === 8
            ? "Concluir"
            : "Continuar",
    })),
  };
}
