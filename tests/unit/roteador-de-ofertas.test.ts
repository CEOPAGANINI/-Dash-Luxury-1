import { describe, expect, it } from "vitest";

import {
  OfferPage,
  PAGINAS_EXEMPLO,
  decidirDestino,
  descreverRegra,
  paginasComRedirecionamento,
  totalDeRedirecionamentos,
} from "@/features/offer-router/offer-router-model";

const oferta = PAGINAS_EXEMPLO.find((p) => p.id === "oferta") as OfferPage;

describe("decidirDestino", () => {
  it("redireciona por região quando o país bate", () => {
    const d = decidirDestino(oferta, { pais: "RU", dispositivo: "mobile" }, 90);
    expect(d.ficou).toBe(false);
    expect(d.destino).toBe("/indisponivel");
  });

  it("redireciona o desktop pela regra de aparelho", () => {
    const d = decidirDestino(oferta, { pais: "BR", dispositivo: "desktop" }, 90);
    expect(d.ficou).toBe(false);
    expect(d.destino).toBe("/versao-computador");
  });

  it("deixa o visitante na origem quando nenhuma regra bate", () => {
    const d = decidirDestino(oferta, { pais: "BR", dispositivo: "mobile" }, 90);
    expect(d.ficou).toBe(true);
    expect(d.destino).toBe("/oferta");
  });

  it("respeita a fatia do tráfego (roleta)", () => {
    const quiz = PAGINAS_EXEMPLO.find((p) => p.id === "quiz") as OfferPage;
    expect(decidirDestino(quiz, { pais: "BR", dispositivo: "mobile" }, 10).destino).toBe("/quiz-b");
    expect(decidirDestino(quiz, { pais: "BR", dispositivo: "mobile" }, 80).ficou).toBe(true);
  });

  it("ignora regra pausada ou sem destino", () => {
    const pg: OfferPage = {
      id: "x",
      nome: "X",
      url: "/x",
      regras: [
        { id: "a", tipo: "regiao", paises: ["RU"], dispositivos: [], percentual: 50, destino: "/off", ativo: false },
      ],
    };
    expect(decidirDestino(pg, { pais: "RU", dispositivo: "mobile" }, 0).ficou).toBe(true);
  });
});

describe("helpers", () => {
  it("lista só páginas com redirecionamento ativo", () => {
    const nomes = paginasComRedirecionamento(PAGINAS_EXEMPLO).map((p) => p.id);
    expect(nomes).toContain("oferta");
    expect(nomes).toContain("quiz");
    expect(nomes).not.toContain("vip");
  });
  it("conta os redirecionamentos e descreve regras", () => {
    expect(totalDeRedirecionamentos(PAGINAS_EXEMPLO)).toBe(3);
    expect(descreverRegra(oferta.regras[1])).toMatch(/computador/i);
  });
});

describe("regras por sistema e por rede", () => {
  const base: OfferPage = {
    id: "s",
    nome: "S",
    url: "/s",
    regras: [
      { id: "so", tipo: "sistema", paises: [], dispositivos: [], sistemas: ["ios"], percentual: 50, destino: "/apple", ativo: true },
      { id: "re", tipo: "rede", paises: [], dispositivos: [], redes: ["cel5g"], percentual: 50, destino: "/turbo", ativo: true },
    ],
  };
  it("redireciona por sistema (iOS)", () => {
    const d = decidirDestino(base, { pais: "BR", dispositivo: "mobile", sistema: "ios", rede: "wifi" }, 90);
    expect(d.destino).toBe("/apple");
  });
  it("redireciona por rede (5G) quando o sistema não bate", () => {
    const d = decidirDestino(base, { pais: "BR", dispositivo: "mobile", sistema: "android", rede: "cel5g" }, 90);
    expect(d.destino).toBe("/turbo");
  });
  it("fica na origem quando nem sistema nem rede batem", () => {
    const d = decidirDestino(base, { pais: "BR", dispositivo: "mobile", sistema: "windows", rede: "wifi" }, 90);
    expect(d.ficou).toBe(true);
  });
});
