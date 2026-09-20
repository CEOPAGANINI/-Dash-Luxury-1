import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  ConnectionTestResult,
  CreateCustomerInput,
  CreatePaymentInput,
  PaymentMethod,
  PaymentProvider,
  PaymentProviderStatus,
  PaymentResult,
  ProviderCredentials,
  WebhookEvent,
} from "@/payment-providers/types";

/**
 * Adapter Broski (https://broski.pt) — gateway português de MB WAY e
 * Multibanco (somente EUR).
 *
 * Implementado estritamente a partir da especificação oficial:
 * https://docs.broski.pt/openapi.yaml (baixada em 2026-07-28).
 *
 * Características da API:
 * - Base URL: https://api.broski.pt
 * - Autenticação: `Authorization: Bearer sk_live_…` (server-to-server;
 *   CORS bloqueia browser — a chave NUNCA vai ao frontend)
 * - Valores em cêntimos (inteiros), corpo sempre UTF-8
 * - Idempotency-Key obrigatória em criação de pedido e estorno
 * - Webhooks assinados: header `Broski-Signature: t=<unix>,v1=<hex>`,
 *   v1 = HMAC-SHA256(secret, t + "." + corpo_cru), tolerância ±5 min
 * - Liberação de produto SOMENTE no webhook `order.paid`
 */

const BROSKI_BASE_URL = "https://api.broski.pt";

/** Tolerância de timestamp na verificação de webhook (±5 minutos) */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/** Mapeia status da API Broski → status padronizado da plataforma */
const STATUS_MAP: Record<string, PaymentProviderStatus> = {
  pending: "processing", // MB WAY criado, aguardando confirmação no telemóvel
  awaiting_payment: "pending", // Multibanco: voucher emitido
  paid: "approved",
  expired: "expired",
  failed: "refused",
  refunded: "refunded",
};

interface BroskiOrder {
  object?: string;
  id: string;
  status: string;
  amount: number;
  amount_refunded?: number;
  currency?: string;
  method: string;
  external_reference?: string;
  livemode?: boolean;
  created_at?: string;
  paid_at?: string;
  multibanco?: {
    entity: string;
    reference: string;
    amount: number;
    expires_at?: string;
  };
}

interface BroskiError {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
  };
}

export class BroskiUnsupportedError extends Error {
  constructor(operation: string, detail: string) {
    super(`Broski não suporta "${operation}": ${detail}`);
    this.name = "BroskiUnsupportedError";
  }
}

export class BroskiApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BroskiApiError";
  }
}

export interface BroskiCredentials extends ProviderCredentials {
  /** Chave secreta do painel Broski (Configurações → API) */
  apiKey: string;
  /** Segredo de assinatura de webhooks (whbroski_…) */
  webhookSecret?: string;
}

function toPaymentResult(order: BroskiOrder): PaymentResult {
  return {
    externalId: order.id,
    status: STATUS_MAP[order.status] ?? "created",
    method: (order.method === "mbway"
      ? "mbway"
      : "multibanco") as PaymentMethod,
    amountCents: order.amount,
    currency: order.currency ?? "EUR",
    displayData: order.multibanco
      ? {
          multibancoEntity: order.multibanco.entity,
          multibancoReference: order.multibanco.reference,
        }
      : undefined,
    raw: order,
  };
}

export class BroskiProvider implements PaymentProvider {
  readonly key = "broski";
  readonly name = "Broski";

