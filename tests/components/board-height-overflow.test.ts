import { describe, expect, it } from "vitest";

import { ALTURA_MINIMA_DO_QUADRO, alturaSemEstouro } from "@/features/ads/class-board";

/*
  O que a página estoura por baixo do quadro é exatamente a faixa em
  branco que aparece quando se rola. Por isso o quadro devolve esse
  estouro — todo ele, e não até um teto.
*/
describe("a altura do quadro depois de a página estourar", () => {
  it("devolve o estouro inteiro, não só um pedaço", () => {
    expect(alturaSemEstouro(900, 40)).toBe(860);
    // Antes havia um teto de 96px: um estouro maior ficava por devolver
    // e era ele que se via como branco ao rolar.
    expect(alturaSemEstouro(900, 300)).toBe(600);
  });

  it("não encolhe quando a página não estoura", () => {
    expect(alturaSemEstouro(900, 0)).toBe(900);
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
