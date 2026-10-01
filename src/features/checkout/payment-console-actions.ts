"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  orders,
  paymentAttempts,
  payments,
  paymentWebhooks,
} from "@/database/schema";
import { exigirWorkspaceRole } from "@/lib/workspace";
import { createBroskiProvider } from "@/payment-providers/broski";
import { resolveBroskiCredentials } from "@/payment-providers/broski/credentials";
import type { CheckoutPaymentMetadata } from "./payment-lifecycle";
import { updatePaymentState } from "./payment-processing";

export type ReconciliationResult = { ok: boolean; message: string };

/** Only GETs the gateway. This action can neither charge nor refund a buyer. */
export async function reconcileCheckoutPaymentAction(
  paymentId: string,
  _previous: ReconciliationResult | null,
): Promise<ReconciliationResult> {
  void _previous;
  if (!z.uuid().safeParse(paymentId).success)
    return { ok: false, message: "Pagamento inválido." };
  if (!isDatabaseConfigured())
    return { ok: false, message: "Banco de dados indisponível." };
  try {
    const { workspaceId } = await exigirWorkspaceRole([
      "owner",
      "admin",
      "finance",
    ]);
    const db = getDb();
    const [row] = await db
      .select({ payment: payments, reference: orders.reference })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.id, paymentId),
          eq(payments.workspaceId, workspaceId),
          eq(orders.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (
      !row ||
      (row.payment.metadata as CheckoutPaymentMetadata).provider !== "broski"
    )
      return {
        ok: false,
        message: "Pagamento Broski não encontrado nesta conta.",
      };
    const credentials = await resolveBroskiCredentials(workspaceId);
    if (!credentials)
      return {
        ok: false,
        message:
          "Conecte as credenciais do Broski em Integrações antes de consultar.",
      };
    const provider = createBroskiProvider(credentials);
    const result = row.payment.externalId
      ? await provider.getPayment(row.payment.externalId)
      : await provider.findPaymentByReference(row.reference);
    if (!result)
      return {
        ok: false,
        message:
          "Referência não localizada nos 100 pedidos mais recentes do gateway. Isso não prova ausência de cobrança: confira esta referência no Broski antes de iniciar outra tentativa.",
      };
    if (
      result.amountCents !== row.payment.amountCents ||
      result.currency !== row.payment.currency
    )
      return {
        ok: false,
        message:
          "O valor ou a moeda do gateway não coincide com o pedido. Nenhuma alteração financeira foi feita.",
      };
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!current) throw new Error("payment_missing");
      const metadata: CheckoutPaymentMetadata = {
        ...(current.metadata as CheckoutPaymentMetadata),
        uncertainty: false,
        submission: "ready",
        displayData: {
          multibancoEntity: result.displayData?.multibancoEntity,
          multibancoReference: result.displayData?.multibancoReference,
        },
      };
      await tx
        .update(payments)
        .set({
          externalId: result.externalId,
          failureReason: null,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));
      await updatePaymentState(
        tx,
        { ...current, metadata },
        result.status,
        result.refundedAmountCents,
      );
      const [last] = await tx
        .select({
          number: sql<number>`coalesce(max(${paymentAttempts.attemptNumber}), 0)::int`,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.paymentId, paymentId));
      await tx.insert(paymentAttempts).values({
        workspaceId,
        paymentId,
        attemptNumber: last.number + 1,
        status: result.status,
        responseSummary: {
          source: "authenticated_read_only_reconciliation",
          status: result.status,
          refundedAmountCents: result.refundedAmountCents ?? 0,
        },
      });
      await tx
        .update(paymentWebhooks)
        .set({ paymentId, processedAt: new Date(), processingError: null })
        .where(
          and(
            eq(paymentWebhooks.workspaceId, workspaceId),
            eq(paymentWebhooks.providerKey, "broski"),
            eq(paymentWebhooks.signatureValid, true),
            isNull(paymentWebhooks.processedAt),
            sql`${paymentWebhooks.payload}->>'paymentExternalId' = ${result.externalId}`,
          ),
        );
    });
    revalidatePath("/configuracoes/pagamentos");
    revalidatePath("/checkouts");
    revalidatePath("/pedidos");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Consulta concluída. Estado confirmado: ${result.status}. Nenhuma nova cobrança ou estorno foi iniciado.`,
    };
  } catch {
    return {
      ok: false,
      message:
        "Não foi possível concluir a conciliação. Verifique a conexão e a permissão financeira. O pagamento não foi recriado.",
    };
  }
}
