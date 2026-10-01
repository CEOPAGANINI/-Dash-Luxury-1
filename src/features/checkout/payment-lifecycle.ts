import type { PaymentProviderStatus } from "@/payment-providers/types";

/** Late gateway deliveries cannot undo a settled payment. */
export function paymentTransition(
  current: string,
  incoming: PaymentProviderStatus,
): PaymentProviderStatus | null {
  if (current === incoming) return null;
  if (current === "refunded" || current === "chargeback") return null;
  if (
    ["approved", "partially_refunded"].includes(current) &&
    !["refunded", "partially_refunded", "chargeback"].includes(incoming)
  )
    return null;
  if (
    ["refused", "expired", "cancelled"].includes(current) &&
    ["created", "pending", "processing"].includes(incoming)
  )
    return null;
  return incoming;
}

export const ORDER_STATUS_BY_PAYMENT = {
  created: "created",
  pending: "awaiting_payment",
  processing: "processing",
  approved: "paid",
  refused: "refused",
  expired: "expired",
  cancelled: "cancelled",
  refunded: "refunded",
  partially_refunded: "paid",
  chargeback: "chargeback",
} as const;

export type InventoryReservation = {
  productId: string;
  quantity: number;
  state: "reserved" | "consumed" | "released";
};
export type CheckoutPaymentMetadata = {
  provider?: string;
  fingerprint?: string;
  inventory?: InventoryReservation;
  displayData?: { multibancoEntity?: string; multibancoReference?: string };
  mbwayPhone?: string;
  refundedAmountCents?: number;
  uncertainty?: boolean;
  submission?: "submitting" | "ready" | "unknown";
};
