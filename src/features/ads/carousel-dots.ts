/*
  Os pontinhos do carrossel dos criativos, como no Instagram.

  Com poucos criativos aparecem todos do mesmo tamanho. Com muitos, a
  fila de pontinhos não pode crescer sem fim — então anda uma janela à
  volta do criativo aberto, e os pontinhos que ficam nas pontas dessa
  janela vão encolhendo, avisando que há mais para lá deles.

  Isto é só a conta de qual pontinho fica de que tamanho: sem navegador
  e sem React, para poder ser lido e testado à parte.
*/

/** Quantos pontinhos cabem na janela, no máximo. */
export const PONTOS_A_VISTA = 7;

export type EscalaDoPonto = "cheio" | "meio" | "mini" | "oculto";

/** Onde começa a janela de pontinhos, com o criativo aberto no meio. */
export function inicioDaJanela(atual: number, total: number): number {
  if (total <= PONTOS_A_VISTA) return 0;
  const meio = Math.floor(PONTOS_A_VISTA / 2);
  const cru = Math.round(atual) - meio;
  return Math.min(Math.max(cru, 0), total - PONTOS_A_VISTA);
}

/**
 * O tamanho de um pontinho: cheio o que está à vista, meio e mini os das
 * pontas quando ainda há criativos para lá deles, oculto o resto. O
 * pontinho do criativo aberto é sempre cheio.
 */
export function escalaDoPonto(indice: number, atual: number, total: number): EscalaDoPonto {
  if (total <= PONTOS_A_VISTA) return "cheio";
  const inicio = inicioDaJanela(atual, total);
  const fim = inicio + PONTOS_A_VISTA - 1;
  if (indice < inicio || indice > fim) return "oculto";
  if (indice === atual) return "cheio";
  // Só encolhe do lado onde ainda há criativos escondidos.
  const haAntes = inicio > 0;
  const haDepois = fim < total - 1;
  if (haAntes && indice === inicio) return "mini";
  if (haAntes && indice === inicio + 1) return "meio";
  if (haDepois && indice === fim) return "mini";
  if (haDepois && indice === fim - 1) return "meio";
  return "cheio";
}

/** O índice do cartão à vista, a partir do quanto a fila já correu. */
export function cartaoAberto(scrollLeft: number, largura: number, total: number): number {
  if (!(largura > 0) || total <= 0) return 0;
  return Math.min(Math.max(Math.round(scrollLeft / largura), 0), total - 1);
}

/*
  Quantos criativos cabem numa página da secção.

  A secção leva, por criativo, o cartão dele e os cartões de cada
  posicionamento — um bloco alto. Em vez de fixar um número, mede-se a
  altura que a secção tem e vê-se quantos blocos inteiros lá cabem:
  num ecrã alto entram dois, num baixo entra um. Nunca menos de um —
  meio criativo não serve a ninguém.
*/
export function quantosCabem(alturaDisponivel: number, alturaDoBloco: number, total: number): number {
  /* Antes de haver medida — o primeiro desenho, ou um ambiente sem
     layout — mostram-se todos. Esconder criativos por causa de uma
     medida que ainda não existe seria pior do que a página ficar longa
     por um instante. */
  if (!(alturaDoBloco > 0) || !(alturaDisponivel > 0)) return Math.max(total, 1);
  const cabem = Math.floor(alturaDisponivel / alturaDoBloco);
  return Math.min(Math.max(cabem, 1), Math.max(total, 1));
}

/** Parte uma lista em páginas de `porPagina`. */
export function emPaginas<T>(lista: readonly T[], porPagina: number): T[][] {
  const tamanho = Math.max(1, Math.floor(porPagina));
  const paginas: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) paginas.push(lista.slice(i, i + tamanho));
  return paginas.length ? paginas : [[]];
}
