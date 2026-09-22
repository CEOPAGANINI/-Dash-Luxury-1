import { describe, expect, it } from "vitest";

import { PONTOS_A_VISTA, cartaoAberto, emPaginas, escalaDoPonto, inicioDaJanela, quantosCabem } from "@/features/ads/carousel-dots";

describe("os pontinhos do carrossel dos criativos", () => {
  it("com poucos criativos mostra todos os pontinhos do mesmo tamanho", () => {
    for (const total of [1, 2, 5, PONTOS_A_VISTA]) {
      const escalas = Array.from({ length: total }, (_, i) => escalaDoPonto(i, 0, total));
      expect(escalas.every((e) => e === "cheio")).toBe(true);
    }
  });

  it("com muitos criativos anda uma janela e esconde o resto", () => {
    const total = 20;
    const aVista = (atual: number) =>
      Array.from({ length: total }, (_, i) => i).filter((i) => escalaDoPonto(i, atual, total) !== "oculto");
    // No começo, a janela encosta na ponta esquerda.
    expect(aVista(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // No meio, o criativo aberto fica no centro da janela.
    expect(aVista(10)).toEqual([7, 8, 9, 10, 11, 12, 13]);
    // No fim, encosta na ponta direita — nunca sobra espaço vazio.
    expect(aVista(19)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    expect(inicioDaJanela(19, total)).toBe(total - PONTOS_A_VISTA);
  });

  it("só encolhe os pontinhos do lado onde ainda há criativos escondidos", () => {
    const total = 20;
    // No começo não há nada à esquerda: os primeiros ficam cheios e só os
    // da direita avisam que há mais.
    expect(escalaDoPonto(0, 0, total)).toBe("cheio");
    expect(escalaDoPonto(1, 0, total)).toBe("cheio");
    expect(escalaDoPonto(5, 0, total)).toBe("meio");
    expect(escalaDoPonto(6, 0, total)).toBe("mini");
    // No meio encolhe dos dois lados.
    expect(escalaDoPonto(7, 10, total)).toBe("mini");
    expect(escalaDoPonto(8, 10, total)).toBe("meio");
    expect(escalaDoPonto(13, 10, total)).toBe("mini");
    // O pontinho do criativo aberto é sempre cheio.
    for (let atual = 0; atual < total; atual++) expect(escalaDoPonto(atual, atual, total)).toBe("cheio");
  });

  it("descobre o criativo à vista pelo tanto que a fila já correu", () => {
    // Cada criativo ocupa a fila toda: 320px de largura, três criativos.
    expect(cartaoAberto(0, 320, 3)).toBe(0);
    expect(cartaoAberto(150, 320, 3)).toBe(0);
    expect(cartaoAberto(170, 320, 3)).toBe(1);
    expect(cartaoAberto(640, 320, 3)).toBe(2);
    // Nunca passa do último, nem fica negativo.
    expect(cartaoAberto(5000, 320, 3)).toBe(2);
    expect(cartaoAberto(-20, 320, 3)).toBe(0);
    // Sem medida (jsdom, antes de desenhar) fica no primeiro.
    expect(cartaoAberto(0, 0, 3)).toBe(0);
    expect(cartaoAberto(100, 320, 0)).toBe(0);
  });
});

describe("quantos criativos cabem numa página", () => {
  it("divide a altura da secção pela altura de um bloco", () => {
    // 700px de secção e blocos de 340px: cabem dois.
    expect(quantosCabem(700, 340, 5)).toBe(2);
    // 1.100px: cabem três.
    expect(quantosCabem(1_100, 340, 5)).toBe(3);
  });

  it("nunca mostra menos de um — meio criativo não serve", () => {
    expect(quantosCabem(200, 340, 5)).toBe(1);
  });

  it("antes de haver medida mostra todos, em vez de esconder por adivinhação", () => {
    expect(quantosCabem(0, 340, 5)).toBe(5);
    expect(quantosCabem(700, 0, 5)).toBe(5);
    expect(quantosCabem(0, 0, 0)).toBe(1);
  });

  it("nunca promete mais criativos do que existem", () => {
    expect(quantosCabem(5_000, 340, 2)).toBe(2);
    expect(quantosCabem(5_000, 340, 0)).toBe(1);
  });

  it("aguenta uma altura de bloco impossível", () => {
    expect(quantosCabem(700, -10, 5)).toBe(5);
  });
});

describe("as páginas do carrossel", () => {
  it("partem a lista em pedaços do tamanho pedido", () => {
    expect(emPaginas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(emPaginas([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(emPaginas([1, 2, 3], 9)).toEqual([[1, 2, 3]]);
  });

  it("uma lista vazia dá uma página vazia, não nenhuma", () => {
    expect(emPaginas([], 3)).toEqual([[]]);
  });

  it("um tamanho impossível vira um por página, em vez de um ciclo sem fim", () => {
    expect(emPaginas([1, 2], 0)).toEqual([[1], [2]]);
    expect(emPaginas([1, 2], -3)).toEqual([[1], [2]]);
  });
});
