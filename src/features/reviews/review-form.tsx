"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Plus, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  saveReviewAction,
  type ReviewActionResult,
} from "@/features/reviews/actions";
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

export function ReviewForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, pending] = useActionState<
    ReviewActionResult | null,
    FormData
  >(saveReviewAction, null);
  // Formulário totalmente não-controlado: após guardar, a `key` muda e o
  // React remonta os campos já limpos, sem precisar de estado nem efeitos.
  const formKey = state?.ok ? `saved-${state.message ?? ""}` : "novo";

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Cadastre um produto primeiro para poder adicionar avaliações.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova avaliação</CardTitle>
        <CardDescription>
          Aparece na secção &quot;Avaliações dos clientes&quot; da landing page
          assim que for guardada.
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
              <Label>Produto</Label>
              <BlockPicker
                id="productId"
                name="productId"
                ariaLabel="Produto"
                size="sm"
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Nota</Label>
              {/* Radios nativos: acessível por teclado e limpa no reset */}
              <div className="flex flex-row-reverse items-center justify-end gap-1">
                {[5, 4, 3, 2, 1].map((n) => (
                  <label
                    key={n}
                    className="group cursor-pointer p-0.5"
                    title={`${n} estrela${n > 1 ? "s" : ""}`}
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      defaultChecked={n === 5}
                      className="peer sr-only"
                    />
                    <Star
                      className={cn(
                        "text-muted-foreground/40 size-6 transition-colors",
                        "peer-checked:fill-amber-400 peer-checked:text-amber-400",
                        "group-hover:text-amber-400",
                      )}
                    />
                    <span className="sr-only">{n} estrelas</span>
                  </label>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Selecione a estrela correspondente à nota.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authorName">Nome do cliente</Label>
              <Input
                id="authorName"
                name="authorName"
                placeholder="Ex.: Inês C."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">
                Cidade{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input id="location" name="location" placeholder="Ex.: Porto" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">
                Título{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input
                id="title"
                name="title"
                placeholder="Ex.: Muito confortável"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="body">Comentário</Label>
              <textarea
                id="body"
                name="body"
                required
                rows={3}
                placeholder="O que o cliente escreveu…"
                className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reviewedAt">
                Data{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <Input id="reviewedAt" name="reviewedAt" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="photoUrl">
                Foto do cliente{" "}
                <span className="text-muted-foreground font-normal">
                  (URL, opcional)
                </span>
              </Label>
              <Input id="photoUrl" name="photoUrl" placeholder="https://…" />
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked
                className="accent-primary size-4"
              />
              Publicar imediatamente
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="isVerifiedPurchase"
                className="accent-primary mt-0.5 size-4"
              />
              <span>
                Marcar como &quot;Compra verificada&quot;
                <span className="text-muted-foreground block text-xs">
                  Use apenas quando existir um pedido pago deste cliente. O selo
                  é uma afirmação legal perante o consumidor.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit" loading={pending}>
            <Plus /> Guardar avaliação
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
