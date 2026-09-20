import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, BellOff, Users } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  listCustomers,
  summarizeCustomers,
  type CustomerRow,
} from "@/features/customers/queries";
import {
  ORDEM_SEGMENTOS,
  SEGMENTOS,
  contarSegmentos,
  segmentar,
  type Segmento,
} from "@/features/customers/crm";
import { demoCustomerRows } from "@/features/customers/crm-demo";
import { toggleMarketingConsentAction } from "@/features/customers/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

/*
  CRM.

  A pergunta que esta página responde é "em quem vale investir agora?". Por
  isso os segmentos vêm antes da tabela: um clique num segmento filtra a
  lista, e cada segmento diz o que fazer com quem está nele.

  Sem banco, a lista mostra fichas de demonstração — e diz isso no topo —
  para o CRM poder ser visto antes da primeira venda real.
*/

function ehSegmento(valor: unknown): valor is Segmento {
  return typeof valor === "string" && valor in SEGMENTOS;
}

/** A lista e o relógio dela, do banco ou da demonstração. */
async function carregarClientes(): Promise<{
  bancoConfigurado: boolean;
  agora: number;
  rows: CustomerRow[];
}> {
  const bancoConfigurado = isDatabaseConfigured();
  const agora = Date.now();
  const rows = bancoConfigurado ? await listCustomers() : demoCustomerRows(agora);
  return { bancoConfigurado, agora, rows };
}

export default async function ClientesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const filtro = ehSegmento(searchParams.segmento) ? searchParams.segmento : null;

  const { bancoConfigurado, agora, rows } = await carregarClientes();

  const summary = summarizeCustomers(rows);
  const contagem = contarSegmentos(rows);
  const visiveis = filtro
    ? rows.filter((c) => segmentar(c, agora) === filtro)
    : rows;

  const cards = [
    { label: "Total de clientes", value: String(summary.total) },
    { label: "Compraram", value: String(summary.buyers) },
    { label: "Receita total", value: formatMoney(summary.revenueCents) },
    { label: "Ticket médio", value: formatMoney(summary.averageTicketCents) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
            Clientes
          </p>
          <h2 className="mt-1 text-[clamp(1.75rem,1.4rem+1vw,2.6rem)] leading-none font-extrabold tracking-[-0.045em]">
            CRM
          </h2>
          <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
            Quem já comprou ou tentou comprar, separado em segmentos calculados
            dos próprios pedidos. Clique num segmento para ver só quem está
            nele.
          </p>
        </div>
        <Badge variant={bancoConfigurado ? "success" : "warning"}>
          {bancoConfigurado ? "Dados reais" : "Demonstração — sem banco"}
        </Badge>
      </header>

      {/* Segmentos: o placar e o filtro são a mesma coisa. */}
      <nav
        aria-label="Segmentos"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
      >
        {ORDEM_SEGMENTOS.map((seg) => {
          const def = SEGMENTOS[seg];
          const ativo = filtro === seg;
          return (
            <Link
              key={seg}
              href={ativo ? "/clientes" : `/clientes?segmento=${seg}`}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "bg-card focus-visible:ring-ring block rounded-xl border px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                ativo ? "border-foreground bg-muted/40" : "hover:bg-muted/20",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <Badge variant={def.tom}>{def.label}</Badge>
                <span className="text-xl leading-none font-extrabold tabular-nums">
                  {contagem[seg]}
                </span>
              </span>
              <span className="text-muted-foreground mt-2 block text-[0.6875rem] leading-4">
                {def.pergunta}
              </span>
            </Link>
          );
        })}
      </nav>

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

      {visiveis.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            filtro
              ? `Ninguém em "${SEGMENTOS[filtro].label}" agora`
              : "Nenhum cliente ainda"
          }
          description={
            filtro
              ? "Assim que alguém entrar neste segmento, aparece aqui."
              : "Assim que alguém preencher o checkout, aparece aqui com o histórico de pedidos e o valor gasto."
          }
          className="min-h-[320px]"
          action={
            filtro ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/clientes">Ver todos</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Cliente</th>
                  <th className="pb-2.5 font-medium">Segmento</th>
                  <th className="pb-2.5 text-right font-medium">Pedidos</th>
                  <th className="pb-2.5 text-right font-medium">Gasto total</th>
                  <th className="pb-2.5 text-right font-medium">
                    Ticket médio
                  </th>
                  <th className="pb-2.5 pl-6 font-medium">Última compra</th>
                  <th className="pb-2.5 pl-4 font-medium">Marketing</th>
                  <th className="pb-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => {
                  const seg = segmentar(c, agora);
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-3">
                        <Link
                          href={`/clientes/${c.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-muted-foreground text-xs">{c.email}</p>
                        {c.phone && (
                          <p className="text-muted-foreground text-xs">
                            {c.phone}
                          </p>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant={SEGMENTOS[seg].tom}>
                          {SEGMENTOS[seg].label}
                        </Badge>
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
                        {formatMoney(c.totalSpentCents)}
                      </td>
                      <td className="text-muted-foreground py-3 text-right">
                        {c.paidCount > 0
                          ? formatMoney(c.averageTicketCents)
                          : "—"}
                      </td>
                      <td className="text-muted-foreground py-3 pl-6 text-xs">
                        {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
                      </td>
                      <td className="py-3 pl-4">
                        <Badge variant={c.marketingOptOut ? "muted" : "success"}>
                          {c.marketingOptOut ? "Não recebe" : "Recebe"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          {bancoConfigurado && (
                            <form action={toggleMarketingConsentAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <input
                                type="hidden"
                                name="optOut"
                                value={String(!c.marketingOptOut)}
                              />
                              <Button size="sm" variant="outline" type="submit">
                                {c.marketingOptOut ? <Bell /> : <BellOff />}
                                {c.marketingOptOut ? "Reativar" : "Bloquear"}
                              </Button>
                            </form>
                          )}
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/clientes/${c.id}`}>
                              Ficha <ArrowRight />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
