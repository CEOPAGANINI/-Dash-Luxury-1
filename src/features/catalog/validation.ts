import { z } from "zod";

export function moneyToCents(value: string): number {
  const raw = value.trim();
  let normalized: string;
  if (/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(raw))
    normalized = raw.replaceAll(".", "").replace(",", ".");
  else if (/^\d+(?:\.\d{1,2})?$/.test(raw)) normalized = raw;
  else throw new Error("Informe um preço válido, como 129,90.");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000)
    throw new Error("Preço acima do limite permitido.");
  return cents;
}

const slug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use um endereço com letras minúsculas, números e hífens.",
  );
const cents = z.number().int().min(0).max(1_000_000_000);
const optionalUrl = z
  .union([
    z.literal(""),
    z
      .string()
      .max(2048)
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use uma URL HTTPS.",
      ),
  ])
  .default("");

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome.").max(200),
    slug,
    sku: z.string().trim().max(100).default(""),
    type: z.enum(["physical", "digital", "service", "subscription"]),
    status: z.enum(["draft", "active", "archived"]),
    currency: z.enum(["BRL", "EUR"]).default("BRL"),
    priceCents: cents,
    promoPriceCents: cents.nullable().default(null),
    costCents: cents.nullable().default(null),
    storeId: z.string().uuid().nullable().default(null),
    description: z.string().max(10_000).default(""),
    shortDescription: z.string().max(500).default(""),
    mainImageUrl: optionalUrl,
    deliveryUrl: optionalUrl,
    trackInventory: z.boolean().default(false),
    minStockAlert: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .nullable()
      .default(null),
    categoryIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine(
    (value) =>
      value.promoPriceCents === null ||
      value.promoPriceCents <= value.priceCents,
    {
      message: "O preço promocional não pode superar o preço normal.",
      path: ["promoPriceCents"],
    },
  );

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(200),
  slug,
  description: z.string().max(2000).default(""),
  storeId: z.string().uuid().nullable().default(null),
  imageUrl: optionalUrl,
});

export const inventoryInputSchema = z
  .object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable().default(null),
    version: z.string().datetime(),
    quantity: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine(
        (value) => value !== 0,
        "Informe uma entrada ou saída diferente de zero.",
      ),
    reason: z.enum(["restock", "adjustment", "return"]),
    note: z.string().trim().min(3, "Explique o ajuste.").max(500),
  })
  .refine((value) => value.reason === "adjustment" || value.quantity > 0, {
    message:
      "Reposição e devolução devem aumentar o estoque. Para saídas, escolha Ajuste.",
    path: ["quantity"],
  });

export type ProductInput = z.infer<typeof productInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type InventoryInput = z.infer<typeof inventoryInputSchema>;

export function catalogSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}
