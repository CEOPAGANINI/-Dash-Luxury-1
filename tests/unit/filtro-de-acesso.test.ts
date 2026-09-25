import { describe, expect, it } from "vitest";

import {
  AccessRule,
  avaliarAcesso,
  descreverAcao,
  resumoDaRegra,
} from "@/features/access-filter/access-filter-model";

const base: AccessRule = {
  paisesMode: "allow",
  paises: ["BR"],
  dispositivos: ["mobile"],
  acao: "not_found",
  redirectUrl: "",
};

describe("avaliarAcesso", () => {
  it("libera quem está no país e aparelho liberados", () => {
    const v = avaliarAcesso(base, { pais: "BR", dispositivo: "mobile" });
    expect(v.permitido).toBe(true);
  });

  it("barra um país fora da lista de liberados", () => {
    const v = avaliarAcesso(base, { pais: "RU", dispositivo: "mobile" });
    expect(v.permitido).toBe(false);
    expect(v.motivo).toMatch(/liberados/);
  });

  it("barra um aparelho não liberado mesmo com o país certo", () => {
    const v = avaliarAcesso(base, { pais: "BR", dispositivo: "desktop" });
    expect(v.permitido).toBe(false);
    expect(v.motivo).toMatch(/Computador/);
  });

  it("no modo bloquear, barra só quem está na lista", () => {
    const regra: AccessRule = {
      ...base,
      paisesMode: "block",
      paises: ["RU"],
      dispositivos: ["mobile", "desktop", "tablet"],
    };
    expect(avaliarAcesso(regra, { pais: "RU", dispositivo: "mobile" }).permitido).toBe(false);
    expect(avaliarAcesso(regra, { pais: "BR", dispositivo: "mobile" }).permitido).toBe(true);
  });

  it("lista vazia no modo liberar barra todo mundo", () => {
    const regra: AccessRule = { ...base, paises: [] };
    expect(avaliarAcesso(regra, { pais: "BR", dispositivo: "mobile" }).permitido).toBe(false);
  });
});

describe("descreverAcao e resumoDaRegra", () => {
  it("descreve o redirect com o endereço", () => {
    const regra: AccessRule = { ...base, acao: "redirect", redirectUrl: "https://x.com/off" };
    expect(descreverAcao(regra)).toMatch(/https:\/\/x\.com\/off/);
  });
  it("resume a regra em texto", () => {
    expect(resumoDaRegra(base)).toMatch(/libera 1 país/);
  });
});
