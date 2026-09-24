"use client";

import * as React from "react";

import type { DemoRevenueDay } from "@/lib/demo-data";
import {
  FILTERS_EVENT,
  readStoredFilters,
  type StoredGlobalFilters,
} from "@/lib/dashboard-filters";
import {
  OPERATIONS,
  buildOperationFunnelSnapshot,
} from "@/domain/analytics/operation-funnels";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/shared/formatters/dashboard";
import { BlockPicker } from "@/components/ui/block-picker";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Onde guardamos a operação e o funil escolhidos, entre visitas. */
const FUNNEL_CHOICE_KEY = "dash-operation-funnel-v1";

/** Rosca de idades em tons de roxo, como no design original — o dado
    continua na legenda, não na cor. */
/* Faixas de idade são identidade, não meta: degraus de cinza. */
const AGE_COLORS = ["#f5f5f5", "#c2c2c2", "#a0a0a0", "#828282", "#676767"];

const STATUS_VARIANT: Record<string, "success" | "warning" | "info"> = {
  Ativo: "success",
  Escalando: "info",
  "Em teste": "warning",
};

interface OperationFunnelProps {
  days: DemoRevenueDay[];
  fallbackWeek: DemoRevenueDay[];
}

/**
 * O funil de UMA operação por vez: escolha a operação e o funil, e veja as
 * etapas com os nomes daquele funil, quanto custou cada passo e quem é o
 * público. Segue o período escolhido na área Calendário.
 */
