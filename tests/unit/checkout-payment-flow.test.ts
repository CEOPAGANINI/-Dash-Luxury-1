import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/database/client";
import {
  checkouts,
  inventoryMovements,
  orders,
  orderItems,
  payments,
  paymentWebhooks,
  products,
} from "@/database/schema";
import { completarConfig } from "@/features/checkout-editor/checkout-config";
import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

const gateway = vi.hoisted(() => ({
  createPayment: vi.fn(),
  getPayment: vi.fn(),
  findPaymentByReference: vi.fn(),
  ApiError: class extends Error {
    constructor(
      public httpStatus: number,
      public code: string,
    ) {
      super("synthetic refusal");
    }
  },
}));
let fixture: BancoDeTeste;
let workspaceId: string;
let currentRole: "owner" | "viewer" = "owner";
let shippingFixture: ShippingMethodRow[] = [];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/database/client", () => ({
  getDb: () => fixture.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({
  getPublicWorkspaceId: async () => workspaceId,
  exigirWorkspaceRole: async (roles: string[]) => {
    if (!roles.includes(currentRole)) throw new Error("role_denied");
    return { workspaceId, role: currentRole };
  },
}));
vi.mock("@/features/shipping/queries", () => ({
  listActiveShippingMethods: async () => shippingFixture,
  calculateShippingCost: () => 0,
}));
vi.mock("@/payment-providers/broski/credentials", () => ({
  resolveBroskiCredentials: async () => ({
    environment: "sandbox",
    apiKey: "synthetic-test-only",
    webhookSecret: "synthetic-test-only",
  }),
}));
vi.mock("@/payment-providers/broski", () => ({
  createBroskiProvider: () => gateway,
  BroskiApiError: gateway.ApiError,
}));
import { submitCheckoutAction } from "@/features/checkout/actions";
import { processBroskiEvent } from "@/features/checkout/payment-processing";
import { reconcileCheckoutPaymentAction } from "@/features/checkout/payment-console-actions";
import { getPaymentConsole } from "@/features/checkout/payment-console";
import { getProductBySlug } from "@/features/landing/queries";
import type { ShippingMethodRow } from "@/features/shipping/types";

async function purchase(stock = 3) {
  const [product] = await fixture.db
    .insert(products)
    .values({
      workspaceId,
      name: "Produto de teste",
      slug: crypto.randomUUID(),
      priceCents: 2500,
      currency: "EUR",
      type: "physical",
      status: "active",
      trackInventory: true,
      stockQuantity: stock,
    })
    .returning();
  const [checkout] = await fixture.db
    .insert(checkouts)
    .values({
      workspaceId,
      name: "Checkout de teste",
      slug: crypto.randomUUID(),
      mainProductId: product.id,
      currency: "EUR",
      status: "published",
      paymentMethods: ["multibanco"],
      config: completarConfig({
        pagamentos: ["multibanco"],
        campos: [
          { id: "documento", ativo: false, obrigatorio: false },
          { id: "telefone", ativo: true, obrigatorio: false },
        ],
      }),
    })
    .returning();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    firstName: "Cliente",
    lastName: "Teste",
    email: "cliente@example.test",
    phone: "",
    addressLine1: "Rua dos Testes, 10",
    addressLine2: "",
    postalCode: "1234-567",
    city: "Lisboa",
    paymentMethod: "multibanco",
    productSlug: product.slug,
    checkoutId: checkout.id,
    attemptId: crypto.randomUUID(),
    quantity: "1",
    shippingMethodId: "",
    acceptOrderBump: "false",
  }))
    form.set(key, value);
  return { form, product, checkout };
}

function fakePayment() {
  return {
    externalId: crypto.randomUUID(),
    amountCents: 2500,
    currency: "EUR",
    method: "multibanco",
    status: "pending",
    displayData: {
      multibancoEntity: "12345",
      multibancoReference: "123456789",
    },
  };
}

async function currentPayment() {
  const [payment] = await fixture.db
    .select()
    .from(payments)
    .where(eq(payments.workspaceId, workspaceId));
  return payment;
}

