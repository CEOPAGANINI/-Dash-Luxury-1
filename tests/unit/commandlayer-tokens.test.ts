// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const stylesheet = readFileSync(
  path.join(root, "src/app/command-layer.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(css|tsx)$/.test(entry.name)
        ? [file]
        : [];
  });
}

function blockAfter(source: string, selector: string) {
  const selectorStart = source.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing selector: ${selector}`);
  const open = source.indexOf("{", selectorStart);
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed block: ${selector}`);
}

function declaration(source: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing declaration: ${property}`);
  return match[1].trim();
}

const dark = blockAfter(
  stylesheet,
  'body:has([data-design-system="commandlayer"])',
);
const light = blockAfter(stylesheet, 'html[data-tema="branco"] body:has(');

function whiteContrast(hex: string) {
  const channels = hex.slice(1).match(/../g);
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid color: ${hex}`);
  const linear = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
}

describe("CommandLayer token contracts", () => {
  it("declares every literal --cl-* variable referenced by source CSS and TSX", () => {
    const files = sourceFiles(path.join(root, "src")).map((file) => ({
      file,
      source: readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    }));
    const declared = new Set(
      files
        .filter(({ file }) => file.endsWith(".css"))
        .flatMap(({ source }) =>
          [...source.matchAll(/(--cl-[\w-]+)\s*:/g)].map((match) => match[1]),
        ),
    );
    const missing = files.flatMap(({ file, source }) =>
      [...source.matchAll(/var\(\s*(--cl-[\w-]+)/g)]
        .filter((match) => !declared.has(match[1]))
        .map((match) => `${path.relative(root, file)}: ${match[1]}`),
    );
    expect(declared.size).toBeGreaterThan(30);
    expect([...new Set(missing)]).toEqual([]);
  });

  it("keeps structural colors monochromatic in both themes and indicators colored", () => {
    const structural = [
      "--cl-canvas",
      "--cl-chassis",
      "--cl-screen",
      "--cl-well",
      "--cl-terminal",
      "--cl-readout",
      "--cl-card-top",
      "--cl-raised",
      "--cl-border",
      "--cl-border-strong",
      "--cl-hover",
      "--cl-text-primary",
      "--cl-text-secondary",
      "--cl-text-body",
      "--cl-text-muted",
      "--cl-text-dim",
      "--cl-accent",
    ];
    for (const source of [dark, light]) {
      for (const token of structural) {
        const color = declaration(source, token);
        const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
        expect(rgb, `${token}: ${color}`).not.toBeNull();
        expect(rgb![1], token).toBe(rgb![2]);
        expect(rgb![2], token).toBe(rgb![3]);
      }
    }
    const tokens = [
      ["--cl-accent", "#fafafa", "#171717"],
      ["--cl-activity", "#06b6d4", "#0e7490"],
      ["--cl-success", "#34d399", "#065f46"],
      ["--cl-warning", "#f59e0b", "#92400e"],
      ["--cl-info", "#60a5fa", "#1d4ed8"],
      ["--cl-danger", "#fb7185", "#be123c"],
    ];
    for (const [token, darkValue, lightValue] of tokens) {
      expect(declaration(dark, token), `${token}: dark`).toBe(darkValue);
      expect(declaration(light, token), `${token}: light`).toBe(lightValue);
    }
    expect(declaration(dark, "color-scheme")).toBe("dark");
    expect(declaration(light, "color-scheme")).toBe("light");
    expect(declaration(dark, "--serie-1")).toBe("var(--cl-activity)");
  });

  it("keeps dark surfaces in distinct black layers instead of gray blocks", () => {
    for (const [token, value] of [
      ["--cl-canvas", "#050505"],
      ["--cl-screen", "#080808"],
      ["--cl-chassis", "#0b0b0b"],
      ["--cl-well", "#000000"],
      ["--cl-terminal", "#020202"],
      ["--cl-readout", "#060606"],
      ["--cl-card-top", "#111111"],
      ["--cl-raised", "#101010"],
      ["--cl-border", "#202020"],
      ["--cl-border-strong", "#303030"],
      ["--cl-hover", "#171717"],
    ])
      expect(declaration(dark, token), token).toBe(value);
  });

  it("keeps straight UI corners, 4px frame, and shared font families", () => {
    expect(declaration(dark, "--cl-radius-panel")).toBe("0px");
    expect(declaration(dark, "--cl-radius-inner")).toBe("0px");
    expect(declaration(dark, "--cl-radius-control")).toBe("0px");
    expect(declaration(dark, "--cl-frame")).toBe("4px");
    expect(declaration(dark, "--cl-sans")).toContain("var(--font-inter)");
    expect(declaration(dark, "--cl-mono")).toContain(
      "var(--font-jetbrains-mono)",
    );
  });

  it.each([
    [
      "dark normal",
      dark,
      "--cl-button-fill",
      "--cl-cta-top",
      "--cl-cta-bottom",
    ],
    [
      "dark hover",
      dark,
      "--cl-button-hover-fill",
      "--cl-cta-hover-top",
      "--cl-cta-hover-bottom",
    ],
    [
      "light normal",
      light,
      "--cl-button-fill",
      "--cl-cta-top",
      "--cl-cta-bottom",
    ],
    [
      "light hover",
      light,
      "--cl-button-hover-fill",
      "--cl-cta-hover-top",
      "--cl-cta-hover-bottom",
    ],
  ] as const)(
    "keeps white CTA text accessible on neutral gradients in %s",
    (_state, theme, fillToken, topToken, bottomToken) => {
      const fill = declaration(dark, fillToken);
      expect(fill.replace(/\s+/g, "")).toBe(
        `linear-gradient(var(${topToken}),var(${bottomToken}))`,
      );
      const contrasts = [topToken, bottomToken].map((token) =>
        whiteContrast(declaration(theme, token)),
      );
      // Grayscale linear gradients cannot exceed their lighter endpoint's
      // luminance. Compute the worst stop; do not hardcode a passing ratio.
      expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("uses the requested grayscale CTA stops instead of cyan fills or scrims", () => {
    for (const [token, darkValue, lightValue] of [
      ["--cl-cta-top", "#171717", "#262626"],
      ["--cl-cta-bottom", "#080808", "#111111"],
      ["--cl-cta-hover-top", "#202020", "#404040"],
      ["--cl-cta-hover-bottom", "#111111", "#262626"],
    ]) {
      expect(declaration(dark, token), token).toBe(darkValue);
      expect(declaration(light, token), token).toBe(lightValue);
    }
    expect(stylesheet).toContain("background: var(--cl-button-fill)");
    expect(stylesheet).toContain("background: var(--cl-button-hover-fill)");
  });

  it("keeps the 390px overview stacked and filter labels on one line", () => {
    // Source contract only; viewport screenshots remain part of visual QA.
    const mobile = blockAfter(stylesheet, "@media (max-width: 639px)");
    const grid = blockAfter(mobile, ".cl .visual-overview-grid {");
    expect(declaration(grid, "display")).toBe("flex");
    expect(declaration(grid, "flex-direction")).toBe("column");
    const zone = blockAfter(
      mobile,
      ".cl .visual-overview-grid > .visual-overview-zone",
    );
    expect(declaration(zone, "width")).toBe("100%");
    expect(declaration(zone, "height")).toBe("auto");
    const filters = blockAfter(mobile, ".cl .visual-overview-filters {");
    expect(declaration(filters, "grid-template-columns")).toBe(
      "repeat(4, minmax(0, 1fr))",
    );
    const buttons = blockAfter(mobile, ".cl .visual-overview-filters button");
    expect(declaration(buttons, "white-space")).toBe("nowrap");
    expect(declaration(buttons, "min-height")).toBe("44px");
    const title = blockAfter(mobile, ".cl .visual-overview-zone-heading p");
    expect(declaration(title, "overflow-wrap")).toBe("normal");
  });
});
