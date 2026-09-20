/**
 * Tipos e constantes de segmentação — seguros para o navegador.
 *
 * Vive separado de `segments.ts` porque aquele módulo importa o cliente do
 * banco (postgres/drizzle), que nunca pode entrar no bundle do cliente.
 */

export type SegmentKey = "paid" | "pending" | "refused" | "no_orders" | "all";

export interface SegmentDefinition {
  key: SegmentKey;
  label: string;
  description: string;
}

export const SEGMENTS: SegmentDefinition[] = [
  {
    key: "paid",
    label: "Compraram (pagos)",
    description: "Clientes com pelo menos um pedido pago",
  },
  {
    key: "pending",
    label: "Pagamento pendente",
    description:
      "Geraram a referência mas ainda não pagaram — ideal para lembrar",
  },
  {
    key: "refused",
    label: "Pagamento recusado ou expirado",
    description: "Tentaram pagar e não conseguiram",
  },
  {
    key: "no_orders",
    label: "Sem pedidos",
    description: "Estão no cadastro mas nunca iniciaram uma compra",
  },
  { key: "all", label: "Todos os clientes", description: "Toda a base" },
];
