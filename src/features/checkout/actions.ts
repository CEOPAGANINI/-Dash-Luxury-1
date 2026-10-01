"use server";

import { createHash } from "node:crypto";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { checkoutSchema, normalizePtPhone } from "@/validations/checkout";
import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  checkouts,
  customers,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  products,
} from "@/database/schema";
import { getPublicWorkspaceId } from "@/lib/workspace";
import { getAppUrl } from "@/lib/app-url";
import {
  calculateShippingCost,
  listActiveShippingMethods,
} from "@/features/shipping/queries";
import {
  BroskiApiError,
  createBroskiProvider,
} from "@/payment-providers/broski";
import { resolveBroskiCredentials } from "@/payment-providers/broski/credentials";
import { updatePaymentState } from "./payment-processing";
import type { CheckoutPaymentMetadata } from "./payment-lifecycle";
import { completarConfig } from "@/features/checkout-editor/checkout-config";

export type CheckoutActionResult =
  | {
      status: "validation_error" | "payment_error";
      error: string;
      mayStartNew?: boolean;
    }
  | {
      status: "unavailable" | "payment_unknown";
      message: string;
      orderReference?: string;
    }
  | {
      status: "payment_created" | "paid";
      method: "mbway" | "multibanco";
      orderReference: string;
      totalCents: number;
      mbwayPhone?: string;
      multibanco?: { entity: string; reference: string; amountCents: number };
    };

class CheckoutRejected extends Error {}

function displayPayment(
  payment: typeof payments.$inferSelect,
  order: typeof orders.$inferSelect,
): CheckoutActionResult {
  const metadata = payment.metadata as CheckoutPaymentMetadata;
  if (
    ["refused", "expired", "cancelled", "refunded", "chargeback"].includes(
      payment.status,
    )
  )
    return {
      status: "payment_error",
      mayStartNew: true,
      error:
        "Esta tentativa foi encerrada. Você pode iniciar outra compra pelo botão de nova tentativa.",
    };
  return {
    status:
      payment.status === "approved" || payment.status === "partially_refunded"
        ? "paid"
        : "payment_created",
    method: payment.method as "mbway" | "multibanco",
    orderReference: order.reference,
    totalCents: order.totalCents,
    mbwayPhone: metadata.mbwayPhone,
    multibanco:
      metadata.displayData?.multibancoEntity &&
      metadata.displayData.multibancoReference
        ? {
            entity: metadata.displayData.multibancoEntity,
            reference: metadata.displayData.multibancoReference,
            amountCents: order.totalCents,
          }
        : undefined,
  };
}

