"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import { formatInteger } from "@/features/unified-dashboard/formatters";

/** Financial observations, not the demonstrative financial projection engine. */
export function ObservedOverview({
  section = "overview",
}: {
  section?: string;
}) {
  const { data } = useUnifiedDashboard();
  const [period, setPeriod] = useState<"7d" | "30d" | "month">("30d");
  const asOf = new Date(data.source.asOf);
  const currency = data.source.currency ?? "BRL";
  const formatCurrency = (value: number, digits = 2) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: digits,
    }).format(value);
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: data.source.timeZone ?? "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  const part = (name: string) =>
    dateParts.find((part) => part.type === name)?.value ?? "";
  const localToday = `${part("year")}-${part("month")}-${part("day")}`;
  const anchor = new Date(`${localToday}T12:00:00Z`);
  const start =
    period === "month"
      ? `${localToday.slice(0, 8)}01`
      : new Date(anchor.getTime() - (period === "7d" ? 6 : 29) * 86_400_000)
          .toISOString()
          .slice(0, 10);
  const days = data.source.revenueDays.filter(
    (day) => day.date >= start && day.date <= localToday,
  );
  const sums = days.reduce(
    (sum, day) => ({
      approved: sum.approved + day.approved,
      pending: sum.pending + day.pending,
      refused: sum.refused + day.refused,
      orders: sum.orders + day.orders,
      paidOrders: sum.paidOrders + day.paidOrders,
    }),
    { approved: 0, pending: 0, refused: 0, orders: 0, paidOrders: 0 },
  );
  const available = data.source.status === "ready";
  const paymentTotals = new Map<string, { count: number; amount: number }>();
  for (const payment of data.source.paymentDays ?? []) {
    if (payment.date < start || payment.date > localToday) continue;
    const previous = paymentTotals.get(payment.status) ?? {
      count: 0,
      amount: 0,
    };
    paymentTotals.set(payment.status, {
      count: previous.count + payment.count,
      amount: previous.amount + payment.amount,
    });
  }
  const governance = [
    "confidence",
    "governance",
    "context",
    "decisions",
  ].includes(section);
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-xl font-semibold">
            {governance
              ? "Fontes e qualidade dos dados"
              : "Resultado registrado da operação"}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-[75ch] text-sm">
            {data.source.note}
          </p>
        </div>
        {!governance && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Período do resultado"
          >
            {(["7d", "30d", "month"] as const).map((p) => (
              <Button
                className="min-h-11 rounded-none"
                key={p}
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
              >
                {p === "month" ? "Mês" : p === "7d" ? "7 dias" : "30 dias"}
              </Button>
            ))}
          </div>
        )}
      </header>
      {!available ? (
        <div role="status" className="border bg-card p-5">
          <p>
            {data.source.status === "error"
              ? "A consulta falhou. Recarregue a página para tentar novamente."
              : "Sem fonte de dados disponível."}
          </p>
          <Button asChild className="mt-3 rounded-none" variant="outline">
            <Link href="/integracoes">Ver integrações</Link>
          </Button>
        </div>
      ) : governance ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <Source
            label="Pedidos, catálogo e clientes"
            value="Banco da operação autenticada"
          />
          <Source label="Última consulta" value={data.source.asOf} />
          <Source
            label="Mídia"
            value={
              data.source.mediaSyncedAt
                ? `Snapshot sincronizado em ${data.source.mediaSyncedAt}. Período próprio, não somado à receita do checkout.`
                : "Indisponível: sincronize uma conta de anúncios."
            }
          />
          <Source
            label="Lucro, custos completos e saldo de repasse"
            value="Indisponíveis: ainda não há conciliação completa dessas fontes. Não calculamos custos por porcentagens fictícias."
          />
        </dl>
      ) : ["profit-summary", "financial-composition"].includes(section) ? (
        <div className="border bg-card p-5">
          <h3 className="font-semibold">Lucro ainda não conciliado</h3>
          <p className="text-muted-foreground mt-2 max-w-[75ch] text-sm">
            Receita bruta não é lucro. Custos de produto, mídia do mesmo
            período, taxas, impostos, devoluções e caixa precisam estar
            conciliados antes de mostrar essa comparação.
          </p>
          <Button asChild className="mt-3 rounded-none" variant="outline">
            <Link href="/financeiro/entradas-saidas">
              Consultar livro-caixa
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {start} a {localToday} · {currency} · data de criação do pedido,
            estado atual
          </p>
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              label="Receita bruta de pedidos pagos"
              value={formatCurrency(sums.approved, 2)}
            />
            <Metric
              label="Valor aguardando pagamento"
              value={formatCurrency(sums.pending, 2)}
            />
            <Metric
              label="Valor de pedidos recusados"
              value={formatCurrency(sums.refused, 2)}
            />
            <Metric
              label="Pedidos registrados"
              value={formatInteger(sums.orders)}
            />
          </dl>
          <section className="border bg-card p-4">
            <h3 className="mb-4 font-semibold">Receita bruta por dia</h3>
            {days.length ? (
              <div
                className="h-64 min-w-0"
                role="img"
                aria-label="Gráfico de receita bruta de pedidos pagos por dia"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ left: 4, right: 10 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date: string) =>
                        `${date.slice(8)}/${date.slice(5, 7)}`
                      }
                      minTickGap={24}
                    />
                    <YAxis
                      width={66}
                      tickFormatter={(value: number) =>
                        String(Math.round(value))
                      }
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatCurrency(Number(value), 2),
                        "Receita bruta",
                      ]}
                    />
                    <Bar dataKey="approved" fill="var(--foreground)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground py-8 text-sm">
                Nenhum pedido registrado neste período. A consulta ao banco foi
                concluída; isso não é dado de demonstração.
              </p>
            )}
          </section>
          <div className="grid gap-3 sm:grid-cols-3">
            <Source
              label="Ticket dos pedidos pagos"
              value={
                sums.paidOrders
                  ? formatCurrency(sums.approved / sums.paidOrders, 2)
                  : "Sem pedidos pagos"
              }
            />
            <Source
              label="Saldo de repasse"
              value="Indisponível: depende da conciliação do gateway"
            />
            <Source
              label="Lucro e margem"
              value="Indisponíveis: custos ainda não conciliados"
            />
          </div>
          <section className="border bg-card p-4">
            <h3 className="font-semibold">Pagamentos registrados</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Tentativas de pagamento por data de criação e estado atual. Não
              são somadas à receita de pedidos.
            </p>
            {paymentTotals.size ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[...paymentTotals].map(([status, totals]) => (
                  <Source
                    key={status}
                    label={PAYMENT_LABELS[status] ?? status}
                    value={`${formatInteger(totals.count)} tentativa(s) · ${formatCurrency(totals.amount, 2)}`}
                  />
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                Nenhuma tentativa de pagamento registrada neste período.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  created: "Criado",
  pending: "Pendente",
  processing: "Processando",
  approved: "Aprovado",
  refused: "Recusado",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  chargeback: "Chargeback",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border bg-card p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-2 break-words text-[clamp(1.25rem,2vw,1.875rem)] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
function Source({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border bg-card p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-2 break-words text-sm leading-6">{value}</dd>
    </div>
  );
}
