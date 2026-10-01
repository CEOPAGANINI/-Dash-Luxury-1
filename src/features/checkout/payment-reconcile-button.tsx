"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  reconcileCheckoutPaymentAction,
  type ReconciliationResult,
} from "./payment-console-actions";

export function PaymentReconcileButton({ paymentId }: { paymentId: string }) {
  const [result, action, pending] = useActionState<
    ReconciliationResult | null,
    FormData
  >(reconcileCheckoutPaymentAction.bind(null, paymentId), null);
  return (
    <form action={action} className="space-y-2">
      <Button variant="outline" type="submit" size="sm" loading={pending}>
        Consultar no gateway
      </Button>
      {result && (
        <p role="status" className="max-w-sm text-xs">
          {result.message}
        </p>
      )}
    </form>
  );
}
