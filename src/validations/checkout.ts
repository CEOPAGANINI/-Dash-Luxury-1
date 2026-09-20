import { z } from "zod";

/**
 * Telemóvel português (obrigatório para MB WAY): +351 9XXXXXXXX.
 * A app MB WAY só existe em telemóveis, por isso o 9 inicial é exigido —
 * mas SOMENTE quando o método escolhido é MB WAY.
 */
const PT_MOBILE_REGEX = /^\+3519\d{8}$/;

/**
 * Telefone português genérico (fixo ou móvel): +351 seguido de 9 dígitos.
 * Aceita fixos (2XXXXXXXX) para Multibanco, que não usa o número para nada
 * além de contacto.
 */
const PT_PHONE_REGEX = /^\+351\d{9}$/;

/** Código postal PT: NNNN-NNN (formato exigido pela API Broski) */
const PT_POSTAL_REGEX = /^\d{4}-\d{3}$/;

/** Remove espaços, hífens e parênteses; assume +351 quando não há indicativo. */
export function normalizePtPhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00351")) return `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("351")) return `+${cleaned}`;
  if (/^\d{9}$/.test(cleaned)) return `+351${cleaned}`;
  return cleaned;
}

export const checkoutSchema = z
  .object({
    firstName: z.string().trim().min(2, "Informe o seu nome"),
    lastName: z.string().trim().min(2, "Informe o apelido"),
    email: z.string().trim().email("Informe um e-mail válido"),
    phone: z.string().trim().optional().or(z.literal("")),
    addressLine1: z.string().trim().min(4, "Informe a morada"),
    addressLine2: z.string().trim().optional().or(z.literal("")),
    postalCode: z
      .string()
      .trim()
      .regex(PT_POSTAL_REGEX, "Código postal no formato 1234-567"),
    city: z.string().trim().min(2, "Informe a localidade"),
    paymentMethod: z.enum(["mbway", "multibanco"], {
      message: "Escolha a forma de pagamento",
    }),
    quantity: z.coerce.number().int().min(1).max(10),
    productSlug: z.string().trim().min(1),
    couponCode: z.string().trim().optional().or(z.literal("")),
    shippingMethodId: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const phone = data.phone ? normalizePtPhone(data.phone) : "";

    if (data.paymentMethod === "mbway") {
      // MB WAY: o pedido de pagamento é enviado para a app do telemóvel.
      if (!phone) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "O MB WAY precisa do seu telemóvel para enviar o pedido",
        });
      } else if (!PT_MOBILE_REGEX.test(phone)) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message:
            "Para MB WAY, informe um telemóvel português (ex.: 912 345 678)",
        });
      }
      return;
    }

    // Multibanco: telefone é opcional (só contacto). Se vier, tem de ser válido.
    if (phone && !PT_PHONE_REGEX.test(phone)) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Telefone inválido. Use 9 dígitos (ex.: 222 001 079)",
      });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
