// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Regressão do texto claro sobre cartão claro no Servidor. CommandLayer
 * substituiu a solução Nexus de manter essa área sempre escura: texto e
 * superfícies agora devem mudar juntos, herdando o tema do dashboard.
 * Esta guarda confere o contrato CSS e o contraste de seus tokens. A
 * cascata final, estados e renderização continuam exigindo QA no navegador.
 */
function ler(arquivo: string) {
  return readFileSync(resolve(process.cwd(), arquivo), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

const tema = ler("src/app/command-layer.css");
const servidor = ler("src/features/vps/servidor-nexus.module.css");
const layout = ler("src/app/(painel)/servidor/layout.tsx");

function bloco(css: string, seletor: string) {
  const inicio = css.indexOf(seletor);
  if (inicio < 0) throw new Error(`Seletor ausente: ${seletor}`);
  const abertura = css.indexOf("{", inicio);
  return css.slice(abertura + 1, css.indexOf("}", abertura));
}

function valor(css: string, propriedade: string) {
  const valor = css.match(
    new RegExp(`(?:^|;)\\s*${propriedade}\\s*:\\s*([^;]+);`),
  )?.[1];
  if (!valor) throw new Error(`Declaração ausente: ${propriedade}`);
  return valor.trim();
}

const escuro = bloco(tema, 'body:has([data-design-system="commandlayer"])');
const claro = bloco(tema, 'html[data-tema="branco"] body:has(');

function corDoTema(token: string, claroAtivo: boolean) {
  return valor(`${claroAtivo ? claro : ""};${escuro}`, token);
}

function luminancia(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex))
    throw new Error(`Cor sólida inesperada: ${hex}`);
  const canais = [1, 3, 5].map((inicio) => {
    const canal = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return canais[0] * 0.2126 + canais[1] * 0.7152 + canais[2] * 0.0722;
}

function contraste(a: string, b: string) {
  const [alto, baixo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
}

describe("legibilidade do Servidor nos temas do dashboard", () => {
  it("herda CommandLayer sem fixar tema ou redefinir a paleta localmente", () => {
    expect(layout).toContain('data-server-design="commandlayer"');
    expect(layout).not.toMatch(/data-tema=|colorScheme\s*:/);
    expect(servidor).not.toMatch(/--cl-[\w-]+\s*:|color-scheme\s*:/);
    expect(valor(bloco(servidor, ".scope {"), "color")).toBe(
      "var(--cl-text-body)",
    );
    for (const alias of servidor.matchAll(/--server-[\w-]+\s*:\s*([^;]+);/g)) {
      expect(alias[1].trim()).toMatch(/^var\(--cl-[\w-]+\)$/);
    }
  });

  it.each([
    ["preto", false],
    ["branco", true],
  ] as const)(
    "mantém texto legível nos painéis no tema %s",
    (_nome, branco) => {
      const corpo = valor(bloco(servidor, ".scope {"), "color");
      const titulo = valor(
        bloco(servidor, ".scope :where(h2, h3, h4)"),
        "color",
      );
      const tabela = bloco(servidor, ".scope :where(th)");
      const fundoCard = valor(bloco(servidor, ".panelInner,"), "background");
      const fundos = `${fundoCard} ${valor(tabela, "background")}`;
      const textos = `${corpo} ${titulo} ${valor(tabela, "color")}`;
      const tokens = (css: string) =>
        [...css.matchAll(/var\((--cl-[\w-]+)\)/g)].map((match) => match[1]);
      const coresFundo = tokens(fundos);
      const coresTexto = tokens(textos);
      expect(coresFundo.length).toBeGreaterThan(0);
      expect(coresTexto.length).toBeGreaterThan(0);
      for (const texto of coresTexto) {
        for (const fundo of coresFundo) {
          expect(
            contraste(corDoTema(texto, branco), corDoTema(fundo, branco)),
            `${texto} sobre ${fundo}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );
});
