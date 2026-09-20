"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  Info,
  Lock,
  MapPin,
  Smartphone,
  Truck,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { LandingProduct } from "@/features/landing/technebula-data";
import {
  calculateShippingCost,
  type ShippingMethodRow,
} from "@/features/shipping/types";
import {
  submitCheckoutAction,
  type CheckoutActionResult,
} from "@/features/checkout/actions";
import { sendTrack } from "@/features/analytics/tracker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CheckoutFormProps {
  product: LandingProduct;
  initialQuantity: number;
  shippingMethods: ShippingMethodRow[];
}

function Section({
  step,
  icon: Icon,
  title,
  children,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 md:p-6">
      <h2 className="flex items-center gap-2.5 text-base font-bold">
        <span className="flex size-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
          {step}
        </span>
        <Icon className="size-4 text-violet-600" />
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CheckoutForm({
  product,
  initialQuantity,
  shippingMethods,
}: CheckoutFormProps) {
  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(submitCheckoutAction, null);

  const [quantity, setQuantity] = React.useState(initialQuantity);
  const [method, setMethod] = React.useState<"mbway" | "multibanco">("mbway");
  const [shippingMethodId, setShippingMethodId] = React.useState(
    shippingMethods[0]?.id ?? "",
  );
  const [summaryOpen, setSummaryOpen] = React.useState(false);

  const fmt = (cents: number) => formatMoney(cents, product.currency, "pt-PT");
  const subtotal = product.priceCents * quantity;
  const selectedShipping = shippingMethods.find(
    (m) => m.id === shippingMethodId,
  );
  const shipping = selectedShipping
    ? calculateShippingCost(selectedShipping, subtotal)
    : 0;
  const total = subtotal + shipping;

  // Pagamento criado com sucesso: regista o evento uma única vez.
  React.useEffect(() => {
    if (state?.status === "payment_created") {
      sendTrack("payment_created", {
        productSlug: product.slug,
        valueCents: state.totalCents,
        currency: product.currency,
        properties: { method: state.method },
      });
    }
  }, [state, product.slug, product.currency]);

  // Pagamento criado: substitui o formulário pelas instruções de pagamento
  if (state?.status === "payment_created") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl border bg-white p-6 md:p-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            {state.method === "mbway" ? (
              <Smartphone className="size-6" />
            ) : (
              <Lock className="size-6" />
            )}
          </div>
          <h1 className="mt-4 text-center text-xl font-bold">
            {state.method === "mbway"
              ? "Confirme o pagamento no seu telemóvel"
              : "Referência Multibanco gerada"}
          </h1>
          <p className="mt-1 text-center text-sm text-zinc-500">
            Pedido <strong>{state.orderReference}</strong> ·{" "}
            {fmt(state.totalCents)}
          </p>

          {state.method === "mbway" ? (
            <div className="mt-6 rounded-xl bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-700">
              Enviámos um pedido de pagamento MB WAY para{" "}
              <strong>{state.mbwayPhone}</strong>.
              <br />
              Abra a app MB WAY e <strong>confirme em até 5 minutos</strong>.
              Assim que confirmar, receberá o e-mail de confirmação do pedido.
            </div>
          ) : state.multibanco ? (
            <div className="mt-6 overflow-hidden rounded-xl border">
              <div className="grid grid-cols-3 divide-x text-center">
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Entidade</p>
                  <p className="mt-1 font-mono text-lg font-bold">
                    {state.multibanco.entity}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Referência</p>
                  <p className="mt-1 font-mono text-lg font-bold">
                    {state.multibanco.reference}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-zinc-500">Valor</p>
                  <p className="mt-1 font-mono text-lg font-bold">
                    {fmt(state.multibanco.amountCents)}
                  </p>
                </div>
              </div>
              <p className="border-t bg-zinc-50 p-3 text-center text-xs text-zinc-500">
                Pague no homebanking ou em qualquer ATM Multibanco. O pedido é
                confirmado automaticamente após o pagamento.
              </p>
            </div>
          ) : null}

          <p className="mt-6 text-center text-xs text-zinc-500">
            Guarde a referência do pedido: {state.orderReference}
          </p>
        </div>
      </div>
    );
  }

  const summary = (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border bg-zinc-50">
          <Image
            src={product.mainImage}
            alt={product.name}
            fill
            className="object-contain p-1"
          />
          <span className="absolute -top-0 -right-0 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white">
            {quantity}
          </span>
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{product.name}</p>
          <p className="text-zinc-500">{fmt(product.priceCents)} / un.</p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex size-6 items-center justify-center rounded border text-zinc-600 hover:bg-zinc-50"
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-semibold">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              className="flex size-6 items-center justify-center rounded border text-zinc-600 hover:bg-zinc-50"
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>
        </div>
      </div>
      <dl className="space-y-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Subtotal</dt>
          <dd className="font-medium">{fmt(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Portes de envio</dt>
          <dd
            className={cn("font-medium", shipping === 0 && "text-emerald-600")}
          >
            {selectedShipping
              ? shipping === 0
                ? "Grátis"
                : fmt(shipping)
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd>{fmt(total)}</dd>
        </div>
        <p className="text-xs text-zinc-500">IVA incluído</p>
      </dl>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:py-10 lg:grid-cols-[1fr_380px]">
      {/* Resumo recolhível no mobile */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            Resumo do pedido
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                summaryOpen && "rotate-180",
              )}
            />
          </span>
          <span>{fmt(total)}</span>
        </button>
        {summaryOpen && (
          <div className="mt-2 rounded-xl border bg-white p-4">{summary}</div>
        )}
      </div>

      {/* Formulário */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="productSlug" value={product.slug} />
        <input type="hidden" name="quantity" value={quantity} />
        <input type="hidden" name="paymentMethod" value={method} />
        <input type="hidden" name="shippingMethodId" value={shippingMethodId} />

        {state?.status === "validation_error" && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.status === "payment_error" && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Pagamento não iniciado</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.status === "unavailable" && (
          <Alert variant="warning">
            <Info />
            <AlertTitle>Pagamento ainda não ativado</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <Section step={1} icon={User} title="Contacto">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Apelido</Label>
              <Input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.pt"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                {method === "mbway" ? (
                  "Telemóvel (MB WAY)"
                ) : (
                  <>
                    Telefone{" "}
                    <span className="text-zinc-400 font-normal">
                      (opcional)
                    </span>
                  </>
                )}
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="912 345 678"
                required={method === "mbway"}
              />
              {method === "mbway" && (
                <p className="text-xs text-zinc-500">
                  O pedido de pagamento chega na app MB WAY deste número.
                </p>
              )}
            </div>
          </div>
        </Section>

        <Section step={2} icon={MapPin} title="Entrega">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Morada</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                autoComplete="address-line1"
                placeholder="Rua, número, andar"
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine2">
                Complemento{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="addressLine2"
                name="addressLine2"
                autoComplete="address-line2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Código postal</Label>
              <Input
                id="postalCode"
                name="postalCode"
                autoComplete="postal-code"
                placeholder="1234-567"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Localidade</Label>
              <Input
                id="city"
                name="city"
                autoComplete="address-level2"
                required
              />
            </div>
          </div>
        </Section>

        {shippingMethods.length > 0 && (
          <Section step={3} icon={Truck} title="Envio">
            <div className="space-y-2">
              {shippingMethods.map((m) => {
                const cost = calculateShippingCost(m, subtotal);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setShippingMethodId(m.id)}
                    aria-pressed={shippingMethodId === m.id}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border-2 p-3.5 text-left transition-colors",
                      shippingMethodId === m.id
                        ? "border-violet-600 bg-violet-50/50"
                        : "border-zinc-200 hover:border-zinc-300",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-bold">{m.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {m.deliveryEstimate}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        cost === 0 && "text-emerald-600",
                      )}
                    >
                      {cost === 0 ? "Grátis" : fmt(cost)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        <Section
          step={shippingMethods.length > 0 ? 4 : 3}
          icon={Smartphone}
          title="Pagamento"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  key: "mbway",
                  label: "MB WAY",
                  img: "/landing/mbway.svg",
                  hint: "Confirmação imediata no telemóvel",
                },
                {
                  key: "multibanco",
                  label: "Multibanco",
                  img: "/landing/multibanco.svg",
                  hint: "Referência para pagar no homebanking ou ATM",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setMethod(opt.key);
                  sendTrack("checkout_payment_selected", {
                    productSlug: product.slug,
                    properties: { method: opt.key },
                  });
                }}
                aria-pressed={method === opt.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                  method === opt.key
                    ? "border-violet-600 bg-violet-50/50"
                    : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={opt.img}
                  alt=""
                  className="h-8 rounded border bg-white px-1.5 py-0.5"
                />
                <span>
                  <span className="block text-sm font-bold">{opt.label}</span>
                  <span className="block text-xs text-zinc-500">
                    {opt.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
            <Lock className="size-3.5" />
            Pagamento processado em Portugal por infraestrutura licenciada na
            UE.
          </p>
        </Section>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={shippingMethods.length > 0 && !shippingMethodId}
          className="h-12 w-full bg-orange-500 text-base font-bold hover:bg-orange-600"
        >
          {method === "mbway"
            ? `Pagar ${fmt(total)} com MB WAY`
            : `Gerar referência Multibanco · ${fmt(total)}`}
        </Button>

        <p className="text-center text-xs text-zinc-500">
          Ao confirmar, aceita os{" "}
          <Link href="/legal/termos" className="underline" target="_blank">
            Termos e Condições
          </Link>{" "}
          da TechNébula.
        </p>
      </form>

      {/* Resumo fixo no desktop */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 rounded-2xl border bg-white p-5">
          <h2 className="mb-4 text-base font-bold">Resumo do pedido</h2>
          {summary}
        </div>
      </aside>
    </div>
  );
}
