/*
  A ponte entre o Roteador de ofertas e o Quadro de funil.

  O dono quer escolher, dentro do redirecionador, páginas/lojas/links que
  já existem no quadro de funil — como origem (a página que recebe o
  tráfego) e como destino (para onde mandar quem bate numa regra). Aqui a
  gente lê os nós do funil e devolve só os que fazem sentido como um lugar
  para onde um visitante pode ir. Continua sendo demonstração: nada roteia
  nem publica de verdade.
*/

import { FUNIL_DEMO } from "@/features/funnel/funnel-demo";
import type {
  FunnelData,
  FunnelNode,
  FunnelNodeType,
} from "@/features/funnel/funnel-model";

/** As famílias de lugar que o redirecionador entende. */
export type FunnelDestKind = "pagina" | "quiz" | "loja" | "link";

/** Um lugar do funil que dá para escolher no redirecionador. */
export interface FunnelDestino {
  /** Id do nó no funil (para não duplicar ao adicionar). */
  id: string;
  /** Nome mostrado (o título do nó no funil). */
  nome: string;
  /** Endereço utilizável — caminho (/...) ou URL http(s). */
  url: string;
  categoria: FunnelDestKind;
}

/** De que tipo de nó do funil sai cada família (os outros são ignorados). */
const CATEGORIA_POR_TIPO: Partial<Record<FunnelNodeType, FunnelDestKind>> = {
  page_v3: "pagina",
  quiz: "quiz",
  pipeline: "loja",
  pipeline_ticket: "loja",
  shortcut_url: "link",
  link_whats: "link",
  link_split: "link",
  link_test_ab: "link",
  link_countries: "link",
};

/** Rótulo do grupo, para os cabeçalhos do seletor. */
export const ROTULO_CATEGORIA: Record<FunnelDestKind, string> = {
  pagina: "Páginas",
  quiz: "Quizzes",
  loja: "Lojas / Checkout",
  link: "Links / Atalhos",
};

/** Ordem em que os grupos aparecem no seletor. */
export const ORDEM_CATEGORIA: FunnelDestKind[] = [
  "pagina",
  "quiz",
  "loja",
  "link",
];

/**
 * Um endereço utilizável para o nó: usa a url do nó quando é caminho (/...)
 * ou URL http(s); senão, monta um slug a partir do título (ex.: "Checkout"
 * → "/checkout"). Assim uma loja cujo nó guarda um rótulo ("negócios")
 * ainda vira um destino apresentável.
 */
function enderecoDoNo(n: FunnelNode): string {
  const u = (n.url ?? "").trim();
  if (u.startsWith("/") || /^https?:\/\//i.test(u)) return u;
  const slug = n.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return "/" + (slug || n.id);
}

/** Os lugares do funil que dá para escolher no redirecionador. */
export function destinosDoFunil(data: FunnelData = FUNIL_DEMO): FunnelDestino[] {
  const saida: FunnelDestino[] = [];
  for (const n of data.nodes) {
    const categoria = CATEGORIA_POR_TIPO[n.type];
    if (!categoria) continue;
    saida.push({ id: n.id, nome: n.title, url: enderecoDoNo(n), categoria });
  }
  return saida;
}

/** Só os lugares que recebem tráfego (viram origem no redirecionador). */
export function origensDoFunil(data: FunnelData = FUNIL_DEMO): FunnelDestino[] {
  return destinosDoFunil(data).filter(
    (d) => d.categoria === "pagina" || d.categoria === "quiz",
  );
}

/** Agrupa os destinos por categoria, na ordem do seletor. */
export function destinosPorCategoria(
  itens: FunnelDestino[],
): { categoria: FunnelDestKind; itens: FunnelDestino[] }[] {
  return ORDEM_CATEGORIA.map((categoria) => ({
    categoria,
    itens: itens.filter((d) => d.categoria === categoria),
  })).filter((g) => g.itens.length > 0);
}

/** Os lugares do funil de demonstração, prontos para a tela. */
export const DESTINOS_FUNIL = destinosDoFunil();
export const ORIGENS_FUNIL = origensDoFunil();
