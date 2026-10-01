// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, workspaceId: "" }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({
  getOrCreateDefaultWorkspace: async () => state.workspaceId,
  getWorkspaceAccess: async () => ({ workspaceId: state.workspaceId }),
}));

import { eq } from "drizzle-orm";
import { customers, orders, workspaces } from "@/database/schema";
import {
  listCustomers,
  summarizeCustomers,
} from "@/features/customers/queries";
import { getFichaDoCliente } from "@/features/customers/crm";
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

async function operation(currency: "BRL" | "EUR") {
  const { workspaceId } = await criarWorkspaceDeTeste(banco.db);
  state.workspaceId = workspaceId;
  await banco.db
    .update(workspaces)
    .set({
      settings: {
        operation: {
          name: "Operação de teste",
          currency,
          timezone: "Europe/Lisbon",
          supportEmail: "",
          supportUrl: "",
          website: "",
        },
      },
    })
    .where(eq(workspaces.id, workspaceId));
  const [customer] = await banco.db
    .insert(customers)
    .values({
      workspaceId,
      email: `${crypto.randomUUID()}@example.test`,
      firstName: "Cliente real",
    })
    .returning();
  return { workspaceId, customer };
}

describe("CRM respeita moeda e workspace sem truncar valores", () => {
  it("calcula LTV/ticket só na moeda configurada, sem overflow int32 nem pedidos de outro workspace", async () => {
    const { workspaceId, customer } = await operation("EUR");
    const foreign = await criarWorkspaceDeTeste(banco.db);
    await banco.db.insert(orders).values([
      {
        workspaceId,
        customerId: customer.id,
        reference: "eur-1",
        status: "paid",
        currency: "EUR",
        totalCents: 2_200_000_000,
      },
      {
        workspaceId,
        customerId: customer.id,
        reference: "eur-2",
        status: "delivered",
        currency: "EUR",
        totalCents: 2_200_000_000,
      },
      {
        workspaceId,
        customerId: customer.id,
        reference: "brl",
        status: "paid",
        currency: "BRL",
        totalCents: 999_000,
      },
      {
        workspaceId,
        customerId: customer.id,
        reference: "pending",
        status: "awaiting_payment",
        currency: "EUR",
        totalCents: 8_000,
      },
      {
        workspaceId: foreign.workspaceId,
        customerId: customer.id,
        reference: "foreign",
        status: "paid",
        currency: "EUR",
        totalCents: 99_000,
      },
    ]);
    const rows = await listCustomers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: "EUR",
      orderCount: 3,
      paidCount: 2,
      totalSpentCents: 4_400_000_000,
      averageTicketCents: 2_200_000_000,
    });
    expect(typeof rows[0].totalSpentCents).toBe("number");
    expect(summarizeCustomers(rows)).toMatchObject({
      currency: "EUR",
      revenueCents: 4_400_000_000,
      averageTicketCents: 2_200_000_000,
    });
  });

  it("mantém histórico com moeda original, mas agrega a ficha completa além de 100 pedidos apenas em BRL", async () => {
    const { workspaceId, customer } = await operation("BRL");
    const foreign = await criarWorkspaceDeTeste(banco.db);
    await banco.db.insert(orders).values(
      Array.from({ length: 105 }, (_, i) => ({
        workspaceId,
        customerId: customer.id,
        reference: `real-${i}`,
        status: "paid" as const,
        currency: "BRL",
        totalCents: 1_000,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    );
    await banco.db.insert(orders).values([
      {
        workspaceId,
        customerId: customer.id,
        reference: "eur-other",
        status: "paid",
        currency: "EUR",
        totalCents: 999_000,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        workspaceId: foreign.workspaceId,
        customerId: customer.id,
        reference: "foreign-detail",
        status: "paid",
        currency: "BRL",
        totalCents: 999_000,
      },
    ]);
    const ficha = await getFichaDoCliente(customer.id);
    expect(ficha).toMatchObject({
      currency: "BRL",
      metricas: {
        orderCount: 105,
        paidCount: 105,
        totalSpentCents: 105_000,
        averageTicketCents: 1_000,
      },
    });
    expect(ficha?.pedidos).toHaveLength(100);
    expect(
      ficha?.pedidos.find((p) => p.reference === "eur-other")?.currency,
    ).toBe("EUR");
    expect(ficha?.pedidos.some((p) => p.reference === "foreign-detail")).toBe(
      false,
    );
  });
});
