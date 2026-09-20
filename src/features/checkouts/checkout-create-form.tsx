"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";

import {
  createCheckoutAction,
  type CheckoutActionResult,
} from "@/features/checkouts/actions";
import { slugify } from "@/validations/checkout-crud";
import type { ProductOption } from "@/features/reviews/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BlockPicker } from "@/components/ui/block-picker";
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

const METHODS = [
  { value: "mbway", label: "MB WAY" },
  { value: "multibanco", label: "Multibanco" },
] as const;

export function CheckoutCreateForm({
  products,
  appUrl,
}: {
  products: ProductOption[];
  appUrl: string;
}) {
  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(createCheckoutAction, null);

  const [slugPreview, setSlugPreview] = React.useState("");
  const formKey = state?.ok ? `saved-${state.message ?? ""}` : "novo";

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Cadastre um produto primeiro para poder criar um checkout.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Criar checkout</CardTitle>
        <CardDescription>
          Cada checkout tem o seu próprio endereço público, para usar em
          campanhas diferentes.
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
              <Label htmlFor="name">Nome interno</Label>
              <Input
                id="name"
                name="name"
                placeholder="Ex.: Cadeira — campanha Meta"
                required
                onChange={(e) => setSlugPreview(slugify(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">
                Só para o seu controlo. O cliente não vê.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Produto principal</Label>
              <BlockPicker
                id="productId"
                name="productId"
                ariaLabel="Produto principal"
                size="sm"
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="slug">
                Endereço público{" "}
                <span className="text-muted-foreground font-normal">
                  (deixe vazio para gerar do nome)
                </span>
              </Label>
              <Input
                id="slug"
                name="slug"
                placeholder={slugPreview || "cadeira-campanha-meta"}
                onChange={(e) => setSlugPreview(slugify(e.target.value))}
              />
              <p className="text-muted-foreground font-mono text-xs break-all">
                {appUrl}/checkout/{slugPreview || "…"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Formas de pagamento</Label>
            <div className="flex flex-wrap gap-4">
              {METHODS.map((m) => (
                <label
                  key={m.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="paymentMethods"
                    value={m.value}
                    defaultChecked
                    className="accent-primary size-4"
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Só aparecem as formas realmente suportadas pelo gateway ligado
              (Broski: MB WAY e Multibanco).
            </p>
          </div>

          <label className="flex items-center gap-2 border-t pt-4 text-sm">
            <input
              type="checkbox"
              name="publishNow"
              className="accent-primary size-4"
            />
            Publicar imediatamente
          </label>

          <Button type="submit" loading={pending}>
            <Plus /> Criar checkout
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
