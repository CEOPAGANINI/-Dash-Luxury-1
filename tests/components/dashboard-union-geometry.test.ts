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

  it.each(["nebula", "orbit"])(
    "enforces square HTML geometry including portals in the %s skin",
    (skin) => {
      const geometry = sharedRules.find((rule) =>
        rule.declarations.has("--orb-raio-painel"),
      )!;
      expect(geometry.selector).toContain(`data-design-system="${skin}"`);
      expect(geometry.selector).toContain(":not(svg):not(svg *)");
      // The target is the authenticated body, not only .dash-skin descendants:
      // a Radix portal is attached as a sibling of the panel's wrapper.
      expect(geometry.selector).toMatch(/body:has\([\s\S]+\) :not\(svg\)/);
      expect(geometry.declarations.get("border-radius")).toBe("0");
      expect(geometry.declarations.get("corner-shape")).toBe("square");
      for (const [name, value] of geometry.declarations) {
        if (/radius|raio/.test(name)) expect(value, name).toBe("0");
      }
      expect(nebula).toMatch(
        /@layer dashboard-geometry\s*\{[\s\S]*?border-radius:\s*0\s*!important/,
      );
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
              rule.selector.includes(`data-design-system="${skin}"`) &&
              rule.declarations.get("border-radius") === "0",
          ),
          suffix,
        ).toBe(true);
      }
    },
  );

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
