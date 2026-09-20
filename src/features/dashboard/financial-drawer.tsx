"use client";

import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";
import type { MetricDetail } from "@/lib/demo-data";

interface FinancialDrawerProps {
  label: string;
  value: string;
  deltaPct: number;
  goalProgress?: number;
  composition?: { recebido: number; pendente: number; recusado: number };
  /** Histórico recente, para o mini-gráfico de tendência. */
  history?: number[];
  detail: MetricDetail;
}

function Delta({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold",
        positive ? "text-success" : "text-destructive",
        className,
      )}
    >
      {positive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Painel de drill-down (Radar Financeiro): abre ao passar o mouse sobre uma métrica. */
export function FinancialDrawer({
  label,
  value,
  deltaPct,
  goalProgress,
  composition,
  history,
  detail,
}: FinancialDrawerProps) {
  const topInfluencers = detail.influencers.slice(0, 2);

  return (
    <div
      className="drawer-enter bg-popover text-popover-foreground border-border absolute inset-0 flex flex-col overflow-hidden rounded-xl border p-3 shadow-lg"
      style={{ transformOrigin: "center" }}
    >
      <style>{`
        @keyframes drawerIn {
          from { opacity: 0; transform: scale(0.97) translateY(-4px); filter: blur(3px); }
          to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
        }
        .drawer-enter { animation: drawerIn 180ms cubic-bezier(0.16,1,0.3,1); }
      `}</style>

      {/* 1. Valor + 2. Variação */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {label}
          </p>
          <p className="text-xl leading-tight font-bold tabular-nums">
            {value}
          </p>
        </div>
        <Delta value={deltaPct} className="mt-4 text-xs" />
      </div>

      {history && history.length > 1 && (
        <div className="-mx-3 mt-1 h-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={history.map((v, i) => ({ i, v }))}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="drawer-history" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-foreground)"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-foreground)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--color-foreground)"
                strokeWidth={1.5}
                fill="url(#drawer-history)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3. Estado: comparação com ontem / 7 / 30 dias */}
      <div className="bg-muted/40 mt-1.5 grid grid-cols-3 gap-1 rounded-lg py-1.5 text-center">
        <div>
          <p className="text-muted-foreground text-xs uppercase">Ontem</p>
          <Delta value={deltaPct} className="justify-center text-xs" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase">7 dias</p>
          <Delta value={detail.compare7d} className="justify-center text-xs" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase">30 dias</p>
          <Delta value={detail.compare30d} className="justify-center text-xs" />
        </div>
      </div>

      {goalProgress !== undefined && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">
            Meta {goalProgress.toFixed(0)}%
          </span>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-foreground/70 h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, goalProgress)}%` }}
            />
          </div>
        </div>
      )}

      {composition && (
        <div className="mt-1.5 flex items-center justify-between gap-1 text-xs">
          <span className="text-success flex items-center gap-1">
            <span className="bg-success size-1.5 rounded-full" />
            {composition.recebido.toFixed(0)}%
          </span>
          <span className="text-warning flex items-center gap-1">
            <span className="bg-warning size-1.5 rounded-full" />
            {composition.pendente.toFixed(0)}%
          </span>
          <span className="text-destructive flex items-center gap-1">
            <span className="bg-destructive size-1.5 rounded-full" />
            {composition.recusado.toFixed(0)}%
          </span>
        </div>
      )}

      {/* Principais influenciadores — só os 2 mais relevantes, pra caber sem rolar */}
      <div className="mt-1.5 space-y-0.5">
        {topInfluencers.map((inf) => (
          <div
            key={inf.label}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-muted-foreground truncate">{inf.label}</span>
            {inf.deltaPct === 0 ? (
              <span className="text-muted-foreground">estável</span>
            ) : (
              <Delta value={inf.deltaPct} className="text-xs" />
            )}
          </div>
        ))}
      </div>

      {/* Impacto + insight + ação, num único bloco compacto */}
      <div className="bg-info/10 border-info/25 mt-1.5 flex flex-1 gap-1.5 rounded-lg border p-2 text-xs leading-snug">
        <Sparkles className="text-info mt-0.5 size-3 shrink-0" />
        <div className="min-w-0">
          <p className="flex items-center gap-1">
            <span
              className={cn(
                "font-bold",
                detail.impact.trim().startsWith("-")
                  ? "text-destructive"
                  : "text-success",
              )}
            >
              {detail.impact}
            </span>
          </p>
          <p className="text-foreground/90 line-clamp-1">{detail.insight}</p>
          <p className="text-muted-foreground line-clamp-1">
            <span className="font-semibold">Ação:</span> {detail.action}
          </p>
        </div>
      </div>
    </div>
  );
}
