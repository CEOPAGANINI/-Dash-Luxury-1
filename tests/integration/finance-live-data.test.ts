// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({ getOrCreateDefaultWorkspace: vi.fn() }));

import { ledgerEntries, workspaces } from "@/database/schema";
import { readUnifiedFinancialData } from "@/features/unified-dashboard/finance-data";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

let banco: BancoDeTeste;
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});

describe("finance uses scoped ledger without the analytics read model", () => {
  it("preserves configured currency/timezone and excludes other operations and unconfirmed rows", async () => {
    const { workspaceId } = await criarWorkspaceDeTeste(
      banco.db,
      "Financeiro real",
    );
    const foreign = await criarWorkspaceDeTeste(banco.db, "Outra operação");
    await banco.db
      .update(workspaces)
      .set({
        settings: { operation: { currency: "EUR", timezone: "Europe/Lisbon" } },
      })
      .where(eq(workspaces.id, workspaceId));
    await banco.db.insert(ledgerEntries).values([
      {
        workspaceId,
        type: "manual_in",
        direction: "in",
        description: "EUR confirmado",
        amountCents: 1990,
        currency: "EUR",
      },
      {
        workspaceId,
        type: "manual_in",
        direction: "in",
        description: "BRL excluído",
        amountCents: 9990,
        currency: "BRL",
      },
      {
        workspaceId,
        type: "manual_out",
        direction: "out",
        description: "Pendente excluído",
        amountCents: 9990,
        currency: "EUR",
        status: "pending",
      },
      {
        workspaceId: foreign.workspaceId,
        type: "manual_in",
        direction: "in",
        description: "Outra conta",
        amountCents: 9990,
        currency: "EUR",
      },
    ]);
    const data = await readUnifiedFinancialData(workspaceId);
    expect(data.operations.alpha.name).toBe("Financeiro real");
    expect(data.source).toMatchObject({
      status: "ready",
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0]).toMatchObject({
      description: "EUR confirmado",
      value: 19.9,
      type: "entrada",
    });
    expect(data.products).toEqual([]);
    expect(data.orders).toEqual([]);
    expect(data.customers).toEqual([]);
    expect(data.source.unavailableMetrics).toContain("cash");
  });

  it("bounds the list to the 100 most recent confirmed ledger records", async () => {
    const { workspaceId } = await criarWorkspaceDeTeste(banco.db);
    const start = Date.parse("2026-09-30T12:00:00Z");
    await banco.db.insert(ledgerEntries).values(
      Array.from({ length: 105 }, (_, index) => ({
        workspaceId,
        type: "manual_in" as const,
        direction: "in" as const,
        description: `Registro ${index}`,
        amountCents: index,
        occurredAt: new Date(start + index * 1000),
      })),
    );
    const data = await readUnifiedFinancialData(workspaceId);
    expect(data.transactions).toHaveLength(100);
    expect(data.transactions[0].description).toBe("Registro 104");
    expect(data.transactions[99].description).toBe("Registro 5");
  });
});
