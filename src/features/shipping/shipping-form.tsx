"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";

import {
  saveShippingMethodAction,
  type ShippingActionResult,
} from "@/features/shipping/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ShippingForm() {
  const [state, formAction, pending] = useActionState<
    ShippingActionResult | null,
    FormData
  >(saveShippingMethodAction, null);

  const formKey = state?.ok ? `saved-${state.message ?? ""}` : "novo";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo frete</CardTitle>
        <CardDescription>
          Aparece como opção para o cliente escolher no checkout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={formKey} action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                placeholder="Ex.: Envio Standard"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryEstimate">Prazo</Label>
              <Input
                id="deliveryEstimate"
                name="deliveryEstimate"
                placeholder="Ex.: 2 a 4 dias úteis"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceCents">
                Valor (€){" "}
                <span className="text-muted-foreground font-normal">
                  — use vírgula, ex.: 4,99
                </span>
              </Label>
              <Input
                id="priceCentsDisplay"
                type="text"
                inputMode="decimal"
                placeholder="4,99"
                onChange={(e) => {
                  const cents = Math.round(
                    (Number(e.target.value.replace(",", ".")) || 0) * 100,
                  );
                  const hidden = e.currentTarget.form?.elements.namedItem(
                    "priceCents",
                  ) as HTMLInputElement | null;
                  if (hidden) hidden.value = String(cents);
                }}
              />
              <input type="hidden" name="priceCents" defaultValue={0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="freeAboveCents">
                Grátis a partir de (€){" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="freeAboveCentsDisplay"
                type="text"
                inputMode="decimal"
                placeholder="Ex.: 19,99"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const hidden = e.currentTarget.form?.elements.namedItem(
                    "freeAboveCents",
                  ) as HTMLInputElement | null;
                  if (!hidden) return;
                  hidden.value = raw
                    ? String(Math.round(Number(raw.replace(",", ".")) * 100))
                    : "";
                }}
              />
              <input type="hidden" name="freeAboveCents" defaultValue="" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked
              className="accent-primary size-4"
            />
            Ativar imediatamente
          </label>

          <Button type="submit" loading={pending}>
            <Plus /> Criar frete
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
