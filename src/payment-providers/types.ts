/**
 * Contrato dos adapters de pagamento.
 *
 * O checkout NUNCA depende de um gateway específico — apenas desta
 * interface. Cada gateway (Stripe, Mercado Pago, Pagar.me, Asaas, custom)
 * implementa PaymentProvider na Fase 4.
 *
 * Regras invioláveis:
 * - Nunca armazenar número completo de cartão ou CVV (tokenização apenas).
 * - Nunca inventar suporte: `listPaymentMethods` retorna somente o que o
 *   gateway realmente suporta na conta configurada.
 * - Toda criação de pagamento envia `idempotencyKey`.
 * - Todo webhook é verificado com `verifyWebhookSignature` antes de
 *   `parseWebhook`/`handleWebhook`.
 */

export type PaymentMethod =
  | "card"
  | "pix"
  | "boleto"
  | "mbway"
  | "multibanco"
  | "sepa_debit"
  | "apple_pay"
  | "google_pay";

export type PaymentProviderStatus =
  | "created"
  | "pending"
  | "processing"
  | "approved"
  | "refused"
  | "expired"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "chargeback";

export interface ProviderCredentials {
  environment: "sandbox" | "production";
  /** Chaves específicas do provedor (descriptografadas em runtime) */
  [key: string]: string | undefined;
}

export interface CreatePaymentInput {
  idempotencyKey: string;
  orderId: string;
  amountCents: number;
  currency: string;
  method: PaymentMethod;
  customer: {
    id?: string;
    name: string;
    email: string;
    phone?: string;
    document?: string;
    /** Obrigatório em produtos físicos para gateways que exigem morada */
    address?: {
      line1: string;
      line2?: string;
      postalCode: string;
      city: string;
      region?: string;
      country?: string;
    };
  };
  /** Token do cartão gerado pelo componente seguro do gateway — nunca PAN/CVV */
  cardToken?: string;
  installments?: number;
  metadata?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaymentResult {
  externalId: string;
  status: PaymentProviderStatus;
  method: PaymentMethod;
  amountCents: number;
  currency: string;
  /** Dados de exibição: QR Code Pix, URL de boleto, redirect 3DS etc. */
  displayData?: {
    pixQrCode?: string;
    pixCopyPaste?: string;
    boletoUrl?: string;
    boletoBarcode?: string;
    redirectUrl?: string;
    multibancoEntity?: string;
    multibancoReference?: string;
  };
  feeCents?: number;
  cardBrand?: string;
  cardLast4?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone?: string;
  document?: string;
}

export interface WebhookEvent {
  /** ID do evento no provedor (deduplicação) */
  externalEventId: string;
  type: string;
  paymentExternalId?: string;
  status?: PaymentProviderStatus;
  amountCents?: number;
  raw: unknown;
}

export interface ConnectionTestResult {
  ok: boolean;
  environment: "sandbox" | "production";
  message: string;
  /** Dados da conta retornados pelo gateway (mascarados) */
  accountInfo?: Record<string, string>;
}

export interface PaymentProvider {
  /** Identificador único do adapter (ex.: "stripe") */
  readonly key: string;
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  getPayment(paymentExternalId: string): Promise<PaymentResult>;
  cancelPayment(paymentExternalId: string): Promise<PaymentResult>;
  refundPayment(
    paymentExternalId: string,
    amountCents?: number,
  ): Promise<PaymentResult>;

  createCustomer(input: CreateCustomerInput): Promise<{ externalId: string }>;

  /** Formas de pagamento REALMENTE suportadas pela conta/ambiente configurados */
  listPaymentMethods(context: {
    currency: string;
    country: string;
  }): Promise<PaymentMethod[]>;

  /** Verifica assinatura do webhook (obrigatório antes de processar) */
  verifyWebhookSignature(request: Request, rawBody: string): Promise<boolean>;
  parseWebhook(rawBody: string): Promise<WebhookEvent>;

  testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Fábrica de providers — implementada na Fase 4.
 * Cada adapter vive em src/payment-providers/<key>/.
 */
export type PaymentProviderFactory = (
  credentials: ProviderCredentials,
) => PaymentProvider;
