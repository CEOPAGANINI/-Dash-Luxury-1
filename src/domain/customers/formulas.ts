import { safeDivide } from "@/domain/shared/math";

export function calculateRepeatRate(
  recurringCustomers: number,
  totalOrders: number,
): number {
  return safeDivide(recurringCustomers, totalOrders);
}

/** Estimativa demonstrativa de LTV em 90 dias. */
export function estimateLtv90(ticket: number, repeatRate: number): number {
  return ticket * (1 + repeatRate * 0.72 + repeatRate * repeatRate * 0.38);
}
