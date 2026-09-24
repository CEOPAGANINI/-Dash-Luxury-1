// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../src/app/nebula-dashboard.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

// Token rules are flat declaration blocks. Keep this focused parser local to
// this regression test rather than depending on the stylesheet bundler.
const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
  selector: match[1].replace(/\s+/g, " ").trim(),
  declarations: new Map(
    Array.from(match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g), (declaration) => [
      declaration[1],
      declaration[2].trim().replace(/\s*!important$/, ""),
    ]),
  ),
}));

const themeRules = rules.filter((rule) => rule.declarations.has("--nebula-bg"));
const dark = themeRules.find((rule) => !rule.selector.includes("data-tema"));
const light = themeRules.find((rule) =>
  rule.selector.includes('data-tema="branco"'),
);

// Only structural, typographic and neutral-series colors belong here. Success,
// warning, error, information and platform colors intentionally remain semantic.
const neutralTokens = [
  "--nebula-bg",
  "--nebula-bg-2",
  "--nebula-panel",
  "--nebula-panel-2",
  "--nebula-text",
  "--nebula-muted",
  "--nebula-faint",
  "--nebula-line",
  "--nebula-line-strong",
  "--nebula-accent",
  "--nebula-accent-2",
  "--nebula-selected",
  "--nebula-selected-bg",
  "--camada-0",
  "--camada-1",
  "--camada-2",
  "--camada-3",
  "--camada-4",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--traffic-funnel-from",
  "--traffic-funnel-to",
];