export function OperationFunnel({ days, fallbackWeek }: OperationFunnelProps) {
  const [operationId, setOperationId] = React.useState(OPERATIONS[0].id);
  const [funnelId, setFunnelId] = React.useState(OPERATIONS[0].funnels[0].id);
  const [selectedDates, setSelectedDates] = React.useState<string[] | null>(
    null,
  );

  // Recupera a escolha anterior e o período global depois de montar — o
  // servidor não conhece o storage, então a primeira pintura usa o padrão.
  const hydrated = React.useRef(false);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const savedChoice = window.localStorage.getItem(FUNNEL_CHOICE_KEY);
        if (savedChoice) {
          const parsed = JSON.parse(savedChoice) as {
            operationId?: string;
            funnelId?: string;
          };
          const operation = OPERATIONS.find(
            (op) => op.id === parsed.operationId,
          );
          if (operation) {
            setOperationId(operation.id);
            const funnel = operation.funnels.find(
              (f) => f.id === parsed.funnelId,
            );
            if (funnel) setFunnelId(funnel.id);
          }
        }
      } catch {
        // Sem storage: segue com o padrão.
      }
      const globalFilters = readStoredFilters();
      if (globalFilters?.selectedDates !== undefined) {
        setSelectedDates(globalFilters.selectedDates);
      }
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Se outro bloco da página trocar o período, este funil acompanha na hora.
  React.useEffect(() => {
    function onFiltersChange(event: Event) {
      const detail = (event as CustomEvent<StoredGlobalFilters>).detail;
      if (detail?.selectedDates !== undefined)
        setSelectedDates(detail.selectedDates);
    }
    window.addEventListener(FILTERS_EVENT, onFiltersChange);
    return () => window.removeEventListener(FILTERS_EVENT, onFiltersChange);
  }, []);

  React.useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(
        FUNNEL_CHOICE_KEY,
        JSON.stringify({ operationId, funnelId }),
      );
    } catch {
      // Sem storage: a escolha só não persiste.
    }
  }, [operationId, funnelId]);

  const operation =
    OPERATIONS.find((op) => op.id === operationId) ?? OPERATIONS[0];

  const period = React.useMemo(() => {
    if (!selectedDates || selectedDates.length === 0) return fallbackWeek;
    const wanted = new Set(selectedDates);
    const matched = days.filter((day) => wanted.has(day.date));
    return matched.length > 0 ? matched : fallbackWeek;
  }, [days, selectedDates, fallbackWeek]);

  const snapshot = React.useMemo(
    () => buildOperationFunnelSnapshot(operationId, funnelId, period),
    [operationId, funnelId, period],
  );

  if (!snapshot) return null;

  const { funnel } = snapshot;
  const maxVolume = Math.max(snapshot.stages[0]?.volume ?? 1, 1);

  const kpis = [
    {
      label: "Gasto em anúncio",
      value: formatCompactCurrency(snapshot.spend),
      hint: "Total investido neste funil.",
    },
    {
      label: snapshot.primaryLabel,
      value: formatInteger(snapshot.purchases),
      hint: "O resultado principal do funil.",
    },
    {
      label: "Custo por resultado",
      value: formatCurrency(snapshot.costPerResult),
      hint: "Gasto dividido pelos resultados.",
    },
    {
      label: "Dinheiro que voltou",
      value: formatCompactCurrency(snapshot.revenue),
      hint: "Resultados × valor médio de cada um.",
    },
    {
      label: "Custo por mil (CPM)",
      value: formatCurrency(snapshot.cpm),
      hint: "Preço de mostrar o anúncio mil vezes.",
    },
    {
      label: "Cliques (CTR)",
      value: formatPercent(snapshot.ctr, 2),
      hint: "De cada 100 que viram, quantos clicaram.",
    },
  ];

  return (
    <Card id="operation-funnel" className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Funil da operação</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Uma operação por vez: escolha o funil e veja cada passo, do
              anúncio ao resultado, com o custo de cada etapa. O período vem da
              área Calendário.
            </CardDescription>
          </div>
          <Badge variant={STATUS_VARIANT[funnel.status] ?? "muted"}>
            {funnel.status}
          </Badge>
        </div>

        {/* Escolha da operação e do funil. */}
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="block min-w-0">
            <span className="text-muted-foreground text-sm font-bold">
              Operação
            </span>
            <BlockPicker
              ariaLabel="Operação"
              className="mt-1"
              value={operationId}
              onChange={(v) => {
                const next = OPERATIONS.find((op) => op.id === v);
                if (!next) return;
                setOperationId(next.id);
                setFunnelId(next.funnels[0].id);
              }}
              options={OPERATIONS.map((op) => ({
                value: op.id,
                label: op.label,
              }))}
            />
          </div>

          <div className="block min-w-0">
            <span className="text-muted-foreground text-sm font-bold">
              Funil
            </span>
            <BlockPicker
              ariaLabel="Funil"
              className="mt-1"
              value={funnelId}
              onChange={setFunnelId}
              options={operation.funnels.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
            />
          </div>

          <div className="rounded-lg border px-3 py-2 text-sm sm:col-span-2 lg:col-span-1 lg:self-end">
            <span className="text-muted-foreground block text-xs font-bold">
              Tipo · Período
            </span>
            <span className="font-semibold">
              {funnel.type} ·{" "}
              {snapshot.daysCount === 1
                ? "1 dia"
                : `${snapshot.daysCount} dias`}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5">
        {/* O resumo em uma frase: entrou X, saiu Y, custou Z. */}
        <div className="bg-muted/30 rounded-xl border p-3.5">
          <p className="text-[0.9375rem] leading-6">
            <strong className="tabular-nums">
              {formatInteger(snapshot.entryVolume)}
            </strong>{" "}
            pessoas viram o anúncio e{" "}
            <strong className="tabular-nums">
              {formatInteger(snapshot.purchases)}
            </strong>{" "}
            chegaram até &quot;{snapshot.primaryLabel.toLowerCase()}&quot; —{" "}
            <strong className="tabular-nums">
              {formatPercent(snapshot.finalConversion, 2)}
            </strong>{" "}
            do começo ao fim. Cada resultado custou{" "}
            <strong className="tabular-nums">
              {formatCurrency(snapshot.costPerResult)}
            </strong>
            .
          </p>
        </div>

        {/* Os seis números deste funil. */}
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10.5rem),1fr))]">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border p-3.5 shadow-xs">
              <p className="text-muted-foreground text-sm font-bold">
                {kpi.label}
              </p>
              <p className="mt-1.5 text-xl font-extrabold tracking-tight tabular-nums">
                {kpi.value}
              </p>
              <p className="text-muted-foreground mt-1 text-sm leading-5">
                {kpi.hint}
              </p>
            </div>
          ))}
        </div>

        {/* As etapas, com % que avançou e custo de cada passo. */}
        <section aria-label="Etapas do funil">
          <h4 className="text-base font-extrabold tracking-tight">
            Passo a passo do funil
          </h4>
          <p className="text-muted-foreground mt-0.5 text-sm">
            A barra mostra quanta gente sobrou em cada passo; ao lado, o que
            cada passo custou.
          </p>
          <div className="mt-3 space-y-2.5">
            {snapshot.stages.map((stage, index) => (
              <div
                key={stage.label}
                className={cn(
                  "grid items-center gap-x-4 gap-y-1 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
                  stage.primary && "border-success/40 bg-success/5",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-sm font-bold">
                      {stage.label}
                      {stage.primary && (
                        <span className="text-success"> ← resultado</span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums">
                      <strong>{formatInteger(stage.volume)}</strong>
                      {index > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatPercent(stage.conversion / 100, 1)} vieram da
                          etapa anterior
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 h-2.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        stage.primary ? "bg-success" : "bg-primary",
                      )}
                      style={{
                        width: `${Math.max((stage.volume / maxVolume) * 100, 1.5)}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm sm:text-right">
                  {stage.costLabel}:{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCurrency(stage.costValue)}
                  </strong>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Público e vídeo, lado a lado. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section
            aria-label="Idade de quem compra"
            className="rounded-xl border p-4"
          >
            <h4 className="text-base font-extrabold tracking-tight">
              Quem é o público
            </h4>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Idade de quem chega neste funil.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <div
                aria-hidden
                data-dashboard-chart="donut"
                data-dashboard-chart-part="ring"
                className="relative size-36 shrink-0 rounded-full"
                style={{
                  background: `conic-gradient(${funnel.demographics
                    .map((slice, index) => {
                      const start = funnel.demographics
                        .slice(0, index)
                        .reduce((sum, s) => sum + s.share, 0);
                      return `${AGE_COLORS[index % AGE_COLORS.length]} ${start}% ${start + slice.share}%`;
                    })
                    .join(", ")})`,
                }}
              >
                <div
                  className="bg-card absolute inset-7 rounded-full"
                  data-dashboard-chart-part="hole"
                />
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {funnel.demographics.map((slice, index) => (
                  <li
                    key={slice.label}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: AGE_COLORS[index % AGE_COLORS.length],
                      }}
                    />
                    <span className="min-w-0 flex-1">{slice.label}</span>
                    <strong className="tabular-nums">
                      {formatPercent(slice.share / 100)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section
            aria-label="Retenção do vídeo do anúncio"
            className="rounded-xl border p-4"
          >
            <h4 className="text-base font-extrabold tracking-tight">
              Quanto do vídeo as pessoas assistem
            </h4>
            <p className="text-muted-foreground mt-0.5 text-sm">
              De quem deu play no anúncio, quantos chegam a cada parte.
            </p>
            <div className="mt-3 space-y-2.5">
              {(
                [
                  ["Assistiram o começo (25%)", funnel.video[0]],
                  ["Chegaram à metade (50%)", funnel.video[1]],
                  ["Passaram de 75%", funnel.video[2]],
                  ["Assistiram até o fim", funnel.video[3]],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <strong className="tabular-nums">
                      {formatPercent(value / 100)}
                    </strong>
                  </div>
                  <div className="bg-muted mt-1 h-2.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
