import { describe, expect, it } from "vitest";

import { ALTURA_MINIMA_DO_QUADRO, alturaSemEstouro } from "@/features/ads/class-board";

/*
  O quadro só encolhe pelo que é dele: o quanto o próprio fundo cai
  abaixo da janela. Descontar o estouro da página inteira — que pode vir
  de outra coisa, como a lista do menu da direita — esmagava o quadro até
  ao piso e deixava os cartões cortados com meia tela em branco.
*/
describe("a altura do quadro quando ele passa da janela", () => {
  it("devolve o excesso do próprio quadro", () => {
    expect(alturaSemEstouro(900, 40)).toBe(860);
    expect(alturaSemEstouro(900, 300)).toBe(600);
  });

  it("não encolhe quando o quadro cabe", () => {
    expect(alturaSemEstouro(900, 0)).toBe(900);
    // O quadro acabar acima do fim da janela não é motivo para crescer
    // nem para encolher: quem manda na altura é a medida, não isto.
    expect(alturaSemEstouro(900, -20)).toBe(900);
  });

  it("nunca desce abaixo do piso, por maior que seja o estouro", () => {
    expect(alturaSemEstouro(900, 5_000)).toBe(ALTURA_MINIMA_DO_QUADRO);
    expect(alturaSemEstouro(ALTURA_MINIMA_DO_QUADRO, 100)).toBe(
      ALTURA_MINIMA_DO_QUADRO,
    );
  });

  it("aguenta uma medida impossível sem devolver NaN", () => {
    expect(Number.isFinite(alturaSemEstouro(900, Number.NaN))).toBe(true);
    expect(alturaSemEstouro(900, Number.NaN)).toBe(900);
  });
});
