"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";
import { formatPercent } from "@/shared/formatters/dashboard";
import { cn } from "@/lib/utils";

export function ExecutiveDataConfidence({
  model,
  demoMode,
}: {
  model: ExecutiveDashboardModel;
  demoMode: boolean;
}) {
  const delayed = model.freshness.filter(
    (source) => source.status !== "healthy",
  );
  const quality = model.snapshot.dataQuality;
  const tone =
    quality >= 0.9 ? "success" : quality >= 0.78 ? "warning" : "destructive";

  return (
    <section
      className="bg-card rounded-2xl border p-3 sm:p-4"
      aria-labelledby="data-confidence-title"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              tone === "success"
                ? "bg-success/10 text-success"
                : tone === "warning"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive",
            )}
          >
            {tone === "success" ? (
              <ShieldCheck className="size-5" />
            ) : (
              <AlertTriangle className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="data-confidence-title" className="text-sm font-extrabold">
                Confiança antes da decisão
              </h2>
              <Badge variant={tone}>
                {formatPercent(quality)} de qualidade
              </Badge>
              <Badge variant={demoMode ? "warning" : "outline"}>
                {demoMode ? "Demonstração" : "Dados reais"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {delayed.length === 0
                ? "Todas as fontes estão dentro do nível esperado de completude."
                : `${delayed.length} fonte${delayed.length === 1 ? "" : "s"} exige${delayed.length === 1 ? "" : "m"} atenção antes de automatizar decisões financeiras.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {model.freshness.map((source) => (
            <span
              key={source.source}
              className="bg-muted/60 inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 font-semibold"
            >
              {source.status === "healthy" ? (
                <CheckCircle2 className="text-success size-3.5" />
              ) : source.status === "delayed" ? (
                <Clock3 className="text-warning size-3.5" />
              ) : (
                <Database className="text-[#c2c2c2] size-3.5" />
              )}
              {source.label} {Math.round(source.completeness * 100)}%
              {source.latencyMinutes !== null
                ? ` · ${source.latencyMinutes}min`
                : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