export async function submitCheckoutAction(
  _previous: CheckoutActionResult | null,
  formData: FormData,
): Promise<CheckoutActionResult> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "validation_error",
      error: parsed.error.issues[0].message,
    };
  const data = parsed.data;
  if (!data.attemptId)
    return {
      status: "validation_error",
      error: "Recarregue o checkout para iniciar uma tentativa segura.",
    };
  if (!isDatabaseConfigured())
    return {
      status: "unavailable",
      message:
        "O pagamento está indisponível nesta configuração. Se você já tentou pagar, aguarde a confirmação da tentativa anterior antes de iniciar outra.",
    };
  const db = getDb();
  let started = false;
  let paymentId: string | undefined;
  let reference: string | undefined;

  try {
    const [checkout] = data.checkoutId
      ? await db
          .select()
          .from(checkouts)
          .where(
            and(
              eq(checkouts.id, data.checkoutId),
              eq(checkouts.status, "published"),
              isNull(checkouts.deletedAt),
            ),
          )
          .limit(1)
      : [];
    if (data.checkoutId && !checkout)
      throw new CheckoutRejected("Este checkout não está publicado.");
    const workspaceId = checkout?.workspaceId ?? (await getPublicWorkspaceId());
    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.slug, data.productSlug),
          eq(products.status, "active"),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);
    if (!product || (checkout && checkout.mainProductId !== product.id))
      throw new CheckoutRejected("Produto não encontrado neste checkout.");
    if (!checkout) {
      const [configured] = await db
        .select({ id: checkouts.id })
        .from(checkouts)
        .where(
          and(
            eq(checkouts.workspaceId, workspaceId),
            eq(checkouts.mainProductId, product.id),
          ),
        )
        .limit(1);
      if (configured)
        throw new CheckoutRejected(
          "Abra o endereço publicado do checkout deste produto para continuar.",
        );
    }
    if (product.type === "subscription")
      throw new CheckoutRejected(
        "O Broski não suporta cobrança recorrente. Use um produto de pagamento único neste checkout.",
      );
    const config = completarConfig(checkout?.config);
    if (
      product.type !== "digital" &&
      (!data.addressLine1 ||
        data.addressLine1.length < 4 ||
        !data.city ||
        data.city.length < 2 ||
        !data.postalCode)
    )
      throw new CheckoutRejected(
        "Informe morada, localidade e código postal para a entrega.",
      );
    for (const field of config.campos) {
      if (!checkout || !field.ativo || !field.obrigatorio) continue;
      if (field.id === "documento" && !data.document)
        throw new CheckoutRejected("Informe o NIF solicitado neste checkout.");
      if (field.id === "telefone" && !data.phone)
        throw new CheckoutRejected(
          "Informe o telefone solicitado neste checkout.",
        );
      if (
        field.id === "endereco" &&
        (!data.addressLine1 || !data.city || !data.postalCode)
      )
        throw new CheckoutRejected(
          "Informe o endereço solicitado neste checkout.",
        );
    }
    if (
      checkout &&
      ((checkout.startsAt && checkout.startsAt > new Date()) ||
        (checkout.endsAt && checkout.endsAt < new Date()))
    )
      throw new CheckoutRejected(
        "Este checkout não está disponível neste período.",
      );
    const allowed = checkout
      ? (checkout.paymentMethods as string[])
      : ["mbway", "multibanco"];
    if (!Array.isArray(allowed) || !allowed.includes(data.paymentMethod))
      throw new CheckoutRejected(
        "Esta forma de pagamento não está habilitada neste checkout.",
      );
    if (product.currency !== "EUR")
      throw new CheckoutRejected(
        "O gateway conectado processa apenas EUR. Configure um produto em euros.",
      );
    const unitPriceCents =
      product.promoPriceCents !== null &&
      product.promoPriceCents >= 0 &&
      product.promoPriceCents <= product.priceCents
        ? product.promoPriceCents
        : product.priceCents;
    const idempotencyKey = `checkout:${workspaceId}:${data.attemptId}`;
    const credentials = await resolveBroskiCredentials(workspaceId);
    if (!credentials) {
      const [existing] = await db
        .select({ payment: payments, order: orders })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(
          and(
            eq(payments.idempotencyKey, idempotencyKey),
            eq(payments.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          existing.payment.externalId ||
          [
            "approved",
            "partially_refunded",
            "refused",
            "expired",
            "cancelled",
            "refunded",
            "chargeback",
          ].includes(existing.payment.status)
        )
          return displayPayment(existing.payment, existing.order);
        return {
          status: "payment_unknown",
          orderReference: existing.order.reference,
          message:
            "A conexão da loja com o gateway está temporariamente indisponível. Esta tentativa já foi registrada: não faça outro pagamento; peça à loja para confirmar este pedido.",
        };
      }
      return {
        status: "unavailable",
        message:
          "Conecte o Broski em Integrações com a chave de API e o segredo de webhook. Nenhuma cobrança foi iniciada.",
      };
    }
    const phone = data.phone ? normalizePtPhone(data.phone) : undefined;
    const configuredShipping =
      product.type === "digital"
        ? []
        : await listActiveShippingMethods(workspaceId);
    const methods = configuredShipping.filter(
      (method) =>
        method.currency === product.currency && method.country === "PT",
    );
    if (configuredShipping.length && !methods.length)
      throw new CheckoutRejected(
        "Configure um método de envio em EUR para Portugal. O frete não pode ser convertido de outra moeda automaticamente.",
      );
    const shippingMethod = data.shippingMethodId
      ? methods.find((m) => m.id === data.shippingMethodId)
      : methods[0];
    if ((methods.length || data.shippingMethodId) && !shippingMethod)
      throw new CheckoutRejected("Escolha uma forma de envio válida.");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({ ...data, phone, checkoutId: checkout?.id ?? null }),
      )
      .digest("hex");

    const prepared = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .for("update");
      if (existing) {
        if (
          (existing.metadata as CheckoutPaymentMetadata).fingerprint !==
          fingerprint
        )
          throw new CheckoutRejected(
            "Os dados desta tentativa mudaram. Confirme primeiro a compra original antes de iniciar outra tentativa.",
          );
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, existing.orderId));
        return { payment: existing, order };
      }
      const bumpCents =
        checkout && data.acceptOrderBump && config.orderBump.ativo
          ? config.orderBump.precoCents
          : 0;
      const subtotal = unitPriceCents * data.quantity + bumpCents;
      const shipping = shippingMethod
        ? calculateShippingCost(shippingMethod, subtotal)
        : 0;
      if (subtotal + shipping <= 0)
        throw new CheckoutRejected(
          "O produto precisa de um preço válido para pagamento.",
        );
      if (
        data.paymentMethod === "mbway" &&
        (subtotal + shipping < 50 || subtotal + shipping > 500_000)
      )
        throw new CheckoutRejected(
          "O MB WAY aceita pagamentos entre €0,50 e €5.000. Escolha Multibanco para valores fora desta faixa.",
        );
      if (
        data.paymentMethod === "multibanco" &&
        subtotal + shipping > 100_000_000
      )
        throw new CheckoutRejected(
          "O valor excede o limite permitido pelo Multibanco.",
        );
      if (product.trackInventory) {
        const reserved = await tx
          .update(products)
          .set({
            stockQuantity: sql`${products.stockQuantity} - ${data.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, product.id),
              gte(products.stockQuantity, data.quantity),
            ),
          )
          .returning({ id: products.id });
        if (!reserved.length)
          throw new CheckoutRejected(
            "Não há estoque suficiente para esta quantidade.",
          );
      }
      const [customer] = await tx
        .insert(customers)
        .values({
          workspaceId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone,
          document: data.document || null,
          country: "PT",
        })
        .onConflictDoUpdate({
          target: [customers.workspaceId, customers.email],
          set: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone,
            document: data.document || null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: customers.id });
      const [order] = await tx
        .insert(orders)
        .values({
          workspaceId,
          reference: `IN-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`,
          checkoutId: checkout?.id,
          customerId: customer.id,
          status: "created",
          currency: "EUR",
          subtotalCents: subtotal,
          shippingCents: shipping,
          totalCents: subtotal + shipping,
          shippingMethod: shippingMethod?.name,
          shippingAddress: {
            line1: data.addressLine1,
            line2: data.addressLine2,
            postal_code: data.postalCode,
            city: data.city,
            country: "PT",
          },
          origin: "checkout",
          countryCode: "PT",
        })
        .returning();
      await tx.insert(orderItems).values({
        workspaceId,
        orderId: order.id,
        productId: product.id,
        productName: product.name,
        quantity: data.quantity,
        unitPriceCents,
        totalCents: unitPriceCents * data.quantity,
      });
      if (bumpCents > 0)
        await tx.insert(orderItems).values({
          workspaceId,
          orderId: order.id,
          productName: config.orderBump.titulo,
          quantity: 1,
          unitPriceCents: bumpCents,
          totalCents: bumpCents,
          isOrderBump: true,
        });
      const metadata: CheckoutPaymentMetadata = {
        provider: "broski",
        fingerprint,
        mbwayPhone: phone,
        submission: "submitting",
        ...(product.trackInventory
          ? {
              inventory: {
                productId: product.id,
                quantity: data.quantity,
                state: "reserved",
              },
            }
          : {}),
      };
      const [payment] = await tx
        .insert(payments)
        .values({
          workspaceId,
          orderId: order.id,
          status: "created",
          method: data.paymentMethod,
          amountCents: order.totalCents,
          currency: "EUR",
          idempotencyKey,
          metadata,
        })
        .returning();
      if (product.trackInventory)
        await tx.insert(inventoryMovements).values({
          workspaceId,
          productId: product.id,
          quantity: -data.quantity,
          reason: "checkout_reservation",
          referenceId: order.id,
        });
      return { payment, order };
    });
    paymentId = prepared.payment.id;
    reference = prepared.order.reference;
    if (
      [
        "approved",
        "partially_refunded",
        "refused",
        "expired",
        "cancelled",
        "refunded",
        "chargeback",
      ].includes(prepared.payment.status)
    )
      return displayPayment(prepared.payment, prepared.order);
    if (
      !prepared.payment.externalId &&
      Date.now() - prepared.payment.createdAt.getTime() >= 23 * 60 * 60 * 1_000
    )
      return {
        status: "payment_unknown",
        orderReference: reference,
        message:
          "Esta tentativa ultrapassou a janela segura de repetição do gateway. Não pague novamente: peça à loja para conciliar este pedido pelo painel do Broski.",
      };
    const provider = createBroskiProvider(credentials);
    started = true;
    const result = prepared.payment.externalId
      ? await provider.getPayment(prepared.payment.externalId)
      : await provider.createPayment({
          idempotencyKey,
          orderId: prepared.order.reference,
          amountCents: prepared.order.totalCents,
          currency: "EUR",
          method: data.paymentMethod,
          customer: {
            name: `${data.firstName} ${data.lastName}`,
            email: data.email,
            phone,
            document: data.document || undefined,
            address:
              data.addressLine1 && data.postalCode && data.city
                ? {
                    line1: data.addressLine1,
                    line2: data.addressLine2 || undefined,
                    postalCode: data.postalCode,
                    city: data.city,
                    country: "PT",
                  }
                : undefined,
          },
          successUrl: `${getAppUrl()}/checkout/${checkout?.slug ?? product.slug}?loja=${workspaceId}`,
          metadata: {
            description: product.name.slice(0, 140),
            productType: product.type === "digital" ? "digital" : "physical",
          },
        });
    if (
      result.amountCents !== prepared.payment.amountCents ||
      result.currency !== "EUR"
    )
      throw new Error("gateway_amount_mismatch");
    const final = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, prepared.payment.id))
        .for("update");
      const metadata: CheckoutPaymentMetadata = {
        ...(current.metadata as CheckoutPaymentMetadata),
        displayData: {
          multibancoEntity: result.displayData?.multibancoEntity,
          multibancoReference: result.displayData?.multibancoReference,
        },
        submission: "ready",
        uncertainty: false,
      };
      await tx
        .update(payments)
        .set({ externalId: result.externalId, metadata, updatedAt: new Date() })
        .where(eq(payments.id, current.id));
      await updatePaymentState(
        tx,
        { ...current, metadata },
        result.status,
        result.refundedAmountCents,
      );
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, current.id));
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, current.orderId));
      return { payment, order };
    });
    return displayPayment(final.payment, final.order);
  } catch (error) {
    if (error instanceof CheckoutRejected)
      return { status: "validation_error", error: error.message };
    const definitelyNotCreated =
      error instanceof BroskiApiError &&
      ([400, 401, 402].includes(error.httpStatus) ||
        (error.httpStatus === 409 &&
          ["mbway_temporarily_blocked", "mbway_pending_for_phone"].includes(
            error.code,
          )));
    if (started && paymentId && definitelyNotCreated) {
      try {
        const alreadyKnown = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(payments)
            .where(eq(payments.id, paymentId!))
            .for("update");
          if (!current) throw new Error("payment_missing");
          if (
            current.externalId ||
            [
              "approved",
              "partially_refunded",
              "refunded",
              "chargeback",
            ].includes(current.status)
          ) {
            const [order] = await tx
              .select()
              .from(orders)
              .where(eq(orders.id, current.orderId));
            return displayPayment(current, order);
          }
          await updatePaymentState(tx, current, "refused");
          return null;
        });
        if (alreadyKnown) return alreadyKnown;
        return {
          status: "payment_error",
          mayStartNew: true,
          error:
            error.httpStatus === 401
              ? "O gateway recusou a conexão da loja. Nenhuma cobrança foi criada; contate a loja."
              : error.code === "mbway_pending_for_phone"
                ? "Este telemóvel já tem um pedido MB WAY pendente. Nenhuma nova cobrança foi criada; confirme o pedido anterior ou inicie outra compra com Multibanco."
                : error.code === "mbway_temporarily_blocked"
                  ? "O MB WAY bloqueou temporariamente este telemóvel. Nenhuma cobrança foi criada; use Multibanco em uma nova tentativa."
                  : "O gateway não conseguiu iniciar o pagamento. Nenhuma cobrança foi criada; você pode iniciar outra tentativa.",
        };
      } catch {
        /* An uncertain database result must not be represented as a safe new attempt. */
      }
    }
    if (started) {
      if (paymentId)
        await db
          .update(payments)
          .set({
            failureReason: "gateway_result_unknown",
            updatedAt: new Date(),
          })
          .where(eq(payments.id, paymentId))
          .catch(() => undefined);
      return {
        status: "payment_unknown",
        orderReference: reference,
        message:
          "A confirmação do gateway ainda não chegou. Não inicie outro pagamento: tente confirmar novamente nesta página; a mesma tentativa será consultada sem criar outra cobrança.",
      };
    }
    return {
      status: "payment_error",
      error:
        "Não foi possível preparar ou consultar o pedido. Nenhuma nova cobrança foi iniciada neste envio. Se você já tentou pagar, confirme a mesma tentativa nesta página.",
    };
  }
}
