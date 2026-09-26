/*
  O catálogo do que está hospedado na VPS (demonstração), organizado por
  domínio. É a fonte compartilhada entre o quadro de funil e o
  redirecionador: dá para escolher o domínio e, dentro dele, as páginas,
  lojas e páginas de oferta. Numa versão ligada, viria dos sites e
  servidores reais da VPS; aqui é só demonstração — nada roteia nem
  publica.
*/

/** Os tipos de página que a VPS hospeda. */
export type PaginaTipo =
  | "pagina"
  | "pagina_fake"
  | "oferta"
  | "loja"
  | "produto";

/** Um domínio hospedado na VPS. */
export interface DominioVps {
  host: string;
  titulo: string;
  /** Estado do domínio (demonstração), como nas telas da VPS. */
  estado: "ativo" | "configurando";
}

/** Uma página publicada num domínio da VPS. */
export interface PaginaVps {
  id: string;
  host: string;
  tipo: PaginaTipo;
  nome: string;
  /** Caminho dentro do domínio (ex.: "/oferta"). */
  caminho: string;
}

/** Os domínios da VPS (demonstração). */
export const DOMINIOS_VPS: DominioVps[] = [
  { host: "loja-suprema.com", titulo: "Loja Suprema", estado: "ativo" },
  { host: "oferta-quente.com", titulo: "Oferta Quente", estado: "ativo" },
  { host: "promo-vip.com", titulo: "Promo VIP", estado: "ativo" },
  { host: "meusite.com", titulo: "Meu site", estado: "configurando" },
];

/** As páginas de cada domínio (demonstração). */
export const PAGINAS_VPS: PaginaVps[] = [
  // loja-suprema.com — uma loja com home e produtos
  {
    id: "sup-home",
    host: "loja-suprema.com",
    tipo: "loja",
    nome: "Home da loja",
    caminho: "/",
  },
  {
    id: "sup-relogio",
    host: "loja-suprema.com",
    tipo: "produto",
    nome: "Relógio Aviator",
    caminho: "/produto/relogio-aviator",
  },
  {
    id: "sup-oculos",
    host: "loja-suprema.com",
    tipo: "produto",
    nome: "Óculos Eclipse",
    caminho: "/produto/oculos-eclipse",
  },
  {
    id: "sup-bota",
    host: "loja-suprema.com",
    tipo: "produto",
    nome: "Bota Trek",
    caminho: "/produto/bota-trek",
  },
  {
    id: "sup-oferta",
    host: "loja-suprema.com",
    tipo: "oferta",
    nome: "Oferta do dia",
    caminho: "/oferta-do-dia",
  },
  // oferta-quente.com — oferta + fachada
  {
    id: "oq-oferta",
    host: "oferta-quente.com",
    tipo: "oferta",
    nome: "Oferta Black — VSL",
    caminho: "/oferta",
  },
  {
    id: "oq-fake",
    host: "oferta-quente.com",
    tipo: "pagina_fake",
    nome: "Avaliação (fachada)",
    caminho: "/avaliacao",
  },
  {
    id: "oq-pagina",
    host: "oferta-quente.com",
    tipo: "pagina",
    nome: "Termos",
    caminho: "/termos",
  },
  // promo-vip.com — oferta + fake + página
  {
    id: "pv-oferta",
    host: "promo-vip.com",
    tipo: "oferta",
    nome: "Oferta VIP",
    caminho: "/vip",
  },
  {
    id: "pv-fake",
    host: "promo-vip.com",
    tipo: "pagina_fake",
    nome: "Notícia (fachada)",
    caminho: "/noticia",
  },
  {
    id: "pv-obrigado",
    host: "promo-vip.com",
    tipo: "pagina",
    nome: "Obrigado",
    caminho: "/obrigado",
  },
  // meusite.com — página comum
  {
    id: "ms-inicio",
    host: "meusite.com",
    tipo: "pagina",
    nome: "Página inicial",
    caminho: "/inicio",
  },
];

/** A URL pública completa de uma página. */
export function urlDaPagina(p: PaginaVps): string {
  return `https://${p.host}${p.caminho}`;
}

/** As páginas de um domínio. */
export function paginasDoDominio(host: string): PaginaVps[] {
  return PAGINAS_VPS.filter((p) => p.host === host);
}

/** As páginas de um domínio de um dado tipo. */
export function paginasDoDominioTipo(
  host: string,
  tipo: PaginaTipo,
): PaginaVps[] {
  return PAGINAS_VPS.filter((p) => p.host === host && p.tipo === tipo);
}

/**
 * O estado de um domínio para o selo do bloco: os do catálogo usam o
 * próprio estado; um domínio digitado à mão (fora do catálogo) fica
 * "configurando" — aguardando o DNS apontar (demonstração).
 */
export function estadoDoDominio(
  host?: string,
): "ativo" | "configurando" | undefined {
  if (!host) return undefined;
  const d = DOMINIOS_VPS.find((x) => x.host === host);
  return d ? d.estado : "configurando";
}

/** Quantas páginas de cada tipo um domínio tem. */
export function resumoDoDominio(host: string): Record<PaginaTipo, number> {
  const base: Record<PaginaTipo, number> = {
    pagina: 0,
    pagina_fake: 0,
    oferta: 0,
    loja: 0,
    produto: 0,
  };
  for (const p of paginasDoDominio(host)) base[p.tipo] += 1;
  return base;
}
