"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function UnifiedPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[clamp(1.75rem,1.4rem+1vw,2.6rem)] leading-none font-extrabold tracking-[-0.045em]">
          {title}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function UnifiedSection({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  className,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "@container min-w-0 overflow-visible rounded-[1.5rem] border bg-card shadow-[0_18px_55px_-46px_rgba(15,23,42,.55)]",
        className,
      )}
    >
      <header className="rounded-t-[1.5rem] border-b bg-muted/20 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="bg-muted text-foreground grid size-10 shrink-0 place-items-center rounded-2xl border">
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.12em] uppercase">
                {eyebrow}
              </p>
              <h3 className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl">
                {title}
              </h3>
              <p className="text-muted-foreground mt-1 max-w-4xl text-sm leading-5">
                {description}
              </p>
            </div>
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      </header>
      <div className="p-3 sm:p-5">{children}</div>
    </section>
  );
}

export type MetricTone =
  "success" | "warning" | "destructive" | "info" | "neutral";

const toneBorder: Record<MetricTone, string> = {
  success: "border-success/25 bg-success/[0.035]",
  warning: "border-warning/30 bg-warning/[0.045]",
  destructive: "border-destructive/25 bg-destructive/[0.035]",
  info: "border-foreground/20 bg-foreground/70/[0.035]",
  neutral: "border-border bg-card",
};

const toneText: Record<MetricTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-foreground dark:text-foreground",
  neutral: "text-foreground",
};

export function UnifiedMetricCard({
  label,
  value,
  note,
  delta,
  tone = "neutral",
  definition,
}: {
  label: string;
  value: string;
  note: string;
  delta?: string;
  tone?: MetricTone;
  definition?: string;
}) {
  const negative = delta?.startsWith("↓") || delta?.startsWith("−");
  return (
    <Card className={cn("min-w-0 gap-3 py-4 shadow-none", toneBorder[tone])}>
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-muted-foreground flex items-center gap-1 text-xs font-semibold">
              <span className="truncate">{label}</span>
              {definition ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-1"
                      aria-label={`Explicar ${label}`}
                    >
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72 text-xs leading-5">
                    {definition}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <p className="mt-2 break-words text-[clamp(1.55rem,1.15rem+1vw,2.35rem)] leading-none font-extrabold tracking-[-0.045em] tabular-nums">
              {value}
            </p>
          </div>
          <span
            className={cn(
              "mt-1 size-2.5 shrink-0 rounded-full",
              toneText[tone],
              "bg-current",
            )}
          />
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-muted-foreground min-h-10 text-xs leading-5">
          {note}
        </p>
        {delta ? (
          <p
            className={cn(
              "mt-3 flex items-center gap-1 border-t pt-3 text-xs font-bold",
              negative ? "text-destructive" : "text-success",
            )}
          >
            {negative ? (
              <ArrowDownRight className="size-3.5" />
            ) : (
              <ArrowUpRight className="size-3.5" />
            )}
            {delta}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SimpleStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    normalized.includes("saud") ||
    normalized.includes("escalar") ||
    normalized.includes("pago") ||
    normalized.includes("public")
      ? "success"
      : normalized.includes("crít") ||
          normalized.includes("pausar") ||
          normalized.includes("recus") ||
          normalized.includes("reduzir")
        ? "destructive"
        : normalized.includes("aten") ||
            normalized.includes("pend") ||
            normalized.includes("validar") ||
            normalized.includes("rascunho")
          ? "warning"
          : "info";
  return <Badge variant={variant}>{status}</Badge>;
}
