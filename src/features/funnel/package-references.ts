import type { FunnelData } from "./funnel-model";

/** A duplicated/conflict-preserved draft keeps references to its original binary assets. */
export function preservePackageReferences(data: FunnelData): FunnelData {
  return {
    ...data,
    nodes: data.nodes.map((node) => ({
      ...node,
      ...(node.pagina
        ? {
            pagina: {
              ...node.pagina,
              ...(node.pagina.zip
                ? {
                    zip: {
                      ...node.pagina.zip,
                      sourceFunnelId: node.pagina.zip.sourceFunnelId ?? data.id,
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...(node.loja
        ? {
            loja: {
              ...node.loja,
              produtos: node.loja.produtos.map((product) => ({
                ...product,
                ...(product.zip
                  ? {
                      zip: {
                        ...product.zip,
                        sourceFunnelId: product.zip.sourceFunnelId ?? data.id,
                      },
                    }
                  : {}),
              })),
            },
          }
        : {}),
    })),
  };
}
export function packageReferenceIds(data: FunnelData): string[] {
  return [
    ...new Set(
      data.nodes
        .flatMap((node) => [
          node.pagina?.zip?.sourceFunnelId,
          ...(node.loja?.produtos.map(
            (product) => product.zip?.sourceFunnelId,
          ) ?? []),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}
