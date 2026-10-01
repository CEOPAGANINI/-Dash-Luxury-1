import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { techNebulaStore } from "@/features/landing/technebula-data";
import { getProductBySlug } from "@/features/landing/queries";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { PixelScripts } from "@/features/pixels/pixel-scripts";
import { Tracker } from "@/features/analytics/tracker";
import { CookieBanner } from "@/features/consent/cookie-banner";
import { listActiveShippingMethods } from "@/features/shipping/queries";
import {
  getPublishedCheckoutBySlug,
  isConfiguredCheckoutSlug,
} from "@/features/checkouts/queries";
import { randomUUID } from "node:crypto";

export const metadata: Metadata = {
  title: `Checkout · ${techNebulaStore.name}`,
};

/**
 * Checkout público (/checkout/[slug]) no layout TechNébula.
 *
 * O slug resolve primeiro para um checkout publicado (criado no painel);
 * se não existir, cai para o slug do produto — mantendo os links antigos
 * a funcionar.
 */
export default async function CheckoutSlugPage(
  props: PageProps<"/checkout/[slug]">,
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;

  const store =
    typeof searchParams.loja === "string" ? searchParams.loja : undefined;
  const checkout = await getPublishedCheckoutBySlug(slug, store);
  if (store && !checkout) notFound();
  if (!checkout && (await isConfiguredCheckoutSlug(slug))) notFound();
  const [product, shippingMethods] = await Promise.all([
    getProductBySlug(checkout?.productSlug ?? slug, checkout?.workspaceId),
    listActiveShippingMethods(checkout?.workspaceId),
  ]);
  if (!product) notFound();

  const qtyRaw = Number(
    typeof searchParams.qty === "string" ? searchParams.qty : "1",
  );
  const quantity = Number.isFinite(qtyRaw)
    ? Math.min(10, Math.max(1, Math.trunc(qtyRaw)))
    : 1;

  return (
    <div className="min-h-svh bg-zinc-50 text-zinc-900">
      <PixelScripts
        workspaceId={checkout?.workspaceId}
        event="InitiateCheckout"
        content={{
          id: product.slug,
          name: product.name,
          valueCents: product.priceCents * quantity,
          currency: product.currency,
        }}
      />
      <Tracker
        checkoutId={checkout?.id}
        event="checkout_opened"
        productSlug={product.slug}
        valueCents={product.priceCents * quantity}
        currency={product.currency}
      />
      {/* Cabeçalho */}
      <header className="bg-zinc-950 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
          <Link
            href={`/p/${product.slug}`}
            className="text-xl font-black tracking-tight text-white"
          >
            Tech<span className="text-violet-400">Nébula</span>
          </Link>
          <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <Lock className="size-3.5" /> Checkout seguro
          </span>
        </div>
      </header>

      <main>
        <CheckoutForm
          product={product}
          initialQuantity={quantity}
          shippingMethods={
            product.type === "digital"
              ? []
              : shippingMethods.filter(
                  (method) =>
                    method.currency === product.currency &&
                    method.country === "PT",
                )
          }
          checkoutId={checkout?.id}
          paymentMethods={checkout?.paymentMethods}
          config={checkout?.config}
          attemptId={randomUUID()}
        />
      </main>

      <footer className="border-t bg-white py-5 text-center text-xs text-zinc-500">
        <p>
          © {new Date().getFullYear()} {techNebulaStore.name} · Pagamento seguro
          por MB WAY e Multibanco
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/legal/termos" className="hover:text-zinc-800">
            Termos
          </Link>
          <Link href="/legal/privacidade" className="hover:text-zinc-800">
            Privacidade
          </Link>
          <Link href="/legal/devolucoes" className="hover:text-zinc-800">
            Devoluções
          </Link>
        </p>
      </footer>

      <CookieBanner />
    </div>
  );
}
