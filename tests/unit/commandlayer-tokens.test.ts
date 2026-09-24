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

function whiteContrastAfterBlackScrim(hex: string, scrim: number) {
  const channels = hex.slice(1).match(/../g);
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid color: ${hex}`);
  const linear = channels.map((channel) => {
    const value = (Number.parseInt(channel, 16) * (1 - scrim)) / 255;
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

  it("preserves distinct reference surfaces and explicit light-theme equivalents", () => {
    const tokens = [
      ["--cl-canvas", "#0f0f11", "#e8ecef"],
      ["--cl-chassis", "#18181b", "#f8fafc"],
      ["--cl-screen", "#131315", "#eef1f4"],
      ["--cl-well", "#09090b", "#dde3e9"],
      ["--cl-terminal", "#0c0c0e", "#e3e9ef"],
      ["--cl-card-top", "#202023", "#ffffff"],
      ["--cl-raised", "#27272a", "#e2e8f0"],
      ["--cl-text-primary", "#f1f5f9", "#0f172a"],
      ["--cl-accent", "#22d3ee", "#155e75"],
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
  });

  it("keeps the 12/8/4px hierarchy, 4px frame, and shared font families", () => {
    expect(declaration(dark, "--cl-radius-panel")).toBe("12px");
    expect(declaration(dark, "--cl-radius-inner")).toBe("8px");
    expect(declaration(dark, "--cl-radius-control")).toBe("4px");
    expect(declaration(dark, "--cl-frame")).toBe("4px");
    expect(declaration(dark, "--cl-sans")).toContain("var(--font-inter)");
    expect(declaration(dark, "--cl-mono")).toContain(
      "var(--font-jetbrains-mono)",
    );
  });

  it.each([
    ["normal", "--cl-button-fill", "--cl-cta-top", "--cl-cta-bottom", 24, 5.84],
    [
      "hover",
      "--cl-button-hover-fill",
      "--cl-cta-hover-top",
      "--cl-cta-hover-bottom",
      40,
      5.99,
    ],
  ] as const)(
    "keeps accessible white CTA text in %s",
    (_state, fillToken, topToken, bottomToken, scrimPercent, minimum) => {
      const fill = declaration(dark, fillToken);
      const scrims = [...fill.matchAll(/rgb\(0 0 0\s*\/\s*(\d+)%\)/g)].map(
        (match) => Number(match[1]),
      );
      expect(scrims).toEqual([scrimPercent, scrimPercent]);
      expect(fill).toContain(`var(${topToken})`);
      expect(fill).toContain(`var(${bottomToken})`);
      const contrasts = [topToken, bottomToken].map((token) =>
        whiteContrastAfterBlackScrim(declaration(dark, token), scrims[0] / 100),
      );
      // Compute from CSS tokens, not a hardcoded pass; rounded expected values
      // are 5.84 normal and 5.99 hover. Both exceed the 4.5:1 text threshold.
      expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5);
      expect(Number(Math.min(...contrasts).toFixed(2))).toBeGreaterThanOrEqual(
        minimum,
      );
    },
  );

  it("preserves original CTA hue stops underneath the contrast scrim", () => {
    expect(declaration(dark, "--cl-cta-top")).toBe("#0891b2");
    expect(declaration(dark, "--cl-cta-bottom")).toBe("#0e7490");
    expect(declaration(dark, "--cl-cta-hover-top")).toBe("#06b6d4");
    expect(declaration(dark, "--cl-cta-hover-bottom")).toBe("#0891b2");
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
