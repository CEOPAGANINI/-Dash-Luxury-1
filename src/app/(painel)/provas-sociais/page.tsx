import type { Metadata } from "next";
import Image from "next/image";
import {
  Database,
  Eye,
  EyeOff,
  MessageSquareQuote,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listProductOptions, listReviews } from "@/features/reviews/queries";
import {
  deleteReviewAction,
  toggleReviewAction,
} from "@/features/reviews/actions";
import { ReviewForm } from "@/features/reviews/review-form";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Provas sociais" };
export const dynamic = "force-dynamic";

export default async function ProvasSociaisPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir as avaliações."
        className="min-h-[420px]"
      />
    );
  }

  const [reviews, products] = await Promise.all([
    listReviews(),
    listProductOptions(),
  ]);

  const published = reviews.filter((r) => r.isPublished);
  const average =
    published.length > 0
      ? published.reduce((s, r) => s + r.rating, 0) / published.length
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Provas sociais</h2>
        <p className="text-muted-foreground text-sm">
          Avaliações exibidas nas suas landing pages
        </p>
      </div>

      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>Use apenas avaliações reais</AlertTitle>
        <AlertDescription>
          Publicar avaliações inventadas é publicidade enganosa — proibido pela
          diretiva europeia Omnibus, com coimas pesadas em Portugal, e motivo de
          reprovação de anúncios pela Meta. Recolha as avaliações dos seus
          clientes e registe-as aqui.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total", value: String(reviews.length) },
          { label: "Publicadas", value: String(published.length) },
          {
            label: "Nota média",
            value: published.length
              ? average.toLocaleString("pt-PT", { maximumFractionDigits: 1 })
              : "—",
          },
          {
            label: "Compra verificada",
            value: String(reviews.filter((r) => r.isVerifiedPurchase).length),
          },
        ].map((c) => (
          <Card key={c.label} className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="text-muted-foreground text-xs">{c.label}</p>
              <p className="mt-1 text-xl font-bold tracking-tight">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ReviewForm products={products} />

      <div>
        <h3 className="mb-3 text-sm font-semibold">Avaliações registadas</h3>
        {reviews.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Nenhuma avaliação ainda"
            description="Assim que registar a primeira, ela aparece automaticamente na landing page do produto."
            className="min-h-[240px]"
          />
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <Card key={r.id} className="py-4">
                <CardContent className="flex flex-wrap items-start gap-4 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "size-3.5",
                              i < r.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30",
                            )}
                          />
                        ))}
                      </span>
                      <span className="text-sm font-semibold">
                        {r.authorName}
                      </span>
                      {r.location && (
                        <span className="text-muted-foreground text-xs">
                          {r.location}
                        </span>
                      )}
                      {r.isVerifiedPurchase && (
                        <Badge variant="success">Compra verificada</Badge>
                      )}
                      <Badge variant={r.isPublished ? "info" : "muted"}>
                        {r.isPublished ? "Publicada" : "Oculta"}
                      </Badge>
                    </div>
                    {r.title && (
                      <p className="mt-1.5 text-sm font-bold">{r.title}</p>
                    )}
                    <p className="text-muted-foreground mt-1 text-sm">
                      {r.body}
                    </p>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      {r.productName} ·{" "}
                      {r.reviewedAt.toLocaleDateString("pt-PT")} ·{" "}
                      {r.helpfulCount} acharam útil
                    </p>
                  </div>

                  {r.photoUrl && (
                    <Image
                      src={r.photoUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="size-16 rounded-lg border object-cover"
                      unoptimized
                    />
                  )}

                  <div className="flex gap-2">
                    <form action={toggleReviewAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="next"
                        value={String(!r.isPublished)}
                      />
                      <Button size="sm" variant="outline" type="submit">
                        {r.isPublished ? <EyeOff /> : <Eye />}
                        {r.isPublished ? "Ocultar" : "Publicar"}
                      </Button>
                    </form>
                    <form action={deleteReviewAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button size="sm" variant="ghost" type="submit">
                        <Trash2 />
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
