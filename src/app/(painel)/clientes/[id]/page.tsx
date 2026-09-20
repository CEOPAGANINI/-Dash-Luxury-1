import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Database,
  MapPin,
  NotebookPen,
  ShoppingBag,
  Tags,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  SEGMENTOS,
  STATUS_PAGOS,
  getFichaDoCliente,
  segmentar,
} from "@/features/customers/crm";
import {
  updateCustomerNotesAction,
  updateCustomerTagsAction,
} from "@/features/customers/crm-actions";
import { toggleMarketingConsentAction } from "@/features/customers/actions";
import { demoCustomerRows } from "@/features/customers/crm-demo";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Ficha do cliente" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  created: "Criado",
  awaiting_payment: "Aguardando pagamento",
  processing: "Processando",
  paid: "Pago",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregue",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
};

function statusVariant(status: string) {
  if (STATUS_PAGOS.has(status)) return "success" as const;
  if (status === "refused" || status === "chargeback") return "destructive" as const;
  if (status === "refunded" || status === "cancelled" || status === "expired")
    return "muted" as const;
  return "warning" as const;
}

/**
 * A ficha: quem é, quanto vale, o que comprou e o que o atendimento
 * precisa lembrar. Etiquetas e anotações são o único dado que a pessoa
 * escreve à mão no CRM — todo o resto vem dos pedidos.
 */
export default async function FichaClientePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!isDatabaseConfigured()) {
    const demo = demoCustomerRows().find((c) => c.id === id);
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/clientes">
            <ArrowLeft /> Voltar ao CRM
          </Link>
        </Button>
        <EmptyState
          icon={Database}
          title={
            demo
              ? `${demo.name} é uma ficha de demonstração`
              : "Banco de dados não conectado"
          }
          description="A ficha completa — pedidos, endereços, etiquetas e anotações — vem do banco. Configure o Supabase para abrir fichas reais."
          className="min-h-[420px]"
        />
      </div>
    );
  }

  const ficha = await getFichaDoCliente(id);
  if (!ficha) notFound();

  const pagos = ficha.pedidos.filter((p) => STATUS_PAGOS.has(p.status));
  const gastoCents = pagos.reduce((s, p) => s + p.totalCents, 0);
  const datas = ficha.pedidos.map((p) => p.createdAt.getTime());
  const segmento = segmentar({
    id: ficha.id,
    name: ficha.name,
    email: ficha.email,
    phone: ficha.phone,
    country: ficha.country,
    orderCount: ficha.pedidos.length,
    paidCount: pagos.length,
    totalSpentCents: gastoCents,
    averageTicketCents: pagos.length ? Math.round(gastoCents / pagos.length) : 0,
    lastOrderAt: datas.length ? new Date(Math.max(...datas)) : null,
    firstOrderAt: datas.length ? new Date(Math.min(...datas)) : null,
    marketingOptOut: ficha.marketingOptOut,
    isBlocked: ficha.isBlocked,
    createdAt: ficha.createdAt,
  });

  const kpis = [
    { label: "Gasto total (LTV)", value: formatMoney(gastoCents) },
    { label: "Pedidos pagos", value: `${pagos.length} de ${ficha.pedidos.length}` },
    {
      label: "Ticket médio",
      value: pagos.length ? formatMoney(gastoCents / pagos.length) : "—",
    },
    { label: "Cliente desde", value: formatDate(ficha.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/clientes">
          <ArrowLeft /> Voltar ao CRM
        </Link>
      </Button>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
            Ficha do cliente
          </p>
          <h2 className="mt-1 flex flex-wrap items-center gap-3 text-[clamp(1.5rem,1.2rem+1vw,2.2rem)] leading-none font-extrabold tracking-[-0.045em]">
            {ficha.name}
            <Badge variant={SEGMENTOS[segmento].tom} className="text-sm">
              {SEGMENTOS[segmento].label}
            </Badge>
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {ficha.email}
            {ficha.phone ? ` · ${ficha.phone}` : ""}
            {ficha.country ? ` · ${ficha.country}` : ""}
          </p>
          <p className="text-muted-foreground text-xs leading-5">
            {SEGMENTOS[segmento].pergunta}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {ficha.isBlocked && <Badge variant="destructive">Bloqueado</Badge>}
          <Badge variant={ficha.marketingOptOut ? "muted" : "success"}>
            {ficha.marketingOptOut ? "Não recebe marketing" : "Recebe marketing"}
          </Badge>
          <form action={toggleMarketingConsentAction}>
            <input type="hidden" name="id" value={ficha.id} />
            <input
              type="hidden"
              name="optOut"
              value={String(!ficha.marketingOptOut)}
            />
            <Button size="sm" variant="outline" type="submit">
              {ficha.marketingOptOut ? <Bell /> : <BellOff />}
              {ficha.marketingOptOut ? "Reativar" : "Bloquear"}
            </Button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{k.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-lg font-bold tracking-tight md:text-xl">
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Tags className="size-3.5" /> Etiquetas
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <form action={updateCustomerTagsAction} className="space-y-2">
              <input type="hidden" name="id" value={ficha.id} />
              <input
                name="tags"
                defaultValue={ficha.tags.join(", ")}
                placeholder="vip, indicação, atacado…"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" type="submit">
                  Salvar etiquetas
                </Button>
                <span className="text-muted-foreground text-[0.6875rem] leading-4">
                  Separe por vírgula. Até 20.
                </span>
              </div>
              {ficha.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ficha.tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardDescription className="flex items-center gap-2 text-xs">
              <NotebookPen className="size-3.5" /> Anotações do atendimento
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <form action={updateCustomerNotesAction} className="space-y-2">
              <input type="hidden" name="id" value={ficha.id} />
              <textarea
                name="notes"
                rows={4}
                defaultValue={ficha.notes ?? ""}
                placeholder="O que precisa lembrar sobre esta pessoa."
                className="border-input bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              />
              <Button size="sm" type="submit">
                Salvar anotações
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardDescription className="flex items-center gap-2 text-xs">
            <ShoppingBag className="size-3.5" /> Pedidos ({ficha.pedidos.length})
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-4">
          {ficha.pedidos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum pedido ainda — é um lead.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Referência</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 font-medium">Origem</th>
                  <th className="pb-2.5 text-right font-medium">Total</th>
                  <th className="pb-2.5 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {ficha.pedidos.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{p.reference}</td>
                    <td className="py-2.5">
                      <Badge variant={statusVariant(p.status)}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground py-2.5 text-xs">
                      {p.origin ?? "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatMoney(p.totalCents)}
                    </td>
                    <td className="text-muted-foreground py-2.5 text-xs">
                      {formatDateTime(p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {ficha.enderecos.length > 0 && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardDescription className="flex items-center gap-2 text-xs">
              <MapPin className="size-3.5" /> Endereços
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {ficha.enderecos.map((e, i) => (
                <li key={i} className="bg-muted/20 rounded-lg border px-3 py-2 text-sm">
                  {e.label && <b className="block text-xs">{e.label}</b>}
                  {[e.city, e.state, e.country].filter(Boolean).join(", ")}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
