import { z } from "zod";

export const shippingMethodSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do frete"),
  deliveryEstimate: z
    .string()
    .trim()
    .min(2, "Informe o prazo (ex.: 2 a 4 dias úteis)"),
  priceCents: z.coerce.number().int().min(0, "O valor não pode ser negativo"),
  freeAboveCents: z
    .union([z.coerce.number().int().min(0), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  isActive: z.coerce.boolean().optional(),
});

export type ShippingMethodInput = z.infer<typeof shippingMethodSchema>;
