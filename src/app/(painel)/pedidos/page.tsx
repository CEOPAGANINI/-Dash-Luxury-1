import type { Metadata } from "next";
import { Database, ListOrdered, ShoppingBag, Wallet } from "lucide-react";

import { listOrders, summarizeOrders } from "@/features/orders/queries";
import { isDatabaseConfigured } from "@/database/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSection } from "@/components/dashboard/page-section";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  awaiting_payment: "Aguardando pagamento",
  processing: "Em processamento",
  paid: "Pago",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  preparing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "info" | "muted"
> = {
  paid: "success",
  delivered: "success",
  awaiting_payment: "warning",
  created: "warning",
  processing: "info",
  shipped: "info",
  refused: "destructive",
  cancelled: "destructive",
  chargeback: "destructive",
  expired: "muted",
  refunded: "muted",
};

const METHOD_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco",
  card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
};

export default async function PedidosPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure as variáveis do Supabase para ver os pedidos reais. Nenhum dado fictício é exibido aqui."
        className="min-h-[420px]"
      />
    );
  }

  const rows = await listOrders();
  const summary = summarizeOrders(rows);

  const cards = [
    { label: "Total de pedidos", value: String(summary.totalOrders) },
    { label: "Pedidos pagos", value: String(summary.paidOrders) },
    {
      label: "Receita aprovada",
      value: formatMoney(summary.paidRevenueCents, "EUR", "pt-PT"),
    },
    {
      label: "Aguardando pagamento",
      value: formatMoney(summary.awaitingRevenueCents, "EUR", "pt-PT"),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Pedidos"
        description="Vendas registradas no banco de dados, atualizadas pelo webhook do gateway."
      />

      <PageSection
        id="section-pedidos-resumo"
        eyebrow="Resumo do período"
        title="Como estão as vendas"
        description="Os quatro números que respondem se o dia foi bom: quantos pedidos entraram, quantos foram pagos e quanto disso já virou dinheiro."
        icon={Wallet}
        tone="success"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-[length:var(--text-caption)]">
                  {c.label}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-[length:var(--text-stat)] leading-none font-extrabold tracking-tight tabular-nums">
                  {c.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageSection>

      <PageSection
        id="section-pedidos-lista"
        eyebrow="Um por um"
        title="Todos os pedidos"
        description="Cada linha é uma compra: quem comprou, o que levou, quanto pagou e em que pé está."
        icon={ListOrdered}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Nenhum pedido ainda"
            description="Assim que a primeira compra for feita no checkout, ela aparecerá aqui com cliente, valor, forma de pagamento e estado."
            className="min-h-[320px]"
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-[length:var(--text-body)]">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-[length:var(--text-caption)]">
                    <th className="pb-2.5 font-medium">Referência</th>
                    <th className="pb-2.5 font-medium">Cliente</th>
                    <th className="pb-2.5 font-medium">Produto</th>
                    <th className="pb-2.5 text-right font-medium">Total</th>
                    <th className="pb-2.5 font-medium">Pagamento</th>
                    <th className="pb-2.5 font-medium">Estado</th>
                    <th className="pb-2.5 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-3 font-mono text-xs">{o.reference}</td>
                      <td className="py-3">
                        <p className="font-medium">{o.customerName ?? "—"}</p>
                        <p className="text-muted-foreground text-xs">
                          {o.customerEmail ?? ""}
                        </p>
                      </td>
                      <td className="py-3">
                        {o.productName ?? "—"}
                        {o.quantity && o.quantity > 1 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ×{o.quantity}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-medium">
                        {formatMoney(o.totalCents, o.currency, "pt-PT")}
                      </td>
                      <td className="py-3">
                        {o.paymentMethod
                          ? (METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod)
                          : "—"}
                      </td>
                      <td className="py-3">
                        <Badge variant={STATUS_VARIANT[o.status] ?? "muted"}>
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground py-3 text-xs">
                        {formatDateTime(o.createdAt, "pt-PT")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </PageSection>
    </div>
  );
}
