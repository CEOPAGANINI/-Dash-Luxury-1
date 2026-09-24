// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

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

const command = read("src/app/command-layer.css");
const commandRules = rulesOf(command);
const dark = commandRules.find(
  (rule) =>
    rule.declarations.has("--cl-canvas") &&
    !rule.selector.includes("data-tema"),
)!;
const light = commandRules.find(
  (rule) =>
    rule.declarations.has("--cl-canvas") &&
    rule.selector.includes('data-tema="branco"'),
)!;

function resolveToken(
  token: string,
  tokens: Map<string, string>,
  seen = new Set<string>(),
): string {
  if (seen.has(token)) throw new Error(`Circular integration token: ${token}`);
  seen.add(token);
  const value = tokens.get(token);
  if (!value) throw new Error(`Missing integration token: ${token}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias ? resolveToken(alias[1], tokens, seen) : value;
}

describe("dashboard active CommandLayer integration and geometry", () => {
  it("loads one current skin while keeping historical alternatives as references", () => {
    const layout = read("src/app/layout.tsx");
    expect(read("src/app/(painel)/layout.tsx")).toContain(
      'data-design-system="commandlayer"',
    );
    expect(layout).toContain('import "./command-layer.css"');
    for (const old of [
      "nebula-dashboard.css",
      "orbit-dashboard.css",
      "commandlayer-dashboard.css",
    ]) {
      expect(read(`src/app/${old}`).length).toBeGreaterThan(0);
      expect(layout).not.toContain(`import "./${old}"`);
    }
    expect(read("src/app/(painel)/design-system/page.tsx")).toContain(
      "CommandLayerDesignSystem",
    );
    expect(command).toContain('html[data-tema="branco"]');
  });

  it("uses straight corners for panels, interiors and controls while preserving frames", () => {
    expect(dark.declarations.get("--cl-radius-panel")).toBe("0px");
    expect(dark.declarations.get("--cl-radius-inner")).toBe("0px");
    expect(dark.declarations.get("--cl-radius-control")).toBe("0px");
    expect(dark.declarations.get("--cl-frame")).toBe("4px");
    const card = commandRules.find(
      (rule) =>
        rule.selector.includes('[data-slot="card"]') &&
        rule.declarations.has("border-radius"),
    );
    expect(card?.declarations.get("border-radius")).toMatch(/^0(?:px)?$/);
    const inner = commandRules.find(
      (rule) =>
        rule.selector.includes('[data-surface="layered"]') &&
        rule.selector.endsWith("::before"),
    );
    expect(inner?.declarations.get("inset")).toBe("4px");
    expect(inner?.declarations.get("border-radius")).toMatch(/^0(?:px)?$/);
    expect(inner?.declarations.get("pointer-events")).toBe("none");
    const button = commandRules.find(
      (rule) =>
        rule.selector.includes(':where([data-slot="button"], .cl-button)') &&
        rule.declarations.has("border-radius"),
    );
    expect(button?.declarations.get("border-radius")).toMatch(/^0(?:px)?$/);
  });

  it("themes body-level portals and their items without depending on a sidebar ancestor", () => {
    const portal = commandRules.find(
      (rule) =>
        rule.selector.includes('[data-slot="dropdown-menu-content"]') &&
        rule.declarations.has("box-shadow"),
    )!;
    expect(portal.selector).toContain("body:has(.cl)");
    expect(portal.selector).not.toContain(" .dash-skin ");
    expect(portal.declarations.get("border-radius")).toMatch(/^0(?:px)?$/);
    expect(portal.declarations.get("background")).toBe("var(--cl-chassis)");
    expect(portal.declarations.get("color")).toBe("var(--cl-text-primary)");
    const item = commandRules.find(
      (rule) =>
        rule.selector.includes('[data-slot="dropdown-menu-item"]') &&
        rule.declarations.has("border-radius"),
    )!;
    expect(item.declarations.get("border-radius")).toMatch(/^0(?:px)?$/);
  });

  it("keeps a theme-aware keyboard focus ring above legacy styles", () => {
    expect(read("src/app/globals.css")).toMatch(
      /@layer\s+theme,\s*base,\s*components,\s*utilities,\s*legacy,\s*commandlayer;/,
    );
    const focus = commandRules.find(
      (rule) =>
        rule.selector.includes(":focus-visible") &&
        rule.declarations.has("outline"),
    );
    expect(focus?.declarations.get("outline")).toBe(
      "2px solid var(--cl-accent)",
    );
    expect(focus?.declarations.get("outline-offset")).toBe("3px");
    expect(dark.declarations.get("--cl-accent")).not.toBe(
      light.declarations.get("--cl-accent"),
    );
  });

  it("keeps CSS-module references to global Tailwind classes explicit", () => {
    const server = read("src/features/vps/servidor-nexus.module.css").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    // Removal is fine; renaming the Tailwind utility into a local class is not.
    expect(server.replaceAll(":global(.uppercase)", "")).not.toMatch(
      /\.uppercase\b/,
    );
  });

  it.each(["dark", "light"])(
    "supplies editor and portal depth aliases in the active %s theme",
    (theme) => {
      const tokens = new Map([
        ...dark.declarations,
        ...(theme === "light" ? light.declarations : []),
      ]);
      for (const [alias, target] of [
        ["--orb-profundidade-bloco", "--cl-shadow-card"],
        ["--orb-profundidade-controlo", "--cl-shadow-highlight"],
        ["--orb-profundidade-portal", "--cl-shadow-overlay"],
        ["--dash-shadow-card", "--cl-shadow-card"],
        ["--dash-shadow-overlay", "--cl-shadow-overlay"],
      ]) {
        expect(tokens.get(alias)).toBe(`var(${target})`);
        expect(resolveToken(alias, tokens)).toBe(resolveToken(target, tokens));
      }
      expect(resolveToken("--orb-raio-bloco", tokens)).toBe("0px");
      expect(resolveToken("--orb-raio-controlo", tokens)).toBe("0px");
      expect(resolveToken("--orb-raio-etiqueta", tokens)).toBe("0px");
    },
  );

  it("preserves circular overview chart geometry in the loaded global layout", () => {
    const globalRules = rulesOf(read("src/app/globals.css"));
    for (const selector of [
      ".visual-overview-donut",
      ".visual-overview-donut > div",
      ".visual-overview-pie",
      ".visual-overview-pie span",
    ]) {
      const chart = globalRules.find(
        (rule) =>
          rule.selector === selector &&
          rule.declarations.get("border-radius") === "50%",
      );
      expect(chart, selector).toBeDefined();
    }
    expect(
      commandRules.some(
        (rule) =>
          rule.selector.includes(".rounded-full") &&
          rule.declarations.get("border-radius") === "0",
      ),
    ).toBe(false);
    for (const rule of commandRules.filter((rule) =>
      rule.declarations.has("clip-path"),
    )) {
      expect(rule.selector).not.toMatch(/avatar|legend|card|:not\(svg\)/);
    }
  });

  it.each([
    "src/features/design/medidas.tsx",
    "src/features/dashboard/operation-funnel.tsx",
    "src/features/unified-dashboard/traffic-diagnostics.tsx",
  ])("retains existing CSS ring and hole hooks in %s", (file) => {
    const source = read(file);
    expect(source).toContain('data-dashboard-chart="donut"');
    expect(source).toContain('data-dashboard-chart-part="ring"');
    expect(source).toContain('data-dashboard-chart-part="hole"');
    expect(source).toContain("conic-gradient");
  });

  it("does not leave conflict markers in the active stylesheet or layout", () => {
    expect(
      command + read("src/app/globals.css") + read("src/app/layout.tsx"),
    ).not.toMatch(/^(?:<{7}|={7}|>{7})/m);
  });
});
