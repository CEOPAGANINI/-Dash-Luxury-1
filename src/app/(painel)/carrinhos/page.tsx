import type { Metadata } from "next";
import { Database, Info, Mail, ShoppingCart } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getCartsSummary, listAbandonedCarts } from "@/features/carts/queries";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

export const metadata: Metadata = { title: "Carrinhos" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  awaiting_payment: "Aguardando pagamento",
  processing: "Em processamento",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export default async function CarrinhosPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para acompanhar os carrinhos."
        className="min-h-[420px]"
      />
    );
  }

  const carts = await listAbandonedCarts();
  const summary = await getCartsSummary(carts);

  const cards = [
    { label: "Por pagar", value: String(summary.abandonedCount) },
    {
      label: "Valor parado",
      value: formatMoney(summary.abandonedValueCents, "EUR", "pt-PT"),
    },
    { label: "Pedidos pagos", value: String(summary.recoveredCount) },
    {
      label: "Taxa de conversão",
      value: formatPercent(summary.recoveryRate),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Carrinhos</h2>
        <p className="text-muted-foreground text-sm">
          Pedidos que ficaram por pagar — o abandono real desta operação
        </p>
      </div>

      <Alert variant="info">
        <Info />
        <AlertTitle>Como ler esta página</AlertTitle>
        <AlertDescription>
          A sua loja vai da landing direto ao checkout, sem carrinho clássico.
          Por isso o abandono relevante é o{" "}
          <strong>pedido gerado e não pago</strong> — sobretudo Multibanco, cuja
          referência pode ficar dias por liquidar. Um lembrete por e-mail
          costuma recuperar boa parte destes.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{c.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-lg font-bold tracking-tight md:text-xl">
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {carts.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhum carrinho por pagar"
          description="Todos os pedidos gerados foram pagos, ou ainda não houve nenhum. Bom sinal."
          className="min-h-[280px]"
        />
      ) : (
        <>
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <Link href="/emails">
                <Mail /> Enviar lembrete aos pendentes
              </Link>
            </Button>
          </div>

          <Card>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2.5 font-medium">Referência</th>
                    <th className="pb-2.5 font-medium">Cliente</th>
                    <th className="pb-2.5 font-medium">Produto</th>
                    <th className="pb-2.5 text-right font-medium">Valor</th>
                    <th className="pb-2.5 font-medium">Estado</th>
                    <th className="pb-2.5 font-medium">Há quanto tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {carts.map((c) => (
                    <tr key={c.orderId} className="border-b last:border-0">
                      <td className="py-3 font-mono text-xs">{c.reference}</td>
                      <td className="py-3">
                        <p className="font-medium">{c.customerName ?? "—"}</p>
                        <p className="text-muted-foreground text-xs">
                          {c.customerEmail ?? ""}
                        </p>
                      </td>
                      <td className="py-3">
                        {c.productName ?? "—"}
                        {c.quantity && c.quantity > 1 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ×{c.quantity}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatMoney(c.totalCents, c.currency, "pt-PT")}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={c.state === "expired" ? "muted" : "warning"}
                        >
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground py-3 text-xs">
                        {c.hoursSince < 1
                          ? "menos de 1h"
                          : c.hoursSince < 24
                            ? `${c.hoursSince}h`
                            : `${Math.floor(c.hoursSince / 24)} dias`}
                        <span className="block">
                          {formatDateTime(c.createdAt, "pt-PT")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
