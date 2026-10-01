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
import {
  completarConfig,
  type CheckoutConfig,
} from "@/features/checkout-editor/checkout-config";

interface CheckoutFormProps {
  product: LandingProduct;
  initialQuantity: number;
  shippingMethods: ShippingMethodRow[];
  checkoutId?: string;
  paymentMethods?: string[];
  config?: CheckoutConfig;
  attemptId: string;
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
    <section className="border bg-[var(--checkout-surface)] p-4 md:p-5">
      <h2 className="flex items-center gap-2.5 text-base font-bold">
        <span className="flex size-7 items-center justify-center bg-[var(--checkout-accent)] text-xs font-bold text-white">
          {step}
        </span>
        <Icon className="size-4" />
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
  checkoutId,
  paymentMethods = ["mbway", "multibanco"],
  config: incomingConfig,
  attemptId,
}: CheckoutFormProps) {
  const config = React.useMemo(
    () => completarConfig(incomingConfig),
    [incomingConfig],
  );
  const storageKey = `checkout-attempt:${checkoutId ?? product.slug}`;
  const formRef = React.useRef<HTMLFormElement>(null);
  const [currentAttemptId, setCurrentAttemptId] = React.useState(attemptId);
  const [restoredState, setRestoredState] =
    React.useState<CheckoutActionResult | null>(null);
  const [attemptReady, setAttemptReady] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [paymentEnded, setPaymentEnded] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [secondsLeft, setSecondsLeft] = React.useState(
    config.contador.minutos * 60,
  );
  const submission = React.useCallback(
    async (previous: CheckoutActionResult | null, payload: FormData) => {
      // A refresh/network retry must reuse the exact purchase, not only its key.
      try {
        const existing = JSON.parse(
          sessionStorage.getItem(storageKey) ?? "null",
        );
        if (
          existing?.payload &&
          existing.result?.status === "payment_unknown"
        ) {
          payload = new FormData();
          for (const [key, value] of Object.entries(existing.payload))
            payload.set(key, String(value));
        }
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            id: payload.get("attemptId"),
            payload: Object.fromEntries(payload),
            result: {
              status: "payment_unknown",
              message:
                "A tentativa anterior está sendo confirmada. Use o botão abaixo para consultar a mesma compra, sem duplicá-la.",
            },
          }),
        );
      } catch {
        /* Private browsing can disable session storage. Server deduplication still applies. */
      }
      const result = await submitCheckoutAction(previous, payload);
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            ...stored,
            result,
            ...(result.status === "validation_error" ||
            result.status === "unavailable"
              ? { payload: undefined }
              : {}),
          }),
        );
      } catch {
        /* No secret is stored or logged. */
      }
      return result;
    },
    [storageKey],
  );
  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(submission, null);
  const effectiveState = state ?? restoredState;

  const [quantity, setQuantity] = React.useState(initialQuantity);
  const [method, setMethod] = React.useState<"mbway" | "multibanco">(
    paymentMethods.includes("mbway") ? "mbway" : "multibanco",
  );
  const [bump, setBump] = React.useState(false);
  const [shippingMethodId, setShippingMethodId] = React.useState(
    shippingMethods[0]?.id ?? "",
  );
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const configuredField = (id: string) =>
    config.campos.find((field) => field.id === id);
  const hasDelivery =
    product.type !== "digital" || Boolean(configuredField("endereco")?.ativo);
  const stepNames = hasDelivery
    ? ["Contacto", "Entrega", "Pagamento"]
    : ["Contacto", "Pagamento"];
  const stepped = config.layout === "etapas";
  const advance = () => {
    const visible = formRef.current?.querySelectorAll<HTMLInputElement>(
      "[data-checkout-step]:not([hidden]) input",
    );
    for (const input of visible ?? []) if (!input.reportValidity()) return;
    setStep((value) => Math.min(stepNames.length - 1, value + 1));
  };
  const fieldOrder = (id: string) => ({
    order: config.campos.findIndex((field) => field.id === id) * 10,
  });

  React.useEffect(() => {
    let saved: {
      id?: string;
      result?: CheckoutActionResult;
      payload?: Record<string, string>;
    } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    } catch {
      /* optional storage */
    }
    const restore = saved;
    queueMicrotask(() => {
      if (restore?.id && /^[0-9a-f-]{36}$/i.test(restore.id)) {
        setCurrentAttemptId(restore.id);
        setRestoredState(restore.result ?? null);
        const fields = restore.payload;
        if (fields) {
          setQuantity(Number(fields.quantity) || initialQuantity);
          setMethod(
            fields.paymentMethod === "multibanco" ? "multibanco" : "mbway",
          );
          setBump(fields.acceptOrderBump === "true");
          setShippingMethodId(fields.shippingMethodId ?? "");
          for (const [name, value] of Object.entries(fields)) {
            const input = formRef.current?.elements.namedItem(name);
            if (input instanceof HTMLInputElement && input.type !== "hidden")
              input.value = value;
          }
        }
      }
      setAttemptReady(true);
    });
  }, [initialQuantity, storageKey]);

  React.useEffect(() => {
    if (
      !attemptReady ||
      confirmed ||
      paymentEnded ||
      !["payment_created", "payment_unknown"].includes(
        effectiveState?.status ?? "",
      )
    )
      return;
    let cancelled = false;
    const inspect = async () => {
      try {
        const query = new URLSearchParams({
          attemptId: currentAttemptId,
          ...(checkoutId ? { checkoutId } : {}),
        });
        const response = await fetch(`/api/public/checkout-status?${query}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (data.status === "approved" || data.status === "partially_refunded")
          setConfirmed(true);
        if (
          [
            "refused",
            "cancelled",
            "expired",
            "refunded",
            "chargeback",
          ].includes(data.status)
        )
          setPaymentEnded(true);
      } catch {
        /* Retry on the next interval. */
      }
    };
    void inspect();
    const interval = setInterval(() => void inspect(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    attemptReady,
    checkoutId,
    currentAttemptId,
    effectiveState?.status,
    confirmed,
    paymentEnded,
  ]);

  React.useEffect(() => {
    if (!config.contador.ativo) return;
    const timer = setInterval(
      () => setSecondsLeft((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => clearInterval(timer);
  }, [config.contador.ativo]);

  const newPurchase = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* optional storage */
    }
    window.location.reload();
  };

  const fmt = (cents: number) => formatMoney(cents, product.currency, "pt-PT");
  const subtotal =
    product.priceCents * quantity +
    (bump && config.orderBump.ativo ? config.orderBump.precoCents : 0);
  const selectedShipping = shippingMethods.find(
    (m) => m.id === shippingMethodId,
  );
  const shipping = selectedShipping
    ? calculateShippingCost(selectedShipping, subtotal)
    : 0;
  const total = subtotal + shipping;

  // Pagamento criado com sucesso: regista o evento uma única vez.
  React.useEffect(() => {
    if (state?.status === "payment_created" || state?.status === "paid") {
      sendTrack("payment_created", {
        checkoutId,
        productSlug: product.slug,
        valueCents: state.totalCents,
        currency: product.currency,
        properties: { method: state.method },
      });
    }
  }, [state, product.slug, product.currency, checkoutId]);

  // Pagamento criado: substitui o formulário pelas instruções de pagamento
  if (
    effectiveState?.status === "payment_created" ||
    effectiveState?.status === "paid"
  ) {
    const state = effectiveState;
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
            {paymentEnded
              ? "Tentativa encerrada"
              : confirmed || state.status === "paid"
                ? "Pagamento confirmado"
                : state.method === "mbway"
                  ? "Confirme o pagamento no seu telemóvel"
                  : "Referência Multibanco gerada"}
          </h1>
          <p className="mt-1 text-center text-sm text-zinc-500">
            Pedido <strong>{state.orderReference}</strong> ·{" "}
            {fmt(state.totalCents)}
          </p>

          {paymentEnded ? (
            <p className="mt-6 text-center">
              O gateway encerrou esta tentativa. Uma nova compra só começa se
              você clicar no botão abaixo.
            </p>
          ) : confirmed || state.status === "paid" ? (
            <p className="mt-6 text-center">
              Seu pedido foi pago e registrado. Guarde a referência abaixo.
            </p>
          ) : state.method === "mbway" ? (
            <div className="mt-6 rounded-xl bg-zinc-50 p-5 text-center text-sm leading-relaxed text-zinc-700">
              Enviámos um pedido de pagamento MB WAY para{" "}
              <strong>{state.mbwayPhone}</strong>.
              <br />
              Abra a app MB WAY e <strong>confirme em até 5 minutos</strong>.
              Esta página atualiza automaticamente quando o gateway confirmar.
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
          {(paymentEnded || confirmed || state.status === "paid") && (
            <Button className="mt-5 w-full" onClick={newPurchase}>
              Iniciar outra compra
            </Button>
          )}
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
              className="flex size-11 items-center justify-center border hover:opacity-70"
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
              className="flex size-11 items-center justify-center border hover:opacity-70"
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
    <div
      className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]"
      style={
        {
          backgroundColor: config.cores.fundo,
          color: config.cores.texto,
          "--checkout-surface": config.cores.fundo,
          "--checkout-accent": config.cores.destaque,
        } as React.CSSProperties
      }
    >
      {/* Resumo recolhível no mobile */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between border bg-[var(--checkout-surface)] px-4 py-3 text-sm font-semibold"
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
          <div className="mt-2 border bg-[var(--checkout-surface)] p-4">
            {summary}
          </div>
        )}
      </div>

      {/* Formulário */}
      <form ref={formRef} action={formAction} className="space-y-4">
        <header>
          <h1 className="text-2xl font-bold">{config.textos.titulo}</h1>
          <p className="text-sm">{config.textos.subtitulo}</p>
        </header>
        {config.contador.ativo && (
          <p role="timer" className="border p-3 text-sm">
            Tempo de preenchimento: {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")} · O pagamento só inicia
            ao confirmar.
          </p>
        )}
        {stepped && (
          <nav
            aria-label="Etapas do checkout"
            className="flex flex-wrap gap-4 text-sm"
          >
            {stepNames.map((label, index) => (
              <span
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={step === index ? "font-bold" : "opacity-60"}
              >
                {index + 1}. {label}
              </span>
            ))}
          </nav>
        )}
        <input type="hidden" name="attemptId" value={currentAttemptId} />
        <input type="hidden" name="checkoutId" value={checkoutId ?? ""} />
        <input
          type="hidden"
          name="acceptOrderBump"
          value={bump ? "true" : "false"}
        />
        <input type="hidden" name="productSlug" value={product.slug} />
        <input type="hidden" name="quantity" value={quantity} />
        <input type="hidden" name="paymentMethod" value={method} />
        <input type="hidden" name="shippingMethodId" value={shippingMethodId} />

        {effectiveState?.status === "validation_error" && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{effectiveState.error}</AlertDescription>
          </Alert>
        )}
        {effectiveState?.status === "payment_error" && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Verifique a tentativa</AlertTitle>
            <AlertDescription>{effectiveState.error}</AlertDescription>
            {(paymentEnded || effectiveState.mayStartNew) && (
              <Button type="button" onClick={newPurchase}>
                Iniciar outra compra
              </Button>
            )}
          </Alert>
        )}
        {effectiveState?.status === "unavailable" && (
          <Alert variant="warning">
            <Info />
            <AlertTitle>Pagamento ainda não ativado</AlertTitle>
            <AlertDescription>{effectiveState.message}</AlertDescription>
          </Alert>
        )}
        {effectiveState?.status === "payment_unknown" && (
          <Alert variant="warning">
            <AlertTitle>
              {confirmed
                ? "Pagamento confirmado pelo gateway"
                : paymentEnded
                  ? "Tentativa encerrada"
                  : "Confirmação em andamento"}
            </AlertTitle>
            <AlertDescription>
              {confirmed
                ? "O pedido está pago. Não é necessário pagar novamente."
                : paymentEnded
                  ? "A tentativa anterior terminou; inicie outra compra se desejar."
                  : effectiveState.message}
              {effectiveState.orderReference && (
                <span className="block">
                  Pedido: {effectiveState.orderReference}
                </span>
              )}
            </AlertDescription>
            {(confirmed || paymentEnded) && (
              <Button type="button" onClick={newPurchase}>
                Iniciar outra compra
              </Button>
            )}
          </Alert>
        )}

        <div data-checkout-step hidden={stepped && step !== 0}>
          <Section step={1} icon={User} title="Contacto">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5" style={fieldOrder("nome")}>
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div
                className="space-y-1.5"
                style={{ order: fieldOrder("nome").order + 1 }}
              >
                <Label htmlFor="lastName">Apelido</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  required
                />
              </div>
              <div className="space-y-1.5" style={fieldOrder("email")}>
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
              <div
                className="space-y-1.5"
                style={fieldOrder("telefone")}
                hidden={
                  !configuredField("telefone")?.ativo &&
                  !paymentMethods.includes("mbway")
                }
              >
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
                  required={
                    method === "mbway" ||
                    Boolean(
                      configuredField("telefone")?.ativo &&
                      configuredField("telefone")?.obrigatorio,
                    )
                  }
                />
                {method === "mbway" && (
                  <p className="text-xs text-zinc-500">
                    O pedido de pagamento chega na app MB WAY deste número.
                  </p>
                )}
              </div>
              {configuredField("documento")?.ativo && (
                <div className="space-y-1.5" style={fieldOrder("documento")}>
                  <Label htmlFor="document">NIF</Label>
                  <Input
                    id="document"
                    name="document"
                    inputMode="numeric"
                    maxLength={9}
                    pattern="[0-9]{9}"
                    autoComplete="off"
                    required={configuredField("documento")?.obrigatorio}
                    placeholder="9 dígitos"
                  />
                </div>
              )}
            </div>
          </Section>
        </div>

        {hasDelivery && (
          <div
            data-checkout-step
            hidden={stepped && step !== 1}
            className="space-y-4"
          >
            <Section step={2} icon={MapPin} title="Entrega">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="addressLine1">Morada</Label>
                  <Input
                    id="addressLine1"
                    name="addressLine1"
                    autoComplete="address-line1"
                    placeholder="Rua, número, andar"
                    required={
                      product.type !== "digital" ||
                      configuredField("endereco")?.obrigatorio
                    }
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
                    required={
                      product.type !== "digital" ||
                      configuredField("endereco")?.obrigatorio
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">Localidade</Label>
                  <Input
                    id="city"
                    name="city"
                    autoComplete="address-level2"
                    required={
                      product.type !== "digital" ||
                      configuredField("endereco")?.obrigatorio
                    }
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
                            ? "border-[var(--checkout-accent)]"
                            : "border-zinc-200 hover:border-zinc-300",
                        )}
                      >
                        <span>
                          <span className="block text-sm font-bold">
                            {m.name}
                          </span>
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
          </div>
        )}

        <div
          data-checkout-step
          hidden={stepped && step !== stepNames.length - 1}
        >
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
              )
                .filter((opt) => paymentMethods.includes(opt.key))
                .map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setMethod(opt.key);
                      sendTrack("checkout_payment_selected", {
                        checkoutId,
                        productSlug: product.slug,
                        properties: { method: opt.key },
                      });
                    }}
                    aria-pressed={method === opt.key}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                      method === opt.key
                        ? "border-[var(--checkout-accent)]"
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
                      <span className="block text-sm font-bold">
                        {opt.label}
                      </span>
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
        </div>

        {config.orderBump.ativo && (
          <label className="flex items-start gap-3 border p-4">
            <input
              type="checkbox"
              checked={bump}
              onChange={(event) => setBump(event.target.checked)}
            />
            <span>
              <strong>
                {config.orderBump.titulo} · {fmt(config.orderBump.precoCents)}
              </strong>
              <span className="block text-sm">{config.orderBump.texto}</span>
            </span>
          </label>
        )}
        {config.depoimentos.length > 0 && (
          <section aria-label="Depoimentos" className="grid gap-3">
            {config.depoimentos.map((review, index) => (
              <blockquote key={index} className="border p-3 text-sm">
                <p>{review.texto}</p>
                <cite>{review.nome}</cite>
              </blockquote>
            ))}
          </section>
        )}
        {config.selos.garantia && (
          <p className="text-sm">Garantia de {config.garantiaDias} dias.</p>
        )}
        {config.selos.compraSegura && (
          <p className="text-sm">{config.textos.seguranca}</p>
        )}
        {config.selos.ssl && (
          <p className="flex items-center gap-2 text-xs">
            <Lock className="size-3" /> Conexão protegida por HTTPS
          </p>
        )}
        {stepped && (
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((value) => value - 1)}
              >
                Voltar
              </Button>
            )}
            {step < stepNames.length - 1 && (
              <Button type="button" onClick={advance}>
                Continuar
              </Button>
            )}
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={
            !attemptReady ||
            confirmed ||
            paymentEnded ||
            (effectiveState?.status === "payment_error" &&
              effectiveState.mayStartNew) ||
            !paymentMethods.length ||
            (shippingMethods.length > 0 && !shippingMethodId)
          }
          hidden={stepped && step !== stepNames.length - 1}
          className="h-12 w-full bg-orange-500 text-base font-bold hover:bg-orange-600"
          style={{ backgroundColor: config.cores.destaque }}
        >
          {effectiveState?.status === "payment_unknown"
            ? "Confirmar a mesma tentativa"
            : incomingConfig
              ? `${config.textos.botao} · ${fmt(total)}`
              : method === "mbway"
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
        <div className="sticky top-6 border bg-[var(--checkout-surface)] p-5">
          <h2 className="mb-4 text-base font-bold">Resumo do pedido</h2>
          {summary}
        </div>
      </aside>
    </div>
  );
}
