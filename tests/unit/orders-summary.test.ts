// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeOrders, type OrderRow } from "@/features/orders/queries";
const row = (
  status: string,
  currency: string,
  totalCents: number,
): OrderRow => ({
  id: crypto.randomUUID(),
  reference: "test",
  status,
  currency,
  totalCents,
  createdAt: new Date(),
  paidAt: null,
  customerName: null,
  customerEmail: null,
  productName: null,
  quantity: null,
  paymentMethod: null,
  paymentStatus: null,
});
describe("order summary currency integrity", () => {
  it("does not add different currencies and includes fulfillment states", () => {
    const result = summarizeOrders([
      row("paid", "BRL", 10000),
      row("shipped", "EUR", 2000),
      row("delivered", "EUR", 3000),
      row("processing", "EUR", 700),
      row("refunded", "EUR", 9999),
    ]);
    expect(result.paidByCurrency).toEqual({ BRL: 10000, EUR: 5000 });
    expect(result.paidRevenueCents).toBe(0);
    expect(result.paidOrders).toBe(3);
    expect(result.awaitingByCurrency).toEqual({ EUR: 700 });
  });
});
