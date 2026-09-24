// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const css = read("src/app/command-layer.css").replace(/\/\*[\s\S]*?\*\//g, "");

// Inspect the active stylesheet, not the retained monochrome/alternative skins.
function rulesOf(source: string) {
  return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: match[1].replace(/\s+/g, " ").trim(),
    declarations: new Map(
      Array.from(match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g), (item) => [
        item[1],
        item[2].trim().replace(/\s*!important$/, ""),
      ]),
    ),
  }));
}
const rules = rulesOf(css);
const dark = rules.find(
  (rule) =>
    rule.declarations.has("--cl-canvas") &&
    !rule.selector.includes("data-tema"),
)!;
const light = rules.find(
  (rule) =>
    rule.declarations.has("--cl-canvas") &&
    rule.selector.includes('data-tema="branco"'),
)!;

function tokensFor(theme: string) {
  expect(dark, "default CommandLayer token block").toBeDefined();
  expect(light, "light-theme overrides").toBeDefined();
  return new Map([
    ...dark.declarations,
    ...(theme === "branco" ? light.declarations : []),
  ]);
}

function resolveColor(
  token: string,
  tokens: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(token)) throw new Error(`Circular palette token: ${token}`);
  seen.add(token);
  const value = tokens.get(token);
  if (!value) throw new Error(`Missing palette token: ${token}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias ? resolveColor(alias[1], tokens, seen) : value;
}

function luminance(hex: string) {
  const channels = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!channels) throw new Error(`Expected hex color: ${hex}`);
  const linear = channels
    .slice(1)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function expectNeutral(value: string, context: string) {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/.exec(
    value,
  );
  const channels = hex
    ? hex.slice(1).map((channel) => parseInt(channel, 16))
    : rgb
      ? rgb.slice(1).map(Number)
      : null;
  expect(channels, `${context}: ${value}`).not.toBeNull();
  expect(channels![0], context).toBe(channels![1]);
  expect(channels![1], context).toBe(channels![2]);
}

describe("dashboard CommandLayer palette", () => {
  it.each(["preto", "branco"])(
    "keeps the %s structure monochromatic while retaining colored data and indicators",
    (theme) => {
      const tokens = tokensFor(theme);
      for (const token of [
        "--background",
        "--card",
        "--muted",
        "--secondary",
        "--popover",
        "--foreground",
        "--card-foreground",
        "--muted-foreground",
        "--secondary-foreground",
        "--popover-foreground",
        "--border",
        "--input",
        "--ring",
        "--accent-foreground",
        "--primary",
        "--primary-foreground",
        "--cl-canvas",
        "--cl-screen",
        "--cl-chassis",
        "--cl-well",
        "--cl-terminal",
        "--cl-readout",
        "--cl-card-top",
        "--cl-raised",
        "--cl-hover",
        "--cl-text-primary",
        "--cl-text-secondary",
        "--cl-text-body",
        "--cl-text-muted",
        "--cl-text-dim",
        "--cl-border",
        "--cl-border-strong",
        "--cl-accent",
      ])
        expectNeutral(resolveColor(token, tokens), `${theme}: ${token}`);
      const surfaces = ["--background", "--card", "--muted", "--secondary"].map(
        (token) => resolveColor(token, tokens),
      );
      expect(new Set(surfaces).size).toBe(4);
      const signals = ["--success", "--warning", "--destructive", "--info"].map(
        (token) => resolveColor(token, tokens),
      );
      expect(new Set(signals).size).toBe(4);
      for (const color of signals) expect(surfaces).not.toContain(color);
      expect(resolveColor("--nebula-bg", tokens)).toBe(
        resolveColor("--cl-canvas", tokens),
      );
      expect(resolveColor("--orb-positive", tokens)).toBe(
        resolveColor("--cl-success", tokens),
      );
      expect(
        new Set(
          [1, 2, 3, 4, 5].map((index) =>
            resolveColor(`--chart-${index}`, tokens),
          ),
        ).size,
      ).toBe(5);
      expect(resolveColor("--chart-1", tokens)).toBe(
        resolveColor("--cl-activity", tokens),
      );
      for (let index = 1; index <= 5; index += 1) {
        const color = resolveColor(`--chart-${index}`, tokens);
        const channels = color.slice(1).match(/../g)!;
        expect(
          new Set(channels).size,
          `${theme}: chart ${index} remains colored`,
        ).toBeGreaterThan(1);
      }
    },
  );

  it.each(["preto", "branco"])(
    "keeps the %s essential text readable on the active surfaces",
    (theme) => {
      const tokens = tokensFor(theme);
      for (const text of [
        "--cl-text-primary",
        "--cl-text-secondary",
        "--cl-text-body",
        "--cl-text-muted",
      ]) {
        for (const surface of ["--cl-canvas", "--cl-chassis", "--cl-screen"]) {
          const a = luminance(resolveColor(text, tokens));
          const b = luminance(resolveColor(surface, tokens));
          expect(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            `${theme}: ${text} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("uses the active shell's neutral brand surface and theme-aware foreground", () => {
    const shell = rulesOf(
      read("src/components/command-layer/shell.module.css"),
    );
    const mark = shell.find((rule) => rule.selector === ".brandMark")!;
    expect(mark.declarations.get("background")).toBe("var(--cl-screen)");
    expect(mark.declarations.get("color")).toBe("var(--cl-accent)");
    expect(mark.declarations.get("box-shadow")).toBe("var(--cl-shadow-inset)");
    expect(read("src/components/layout/header.tsx")).toContain(
      "styles.brandMark",
    );
  });

  it("keeps generic controls weaker than primary and semantic button variants", () => {
    const base = rules.find(
      (rule) =>
        rule.selector.includes(':where([data-slot="button"], .cl-button)') &&
        !rule.selector.includes(":hover") &&
        !rule.selector.includes(":active"),
    );
    expect(base?.declarations.get("background")).toBe("var(--cl-raised)");
    const input = rules.find(
      (rule) =>
        rule.selector.includes("input:not(") &&
        rule.declarations.has("background"),
    );
    expect(input?.selector).toMatch(/:where\(\s*input:not\(/);
    expect(input?.selector).not.toContain('[data-slot="button"]');
    const primary = rules.find(
      (rule) =>
        rule.selector.includes(
          '[data-slot="button"][data-variant="default"]',
        ) && !rule.selector.includes(":hover"),
    );
    expect(primary?.declarations.get("background")).toBe(
      "var(--cl-button-fill)",
    );
    expect(primary?.declarations.get("color")).toBe("#fff");
    for (const [variant, token] of [
      ["destructive", "danger"],
      ["success", "success"],
    ]) {
      const rule = rules.find((candidate) =>
        candidate.selector.includes(
          `[data-slot="button"][data-variant="${variant}"]`,
        ),
      );
      expect(rule?.declarations.get("background")).toBe("var(--cl-raised)");
      expect(rule?.declarations.get("color")).toBe(`var(--cl-${token})`);
      expect(rule?.declarations.get("border-color")).toBe(
        "var(--cl-border-strong)",
      );
    }
  });

  it.each(["preto", "branco"])(
    "gives the %s structural surfaces visible, non-neon depth",
    (theme) => {
      const tokens = tokensFor(theme);
      for (const token of [
        "--cl-shadow-card",
        "--cl-shadow-chassis",
        "--cl-shadow-metric",
      ]) {
        const depth = tokens.get(token)!;
        expect(depth, token).toContain("inset");
        expect(depth, token).toMatch(/,\s*0\s+\d+px/);
        expect(depth, token).not.toContain("--cl-accent");
        expect(depth, token).not.toContain("--cl-activity");
        for (const color of depth.matchAll(/rgb\([^)]*\)/g)) {
          expectNeutral(color[0], `${theme}: ${token}`);
        }
      }
      expect(tokens.get("--dash-shadow-card")).toBe("var(--cl-shadow-card)");
      expect(tokens.get("--dash-shadow-overlay")).toBe(
        "var(--cl-shadow-overlay)",
      );
      expect(tokens.get("--dash-shadow-inset")).toBe("var(--cl-shadow-inset)");
    },
  );

  it("applies elevation to explicit surfaces without moving fixed descendants", () => {
    const surface = rules.find(
      (rule) =>
        rule.selector.includes('[data-slot="card"]') &&
        rule.declarations.get("box-shadow") === "var(--cl-shadow-card)",
    );
    expect(surface).toBeDefined();
    expect(surface?.declarations.has("transform")).toBe(false);
    expect(surface?.declarations.has("filter")).toBe(false);
    const portal = rules.find(
      (rule) =>
        rule.selector.includes('[data-slot="dialog-content"]') &&
        rule.declarations.has("box-shadow"),
    );
    expect(portal?.selector).toContain("body:has(.cl)");
    expect(portal?.declarations.get("box-shadow")).toBe(
      "var(--cl-shadow-overlay)",
    );
    expect(portal?.declarations.get("color")).toBe("var(--cl-text-primary)");
  });
});
