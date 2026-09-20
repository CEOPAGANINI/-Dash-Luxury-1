import type { Metadata } from "next";
import { ArrowDown, ArrowUp, Database, Trash2, Truck } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listShippingMethods } from "@/features/shipping/queries";
import {
  deleteShippingMethodAction,
  reorderShippingMethodAction,
  toggleShippingMethodAction,
} from "@/features/shipping/actions";
import { ShippingForm } from "@/features/shipping/shipping-form";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Fretes" };
export const dynamic = "force-dynamic";

export default async function FretesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para gerir os fretes."
        className="min-h-[420px]"
      />
    );
  }

  const methods = await listShippingMethods();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Fretes</h2>
        <p className="text-muted-foreground text-sm">
          {methods.length} {methods.length === 1 ? "frete" : "fretes"} na base
          de dados. O cliente escolhe um destes no checkout.
        </p>
      </div>

      <ShippingForm />

      {methods.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum frete cadastrado"
          description="Sem fretes ativos, o checkout não consegue calcular o envio. Crie ao menos um acima."
          className="min-h-[240px]"
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Ordem</th>
                  <th className="pb-2.5 font-medium">Frete</th>
                  <th className="pb-2.5 font-medium">Prazo</th>
                  <th className="pb-2.5 font-medium">Valor</th>
                  <th className="pb-2.5 font-medium">Status</th>
                  <th className="pb-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m, i) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2.5">
                      <div className="flex flex-col">
                        <form action={reorderShippingMethodAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Mover para cima"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                        </form>
                        <form action={reorderShippingMethodAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            disabled={i === methods.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Mover para baixo"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="py-2.5 font-medium">{m.name}</td>
                    <td className="text-muted-foreground py-2.5">
                      {m.deliveryEstimate}
                    </td>
                    <td className="py-2.5">
                      {m.priceCents === 0 ? (
                        <span className="text-success font-semibold">
                          Grátis
                        </span>
                      ) : (
                        <>
                          {formatMoney(m.priceCents, m.currency, "pt-PT")}
                          {m.freeAboveCents !== null && (
                            <span className="text-muted-foreground block text-xs">
                              grátis acima de{" "}
                              {formatMoney(
                                m.freeAboveCents,
                                m.currency,
                                "pt-PT",
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={m.isActive ? "success" : "muted"}>
                        {m.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-2">
                        <form action={toggleShippingMethodAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <input
                            type="hidden"
                            name="next"
                            value={String(!m.isActive)}
                          />
                          <Button size="sm" variant="outline" type="submit">
                            {m.isActive ? "Desativar" : "Ativar"}
                          </Button>
                        </form>
                        <form action={deleteShippingMethodAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <Button size="sm" variant="ghost" type="submit">
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
