import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Guarda de regressão para o P0 do contraste.

  As cores com significado do tema claro passavam por pouco — entre 3,5 e
  4,3:1 — em superfícies onde de facto assentam. Este teste lê os tokens
  do próprio CSS e refaz a conta da WCAG, para que ninguém volte a
  clarear uma delas sem o teste avisar.
*/

const css = readFileSync(
  resolve(process.cwd(), "src/app/nebula-dashboard.css"),
  "utf8",
);

/** O bloco do tema claro começa no seletor com data-tema="branco". */
const blocoClaro = css.slice(css.indexOf('html[data-tema="branco"]'));

function token(nome: string): string {
  const m = blocoClaro.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`token --${nome} não encontrado no tema claro`);
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

function contraste(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [alto, baixo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
}

/* As três superfícies onde estas cores de facto assentam no tema claro. */
const SUPERFICIES: { nome: string; cor: [number, number, number] }[] = [
  { nome: "painel", cor: rgb("#f0f0f0") },
  { nome: "cartão", cor: rgb("#ffffff") },
  { nome: "faixa de aviso", cor: [232, 216, 208] },
];

describe("cores com significado do tema claro", () => {
  const cores = [
    ["positivo", "nebula-positive"],
    ["negativo", "nebula-negative"],
    ["informativo", "nebula-cyan"],
    ["atenção", "warning"],
  ] as const;

  for (const [nome, chave] of cores) {
    for (const superficie of SUPERFICIES) {
      it(`${nome} lê-se sobre ${superficie.nome}`, () => {
        const c = contraste(rgb(token(chave)), superficie.cor);
        expect(c).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
