import { describe, expect, it } from "vitest";

import { AMOSTRAS_MAXIMAS, INTERVALO_AMOSTRA_MS, chaveDoHistorico, fatiaDe, registrarAmostra, restoreRoasHistory } from "@/features/ads/roas-history-store";

describe("o histórico do ROAS de cada bloco", () => {
  it("guarda uma leitura por fatia de cinco minutos: na mesma fatia substitui, numa nova acrescenta", () => {
    const t0 = 1_700_000_000_000 - (1_700_000_000_000 % INTERVALO_AMOSTRA_MS);
    let lista = registrarAmostra([], 1.2, t0);
    expect(lista).toEqual([{ t: t0, roas: 1.2 }]);
    lista = registrarAmostra(lista, 1.4, t0 + 60_000);
    expect(lista).toEqual([{ t: t0 + 60_000, roas: 1.4 }]);
    lista = registrarAmostra(lista, 2.1, t0 + INTERVALO_AMOSTRA_MS);
    expect(lista).toHaveLength(2);
    expect(lista[1]).toEqual({ t: t0 + INTERVALO_AMOSTRA_MS, roas: 2.1 });
    expect(fatiaDe(t0 + INTERVALO_AMOSTRA_MS - 1)).toBe(fatiaDe(t0));
    expect(INTERVALO_AMOSTRA_MS).toBe(5 * 60_000);
  });

  it("nunca guarda mais de 24 horas (288 leituras): as mais velhas saem", () => {
    let lista: { t: number; roas: number }[] = [];
    for (let i = 0; i < AMOSTRAS_MAXIMAS + 10; i++) lista = registrarAmostra(lista, i, i * INTERVALO_AMOSTRA_MS);
    expect(lista).toHaveLength(AMOSTRAS_MAXIMAS);
    expect(lista[0].roas).toBe(10);
    expect(lista[lista.length - 1].roas).toBe(AMOSTRAS_MAXIMAS + 9);
  });

  it("lê o que foi guardado em ordem de tempo, sem fatias repetidas, e rejeita dados inválidos", () => {
    const chave = chaveDoHistorico("meta", "scale");
    expect(chave).toBe("meta:scale");
    const lido = restoreRoasHistory(JSON.stringify({ version: 1, blocos: { [chave]: [{ t: 600_000, roas: 2 }, { t: 0, roas: 1 }, { t: 60_000, roas: 1.5 }] } }));
    expect(lido).toEqual({ [chave]: [{ t: 0, roas: 1 }, { t: 600_000, roas: 2 }] });
    expect(restoreRoasHistory(JSON.stringify({ version: 1, blocos: { [chave]: [{ t: 0, roas: -1 }] } }))).toBeNull();
    expect(restoreRoasHistory(JSON.stringify({ version: 1, blocos: { "sem-rede": [] } }))).toBeNull();
    expect(restoreRoasHistory("{")).toBeNull();
  });
});
