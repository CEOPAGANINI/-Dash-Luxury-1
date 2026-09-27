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

/** A saúde de um domínio: o que já está pronto para subir uma landing. */
export interface SaudeDominio {
  /** Registro A apontado para o IP da VPS. */
  dns: boolean;
  /** Domínio já propagou na internet. */
  propagado: boolean;
  /** Certificado HTTPS emitido e ativo. */
  https: boolean;
}

/** Um domínio hospedado na VPS. */
export interface DominioVps {
  host: string;
  titulo: string;
  /** Estado do domínio (demonstração), como nas telas da VPS. */
  estado: "ativo" | "configurando";
  /** Verificação de saúde do domínio (demonstração). */
  saude: SaudeDominio;
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
  {
    host: "loja-suprema.com",
    titulo: "Loja Suprema",
    estado: "ativo",
    saude: { dns: true, propagado: true, https: true },
  },
  {
    host: "oferta-quente.com",
    titulo: "Oferta Quente",
    estado: "ativo",
    saude: { dns: true, propagado: true, https: true },
  },
  {
    host: "promo-vip.com",
    titulo: "Promo VIP",
    estado: "ativo",
    saude: { dns: true, propagado: true, https: true },
  },
  {
    // Apontou o DNS, mas ainda propagando e sem HTTPS emitido.
    host: "meusite.com",
    titulo: "Meu site",
    estado: "configurando",
    saude: { dns: true, propagado: false, https: false },
  },
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

/*
  Slugs criados pelo dono na sessão (demonstração). Ficam num store em
  memória do navegador para aparecerem na lista de todos os blocos até
  recarregar a página. Nada publica nem cria rota de verdade.
*/
const SLUGS_CRIADOS: PaginaVps[] = [];
let seqSlug = 1;

/** Normaliza um caminho para virar um slug (ex.: "Oferta Nova" → "/oferta-nova"). */
export function normalizarSlug(caminho: string): string {
  const t = (caminho ?? "").trim();
  if (!t || t === "/") return "/";
  return (
    "/" +
    t
      .replace(/^\/+/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/** Todos os slugs de um domínio: as páginas hospedadas + os criados aqui. */
export function slugsDoDominio(host: string): PaginaVps[] {
  return [
    ...paginasDoDominio(host),
    ...SLUGS_CRIADOS.filter((s) => s.host === host),
  ];
}

/**
 * Cria um slug novo num domínio (demonstração) e devolve-o. Se o caminho
 * já existe no domínio, devolve o existente sem duplicar.
 */
export function criarSlug(
  host: string,
  caminho: string,
  nome?: string,
): PaginaVps {
  const c = normalizarSlug(caminho);
  const jaExiste = slugsDoDominio(host).find((s) => s.caminho === c);
  if (jaExiste) return jaExiste;
  const novo: PaginaVps = {
    id: `slug-${seqSlug++}`,
    host,
    tipo: "pagina",
    nome: nome?.trim() || c,
    caminho: c,
  };
  SLUGS_CRIADOS.push(novo);
  return novo;
}

/** As páginas de um domínio de um dado tipo. */
export function paginasDoDominioTipo(
  host: string,
  tipo: PaginaTipo,
): PaginaVps[] {
  return PAGINAS_VPS.filter((p) => p.host === host && p.tipo === tipo);
}

/**
 * A saúde de um domínio (demonstração): os do catálogo usam a sua própria
 * verificação; um domínio digitado à mão (fora do catálogo) começa tudo
 * pendente — nada apontado ainda.
 */
export function saudeDoDominio(host?: string): SaudeDominio {
  if (!host) return { dns: false, propagado: false, https: false };
  const d = DOMINIOS_VPS.find((x) => x.host === host);
  return d ? d.saude : { dns: false, propagado: false, https: false };
}

/** Um domínio está pronto para subir landing quando passou em tudo. */
export function dominioPronto(host?: string): boolean {
  const s = saudeDoDominio(host);
  return s.dns && s.propagado && s.https;
}

/**
 * O estado de um domínio para o selo do bloco: 🟢 quando passou em tudo,
 * 🟡 enquanto ainda falta algo. Sem domínio, indefinido.
 */
export function estadoDoDominio(
  host?: string,
): "ativo" | "configurando" | undefined {
  if (!host) return undefined;
  return dominioPronto(host) ? "ativo" : "configurando";
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

/*
  Modo cofre do domínio (demonstração): tranca o domínio inteiro para o
  visitante só conseguir VER a página e COMPRAR — nada além disso. Fica num
  store em memória do navegador, por domínio. Nada muda no servidor de
  verdade; vira robots.txt, cabeçalhos e regras do site na Fase 2.
*/
export interface ItemCofre {
  id: string;
  rotulo: string;
  dica: string;
  /** Grupo para a lista: busca, cópia, acesso, embutir. */
  grupo: "busca" | "copia" | "acesso" | "embutir";
}

export const ITENS_COFRE: ItemCofre[] = [
  { id: "noindex", grupo: "busca", rotulo: "Some da busca, mas abre pelo link", dica: "noindex + nofollow: quem tem o link entra normal; o Google não lista" },
  { id: "robots", grupo: "busca", rotulo: "robots.txt fecha para scrapers e robôs estranhos", dica: "Google continua lendo só para ver o noindex e sair — senão o link apareceria \"pelado\"" },
  { id: "sitemap", grupo: "busca", rotulo: "Sem sitemap.xml nem sitemap index", dica: "Não existe mapa do site para ninguém ler" },
  { id: "ia", grupo: "busca", rotulo: "Robôs de IA bloqueados", dica: "GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider…" },
  { id: "cache", grupo: "busca", rotulo: "Sem cache, trecho ou cópia arquivada", dica: "noarchive, nosnippet e sem Wayback" },
  { id: "copia", grupo: "copia", rotulo: "Sem copiar texto, salvar imagem ou botão direito", dica: "Anti-cópia ligado em tudo" },
  { id: "devtools", grupo: "copia", rotulo: "Desfoca se abrir o inspecionar (F12, Ctrl+U, Ctrl+S)", dica: "Atalhos de código bloqueados" },
  { id: "print", grupo: "copia", rotulo: "Dificultar print e seleção", dica: "user-select off, impressão em branco" },
  { id: "slugs", grupo: "acesso", rotulo: "Só as páginas publicadas respondem", dica: "Qualquer outro caminho do domínio dá 404" },
  { id: "pastas", grupo: "acesso", rotulo: "Sem listagem de pastas nem arquivos soltos", dica: "/imagens/, /js/, .zip, .env — tudo fechado" },
  { id: "hotlink", grupo: "acesso", rotulo: "Imagens e vídeos só carregam dentro da sua página", dica: "Anti-hotlink: fora dela, não abrem" },
  { id: "iframe", grupo: "embutir", rotulo: "Ninguém embute sua página em outro site", dica: "X-Frame-Options: DENY + CSP frame-ancestors" },
  { id: "referrer", grupo: "embutir", rotulo: "Não vazar a origem ao sair para o checkout", dica: "Referrer-Policy: no-referrer" },
];

const COFRE: Record<string, boolean> = {};

/** Se o domínio está trancado no modo cofre (demonstração). */
export function cofreDoDominio(host?: string): boolean {
  return Boolean(host && COFRE[host]);
}

/** Liga/desliga o modo cofre do domínio (demonstração). */
export function setCofreDoDominio(host: string, on: boolean): void {
  COFRE[host] = on;
}
