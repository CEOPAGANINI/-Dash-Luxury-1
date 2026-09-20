import { z } from "zod";

export const reviewSchema = z.object({
  productId: z.string().uuid("Escolha o produto"),
  authorName: z.string().trim().min(2, "Informe o nome de quem avaliou"),
  location: z.string().trim().optional().or(z.literal("")),
  rating: z.coerce
    .number()
    .int()
    .min(1, "Nota de 1 a 5")
    .max(5, "Nota de 1 a 5"),
  title: z
    .string()
    .trim()
    .max(80, "Título muito longo")
    .optional()
    .or(z.literal("")),
  body: z.string().trim().min(10, "Escreva ao menos uma frase"),
  photoUrl: z
    .string()
    .trim()
    .url("URL da foto inválida")
    .optional()
    .or(z.literal("")),
  helpfulCount: z.coerce.number().int().min(0).max(9999).optional(),
  reviewedAt: z.string().trim().optional().or(z.literal("")),
  /**
   * Só pode ser verdadeiro quando existir um pedido pago correspondente —
   * o selo "Compra verificada" é uma afirmação legal perante o consumidor.
   */
  isVerifiedPurchase: z.coerce.boolean().optional(),
  isPublished: z.coerce.boolean().optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
