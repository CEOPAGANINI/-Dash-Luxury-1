"use client";

import { Gauge, TimerReset, TrendingUp, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecutiveSnapshot } from "@/domain/analytics";
import { budgetPacing, financeSummary } from "@/domain/finance";
import {
  formatCompactCurrency,
  formatPercent,
} from "@/shared/formatters/dashboard";
import { cn } from "@/lib/utils";

export function BudgetPacing({ snapshot }: { snapshot: ExecutiveSnapshot }) {
  const now = new Date();
  const elapsed = Math.max(
    0.08,
    (now.getHours() * 60 + now.getMinutes()) / 1440,
  );
  const day = snapshot.days.at(-1);
  const pacing = day ? budgetPacing(day, elapsed) : null;
  const dayFinance = day ? financeSummary([day]) : null;
  const planned = pacing?.orcamento ?? 0;
  const expectedNow = pacing?.esperadoAteAgora ?? 0;
  const actualNow = pacing?.gastoAteAgora ?? 0;
  const pace = expectedNow > 0 ? actualNow / expectedNow : 0;
  const projectedSpend = pacing?.projecao ?? 0;
  const projectedContribution = dayFinance
    ? dayFinance.lucroContribuicao / elapsed
    : 0;
  const status =
    pacing?.ritmo === "acelerado"
      ? "Rápido demais"
      : pacing?.ritmo === "lento"
        ? "Abaixo do ritmo"
        : pacing
          ? "No ritmo"
          : "Dados insuficientes";
  const tone =
    status === "No ritmo"
      ? "success"
      : status === "Rápido demais"
        ? "destructive"
        : "warning";

  const rows = [
    {
      label: "Orçamento planejado",
      value: formatCompactCurrency(planned),
      icon: Wallet,
    },
    {
      label: "Esperado até agora",
      value: formatCompactCurrency(expectedNow),
      icon: TimerReset,
    },
    {
      label: "Gasto observado",
      value: formatCompactCurrency(actualNow),
      icon: Gauge,
    },
    {
      label: "Projeção de fechamento",
      value: formatCompactCurrency(projectedSpend),
      icon: TrendingUp,
    },
  ];

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Ritmo do orçamento</CardTitle>
            <CardDescription className="mt-1">
              Gasto observado, ritmo esperado e projeção financeira do
              fechamento.
            </CardDescription>
          </div>
          <Badge variant={tone}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.label} className="bg-muted/40 rounded-xl border p-3">
              <row.icon className="text-muted-foreground size-4" />
              <p className="text-muted-foreground mt-3 text-xs font-semibold">
                {row.label}
              </p>
              <p className="mt-1 text-lg font-extrabold tabular-nums">
                {row.value}
              </p>
            </div>
          ))}
        </div>
        <div>
          <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-semibold">
            <span>Velocidade de consumo</span>
            <span>{formatPercent(pace)}</span>
          </div>
          <div className="bg-muted h-3 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                tone === "success"
                  ? "bg-success"
                  : tone === "warning"
                    ? "bg-warning"
                    : "bg-destructive",
              )}
              style={{ width: `${Math.min(100, pace * 70)}%` }}
            />
          </div>
        </div>
        <div className="grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-2">
          <p>
            <strong>Lucro projetado:</strong>{" "}
            <span
              className={
                projectedContribution >= 0 ? "text-success" : "text-destructive"
              }
            >
              {formatCompactCurrency(projectedContribution)}
            </span>
          </p>
          <p>
            <strong>Leitura:</strong>{" "}
            {status === "Rápido demais"
              ? "Não aumente verba sem validar mROAS, margem e saturação."
              : status === "Abaixo do ritmo"
                ? "Verifique entrega, aprovação e estabilidade das campanhas."
                : "Mantenha o ritmo e reavalie após nova janela de dados."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
