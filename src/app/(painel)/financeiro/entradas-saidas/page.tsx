import type { Metadata } from "next";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { getSession } from "@/lib/auth/session";
import { demoLedger } from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Financeiro · Entradas/Saídas" };

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function EntradasSaidasPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  const totalEntradas = demoLedger
    .filter((e) => e.type === "entrada")
    .reduce((sum, e) => sum + e.value, 0);
  const totalSaidas = demoLedger
    .filter((e) => e.type === "saida")
    .reduce((sum, e) => sum + e.value, 0);
  const saldo = totalEntradas - totalSaidas;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Entradas e Saídas
          </h2>
          <p className="text-muted-foreground text-sm">
            Livro-caixa dos últimos lançamentos
          </p>
        </div>
        <Badge variant="warning">
          {demoMode
            ? "Sem dados · métricas zeradas"
            : "Exemplo — dados reais chegam na Fase 6"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">
              Total de entradas
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-success flex items-center gap-1 text-lg font-bold tracking-tight md:text-xl">
              <ArrowUpRight className="size-4" />
              {formatBRL(totalEntradas)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">
              Total de saídas
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-destructive flex items-center gap-1 text-lg font-bold tracking-tight md:text-xl">
              <ArrowDownRight className="size-4" />
              {formatBRL(totalSaidas)}
            </p>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4">
            <CardDescription className="text-xs">
              Saldo do período
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <p className="text-lg font-bold tracking-tight md:text-xl">
              {formatBRL(saldo)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
          <CardDescription>Mais recentes primeiro</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Descrição</th>
                  <th className="pb-2 font-medium">Categoria</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {demoLedger.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-muted-foreground py-8 text-center"
                    >
                      Nenhum lançamento disponível.
                    </td>
                  </tr>
                )}
                {demoLedger.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2.5 whitespace-nowrap">
                      {entry.date}
                    </td>
                    <td className="py-2.5">{entry.description}</td>
                    <td className="py-2.5">
                      <Badge variant="outline">{entry.category}</Badge>
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right font-medium whitespace-nowrap",
                        entry.type === "entrada"
                          ? "text-success"
                          : "text-destructive",
                      )}
                    >
                      {entry.type === "entrada" ? "+" : "−"}
                      {formatBRL(entry.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
