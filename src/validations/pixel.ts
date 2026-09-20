import { z } from "zod";

export const pixelTypeEnum = z.enum([
  "meta_pixel",
  "meta_capi",
  "gtm",
  "ga4",
  "google_ads",
  "tiktok_pixel",
]);

/** Formatos oficiais de cada plataforma — evita salvar ID inválido. */
const ID_PATTERNS: Record<string, { regex: RegExp; message: string }> = {
  meta_pixel: {
    regex: /^\d{15,16}$/,
    message: "O ID do Meta Pixel tem 15 ou 16 dígitos",
  },
  meta_capi: {
    regex: /^\d{15,16}$/,
    message: "O ID do Meta Pixel tem 15 ou 16 dígitos",
  },
  ga4: {
    regex: /^G-[A-Z0-9]{6,12}$/i,
    message: "O ID do GA4 tem o formato G-XXXXXXXXXX",
  },
  gtm: {
    regex: /^GTM-[A-Z0-9]{5,10}$/i,
    message: "O ID do GTM tem o formato GTM-XXXXXXX",
  },
  google_ads: {
    regex: /^AW-\d{9,12}$/i,
    message: "O ID do Google Ads tem o formato AW-XXXXXXXXX",
  },
  tiktok_pixel: {
    regex: /^[A-Z0-9]{15,25}$/i,
    message: "O ID do TikTok Pixel é alfanumérico",
  },
};

export const pixelSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao pixel"),
    type: pixelTypeEnum,
    pixelId: z.string().trim().min(1, "Informe o identificador"),
    token: z.string().trim().optional().or(z.literal("")),
    isActive: z.coerce.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const rule = ID_PATTERNS[data.type];
    if (rule && !rule.regex.test(data.pixelId)) {
      ctx.addIssue({
        code: "custom",
        path: ["pixelId"],
        message: rule.message,
      });
    }
    if (data.type === "meta_capi" && !data.token) {
      ctx.addIssue({
        code: "custom",
        path: ["token"],
        message: "A Conversions API exige o token de acesso",
      });
    }
  });

export type PixelInput = z.infer<typeof pixelSchema>;
