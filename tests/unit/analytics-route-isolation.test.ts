// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("analytics belongs only to consuming routes", () => {
  it("does not make editor, VPS or settings wait for global analytics", () => {
    const root = source("src/app/(painel)/layout.tsx");
    expect(root).not.toContain("getUnifiedDashboardData");
    expect(root).not.toContain("unified-dashboard/live-data");
  });

  it("loads dashboard analytics inside a streaming boundary", () => {
    const dashboard = source("src/app/(painel)/dashboard/layout.tsx");
    expect(dashboard).toContain("getUnifiedDashboardData");
    expect(dashboard).toContain("<Suspense");
    expect(dashboard).toContain("initialData={data}");
  });

  it("uses the ledger-only reader on both finance consumers", () => {
    for (const path of [
      "src/app/(painel)/financeiro/page.tsx",
      "src/app/(painel)/financeiro/entradas-saidas/page.tsx",
    ]) {
      const page = source(path);
      expect(page).toContain("getUnifiedFinancialData");
      expect(page).toContain("initialData={data}");
      expect(page).not.toContain("getUnifiedDashboardData");
    }
    const finance = source("src/features/unified-dashboard/finance-data.ts");
    for (const table of ["products", "orders", "customers", "adCampaigns"])
      expect(finance).not.toContain(`.from(${table})`);
  });
});
