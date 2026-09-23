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
});