function resolveColor(
  token: string,
  tokens: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(token)) throw new Error(`Circular palette token: ${token}`);
  seen.add(token);
  const value = tokens.get(token);
  if (!value) throw new Error(`Missing palette token: ${token}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolveColor(reference[1], tokens, seen) : value;
}

function channels(value: string): number[] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (hex) return hex.slice(1).map((channel) => parseInt(channel, 16));
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/.exec(
    value,
  );
  if (rgb) return rgb.slice(1).map(Number);
  throw new Error(`Expected a hex or RGB palette color, received: ${value}`);
}

describe("dashboard black-and-white palette", () => {
  it.each(["preto", "branco"])("keeps the %s theme neutral", (theme) => {
    expect(dark, "default dark token block").toBeDefined();
    expect(light, "light-theme token overrides").toBeDefined();
    const tokens = new Map(dark!.declarations);
    if (theme === "branco") {
      for (const [name, value] of light!.declarations) tokens.set(name, value);
    }
    for (const token of neutralTokens) {
      const value = resolveColor(token, tokens);
      const [red, green, blue] = channels(value);
      expect(red, `${theme}: ${token} = ${value}`).toBe(green);
      expect(green, `${theme}: ${token} = ${value}`).toBe(blue);
    }
  });

  it("uses contrasting theme tokens for the brand instead of a gradient", () => {
    const brandRules = rules.filter((rule) =>
      rule.selector.includes(".nebula-brand-mark"),
    );
    const mark = brandRules.find((rule) => rule.declarations.has("background"));
    const icon = brandRules.find((rule) => rule.selector.endsWith("> svg"));
    expect(mark?.declarations.get("background")).toBe("var(--primary)");
    expect(mark?.declarations.get("color")).toBe("var(--primary-foreground)");
    expect(icon?.declarations.get("color")).toBe("var(--primary-foreground)");
    for (const rule of brandRules) {
      expect([...rule.declarations.values()].join(" ")).not.toMatch(
        /gradient\(/i,
      );
    }
  });

  it("keeps base input exclusions weaker than primary and semantic button variants", () => {
    const baseControls = rules.filter(
      (rule) =>
        rule.selector.includes('[data-slot="button"]') &&
        rule.selector.includes("input:not("),
    );
    expect(baseControls.length).toBeGreaterThan(0);
    for (const rule of baseControls) {
      expect(rule.selector).toMatch(/:where\(\s*input:not\(/);
    }
    for (const variant of ["primary", "destructive", "success"]) {
      const rule = rules.find((candidate) =>
        candidate.selector.includes(
          `[data-slot="button"][class*="bg-${variant}"]`,
        ),
      );
      expect(rule?.declarations.get("background")).toBe(`var(--${variant})`);
      expect(rule?.declarations.get("color")).toBe(
        `var(--${variant}-foreground)`,
      );
    }
  });

  it("locks square corners only inside the Nexus server area", () => {
    // Desde a pele CommandLayer o painel tem blocos de 12 px, controlos de
    // 8 e etiquetas de 4. O canto reto ficou sendo desenho só do Servidor
    // (Nexus Arcade), e a trava vale só dentro dele.
    const geometry = rules.find(
      (rule) =>
        rule.selector.includes(":not(svg):not(svg *)") &&
        rule.declarations.has("--nebula-radius"),
    );
    expect(geometry, "trava de cantos").toBeDefined();
    expect(geometry!.selector).toContain('[data-server-design="nexus"]');
    expect(geometry!.selector).not.toContain("body:has(");
    expect(geometry!.selector).not.toContain("data-design-system");
    expect(geometry!.declarations.get("border-radius")).toBe("0");
    for (const [property, value] of geometry!.declarations) {
      if (property.includes("radius")) expect(value, property).toBe("0");
    }
    // Na camada nomeada, o !important ganha dos !important soltos; por isso
    // ela não pode alcançar nada fora do Nexus.
    expect(css).toMatch(
      /@layer dashboard-geometry\s*\{[\s\S]*?border-radius:\s*0\s*!important/,
    );
    const camada = css.slice(css.indexOf("@layer dashboard-geometry"));
    const fim = camada.indexOf("\n}\n");
    for (const seletor of camada.slice(0, fim).matchAll(/([^{}]+)\{/g)) {
      if (seletor[1].includes("@layer")) continue;
      for (const parte of seletor[1].split(","))
        expect(parte.trim(), "tudo na camada fica no Nexus").toMatch(
          /^\[data-server-design="nexus"\]/,
        );
    }
  });

  it("preserves CSS donut and pie geometry without rounding UI surfaces", () => {
    const chartRules = rules.filter((rule) =>
      rule.declarations.has("clip-path"),
    );
    expect(chartRules).toHaveLength(1);
    const chart = chartRules[0];
    expect(chart.declarations.get("clip-path")).toBe("circle(50%)");
    for (const selector of [
      '.visual-overview-donut[role="img"]',
      '.visual-overview-donut[role="img"] > div',
      '.visual-overview-pie[role="img"]',
      '.visual-overview-pie[role="img"] > span',
    ]) {
      expect(chart.selector).toContain(selector);
    }
    expect(chart.selector).toContain('data-design-system="nebula"');
    expect(chart.selector).not.toMatch(/button|input|avatar|card|:not\(svg\)/);
    expect(chart.declarations.has("border-radius")).toBe(false);
  });

  it.each(["preto", "branco"])(
    "gives the %s surfaces neutral, visible depth",
    (theme) => {
      const tokens = new Map(dark!.declarations);
      if (theme === "branco") {
        for (const [name, value] of light!.declarations)
          tokens.set(name, value);
      }
      for (const token of [
        "--nebula-card-depth",
        "--nebula-control-depth",
        "--nebula-overlay-depth",
      ]) {
        const depth = tokens.get(token)!;
        expect(depth, token).toContain("inset");
        expect(depth, `${token} must have an outer shadow`).toMatch(
          /,\s*0\s+\d+px/,
        );
        const colors = Array.from(
          depth.matchAll(/rgb\([^)]*\)/g),
          (match) => match[0],
        );
        expect(colors.length).toBeGreaterThan(0);
        for (const color of colors) {
          const [red, green, blue] = channels(color);
          expect(red, `${token}: ${color}`).toBe(green);
          expect(green, `${token}: ${color}`).toBe(blue);
        }
      }
      expect(tokens.get("--dash-shadow-card")).toBe("var(--nebula-card-depth)");
      expect(tokens.get("--dash-shadow-overlay")).toBe(
        "var(--nebula-overlay-depth)",
      );
    },
  );

  it("applies elevation only to explicit surfaces without moving fixed descendants", () => {
    const surfaces = rules.find((rule) =>
      rule.selector.includes("[data-dashboard-surface]"),
    );
    expect(surfaces?.selector).toContain("[data-orbit-workspace] section");
    expect(surfaces?.selector).toContain("[data-orbit-workspace] aside");
    expect(surfaces?.declarations.get("box-shadow")).toBe(
      "var(--nebula-card-depth)",
    );
    expect(surfaces?.declarations.has("transform")).toBe(false);
    expect(surfaces?.declarations.has("filter")).toBe(false);
    expect(
      rules.some(
        (rule) =>
          rule.selector.includes('[role="dialog"]') &&
          rule.declarations.get("box-shadow") === "var(--nebula-overlay-depth)",
      ),
    ).toBe(true);
  });
});
