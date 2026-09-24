// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function rulesOf(source: string) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: match[1].replace(/\s+/g, " ").trim(),
    declarations: new Map(
      Array.from(match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g), (item) => [
        item[1],
        item[2]
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\s*!important$/, ""),
      ]),
    ),
  }));
}

const nebula = read("src/app/nebula-dashboard.css");
const orbit = read("src/app/orbit-dashboard.css");
const sharedRules = rulesOf(nebula);
const orbitRules = rulesOf(orbit);
const orbitDark = orbitRules.find((rule) =>
  rule.declarations.has("--orb-profundidade-bloco"),
)!;
const orbitLight = orbitRules.find(
  (rule) =>
    rule.selector.includes('data-tema="branco"') &&
    rule.declarations.has("--orb-profundidade-bloco"),
)!;

function resolveToken(token: string, tokens: Map<string, string>): string {
  const value = tokens.get(token);
  if (!value) throw new Error(`Missing integration token: ${token}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias ? resolveToken(alias[1], tokens) : value;
}

describe("dashboard union preserves Orbit and the fixed geometry contract", () => {
  it("keeps the current Orbit skin, typeface, series and contrast values", () => {
    expect(read("src/app/(painel)/layout.tsx")).toContain(
      'data-design-system="orbit"',
    );
    expect(read("src/app/layout.tsx")).toContain(
      'import "./orbit-dashboard.css"',
    );
    expect(orbitDark.declarations.get("--font-display")).toContain(
      "--font-outfit",
    );
    expect(orbitDark.declarations.get("--orb-canvas")).toBe("#0d0d0d");
    expect(orbitDark.declarations.get("--serie-1")).toBe("#818cf8");
    expect(orbitLight.declarations.get("--serie-1")).toBe("#4f46e5");
    expect(orbitLight.declarations.get("--orb-positive")).toBe("#076d47");
    expect(orbitLight.declarations.get("--orb-negative")).toBe("#b42545");
    expect(orbitLight.declarations.get("--orb-imagem")).toBe("#0b5aa8");
    expect(orbit).toContain("background-image: var(--orb-pontos)");
  });

  it("keeps square geometry only in the Nexus server area, pseudo-elements included", () => {
    const geometry = sharedRules.find((rule) =>
      rule.declarations.has("--orb-raio-painel"),
    )!;
    expect(geometry.selector).toContain('[data-server-design="nexus"]');
    expect(geometry.selector).toContain(":not(svg):not(svg *)");
    expect(geometry.selector).not.toContain("data-design-system");
    expect(geometry.declarations.get("border-radius")).toBe("0");
    expect(geometry.declarations.get("corner-shape")).toBe("square");
    for (const suffix of [
      "::before",
      "::after",
      "::file-selector-button",
      "::-webkit-slider-thumb",
      "::-moz-range-thumb",
    ]) {
      expect(
        sharedRules.some(
          (rule) =>
            rule.selector.includes(suffix) &&
            rule.selector.includes('[data-server-design="nexus"]') &&
            rule.declarations.get("border-radius") === "0",
        ),
        suffix,
      ).toBe(true);
    }
  });

  it("rounds the rest of the panel with the CommandLayer radii", () => {
    expect(read("src/app/layout.tsx")).toMatch(
      /import "\.\/orbit-dashboard\.css";\s*import "\.\/commandlayer-dashboard\.css";/,
    );
    const commandlayer = rulesOf(read("src/app/commandlayer-dashboard.css"));
    const tokens = commandlayer.find(
      (rule) =>
        !rule.selector.includes('data-tema="branco"') &&
        rule.declarations.has("--orb-raio-bloco"),
    )!;
    expect(tokens.declarations.get("--orb-raio-bloco")).toBe("12px");
    expect(tokens.declarations.get("--orb-raio-controlo")).toBe("8px");
    expect(tokens.declarations.get("--orb-raio-etiqueta")).toBe("4px");
    const formas = commandlayer.filter((rule) =>
      /^var\(--orb-raio-(bloco|controlo|etiqueta)\)$/.test(
        rule.declarations.get("border-radius") ?? "",
      ),
    );
    // blocos, menus em portal, itens dos menus, controlos e etiquetas
    expect(formas).toHaveLength(5);
    for (const forma of formas)
      expect(
        forma.selector.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"),
        "o Nexus fica de fora",
      ).toContain(':not([data-server-design="nexus"] *)');
    // Menus do Radix vão para o <body>, fora do .dash-skin.
    const portal = formas.find((rule) =>
      rule.selector.includes('[data-slot="dropdown-menu-content"]'),
    )!;
    expect(portal.selector).not.toContain(" .dash-skin ");
    expect(portal.declarations.get("border-radius")).toBe(
      "var(--orb-raio-bloco)",
    );
    const redondo = commandlayer.find((rule) =>
      rule.selector.includes(".rounded-full.rounded-full"),
    )!;
    expect(redondo.declarations.get("border-radius")).toBe("9999px");
  });

  it("keeps the keyboard focus ring visible in both themes", () => {
    // globals.css pinta o foco de #f5f5f5 com !important; a regra do
    // CommandLayer também precisa de !important para vencer.
    const source = read("src/app/commandlayer-dashboard.css");
    expect(source).toMatch(
      /:focus-visible:not\(\s*\[data-server-design="nexus"\] \*\s*\)\s*\{\s*outline: 2px solid var\(--cl-ciano\) !important;/,
    );
    const nexus = read("src/features/vps/servidor-nexus.module.css");
    expect(nexus).toMatch(
      /:focus-visible \{\s*outline: 2px solid var\(--nx-ciano\) !important;/,
    );
  });

  it("targets Tailwind's global uppercase class from the Nexus module", () => {
    // Num .module.css, ".uppercase" solto vira classe local renomeada e
    // nunca encontra o "uppercase" do Tailwind usado nos componentes.
    const nexus = read("src/features/vps/servidor-nexus.module.css").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(nexus).toContain(":global(.uppercase)");
    expect(nexus.replaceAll(":global(.uppercase)", "")).not.toMatch(
      /\.uppercase\b/,
    );
  });

  it.each(["dark", "light"])(
    "supplies the editor and portal depth aliases in Orbit %s",
    (theme) => {
      const tokens = new Map(orbitDark.declarations);
      if (theme === "light") {
        for (const [key, value] of orbitLight.declarations)
          tokens.set(key, value);
      }
      for (const [legacy, current] of [
        ["card", "bloco"],
        ["control", "controlo"],
        ["overlay", "portal"],
      ]) {
        const alias = `--nebula-${legacy}-depth`;
        expect(tokens.get(alias)).toBe(`var(--orb-profundidade-${current})`);
        const depth = resolveToken(alias, tokens);
        expect(depth).toContain("inset");
        expect(depth).toMatch(/,\s*0\s+\d+px/);
        expect(tokens.get(`--dash-shadow-${legacy}`)).toBe(
          `var(--orb-profundidade-${current})`,
        );
      }
      for (const [name, value] of tokens) {
        if (/^--(?:orb-raio-|radius)/.test(name)) expect(value, name).toBe("0");
      }
    },
  );

  it("elevates actual panels and body-level portals in both skins", () => {
    for (const token of ["--nebula-card-depth", "--nebula-overlay-depth"]) {
      const surface = sharedRules.find(
        (rule) => rule.declarations.get("box-shadow") === `var(${token})`,
      )!;
      expect(surface.selector).toContain('data-design-system="nebula"');
      expect(surface.selector).toContain('data-design-system="orbit"');
      expect(surface.declarations.has("transform")).toBe(false);
      expect(surface.declarations.has("filter")).toBe(false);
      if (token.includes("overlay")) {
        expect(surface.selector).toContain('[role="dialog"]');
        expect(surface.selector).toContain('[data-slot="popover-content"]');
        expect(surface.selector).not.toMatch(/\)\s+\.dash-skin/);
      }
    }
  });

  it("clips only the painted chart and its hole, never a card or legend", () => {
    const clips = sharedRules.filter((rule) =>
      rule.declarations.has("clip-path"),
    );
    expect(clips).toHaveLength(1);
    const clip = clips[0];
    expect(clip.declarations.get("clip-path")).toBe("circle(50%)");
    expect(clip.selector).toContain('data-design-system="orbit"');
    expect(clip.selector).toContain('data-dashboard-chart-part="ring"');
    expect(clip.selector).toContain('data-dashboard-chart-part="hole"');
    expect(clip.selector).toContain('.visual-overview-donut[role="img"]');
    expect(clip.selector).toContain('.visual-overview-pie[role="img"]');
    expect(clip.selector).not.toMatch(
      /avatar|legend|\[style|\[class|card|:not\(svg\)/,
    );
    expect(clip.declarations.has("border-radius")).toBe(false);
  });

  it.each([
    "src/features/design/medidas.tsx",
    "src/features/dashboard/operation-funnel.tsx",
    "src/features/unified-dashboard/traffic-diagnostics.tsx",
  ])("marks the existing CSS ring and hole in %s", (file) => {
    const source = read(file);
    expect(source).toContain('data-dashboard-chart="donut"');
    expect(source).toContain('data-dashboard-chart-part="ring"');
    expect(source).toContain('data-dashboard-chart-part="hole"');
    expect(source).toContain("conic-gradient");
  });

  it("does not leave conflict markers in either integrated stylesheet", () => {
    expect(nebula + orbit).not.toMatch(/^(?:<{7}|={7}|>{7})/m);
  });
});
