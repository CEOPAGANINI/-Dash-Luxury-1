import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  As séries dos gráficos vêm do design system "Capital Overview
  Dashboard". Este teste guarda duas coisas: que os valores são os de lá,
  e que no tema claro elas passam 3:1 — o mínimo de um elemento gráfico —
  contra as superfícies onde de facto assentam.
*/

const css = readFileSync(
  resolve(process.cwd(), "src/app/orbit-dashboard.css"),
  "utf8",
);
const claro = css.slice(css.indexOf('html[data-tema="branco"]'));
const escuro = css.slice(0, css.indexOf('html[data-tema="branco"]'));

function serie(bloco: string, n: number): string {
  const m = bloco.match(new RegExp(`--serie-${n}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`--serie-${n} não encontrada`);
  return m[1];
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminancia(c: [number, number, number]): number {
  const f = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

function contraste(a: string, b: string): number {
  const [alto, baixo] = [luminancia(rgb(a)), luminancia(rgb(b))].sort(
    (x, y) => y - x,
  );
  return (alto + 0.05) / (baixo + 0.05);
}

describe("séries do gráfico", () => {
  it("são as do Capital Overview no tema escuro", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => serie(escuro, n))).toEqual([
      "#818cf8",
      "#34d399",
      "#fbbf24",
      "#f472b6",
      "#a78bfa",
      "#fb7185",
    ]);
  });

  it("nenhuma repete: duas séries iguais no mesmo gráfico não se distinguem", () => {
    const tons = [1, 2, 3, 4, 5, 6, 7].map((n) => serie(escuro, n));
    expect(new Set(tons).size).toBe(tons.length);
  });

  /* 3:1 é o mínimo de um elemento gráfico; 4,5:1 é para texto, e o texto
     da legenda não usa a cor da série — usa a do painel. */
  for (const [nome, fundo] of [
    ["cartão escuro", "#202123"],
    ["canvas escuro", "#0d0d0d"],
  ] as const) {
    it(`no escuro, todas se vêem contra o ${nome}`, () => {
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        expect(contraste(serie(escuro, n), fundo)).toBeGreaterThanOrEqual(3);
      }
    });
  }

  for (const [nome, fundo] of [
    ["cartão branco", "#ffffff"],
    ["canvas claro", "#f4f4f5"],
  ] as const) {
    it(`no claro, todas se vêem contra o ${nome}`, () => {
      for (const n of [1, 2, 3, 4, 5, 6, 7]) {
        expect(contraste(serie(claro, n), fundo)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
