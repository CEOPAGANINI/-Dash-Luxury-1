"use client";

import * as React from "react";
import {
  Bookmark,
  ChevronDown,
  Copy,
  Filter,
  FolderOpen,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BlockPicker, type BlockOption } from "@/components/ui/block-picker";
import { Button } from "@/components/ui/button";
import type { ExecutivePeriod } from "@/domain/analytics";
import { cn } from "@/lib/utils";

export type ExecutiveNetworkFilter =
  "all" | "Face ADS" | "Google ADS" | "YouTube ADS";
export type ExecutiveComparison =
  "previous" | "weekday" | "goal" | "budget" | "forecast";
export type ExecutiveGranularity = "hour" | "day" | "week" | "month";

export interface ExecutiveFilterState {
  comparison: ExecutiveComparison;
  granularity: ExecutiveGranularity;
  network: ExecutiveNetworkFilter;
  product: string;
  offer: string;
  customerType: "all" | "new" | "returning";
  paymentStatus: "all" | "approved" | "pending" | "declined";
  dataStatus: "all" | "confirmed" | "provisional" | "estimated";
}

interface ExecutiveFilterSystemProps {
  period: ExecutivePeriod;
  onPeriodChange: (period: ExecutivePeriod) => void;
  filters: ExecutiveFilterState;
  onFiltersChange: (filters: ExecutiveFilterState) => void;
  selectedDates: string[] | null;
  onSelectedDatesChange: (dates: string[] | null) => void;
  onClearDates: () => void;
}

const PERIOD_OPTIONS: { value: ExecutivePeriod; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Mês atual" },
];

const COMPARISON_OPTIONS: {
  value: ExecutiveComparison;
  label: string;
  available: boolean;
}[] = [
  { value: "previous", label: "Período anterior", available: true },
  {
    value: "weekday",
    label: "Mesmo dia da semana · requer histórico",
    available: false,
  },
  { value: "goal", label: "Meta · exibida nos KPIs", available: false },
  { value: "budget", label: "Orçamento · exibido no pacing", available: false },
  { value: "forecast", label: "Previsão · requer modelo", available: false },
];

const defaultFilters: ExecutiveFilterState = {
  comparison: "previous",
  granularity: "day",
  network: "all",
  product: "all",
  offer: "all",
  customerType: "all",
  paymentStatus: "all",
  dataStatus: "all",
};

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  scope = "global",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: BlockOption[];
  disabled?: boolean;
  scope?: "global" | "local";
}) {
  return (
    <div className="grid min-w-0 gap-1.5 text-xs font-semibold">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span
          className={cn(
            "text-[11px] uppercase tracking-wide",
            scope === "global" ? "text-info" : "text-[#c2c2c2]",
          )}
        >
          {scope}
        </span>
      </span>
      <BlockPicker
        ariaLabel={label}
        size="sm"
        value={value}
        disabled={disabled}
        onChange={onChange}
        options={options}
      />
    </div>
  );
}

