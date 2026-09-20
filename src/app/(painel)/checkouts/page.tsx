import type { Metadata } from "next";
import Link from "next/link";
import {
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listCheckouts } from "@/features/checkouts/queries";
import {
  deleteCheckoutAction,
  duplicateCheckoutAction,
  toggleCheckoutStatusAction,
} from "@/features/checkouts/actions";
import { CheckoutCreateForm } from "@/features/checkouts/checkout-create-form";
import { listProductOptions } from "@/features/reviews/queries";
import { formatMoney } from "@/lib/format";
import { getAppUrl } from "@/lib/app-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Checkouts" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  unpublished: "Despublicado",
  archived: "Arquivado",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted"> = {
  published: "success",
  draft: "warning",
  unpublished: "muted",
  archived: "muted",
};

const METHOD_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco",
};

export default async function CheckoutsPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir os checkouts."
        className="min-h-[420px]"
      />
    );
  }

  const [rows, products] = await Promise.all([
    listCheckouts(),
    listProductOptions(),
  ]);
  const appUrl = getAppUrl();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Checkouts</h2>
        <p className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "checkout" : "checkouts"} · cada um
          com o seu endereço público
        </p>
      </div>

      <CheckoutCreateForm products={products} appUrl={appUrl} />

      {rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum checkout criado"
          description="Crie um checkout acima para ter um endereço próprio por campanha, com métricas separadas."
          className="min-h-[240px]"
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Checkout</th>
                  <th className="pb-2.5 font-medium">Produto</th>
                  <th className="pb-2.5 font-medium">Pagamento</th>
                  <th className="pb-2.5 text-right font-medium">Pedidos</th>
                  <th className="pb-2.5 text-right font-medium">Receita</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3">
                      <p className="font-medium">{c.name}</p>
                      <code className="text-muted-foreground font-mono text-[11px]">
                        /checkout/{c.slug}
                      </code>
                    </td>
                    <td className="py-3">{c.productName ?? "—"}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.paymentMethods.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          c.paymentMethods.map((m) => (
                            <Badge
                              key={m}
                              variant="outline"
                              className="text-[11px]"
                            >
                              {METHOD_LABEL[m] ?? m}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      {c.orderCount}
                      {c.paidCount > 0 && (
                        <span className="text-success block text-xs">
                          {c.paidCount} pagos
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatMoney(c.revenueCents, c.currency, "pt-PT")}
                    </td>
                    <td className="py-3">
                      <Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1.5">
                        {c.status === "published" && (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/checkout/${c.slug}`}
                              target="_blank"
                              aria-label="Abrir checkout"
                            >
                              <ExternalLink />
                            </Link>
                          </Button>
                        )}
                        <form action={toggleCheckoutStatusAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="publish"
                            value={String(c.status !== "published")}
                          />
                          <Button size="sm" variant="outline" type="submit">
                            {c.status === "published" ? <EyeOff /> : <Eye />}
                            {c.status === "published"
                              ? "Despublicar"
                              : "Publicar"}
                          </Button>
                        </form>
                        <form action={duplicateCheckoutAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button
                            size="sm"
                            variant="ghost"
                            type="submit"
                            aria-label="Duplicar"
                          >
                            <Copy />
                          </Button>
                        </form>
                        <form action={deleteCheckoutAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button
                            size="sm"
                            variant="ghost"
                            type="submit"
                            aria-label="Remover"
                          >
                            <Trash2 />
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
