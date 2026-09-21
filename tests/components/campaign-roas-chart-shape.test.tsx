import { describe, expect, it } from "vitest";

import { VAO_DA_BOLINHA, bolinhasVisiveis } from "@/features/ads/block-metrics-panel";
import { INTERVALO_MINUTO_MS, ROAS_MAXIMO, minutoDe, roasDemonstrativo } from "@/features/ads/campaign-roas-history-store";

describe("o desenho do gráfico do ROAS", () => {
  it("desenha todas as bolinhas quando cabem e afina quando não cabem", () => {
    const poucos = [0, 40, 80, 120].map((x) => ({ x }));
    expect(bolinhasVisiveis(poucos, 400)).toHaveLength(4);

    // 360 leituras numa faixa de 400px viravam um pontilhado.
    const muitos = Array.from({ length: 360 }, (_, i) => ({ x: (i / 359) * 400 }));
    const afinadas = bolinhasVisiveis(muitos, 400);
    expect(afinadas.length).toBeLessThanOrEqual(Math.floor(400 / VAO_DA_BOLINHA) + 1);
    expect(afinadas.length).toBeGreaterThan(5);
    // A primeira e a última nunca se perdem.
    expect(afinadas[0]).toBe(muitos[0]);
    expect(afinadas[afinadas.length - 1]).toBe(muitos[muitos.length - 1]);
    // E nenhuma encosta na outra.
    for (let i = 1; i < afinadas.length - 1; i++) expect(afinadas[i].x - afinadas[i - 1].x).toBeGreaterThanOrEqual(VAO_DA_BOLINHA);
  });

  it("um ou dois pontos ficam sempre como estão", () => {
    expect(bolinhasVisiveis([{ x: 10 }], 4)).toHaveLength(1);
    expect(bolinhasVisiveis([{ x: 10 }, { x: 11 }], 4)).toHaveLength(2);
  });

  it("o ROAS da demonstração sobe e desce, é sempre o mesmo no mesmo minuto e fica entre 0,2x e 10x", () => {
    const chave = "meta:campanha-1";
    const inicio = 1_700_000_000_000;
    const serie = Array.from({ length: 240 }, (_, i) => roasDemonstrativo(chave, 2.5, inicio + i * INTERVALO_MINUTO_MS));

    // Determinístico: o mesmo minuto dá sempre o mesmo número.
    expect(roasDemonstrativo(chave, 2.5, inicio)).toBe(serie[0]);
    expect(roasDemonstrativo(chave, 2.5, inicio + 30_000)).toBe(serie[0]);
    expect(minutoDe(inicio + 30_000)).toBe(minutoDe(inicio));

    // Dentro dos limites.
    for (const v of serie) {
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(ROAS_MAXIMO);
    }

    // Com altos e baixos de verdade: sobe e desce, e não é uma reta.
    const distintos = new Set(serie).size;
    expect(distintos).toBeGreaterThan(50);
    expect(Math.max(...serie) - Math.min(...serie)).toBeGreaterThan(0.5);
    const subiu = serie.some((v, i) => i > 0 && v > serie[i - 1]);
    const desceu = serie.some((v, i) => i > 0 && v < serie[i - 1]);
    expect(subiu && desceu).toBe(true);

    // Campanhas diferentes oscilam de maneira diferente.
    const outra = Array.from({ length: 60 }, (_, i) => roasDemonstrativo("meta:campanha-2", 2.5, inicio + i * INTERVALO_MINUTO_MS));
    expect(outra.join(",")).not.toBe(serie.slice(0, 60).join(","));
  });

  it("um ROAS muito alto na campanha não estoura o teto de 10x", () => {
    const v = roasDemonstrativo("meta:foguete", 40, 1_700_000_000_000);
    expect(v).toBeLessThanOrEqual(ROAS_MAXIMO);
    expect(v).toBeGreaterThan(0);
  });
});
