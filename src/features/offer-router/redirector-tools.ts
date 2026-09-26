/*
  As ferramentas do redirecionador: os tipos de bloco que o dono pode
  adicionar no quadro (página, página fake, página de oferta, home da loja
  e página de produto). Os blocos disponíveis vêm do que está hospedado na
  VPS — aqui, um catálogo de demonstração no mesmo espírito do resto da
  tela (nada roteia nem publica de verdade).
*/

/** Os tipos de bloco/página que o quadro conhece. */
export type BlocoTipo =
  | "pagina"
  | "pagina_fake"
  | "oferta"
  | "loja"
  | "produto";

export interface FerramentaDef {
  tipo: BlocoTipo;
  nome: string;
  descricao: string;
  /** Cor de acento do bloco (selo do tipo, borda da porta). */
  cor: string;
  /** `d` de um <path> 24×24 para o ícone do tipo. */
  icone: string;
}

/** As ferramentas na ordem em que aparecem na paleta. */
export const FERRAMENTAS: FerramentaDef[] = [
  {
    tipo: "pagina",
    nome: "Página",
    descricao: "Uma página comum hospedada na VPS.",
    cor: "#8a8d94",
    icone: "M6 3h9l3 3v15H6z M15 3v3h3",
  },
  {
    tipo: "pagina_fake",
    nome: "Página fake",
    descricao: "Uma página de fachada (avaliação, notícia).",
    cor: "#fbbf24",
    icone: "M12 3l9 16H3z M12 10v4 M12 17h.01",
  },
  {
    tipo: "oferta",
    nome: "Página de oferta",
    descricao: "A página que vende a oferta.",
    cor: "#2bd975",
    icone: "M4 7h16v10H4z M8 7v-2h8v2 M4 12h16",
  },
  {
    tipo: "loja",
    nome: "Home da loja",
    descricao: "A página inicial de uma loja.",
    cor: "#60a5fa",
    icone: "M4 9l1-4h14l1 4 M5 9v10h14V9 M9 19v-6h6v6",
  },
  {
    tipo: "produto",
    nome: "Página de produto",
    descricao: "A página de um produto da loja.",
    cor: "#e879f9",
    icone: "M3 8l9-5 9 5-9 5z M3 8v8l9 5 9-5V8",
  },
];

const POR_TIPO = new Map(FERRAMENTAS.map((f) => [f.tipo, f]));
export function ferramenta(tipo: BlocoTipo): FerramentaDef {
  return POR_TIPO.get(tipo) ?? FERRAMENTAS[0];
}
export function rotuloTipo(tipo: BlocoTipo): string {
  return ferramenta(tipo).nome;
}
export function corDoTipo(tipo: BlocoTipo): string {
  return ferramenta(tipo).cor;
}

/** Uma coisa hospedada na VPS que vira um bloco pronto no quadro. */
export interface HospedadoVps {
  id: string;
  tipo: BlocoTipo;
  nome: string;
  /** Endereço público (caminho ou URL). */
  url: string;
  /** O site/servidor da VPS onde está hospedado. */
  site: string;
}

/**
 * O que está hospedado na VPS (demonstração): dois sites — uma loja com
 * home e produtos, e um site de oferta com página de oferta e uma página
 * fake. Numa versão ligada, viria dos sites/servidores reais da VPS.
 */
export const HOSPEDADO_VPS: HospedadoVps[] = [
  // Loja "Suprema" — home + produtos
  {
    id: "loja-suprema",
    tipo: "loja",
    nome: "Loja Suprema — home",
    url: "https://loja-suprema.com/",
    site: "loja-suprema.com",
  },
  {
    id: "prod-relogio",
    tipo: "produto",
    nome: "Relógio Aviator",
    url: "https://loja-suprema.com/produto/relogio-aviator",
    site: "loja-suprema.com",
  },
  {
    id: "prod-oculos",
    tipo: "produto",
    nome: "Óculos Eclipse",
    url: "https://loja-suprema.com/produto/oculos-eclipse",
    site: "loja-suprema.com",
  },
  {
    id: "prod-bota",
    tipo: "produto",
    nome: "Bota Trek",
    url: "https://loja-suprema.com/produto/bota-trek",
    site: "loja-suprema.com",
  },
  // Site de oferta — oferta + página fake
  {
    id: "oferta-quente",
    tipo: "oferta",
    nome: "Oferta Black — VSL",
    url: "https://oferta-quente.com/oferta",
    site: "oferta-quente.com",
  },
  {
    id: "fake-avaliacao",
    tipo: "pagina_fake",
    nome: "Avaliação (fachada)",
    url: "https://oferta-quente.com/avaliacao",
    site: "oferta-quente.com",
  },
  // Site comum
  {
    id: "pagina-inicio",
    tipo: "pagina",
    nome: "Página inicial",
    url: "https://meusite.com/inicio",
    site: "meusite.com",
  },
];

/** O que está hospedado na VPS de um dado tipo. */
export function hospedadosDoTipo(tipo: BlocoTipo): HospedadoVps[] {
  return HOSPEDADO_VPS.filter((h) => h.tipo === tipo);
}

/** Um bloco de página posto no quadro pelo dono. */
export interface BlocoPagina {
  id: string;
  tipo: BlocoTipo;
  nome: string;
  url: string;
  /** O site da VPS, quando o bloco veio de algo hospedado. */
  site?: string;
}