describe("checkout and webhook transactions (isolated PostgreSQL; no real charges)", () => {
  beforeAll(async () => {
    fixture = await criarBancoDeTeste({ vps: false });
  }, 30_000);
  beforeEach(async () => {
    ({ workspaceId } = await criarWorkspaceDeTeste(fixture.db));
    vi.clearAllMocks();
    currentRole = "owner";
    shippingFixture = [];
    const result = fakePayment();
    gateway.createPayment.mockResolvedValue(result);
    gateway.getPayment.mockResolvedValue(result);
    gateway.findPaymentByReference.mockResolvedValue(null);
  });
  afterAll(async () => {
    await fixture.pg.close();
  });

  it("reuses one order, payment and reservation when the buyer retries", async () => {
    const { form, product, checkout } = await purchase();
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "payment_created",
    );
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "payment_created",
    );
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(gateway.getPayment).toHaveBeenCalledTimes(1);
    expect(
      await fixture.db
        .select()
        .from(payments)
        .where(eq(payments.workspaceId, workspaceId)),
    ).toHaveLength(1);
    const [order] = await fixture.db
      .select()
      .from(orders)
      .where(eq(orders.workspaceId, workspaceId));
    expect(order.checkoutId).toBe(checkout.id);
    const [remaining] = await fixture.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(remaining.stockQuantity).toBe(2);
  });

  it("charges the same valid promotional price shown on the landing and snapshots it", async () => {
    const { form, product } = await purchase();
    await fixture.db
      .update(products)
      .set({ promoPriceCents: 1500 })
      .where(eq(products.id, product.id));
    const publicProduct = await getProductBySlug(product.slug, workspaceId);
    expect(publicProduct?.priceCents).toBe(1500);
    expect(publicProduct?.compareAtPriceCents).toBe(2500);
    gateway.createPayment.mockResolvedValue({
      ...fakePayment(),
      amountCents: 1500,
    });
    expect(await submitCheckoutAction(null, form)).toMatchObject({
      status: "payment_created",
      totalCents: 1500,
    });
    expect(gateway.createPayment.mock.calls[0][0].amountCents).toBe(1500);
    const [item] = await fixture.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.workspaceId, workspaceId));
    expect(item.unitPriceCents).toBe(1500);
    expect(item.totalCents).toBe(1500);
  });

  it("does not add BRL shipping cents to an EUR purchase", async () => {
    const { form } = await purchase();
    shippingFixture = [
      {
        id: crypto.randomUUID(),
        name: "Frete BRL",
        currency: "BRL",
        country: "PT",
        priceCents: 1000,
        freeAboveCents: null,
        deliveryEstimate: "3 dias",
        isActive: true,
        position: 0,
      },
    ];
    const result = await submitCheckoutAction(null, form);
    expect(result).toMatchObject({ status: "validation_error" });
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(
      await fixture.db
        .select()
        .from(orders)
        .where(eq(orders.workspaceId, workspaceId)),
    ).toHaveLength(0);
  });

  it("does not claim no charge after a lost gateway response; retries the same provider key", async () => {
    const { form } = await purchase();
    gateway.createPayment.mockRejectedValueOnce(new Error("synthetic timeout"));
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "payment_unknown",
    );
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "payment_created",
    );
    expect(gateway.createPayment.mock.calls[0][0].idempotencyKey).toBe(
      gateway.createPayment.mock.calls[1][0].idempotencyKey,
    );
    expect(gateway.createPayment.mock.calls[0][0].orderId).toBe(
      gateway.createPayment.mock.calls[1][0].orderId,
    );
    expect(
      await fixture.db
        .select()
        .from(payments)
        .where(eq(payments.workspaceId, workspaceId)),
    ).toHaveLength(1);
  });

  it("rejects changing a submitted purchase without creating a second payment", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    form.set("quantity", "2");
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "validation_error",
    );
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  it("releases stock on a definite gateway rejection and safely offers a new purchase", async () => {
    const { form, product } = await purchase();
    gateway.createPayment.mockRejectedValueOnce(
      new gateway.ApiError(402, "payment_failed"),
    );
    const result = await submitCheckoutAction(null, form);
    expect(result).toMatchObject({
      status: "payment_error",
      mayStartNew: true,
    });
    expect((await currentPayment()).status).toBe("refused");
    const [stock] = await fixture.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(stock.stockQuantity).toBe(3);
  });

  it("never re-creates an unknown charge after the provider deduplication window", async () => {
    const { form } = await purchase();
    gateway.createPayment.mockRejectedValueOnce(new Error("synthetic timeout"));
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    await fixture.db
      .update(payments)
      .set({ createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(payments.id, payment.id));
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "payment_unknown",
    );
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  it("enforces enabled payment methods and atomic available stock", async () => {
    const { form } = await purchase(0);
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "validation_error",
    );
    form.set("paymentMethod", "mbway");
    form.set("phone", "912345678");
    expect((await submitCheckoutAction(null, form)).status).toBe(
      "validation_error",
    );
    expect(gateway.createPayment).not.toHaveBeenCalled();
    expect(
      await fixture.db
        .select()
        .from(orders)
        .where(eq(orders.workspaceId, workspaceId)),
    ).toHaveLength(0);
  });

  it("atomically confirms and deduplicates webhook, ignores late pending", async () => {
    const { form, product } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    const event = {
      externalEventId: crypto.randomUUID(),
      type: "order.paid",
      paymentExternalId: payment.externalId!,
      status: "approved" as const,
      amountCents: 2500,
      raw: {},
    };
    expect(
      (
        await processBroskiEvent(
          event,
          workspaceId,
          fixture.db as unknown as Database,
        )
      ).changed,
    ).toBe(true);
    expect(
      (
        await processBroskiEvent(
          event,
          workspaceId,
          fixture.db as unknown as Database,
        )
      ).duplicate,
    ).toBe(true);
    await processBroskiEvent(
      { ...event, externalEventId: crypto.randomUUID(), status: "pending" },
      workspaceId,
      fixture.db as unknown as Database,
    );
    expect((await currentPayment()).status).toBe("approved");
    const [order] = await fixture.db
      .select()
      .from(orders)
      .where(eq(orders.id, payment.orderId));
    expect(order.status).toBe("paid");
    const [stock] = await fixture.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(stock.stockQuantity).toBe(2);
  });

  it("leaves an unresolved receipt reprocessable instead of permanently losing it", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    const externalId = crypto.randomUUID();
    const event = {
      externalEventId: crypto.randomUUID(),
      type: "order.paid",
      paymentExternalId: externalId,
      status: "approved" as const,
      amountCents: 2500,
      raw: {},
    };
    expect(
      (
        await processBroskiEvent(
          event,
          workspaceId,
          fixture.db as unknown as Database,
        )
      ).processed,
    ).toBe(false);
    const payment = await currentPayment();
    await fixture.db
      .update(payments)
      .set({ externalId })
      .where(eq(payments.id, payment.id));
    expect(
      (
        await processBroskiEvent(
          event,
          workspaceId,
          fixture.db as unknown as Database,
        )
      ).processed,
    ).toBe(true);
    expect((await currentPayment()).status).toBe("approved");
  });

  it("rolls back the receipt on an invalid paid amount, permitting a corrected retry", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    const event = {
      externalEventId: crypto.randomUUID(),
      type: "order.paid",
      paymentExternalId: payment.externalId!,
      status: "approved" as const,
      amountCents: 1,
      raw: {},
    };
    await expect(
      processBroskiEvent(event, workspaceId, fixture.db as unknown as Database),
    ).rejects.toThrow("payment_amount_mismatch");
    expect(
      await fixture.db
        .select()
        .from(paymentWebhooks)
        .where(
          and(
            eq(paymentWebhooks.workspaceId, workspaceId),
            eq(paymentWebhooks.externalEventId, event.externalEventId),
          ),
        ),
    ).toHaveLength(0);
    expect((await currentPayment()).status).toBe("pending");
    expect(
      (
        await processBroskiEvent(
          { ...event, amountCents: 2500 },
          workspaceId,
          fixture.db as unknown as Database,
        )
      ).processed,
    ).toBe(true);
  });

  it("releases stock exactly once on expiry and accounts for a late approval", async () => {
    const { form, product } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    const event = {
      externalEventId: crypto.randomUUID(),
      type: "order.expired",
      paymentExternalId: payment.externalId!,
      status: "expired" as const,
      raw: {},
    };
    await processBroskiEvent(
      event,
      workspaceId,
      fixture.db as unknown as Database,
    );
    await processBroskiEvent(
      event,
      workspaceId,
      fixture.db as unknown as Database,
    );
    const [restored] = await fixture.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(restored.stockQuantity).toBe(3);
    expect(
      await fixture.db
        .select()
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.workspaceId, workspaceId),
            eq(inventoryMovements.reason, "reservation_released"),
          ),
        ),
    ).toHaveLength(1);
    await processBroskiEvent(
      {
        ...event,
        externalEventId: crypto.randomUUID(),
        type: "order.paid",
        status: "approved",
      },
      workspaceId,
      fixture.db as unknown as Database,
    );
    const [sold] = await fixture.db
      .select()
      .from(products)
      .where(eq(products.id, product.id));
    expect(sold.stockQuantity).toBe(2);
  });

  it("reconciles through read-only gateway requests, including partial refunds", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    gateway.getPayment.mockResolvedValue({
      ...fakePayment(),
      externalId: payment.externalId,
      status: "partially_refunded",
      refundedAmountCents: 500,
    });
    expect((await reconcileCheckoutPaymentAction(payment.id, null)).ok).toBe(
      true,
    );
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(gateway.getPayment).toHaveBeenCalledTimes(1);
    const reconciled = await currentPayment();
    expect(reconciled.status).toBe("partially_refunded");
    expect(reconciled.netCents).toBe(2000);
    expect(
      (reconciled.metadata as { refundedAmountCents: number })
        .refundedAmountCents,
    ).toBe(500);
  });

  it("recovers a lost external identifier by reference without creating any new charge", async () => {
    const { form } = await purchase();
    gateway.createPayment.mockRejectedValueOnce(new Error("synthetic timeout"));
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    gateway.findPaymentByReference.mockResolvedValue({
      ...fakePayment(),
      status: "approved",
    });
    expect((await reconcileCheckoutPaymentAction(payment.id, null)).ok).toBe(
      true,
    );
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect((await currentPayment()).status).toBe("approved");
  });

  it("does not reconcile another account or allow viewers to mutate a payment", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    currentRole = "viewer";
    expect((await reconcileCheckoutPaymentAction(payment.id, null)).ok).toBe(
      false,
    );
    currentRole = "owner";
    ({ workspaceId } = await criarWorkspaceDeTeste(fixture.db));
    expect((await reconcileCheckoutPaymentAction(payment.id, null)).ok).toBe(
      false,
    );
    expect(gateway.getPayment).not.toHaveBeenCalled();
  });

  it("does not expose customer fields or raw webhook bodies in the payment console", async () => {
    const { form } = await purchase();
    await submitCheckoutAction(null, form);
    const payment = await currentPayment();
    await fixture.db
      .update(payments)
      .set({
        metadata: {
          provider: "broski",
          mbwayPhone: "synthetic-sensitive-phone",
        },
      })
      .where(eq(payments.id, payment.id));
    await fixture.db.insert(paymentWebhooks).values({
      workspaceId,
      providerKey: "broski",
      eventType: "order.paid",
      externalEventId: crypto.randomUUID(),
      signatureValid: true,
      payload: { hidden: "synthetic-sensitive-body" },
    });
    const text = JSON.stringify(await getPaymentConsole());
    expect(text).not.toContain("cliente@example.test");
    expect(text).not.toContain("synthetic-sensitive-phone");
    expect(text).not.toContain("synthetic-sensitive-body");
  });
});
