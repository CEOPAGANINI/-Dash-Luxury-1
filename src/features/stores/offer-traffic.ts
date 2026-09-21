/*
  As ofertas de uma loja e quais estão a receber tráfego.

  "Receber tráfego" não é palpite: é um destes três sinais, nesta ordem
  de força — há campanha ligada a gastar por ela, houve visitas à página
  dela, ou entraram pedidos dela no período. A tela diz sempre qual dos
  três acendeu, para ninguém confundir "está anunciada" com "está a
  vender".

  Este módulo não fala com o banco nem com o navegador: é a conta pura,
  lida pelo servidor e pela tela.
*/

export type SinalDeTrafego = "campanha" | "visitas" | "vendas" | "nenhum";

export interface CampanhaDaOferta {
  id: string;
  nome: string;
  rede: string;
  status: string;
  spendCents: number;
  revenueCents: number;
}

export interface Oferta {
  id: string;
  nome: string;
  slug: string;
  precoCents: number;
  /** A oferta está publicada na loja. */
  ativa: boolean;
  visitas: number;
  pedidos: number;
  receitaCents: number;
  campanhas: CampanhaDaOferta[];
}

export const ROTULO_DO_SINAL: Record<SinalDeTrafego, string> = {
  campanha: "Campanha ativa",
  visitas: "Visitas na página",
  vendas: "Vendas no período",
  nenhum: "Sem tráfego",
};

/** Só contam as campanhas ligadas e a gastar. */
export function campanhasAcesas(oferta: Oferta): CampanhaDaOferta[] {
  return oferta.campanhas.filter((c) => c.status === "active" && c.spendCents > 0);
}

/** O sinal mais forte que a oferta acendeu no período. */
export function sinalDaOferta(oferta: Oferta): SinalDeTrafego {
  if (campanhasAcesas(oferta).length > 0) return "campanha";
  if (oferta.visitas > 0) return "visitas";
  if (oferta.pedidos > 0) return "vendas";
  return "nenhum";
}

/** A oferta está ativa e a receber tráfego — é isto que a página lista. */
export function recebeTrafego(oferta: Oferta): boolean {
  return oferta.ativa && sinalDaOferta(oferta) !== "nenhum";
}

/** O que a campanha investiu e devolveu, somado, para esta oferta. */
export function numerosDaOferta(oferta: Oferta) {
  const acesas = campanhasAcesas(oferta);
  const spendCents = acesas.reduce((s, c) => s + c.spendCents, 0);
  const revenueCents = acesas.reduce((s, c) => s + c.revenueCents, 0);
  return {
    campanhas: acesas.length,
    spendCents,
    revenueCents,
    roas: spendCents > 0 ? Math.round((revenueCents / spendCents) * 100) / 100 : null,
  };
}

/* Ordena as ofertas como se lê um painel: primeiro as que gastam mais,
   depois as que vendem mais, depois as que só recebem visitas. */
export function ordenarOfertas(ofertas: readonly Oferta[]): Oferta[] {
  const peso: Record<SinalDeTrafego, number> = { campanha: 3, vendas: 2, visitas: 1, nenhum: 0 };
  return [...ofertas].sort((a, b) => {
    const pa = peso[sinalDaOferta(a)];
    const pb = peso[sinalDaOferta(b)];
    if (pa !== pb) return pb - pa;
    const na = numerosDaOferta(a);
    const nb = numerosDaOferta(b);
    if (na.spendCents !== nb.spendCents) return nb.spendCents - na.spendCents;
    if (a.receitaCents !== b.receitaCents) return b.receitaCents - a.receitaCents;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/* Tira acentos, pontuação e palavras curtas: "Kit Anti-Idade 60g" vira
   ["kit", "anti", "idade", "60g"]. É assim que se liga o nome de uma
   campanha ao nome de uma oferta sem depender de UTM. */
export function palavrasDe(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
}

const VAZIAS = new Set([
  "ads", "campanha", "campaign", "teste", "test", "escala", "scale", "novo", "nova",
  "cbo", "abo", "adv", "advantage", "meta", "google", "youtube", "tiktok", "com", "para",
]);

/*
  A campanha fala desta oferta? Sim quando partilham pelo menos uma
  palavra que não seja das "vazias" (as que aparecem em toda a campanha,
  como "escala" ou "teste"), ou quando o nome da campanha traz o slug da
  oferta. Não é adivinhação fina: é o mesmo que uma pessoa faria a olhar
  para os dois nomes, e a tela mostra a ligação para se poder conferir.
*/
export function campanhaFalaDaOferta(nomeDaCampanha: string, oferta: { nome: string; slug: string }): boolean {
  const daCampanha = new Set(palavrasDe(nomeDaCampanha));
  if (!daCampanha.size) return false;
  const doSlug = palavrasDe(oferta.slug);
  if (doSlug.length && doSlug.every((p) => daCampanha.has(p))) return true;
  const daOferta = palavrasDe(oferta.nome).filter((p) => !VAZIAS.has(p));
  return daOferta.some((p) => daCampanha.has(p));
}

export interface LojaComOfertas {
  id: string;
  nome: string;
  slug: string;
  ativa: boolean;
  moeda: string;
  ofertas: Oferta[];
}

/** O resumo de uma loja: quantas ofertas há e quantas recebem tráfego. */
export function resumoDaLoja(loja: LojaComOfertas) {
  const ativas = loja.ofertas.filter((o) => o.ativa);
  const comTrafego = ativas.filter(recebeTrafego);
  const spendCents = comTrafego.reduce((s, o) => s + numerosDaOferta(o).spendCents, 0);
  const receitaCents = comTrafego.reduce((s, o) => s + o.receitaCents, 0);
  return { ofertas: loja.ofertas.length, ativas: ativas.length, comTrafego: comTrafego.length, spendCents, receitaCents };
}