export function ExecutiveFilterSystem({
  period,
  onPeriodChange,
  filters,
  onFiltersChange,
  selectedDates,
  onSelectedDatesChange,
  onClearDates,
}: ExecutiveFilterSystemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState("");
  const previousRef = React.useRef<{
    period: ExecutivePeriod;
    filters: ExecutiveFilterState;
    selectedDates: string[] | null;
  } | null>(null);
  const [hasSavedView, setHasSavedView] = React.useState(false);
  const selectedDatesCount = selectedDates?.length ?? 0;

  const [canUndo, setCanUndo] = React.useState(false);

  React.useEffect(() => {
    // Só o navegador sabe se há visão salva; ler depois de montar evita
    // diferença entre a tela do servidor e a do navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSavedView(
      Boolean(window.localStorage.getItem("dashboard-ceo-saved-view")),
    );
  }, []);

  function rememberCurrent() {
    setCanUndo(true);
    previousRef.current = {
      period,
      filters: { ...filters },
      selectedDates: selectedDates ? [...selectedDates] : null,
    };
  }

  const activeFilters = [
    period !== "30d"
      ? {
          key: "period",
          label:
            PERIOD_OPTIONS.find((item) => item.value === period)?.label ??
            period,
        }
      : null,
    filters.comparison !== "previous"
      ? {
          key: "comparison",
          label:
            COMPARISON_OPTIONS.find((item) => item.value === filters.comparison)
              ?.label ?? filters.comparison,
        }
      : null,
    filters.granularity !== "day"
      ? { key: "granularity", label: `Granularidade: ${filters.granularity}` }
      : null,
    filters.network !== "all"
      ? { key: "network", label: filters.network }
      : null,
    filters.product !== "all"
      ? { key: "product", label: filters.product }
      : null,
    filters.offer !== "all" ? { key: "offer", label: filters.offer } : null,
    filters.customerType !== "all"
      ? {
          key: "customerType",
          label:
            filters.customerType === "new"
              ? "Clientes novos"
              : "Clientes recorrentes",
        }
      : null,
    filters.paymentStatus !== "all"
      ? { key: "paymentStatus", label: `Pagamento: ${filters.paymentStatus}` }
      : null,
    filters.dataStatus !== "all"
      ? { key: "dataStatus", label: `Dados: ${filters.dataStatus}` }
      : null,
    selectedDatesCount > 0
      ? {
          key: "dates",
          label: `${selectedDatesCount} dia${selectedDatesCount === 1 ? "" : "s"} selecionado${selectedDatesCount === 1 ? "" : "s"}`,
        }
      : null,
  ].filter(Boolean) as { key: string; label: string }[];

  function update<K extends keyof ExecutiveFilterState>(
    key: K,
    value: ExecutiveFilterState[K],
  ) {
    rememberCurrent();
    onFiltersChange({ ...filters, [key]: value });
  }

  function changePeriod(nextPeriod: ExecutivePeriod) {
    rememberCurrent();
    onPeriodChange(nextPeriod);
  }

  function clearAll() {
    rememberCurrent();
    onPeriodChange("30d");
    onFiltersChange(defaultFilters);
    onClearDates();
  }

  function undoLast() {
    const previous = previousRef.current;
    if (!previous) return;
    const current = {
      period,
      filters: { ...filters },
      selectedDates: selectedDates ? [...selectedDates] : null,
    };
    onPeriodChange(previous.period);
    onFiltersChange(previous.filters);
    onSelectedDatesChange(previous.selectedDates);
    previousRef.current = current;
    setStatusMessage("Última alteração desfeita.");
  }

  function saveView() {
    const payload = {
      period,
      filters,
      selectedDates,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      "dashboard-ceo-saved-view",
      JSON.stringify(payload),
    );
    setHasSavedView(true);
    setStatusMessage("Visão salva neste navegador.");
  }

  function loadView() {
    try {
      const saved = window.localStorage.getItem("dashboard-ceo-saved-view");
      if (!saved) return;
      rememberCurrent();
      const payload = JSON.parse(saved) as {
        period?: ExecutivePeriod;
        filters?: ExecutiveFilterState;
        selectedDates?: string[] | null;
      };
      if (payload.period) onPeriodChange(payload.period);
      if (payload.filters) onFiltersChange(payload.filters);
      onSelectedDatesChange(payload.selectedDates ?? null);
      setStatusMessage("Visão salva carregada.");
    } catch {
      setStatusMessage("A visão salva está inválida e não pôde ser carregada.");
    }
  }

  async function copyView() {
    const payload = JSON.stringify({ period, filters, selectedDates });
    try {
      await navigator.clipboard.writeText(payload);
      setStatusMessage("Configuração da visão copiada.");
    } catch {
      setStatusMessage("Não foi possível copiar automaticamente.");
    }
  }

  function removeFilter(key: string) {
    if (key === "period") changePeriod("30d");
    else if (key === "dates") onClearDates();
    else if (key === "comparison")
      update("comparison", defaultFilters.comparison);
    else if (key === "granularity")
      update("granularity", defaultFilters.granularity);
    else if (key === "network") update("network", defaultFilters.network);
    else if (key === "product") update("product", defaultFilters.product);
    else if (key === "offer") update("offer", defaultFilters.offer);
    else if (key === "customerType")
      update("customerType", defaultFilters.customerType);
    else if (key === "paymentStatus")
      update("paymentStatus", defaultFilters.paymentStatus);
    else if (key === "dataStatus")
      update("dataStatus", defaultFilters.dataStatus);
  }

  return (
    <section
      className="executive-filter-shell bg-card rounded-2xl border"
      aria-labelledby="executive-filter-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
            <Filter className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="executive-filter-title" className="text-sm font-bold">
              Filtros em sequência lógica
            </h2>
            <p className="text-muted-foreground text-xs">
              Contexto → tempo → negócio → aquisição → cliente → pagamento.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{activeFilters.length} ativos</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={undoLast}
            disabled={!canUndo}
          >
            <Undo2 className="size-3.5" /> Desfazer
          </Button>
          <Button variant="ghost" size="sm" onClick={saveView}>
            <Bookmark className="size-3.5" /> Salvar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadView}
            disabled={!hasSavedView}
          >
            <FolderOpen className="size-3.5" /> Carregar
          </Button>
          <Button variant="ghost" size="sm" onClick={copyView}>
            <Copy className="size-3.5" /> Compartilhar
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <RotateCcw className="size-3.5" /> Limpar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "Recolher" : "Abrir filtros"}
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>

      {activeFilters.length > 0 && (
        <div className="border-t px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap gap-2" aria-label="Filtros ativos">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => removeFilter(filter.key)}
                className="bg-muted hover:bg-muted/75 inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold"
                aria-label={`Remover filtro ${filter.label}`}
              >
                {filter.label}
                <X className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {expanded && (
        <>
          <button
            type="button"
            className="executive-filter-backdrop"
            aria-label="Fechar filtros"
            onClick={() => setExpanded(false)}
          />
          <div className="executive-filter-panel border-t p-3 sm:p-4">
            <div className="executive-filter-mobile-head">
              <div>
                <strong>Filtros executivos</strong>
                <span>Global e local</span>
              </div>
              <button
                type="button"
                aria-label="Fechar filtros"
                onClick={() => setExpanded(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <fieldset className="rounded-xl border p-3">
                <legend className="px-1 text-xs font-extrabold uppercase tracking-wide">
                  1. Contexto e tempo
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <SelectField
                    label="Período"
                    value={period}
                    onChange={(value) => changePeriod(value as ExecutivePeriod)}
                    options={PERIOD_OPTIONS}
                  />
                  <SelectField
                    label="Comparação"
                    value={filters.comparison}
                    onChange={(value) =>
                      update("comparison", value as ExecutiveComparison)
                    }
                    options={COMPARISON_OPTIONS.map((item) => ({
                      value: item.value,
                      label: item.label,
                      disabled: !item.available,
                    }))}
                  />
                  <SelectField
                    label="Granularidade"
                    value={filters.granularity}
                    onChange={(value) =>
                      update("granularity", value as ExecutiveGranularity)
                    }
                    options={[
                      { value: "hour", label: "Hora · use o gráfico de 24h abaixo", disabled: true },
                      { value: "day", label: "Dia" },
                      { value: "week", label: "Semana" },
                      { value: "month", label: "Mês" },
                    ]}
                  />
                  <SelectField
                    label="Workspace"
                    value="principal"
                    onChange={() => undefined}
                    disabled
                    options={[
                      { value: "principal", label: "Workspace principal" },
                    ]}
                  />
                </div>
              </fieldset>

              <fieldset className="rounded-xl border p-3">
                <legend className="px-1 text-xs font-extrabold uppercase tracking-wide">
                  2. Negócio e aquisição
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <SelectField
                    label="Produto"
                    value={filters.product}
                    onChange={(value) => update("product", value)}
                    disabled
                    options={[
                      { value: "all", label: "Aguardando dimensão de produto" },
                      { value: "produto-principal", label: "Produto principal" },
                    ]}
                  />
                  <SelectField
                    label="Oferta"
                    value={filters.offer}
                    onChange={(value) => update("offer", value)}
                    disabled
                    options={[
                      { value: "all", label: "Aguardando dimensão de oferta" },
                      { value: "oferta-principal", label: "Oferta principal" },
                    ]}
                  />
                  <SelectField
                    label="Rede"
                    scope="local"
                    value={filters.network}
                    onChange={(value) =>
                      update("network", value as ExecutiveNetworkFilter)
                    }
                    options={[
                      { value: "all", label: "Todas as redes" },
                      { value: "Face ADS", label: "Face ADS" },
                      { value: "Google ADS", label: "Google ADS" },
                      { value: "YouTube ADS", label: "YouTube ADS" },
                    ]}
                  />
                  <SelectField
                    label="Campanha"
                    value="all"
                    onChange={() => undefined}
                    disabled
                    options={[
                      { value: "all", label: "Aguardando integração real" },
                    ]}
                  />
                </div>
              </fieldset>

              <fieldset className="rounded-xl border p-3">
                <legend className="px-1 text-xs font-extrabold uppercase tracking-wide">
                  3. Cliente, pagamento e dado
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <SelectField
                    label="Cliente"
                    value={filters.customerType}
                    onChange={(value) =>
                      update(
                        "customerType",
                        value as ExecutiveFilterState["customerType"],
                      )
                    }
                    disabled
                    options={[
                      { value: "all", label: "Aguardando cliente por evento" },
                      { value: "new", label: "Somente novos" },
                      { value: "returning", label: "Somente recorrentes" },
                    ]}
                  />
                  <SelectField
                    label="Pagamento"
                    value={filters.paymentStatus}
                    onChange={(value) =>
                      update(
                        "paymentStatus",
                        value as ExecutiveFilterState["paymentStatus"],
                      )
                    }
                    disabled
                    options={[
                      { value: "all", label: "Aguardando eventos de pagamento" },
                      { value: "approved", label: "Aprovado" },
                      { value: "pending", label: "Pendente" },
                      { value: "declined", label: "Recusado" },
                    ]}
                  />
                  <SelectField
                    label="Qualidade"
                    value={filters.dataStatus}
                    onChange={(value) =>
                      update(
                        "dataStatus",
                        value as ExecutiveFilterState["dataStatus"],
                      )
                    }
                    disabled
                    options={[
                      { value: "all", label: "Visível na faixa de confiança" },
                      { value: "confirmed", label: "Confirmado" },
                      { value: "provisional", label: "Provisório" },
                      { value: "estimated", label: "Estimado" },
                    ]}
                  />
                  <SelectField
                    label="Região / dispositivo"
                    value="all"
                    onChange={() => undefined}
                    disabled
                    options={[
                      { value: "all", label: "Aguardando integração real" },
                    ]}
                  />
                </div>
                <p className="text-muted-foreground mt-3 text-xs leading-5">
                  Filtros sem dimensão real permanecem desabilitados para não
                  fabricar segmentações. A arquitetura está preparada para
                  Supabase/Drizzle.
                </p>
              </fieldset>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
