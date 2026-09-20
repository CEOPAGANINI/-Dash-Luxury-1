import type { PaymentMethod } from "@/payment-providers/types";

/**
 * Catálogo dos gateways suportados pela plataforma.
 * Somente métodos REALMENTE documentados por cada provedor — nunca inventados.
 * Usado pela página Processador (Fase 4) e pelo seed do banco.
 */
export interface ProviderCatalogEntry {
  key: string;
  name: string;
  description: string;
  supportedMethods: PaymentMethod[];
  supportedCurrencies: string[];
  countries: string[];
  /** true = adapter implementado no código */
  adapterReady: boolean;
  envVars: string[];
  docsUrl: string;
}

export const providerCatalog: ProviderCatalogEntry[] = [
  {
    key: "broski",
    name: "Broski",
    description:
      "Gateway português de MB WAY e Multibanco (EUR). Escolhido como gateway principal do usuário.",
    // Conforme https://docs.broski.pt/openapi.yaml — apenas estes dois métodos
    supportedMethods: ["mbway", "multibanco"],
    supportedCurrencies: ["EUR"],
    countries: ["PT"],
    adapterReady: true,
    envVars: ["BROSKI_API_KEY", "BROSKI_WEBHOOK_SECRET"],
    docsUrl: "https://docs.broski.pt",
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Cartões e métodos internacionais (adapter na Fase 4).",
    supportedMethods: [
      "card",
      "apple_pay",
      "google_pay",
      "sepa_debit",
      "multibanco",
    ],
    supportedCurrencies: ["EUR", "BRL", "USD"],
    countries: ["PT", "BR", "US"],
    adapterReady: false,
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    docsUrl: "https://docs.stripe.com",
  },
  {
    key: "mercado_pago",
    name: "Mercado Pago",
    description: "Pix, cartão e boleto no Brasil (adapter na Fase 4).",
    supportedMethods: ["card", "pix", "boleto"],
    supportedCurrencies: ["BRL"],
    countries: ["BR"],
    adapterReady: false,
    envVars: ["MERCADO_PAGO_ACCESS_TOKEN"],
    docsUrl: "https://www.mercadopago.com.br/developers",
  },
  {
    key: "pagarme",
    name: "Pagar.me",
    description: "Pix, cartão e boleto no Brasil (adapter na Fase 4).",
    supportedMethods: ["card", "pix", "boleto"],
    supportedCurrencies: ["BRL"],
    countries: ["BR"],
    adapterReady: false,
    envVars: ["PAGARME_API_KEY"],
    docsUrl: "https://docs.pagar.me",
  },
  {
    key: "asaas",
    name: "Asaas",
    description: "Pix, cartão e boleto no Brasil (adapter na Fase 4).",
    supportedMethods: ["card", "pix", "boleto"],
    supportedCurrencies: ["BRL"],
    countries: ["BR"],
    adapterReady: false,
    envVars: ["ASAAS_API_KEY"],
    docsUrl: "https://docs.asaas.com",
  },
];