  constructor(private readonly credentials: BroskiCredentials) {}

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.credentials.apiKey}`,
      "Content-Type": "application/json; charset=utf-8",
    };
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const response = await fetch(`${BROSKI_BASE_URL}${path}`, {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const json = (await response.json().catch(() => ({}))) as T & BroskiError;

    if (!response.ok) {
      const param = json.error?.param ? ` (campo: ${json.error.param})` : "";
      throw new BroskiApiError(
        response.status,
        json.error?.code ?? "unknown_error",
        (json.error?.message ?? `Erro HTTP ${response.status} na API Broski`) +
          param,
      );
    }

    return json;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    if (input.method !== "mbway" && input.method !== "multibanco") {
      throw new BroskiUnsupportedError(
        `método ${input.method}`,
        "o Broski aceita apenas MB WAY e Multibanco.",
      );
    }
    if (input.currency.toUpperCase() !== "EUR") {
      throw new BroskiUnsupportedError(
        `moeda ${input.currency}`,
        "o Broski processa apenas EUR.",
      );
    }
    if (input.method === "mbway" && !input.customer.phone) {
      throw new BroskiApiError(
        400,
        "phone_required",
        "MB WAY exige o telemóvel do cliente (+3519XXXXXXXX).",
      );
    }

    const order = await this.request<BroskiOrder>("POST", "/v1/orders", {
      idempotencyKey: input.idempotencyKey,
      body: {
        amount: input.amountCents,
        currency: "EUR",
        method: input.method,
        ...(input.method === "mbway" ? { phone: input.customer.phone } : {}),
        external_reference: input.orderId,
        description: input.metadata?.description?.slice(0, 140),
        checkout_url: input.successUrl ?? input.metadata?.checkoutUrl,
        product_type:
          input.metadata?.productType === "physical" ? "physical" : "digital",
        customer: {
          name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone,
          ...(input.customer.document ? { nif: input.customer.document } : {}),
          // product_type=physical exige address (line1+postal_code+city)
          ...(input.customer.address
            ? {
                address: {
                  line1: input.customer.address.line1,
                  ...(input.customer.address.line2
                    ? { line2: input.customer.address.line2 }
                    : {}),
                  postal_code: input.customer.address.postalCode,
                  city: input.customer.address.city,
                  ...(input.customer.address.region
                    ? { region: input.customer.address.region }
                    : {}),
                  country: input.customer.address.country ?? "PT",
                },
              }
            : {}),
        },
      },
    });

    return toPaymentResult(order);
  }

  async getPayment(paymentExternalId: string): Promise<PaymentResult> {
    const order = await this.request<BroskiOrder>(
      "GET",
      `/v1/orders/${encodeURIComponent(paymentExternalId)}`,
    );
    return toPaymentResult(order);
  }

  async cancelPayment(paymentExternalId: string): Promise<PaymentResult> {
    // A API oficial não possui endpoint de cancelamento; MB WAY expira ao
    // não ser confirmado e o voucher Multibanco tem expires_at próprio.
    throw new BroskiUnsupportedError(
      "cancelamento",
      `a API não expõe cancelamento de pedidos (pedido ${paymentExternalId}); aguarde a expiração ou use estorno após pagamento.`,
    );
  }

  async refundPayment(
    paymentExternalId: string,
    amountCents?: number,
  ): Promise<PaymentResult> {
    // Corpo é obrigatório: {} = estorno total; amount = parcial (repetível).
    await this.request<{ id: string; amount: number; status: string }>(
      "POST",
      `/v1/orders/${encodeURIComponent(paymentExternalId)}/refunds`,
      {
        idempotencyKey: `refund_${paymentExternalId}_${amountCents ?? "total"}_${Date.now()}`,
        body: amountCents ? { amount: amountCents } : {},
      },
    );
    // Recarrega o pedido para refletir status/amount_refunded atualizados
    return this.getPayment(paymentExternalId);
  }

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<{ externalId: string }> {
    // A API não possui endpoint de clientes: o cliente é criado/associado
    // automaticamente pelo e-mail ao criar o pedido.
    throw new BroskiUnsupportedError(
      "criação de cliente",
      `clientes são criados automaticamente pelo e-mail no POST /v1/orders (${input.email}).`,
    );
  }

  async listPaymentMethods(context: {
    currency: string;
    country: string;
  }): Promise<PaymentMethod[]> {
    // Suporte real e documentado: apenas MB WAY e Multibanco, apenas EUR.
    if (context.currency.toUpperCase() !== "EUR") return [];
    return ["mbway", "multibanco"];
  }

  async verifyWebhookSignature(
    request: Request,
    rawBody: string,
  ): Promise<boolean> {
    const secret = this.credentials.webhookSecret;
    if (!secret) return false;

    const header = request.headers.get("Broski-Signature");
    if (!header) return false;

    // Formato: t=<unix>,v1=<hex>
    const parts = new Map(
      header.split(",").map((p) => {
        const [k, ...v] = p.trim().split("=");
        return [k, v.join("=")] as const;
      }),
    );
    const timestamp = parts.get("t");
    const signature = parts.get("v1");
    if (!timestamp || !signature) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) return false;

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async parseWebhook(rawBody: string): Promise<WebhookEvent> {
    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      created: number;
      data?: { object?: BroskiOrder & { order?: string } };
    };

    const obj = event.data?.object;
    const isOrder = obj?.object === "order" || obj?.id?.startsWith("ord_");

    return {
      externalEventId: event.id,
      type: event.type,
      paymentExternalId: isOrder
        ? obj?.id
        : // dispute.created referencia o pedido em data.object.order
          obj?.order,
      status:
        isOrder && obj ? (STATUS_MAP[obj.status] ?? undefined) : undefined,
      amountCents: obj?.amount,
      raw: event,
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // GET /v1/orders é o endpoint de leitura mais leve disponível.
      await this.request<{ data: unknown[]; has_more: boolean }>(
        "GET",
        "/v1/orders",
      );
      return {
        ok: true,
        environment: this.credentials.environment,
        message: "Conexão com a API Broski validada com sucesso.",
      };
    } catch (error) {
      if (error instanceof BroskiApiError && error.httpStatus === 401) {
        return {
          ok: false,
          environment: this.credentials.environment,
          message: "Chave de API inválida (unauthorized).",
        };
      }
      return {
        ok: false,
        environment: this.credentials.environment,
        message:
          error instanceof Error
            ? `Falha ao conectar: ${error.message}`
            : "Falha desconhecida ao conectar com a API Broski.",
      };
    }
  }
}

export function createBroskiProvider(
  credentials: BroskiCredentials,
): BroskiProvider {
  return new BroskiProvider(credentials);
}
