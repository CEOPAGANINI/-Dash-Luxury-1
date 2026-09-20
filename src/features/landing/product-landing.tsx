"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Minus,
  MessageSquare,
  Plus,
  RotateCcw,
  ShieldCheck,
  Star,
  ThumbsUp,
  Truck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type {
  LandingProduct,
  ProductReview,
} from "@/features/landing/technebula-data";
import { techNebulaStore } from "@/features/landing/technebula-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendTrack } from "@/features/analytics/tracker";

interface ProductLandingProps {
  product: LandingProduct;
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatReviewDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const formatted = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  return formatted;
}

function StarRow({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex text-amber-500", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < Math.round(value) ? "fill-current" : "opacity-25",
          )}
        />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: ProductReview }) {
  return (
    <article className="border-b px-5 py-5 last:border-0">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-600">
          {initialsOf(review.name)}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {review.name}
            {review.verifiedPurchase && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <BadgeCheck className="size-3.5" /> Compra verificada
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500">
            {review.location} · {formatReviewDate(review.date)}
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2">
        <StarRow value={review.stars} />
        <span className="text-sm font-bold">{review.title}</span>
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">
        {review.text}
      </p>
      {review.photo && (
        <Image
          src={review.photo}
          alt={`Foto enviada por ${review.name}`}
          width={80}
          height={80}
          className="mt-3 size-20 rounded-lg border object-cover"
        />
      )}
      <button
        type="button"
        className="mt-3 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        <ThumbsUp className="size-3.5" /> Útil ({review.helpful})
      </button>
    </article>
  );
}

function ReviewsSection({ product }: { product: LandingProduct }) {
  const reviews = product.reviews;
  const count = reviews.length;

  if (count === 0) {
    return (
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">
          Avaliações dos clientes
        </h2>
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <MessageSquare className="size-6" />
          </div>
          <p className="font-semibold">Ainda sem avaliações</p>
          <p className="max-w-md text-sm text-zinc-500">
            Este produto é novo na loja. As avaliações de clientes reais
            aparecerão aqui após as primeiras compras.
          </p>
        </div>
      </section>
    );
  }

  const average = reviews.reduce((sum, r) => sum + r.stars, 0) / count;
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const n = reviews.filter((r) => Math.round(r.stars) === stars).length;
    return { stars, percent: Math.round((n / count) * 100) };
  });

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">
        Avaliações dos clientes
      </h2>
      <div className="mt-4 grid gap-0 overflow-hidden rounded-2xl border md:grid-cols-[260px_1fr]">
        {/* Resumo */}
        <div className="border-b p-6 md:border-r md:border-b-0">
          <p className="text-4xl font-black">
            {average.toLocaleString("pt-PT", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
            <span className="text-lg font-semibold text-zinc-400"> /5</span>
          </p>
          <StarRow value={average} className="mt-1" />
          <p className="mt-2 text-sm text-zinc-500">
            Baseado em <strong>{count}</strong>{" "}
            {count === 1 ? "avaliação" : "avaliações"}
          </p>
          <div className="mt-4 space-y-1.5">
            {distribution.map(({ stars, percent }) => (
              <div key={stars} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-zinc-500">{stars}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-8 text-right text-zinc-500">{percent}%</span>
              </div>
            ))}
          </div>
        </div>
        {/* Lista */}
        <div>
          {reviews.map((review, i) => (
            <ReviewCard key={review.name + i} review={review} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductLanding({ product }: ProductLandingProps) {
  const [activeImage, setActiveImage] = React.useState(0);
  const [quantity, setQuantity] = React.useState(1);
  const [tab, setTab] = React.useState<"descricao" | "envios">("descricao");

  const discountPercent = product.compareAtPriceCents
    ? Math.round((1 - product.priceCents / product.compareAtPriceCents) * 100)
    : null;

  const savings = product.compareAtPriceCents
    ? product.compareAtPriceCents - product.priceCents
    : null;

  const fmt = (cents: number) => formatMoney(cents, product.currency, "pt-PT");

  return (
    <div className="min-h-svh bg-white text-zinc-900">
      {/* Cabeçalho TechNébula */}
      <header className="bg-zinc-950 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4">
          <Link href="#" className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-white">
              Tech<span className="text-violet-400">Nébula</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Galeria */}
          <div>
            <div className="relative overflow-hidden rounded-2xl border bg-zinc-50">
              {discountPercent !== null && (
                <span className="absolute top-4 left-4 z-10 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
                  -{discountPercent}%
                </span>
              )}
              <Image
                src={product.gallery[activeImage] ?? product.mainImage}
                alt={product.name}
                width={720}
                height={720}
                priority
                className="aspect-square w-full object-contain"
              />
            </div>
            <div className="mt-3 flex gap-2">
              {product.gallery.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`Imagem ${i + 1}`}
                  className={cn(
                    "overflow-hidden rounded-lg border-2 bg-zinc-50 transition-colors",
                    i === activeImage
                      ? "border-violet-500"
                      : "border-transparent hover:border-zinc-300",
                  )}
                >
                  <Image
                    src={src}
                    alt=""
                    width={72}
                    height={72}
                    className="aspect-square size-16 object-contain"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Informações e compra */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {product.name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {product.rating ? (
                <span className="flex items-center gap-1">
                  <span className="flex text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "size-4",
                          i < Math.round(product.rating!.value)
                            ? "fill-current"
                            : "opacity-30",
                        )}
                      />
                    ))}
                  </span>
                  <strong>
                    {product.rating.value.toLocaleString("pt-PT")}
                  </strong>
                  <span className="text-zinc-500">
                    · {product.rating.count} avaliações
                  </span>
                </span>
              ) : (
                <Badge className="bg-violet-100 text-violet-700">
                  Novidade na loja
                </Badge>
              )}
              <span className="flex items-center gap-1 font-medium text-emerald-600">
                <Check className="size-4" /> Em stock
              </span>
            </div>

            {/* Preço */}
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-4xl font-black tracking-tight">
                  {fmt(product.priceCents)}
                </span>
                {product.compareAtPriceCents && (
                  <>
                    <span className="text-lg text-zinc-400 line-through">
                      {fmt(product.compareAtPriceCents)}
                    </span>
                    {discountPercent !== null && (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-sm font-bold text-red-600">
                        -{discountPercent}%
                      </span>
                    )}
                  </>
                )}
              </div>
              {savings !== null && savings > 0 && (
                <p className="mt-1 font-semibold text-emerald-600">
                  Está a poupar {fmt(savings)}!
                </p>
              )}
              <p className="text-sm text-zinc-500">Preço com IVA incluído</p>
            </div>

            {/* Pagamento seguro */}
            <div className="mt-5 rounded-xl border bg-zinc-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-emerald-600" />
                Pagamento seguro em Portugal
              </p>
              <div className="mt-3 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/mbway.svg"
                  alt="MB WAY"
                  className="h-9 rounded border bg-white px-2 py-1"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/multibanco.svg"
                  alt="Multibanco"
                  className="h-9 rounded border bg-white px-2 py-1"
                />
              </div>
            </div>

            {/* Estoque */}
            {product.stockRemaining !== null && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-red-600">
                    <span className="size-2 animate-pulse rounded-full bg-red-600" />
                    Últimas unidades em stock
                  </span>
                  <span className="text-zinc-500">
                    {product.stockRemaining} restantes
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{
                      width: `${Math.max(4, Math.round((product.stockRemaining / product.stockTotal) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quantidade + CTA */}
            <div className="mt-6 flex gap-3">
              <div className="flex items-center rounded-lg border">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex size-11 items-center justify-center text-zinc-600 hover:bg-zinc-50"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="flex size-11 items-center justify-center text-zinc-600 hover:bg-zinc-50"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <Button
                asChild
                size="lg"
                className="h-11 flex-1 bg-orange-500 text-base font-bold hover:bg-orange-600"
              >
                <Link
                  href={`/checkout/${product.slug}?qty=${quantity}`}
                  onClick={() =>
                    sendTrack("click_buy", {
                      productSlug: product.slug,
                      valueCents: product.priceCents * quantity,
                      currency: product.currency,
                    })
                  }
                >
                  Comprar já
                </Link>
              </Button>
            </div>

            {/* Garantias */}
            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-zinc-700">
                <Truck className="size-4 shrink-0 text-emerald-600" />
                Portes grátis acima de {fmt(product.freeShippingFromCents)} ·
                Entrega em {product.deliveryEstimate}
              </li>
              <li className="flex items-center gap-2 text-zinc-700">
                <RotateCcw className="size-4 shrink-0 text-emerald-600" />
                Devolução gratuita até {product.returnDays} dias
              </li>
              <li className="flex items-center gap-2 text-zinc-700">
                <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
                Produto original com garantia do fabricante
              </li>
            </ul>
          </div>
        </div>

        {/* Abas: descrição / envios */}
        <div className="mt-12">
          <div className="flex gap-6 border-b">
            <button
              type="button"
              onClick={() => setTab("descricao")}
              className={cn(
                "border-b-2 pb-3 text-sm font-semibold transition-colors",
                tab === "descricao"
                  ? "border-violet-500 text-violet-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              Descrição
            </button>
            <button
              type="button"
              onClick={() => setTab("envios")}
              className={cn(
                "border-b-2 pb-3 text-sm font-semibold transition-colors",
                tab === "envios"
                  ? "border-violet-500 text-violet-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              Envios &amp; Devoluções
            </button>
          </div>

          {tab === "descricao" ? (
            <div className="grid gap-8 py-6 lg:grid-cols-3">
              <div className="space-y-4 text-zinc-700 lg:col-span-2">
                <h2 className="text-lg font-bold text-zinc-900">
                  Sobre este produto
                </h2>
                {product.description.map((p, i) => (
                  <p key={i} className="leading-relaxed">
                    {p}
                  </p>
                ))}
                <ul className="grid gap-2 pt-2 sm:grid-cols-2">
                  {product.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 shrink-0 text-emerald-600" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-bold text-zinc-900">
                  Especificações
                </h3>
                <dl className="divide-y rounded-xl border text-sm">
                  {product.specs.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-4 px-4 py-2.5"
                    >
                      <dt className="text-zinc-500">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4 py-6 text-sm leading-relaxed text-zinc-700">
              <p>
                <strong>Envios:</strong> encomendas processadas em 24–48 h
                úteis, com entrega em {product.deliveryEstimate} em todo
                Portugal continental. Portes grátis em compras acima de{" "}
                {fmt(product.freeShippingFromCents)}.
              </p>
              <p>
                <strong>Devoluções:</strong> tem {product.returnDays} dias após
                a receção para devolver o produto sem custos, nos termos da
                legislação portuguesa de compras à distância.
              </p>
              <p>
                <strong>Apoio ao cliente:</strong>{" "}
                <a
                  href={`mailto:${techNebulaStore.supportEmail}`}
                  className="text-violet-600 underline"
                >
                  {techNebulaStore.supportEmail}
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Avaliações dos clientes */}
        <ReviewsSection product={product} />
      </main>

      {/* Rodapé */}
      <footer className="mt-10 bg-zinc-950 text-sm text-zinc-400">
        <div className="mx-auto max-w-6xl px-4">
          {/* Selos */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-b border-zinc-800 py-5 text-xs font-medium text-zinc-300">
            {[
              { icon: ShieldCheck, label: "Pagamento 100% seguro" },
              { icon: Truck, label: "Envio rápido 24–48h" },
              {
                icon: RotateCcw,
                label: `Devolução grátis em ${product.returnDays} dias`,
              },
              { icon: Check, label: "Compra protegida" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-zinc-400" />
                {label}
              </span>
            ))}
          </div>

          {/* Colunas */}
          <div className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-lg font-black tracking-tight text-white">
                Tech<span className="text-violet-400">Nébula</span>
              </p>
              <p className="mt-3 max-w-xs text-xs leading-relaxed">
                A sua loja de tecnologia em Portugal — entrega rápida e
                pagamento seguro por MB WAY e Multibanco.
              </p>
              <div className="mt-4 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/mbway.svg"
                  alt="MB WAY"
                  className="h-7 rounded bg-white px-1.5 py-0.5"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/multibanco.svg"
                  alt="Multibanco"
                  className="h-7 rounded bg-white px-1.5 py-0.5"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold tracking-wider text-white uppercase">
                Loja
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                {["Início", "Produtos", "Promoções", "Novidades"].map((l) => (
                  <li key={l}>
                    <a href="#" className="transition-colors hover:text-white">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold tracking-wider text-white uppercase">
                Apoio ao Cliente
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <a
                    href={`mailto:${techNebulaStore.supportEmail}`}
                    className="transition-colors hover:text-white"
                  >
                    Contactos
                  </a>
                </li>
                {[
                  { label: "Envios e Entregas", href: "/legal/envios" },
                  { label: "Trocas e Devoluções", href: "/legal/devolucoes" },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold tracking-wider text-white uppercase">
                Informações Legais
              </p>
              <ul className="mt-3 space-y-2 text-xs">
                {[
                  { label: "Termos e Condições", href: "/legal/termos" },
                  {
                    label: "Política de Privacidade",
                    href: "/legal/privacidade",
                  },
                  { label: "Política de Cookies", href: "/legal/cookies" },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    href="https://www.livroreclamacoes.pt/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-white"
                  >
                    Livro de Reclamações
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Linha final */}
          <div className="border-t border-zinc-800 py-5 text-center text-xs text-zinc-500">
            © {new Date().getFullYear()} {techNebulaStore.name}. Todos os
            direitos reservados. · Pagamento seguro · Entrega em todo Portugal
          </div>
        </div>
      </footer>
    </div>
  );
}
