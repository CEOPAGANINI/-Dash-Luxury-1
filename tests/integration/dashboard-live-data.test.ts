// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({ getOrCreateDefaultWorkspace: vi.fn() }));

import {
  ledgerEntries,
  orders,
  payments,
  products,
  workspaces,
} from "@/database/schema";
import { eq } from "drizzle-orm";
import { readUnifiedDashboardData } from "@/features/unified-dashboard/live-data";
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

describe("dashboard consulta resultados registrados, não amostras", () => {
  it("mantém escopo workspace, moeda e data; não soma tentativas como pedidos", async () => {
    const { workspaceId } = await criarWorkspaceDeTeste(banco.db, "Loja real");
    const foreign = await criarWorkspaceDeTeste(banco.db, "Outra loja");
    const date = new Date("2026-09-30T15:00:00Z");
    await banco.db.insert(orders).values([
      {
        workspaceId,
        reference: "pago",
        status: "paid",
        totalCents: 12500,
        createdAt: date,
      },
      {
        workspaceId,
        reference: "pendente",
        status: "awaiting_payment",
        totalCents: 5500,
        createdAt: date,
      },
      {
        workspaceId,
        reference: "recusado",
        status: "refused",
        totalCents: 2300,
        createdAt: date,
      },
      {
        workspaceId,
        reference: "usd",
        status: "paid",
        totalCents: 99000,
        currency: "USD",
        createdAt: date,
      },
      {
        workspaceId: foreign.workspaceId,
        reference: "outro",
        status: "paid",
        totalCents: 999000,
        createdAt: date,
      },
    ]);
    await banco.db.insert(products).values({
      workspaceId,
      name: "Produto real",
      slug: "real",
      priceCents: 12500,
      status: "active",
    });
    await banco.db.insert(ledgerEntries).values({
      workspaceId,
      type: "manual_in",
      direction: "in",
      description: "Entrada real",
      amountCents: 12500,
      occurredAt: date,
    });
    const data = await readUnifiedDashboardData(
      workspaceId,
      new Date("2026-10-01T15:00:00Z"),
    );
    expect(Object.keys(data.operations)).toEqual(["alpha"]);
    expect(data.operations.alpha.name).toBe("Loja real");
    expect(data.source.status).toBe("ready");
    expect(data.source.revenueDays).toEqual([
      {
        date: "2026-09-30",
        approved: 125,
        pending: 55,
        refused: 23,
        orders: 3,
        paidOrders: 1,
      },
    ]);
    expect(data.products[0].name).toBe("Produto real");
    expect(data.transactions[0]).toMatchObject({ value: 125, type: "entrada" });
    expect(data.source.unavailableMetrics).toContain("contributionProfit");
    expect(data.source.unavailableMetrics).toContain("cash");
  });

  it("consulta vazia é distinguida de fonte indisponível", async () => {
    const { workspaceId } = await criarWorkspaceDeTeste(banco.db);
    const data = await readUnifiedDashboardData(workspaceId);
    expect(data.source.status).toBe("ready");
    expect(data.source.revenueDays).toEqual([]);
    expect(data.operations.alpha.campaigns).toEqual([]);
  });

  it("usa EUR e fuso configurados sem somar BRL nem contar pagamentos como pedidos", async () => {
    const { workspaceId } = await criarWorkspaceDeTeste(banco.db);
    await banco.db
      .update(workspaces)
      .set({
        settings: { operation: { currency: "EUR", timezone: "Europe/Lisbon" } },
      })
      .where(eq(workspaces.id, workspaceId));
    const createdAt = new Date("2026-09-30T23:30:00Z");
    const [order] = await banco.db
      .insert(orders)
      .values({
        workspaceId,
        reference: "eur-only",
        status: "paid",
        totalCents: 1990,
        currency: "EUR",
        createdAt,
      })
      .returning();
    await banco.db.insert(orders).values({
      workspaceId,
      reference: "brl-excluded",
      status: "paid",
      totalCents: 999999,
      currency: "BRL",
      createdAt,
    });
    await banco.db.insert(payments).values([
      {
        workspaceId,
        orderId: order.id,
        amountCents: 1990,
        currency: "EUR",
        method: "card",
        status: "approved",
        createdAt,
      },
      {
        workspaceId,
        orderId: order.id,
        amountCents: 1990,
        currency: "EUR",
        method: "card",
        status: "refused",
        createdAt,
      },
    ]);
    const data = await readUnifiedDashboardData(
      workspaceId,
      new Date("2026-10-01T15:00:00Z"),
    );
    expect(data.source).toMatchObject({
      currency: "EUR",
      timeZone: "Europe/Lisbon",
    });
    expect(data.source.revenueDays).toEqual([
      {
        date: "2026-10-01",
        approved: 19.9,
        pending: 0,
        refused: 0,
        orders: 1,
        paidOrders: 1,
      },
    ]);
    expect(data.source.paymentDays).toEqual([
      { date: "2026-10-01", status: "approved", count: 1, amount: 19.9 },
      { date: "2026-10-01", status: "refused", count: 1, amount: 19.9 },
    ]);
    expect(data.orders).toHaveLength(1);
    expect(data.operations.alpha.kpis.orders).toBe(1);
  });
});
