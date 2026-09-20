import { z } from "zod";

/** Slug público: minúsculas, números e hífens. */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCheckoutSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome interno ao checkout"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "O endereço precisa de pelo menos 3 caracteres")
    .max(80, "Endereço muito longo")
    .regex(SLUG_REGEX, "Use apenas minúsculas, números e hífens"),
  productId: z.string().uuid("Escolha o produto principal"),
  paymentMethods: z
    .array(z.enum(["mbway", "multibanco"]))
    .min(1, "Escolha pelo menos uma forma de pagamento"),
  publishNow: z.coerce.boolean().optional(),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

/** Converte um nome livre num slug seguro para URL. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
