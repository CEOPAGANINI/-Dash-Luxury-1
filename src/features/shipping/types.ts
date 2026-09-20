/**
 * Tipos e cálculo de frete — seguros para o navegador.
 *
 * Vive separado de `queries.ts` porque aquele módulo importa o cliente do
 * banco (postgres/drizzle), que nunca pode entrar no bundle do cliente.
 */

export interface ShippingMethodRow {
  id: string;
  name: string;
  deliveryEstimate: string;
  priceCents: number;
  currency: string;
  country: string;
  freeAboveCents: number | null;
  isActive: boolean;
  position: number;
}

/** Calcula o custo de envio de um método para um dado subtotal. */
export function calculateShippingCost(
  method: ShippingMethodRow,
  subtotalCents: number,
): number {
  if (
    method.freeAboveCents !== null &&
    subtotalCents >= method.freeAboveCents
  ) {
    return 0;
  }
  return method.priceCents;
}
