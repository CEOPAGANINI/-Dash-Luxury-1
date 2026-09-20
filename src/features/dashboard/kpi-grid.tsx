import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DemoKpi } from "@/lib/demo-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

interface KpiGridProps {
  kpis: DemoKpi[];
  columns?: string;
}

/** Grade de cartões de indicador (valor + variação percentual). */
export function KpiGrid({
  kpis,
  columns = "grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6",
}: KpiGridProps) {
  return (
    <div className={cn("grid", columns)}>
      {kpis.map((kpi) => {
        const positive = kpi.change >= 0;
        return (
          <Card key={kpi.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-lg font-bold tracking-tight md:text-xl">
                {kpi.value}
              </p>
              <p
                className={cn(
                  "mt-1 flex items-center gap-0.5 text-xs font-medium",
                  positive ? "text-success" : "text-destructive",
                )}
              >
                {positive ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {Math.abs(kpi.change).toLocaleString("pt-BR")}%
                <span className="text-muted-foreground ml-1 font-normal">
                  vs. período anterior
                </span>
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
