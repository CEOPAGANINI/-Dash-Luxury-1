import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  A área Servidor (desenho Nexus) é escura nos dois temas. No tema claro,
  as camadas de superfície do painel precisam seguir esse escuro dentro
  dela; senão o cartão fica branco e herda a letra branca do Nexus.
*/
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const inicio = css.indexOf(
  'html[data-tema="branco"] .dash-skin [data-server-design="nexus"] {',
);
const bloco = inicio >= 0 ? css.slice(inicio, css.indexOf("}", inicio)) : "";

describe("área Servidor no tema claro", () => {
  it("tem um bloco que devolve as camadas escuras dentro dela", () => {
    expect(inicio).toBeGreaterThan(-1);
  });

  it.each([
    "--material",
    "--camada-1",
    "--camada-2",
    "--muted",
    "--card-foreground",
    "--dash-surface-card",
  ])("%s volta ao valor escuro", (token) => {
    const linha = bloco
      .split("\n")
      .find((l) => l.trim().startsWith(`${token}:`));
    expect(linha, token).toBeTruthy();
    // Nada de branco sólido: só véus brancos mínimos ou texto claro.
    expect(linha).not.toMatch(/#ffffff\b|#fafafb/);
  });
});
