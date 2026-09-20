export type PixelType =
  | "meta_pixel"
  | "meta_capi"
  | "gtm"
  | "ga4"
  | "google_ads"
  | "tiktok_pixel"
  | "utmify"
  | "custom_script";

export interface PixelRow {
  id: string;
  name: string;
  type: PixelType;
  pixelId: string | null;
  isActive: boolean;
  hasToken: boolean;
  lastActivityAt: Date | null;
}

export const PIXEL_TYPE_INFO: Record<
  PixelType,
  { label: string; idLabel: string; idPlaceholder: string; helper: string }
> = {
  meta_pixel: {
    label: "Meta Pixel (Facebook/Instagram)",
    idLabel: "ID do Pixel",
    idPlaceholder: "1234567890123456",
    helper:
      "Encontre em Gestor de Eventos da Meta → Fontes de dados → o seu pixel.",
  },
  meta_capi: {
    label: "Meta Conversions API",
    idLabel: "ID do Pixel",
    idPlaceholder: "1234567890123456",
    helper:
      "Usa o mesmo ID do pixel + token de acesso. Envia a compra pelo servidor, sem depender do navegador.",
  },
  ga4: {
    label: "Google Analytics 4",
    idLabel: "ID de medição",
    idPlaceholder: "G-XXXXXXXXXX",
    helper: "Admin → Fluxos de dados → o seu fluxo web.",
  },
  gtm: {
    label: "Google Tag Manager",
    idLabel: "ID do contentor",
    idPlaceholder: "GTM-XXXXXXX",
    helper: "Aparece no topo do painel do Tag Manager.",
  },
  google_ads: {
    label: "Google Ads",
    idLabel: "ID de conversão",
    idPlaceholder: "AW-XXXXXXXXX",
    helper: "Ferramentas → Conversões → Tag do Google.",
  },
  tiktok_pixel: {
    label: "TikTok Pixel",
    idLabel: "ID do Pixel",
    idPlaceholder: "CXXXXXXXXXXXXXXXXXXX",
    helper: "Gestor de Eventos do TikTok Ads.",
  },
  utmify: {
    label: "UTMify",
    idLabel: "Identificador",
    idPlaceholder: "—",
    helper: "Integração de rastreamento de conversões.",
  },
  custom_script: {
    label: "Script personalizado",
    idLabel: "Identificador",
    idPlaceholder: "—",
    helper: "Disponível apenas para administradores.",
  },
};
