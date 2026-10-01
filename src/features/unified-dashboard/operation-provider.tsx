"use client";

import * as React from "react";

import { emptyDashboardData } from "@/features/unified-dashboard/empty-data";
import type {
  FunnelDefinition,
  NetworkId,
  OperationDefinition,
  OperationId,
  PeriodPreset,
  UnifiedDashboardData,
} from "@/features/unified-dashboard/types";

interface UnifiedDashboardContextValue {
  data: UnifiedDashboardData;
  operationId: OperationId;
  operation: OperationDefinition;
  setOperationId: (id: OperationId) => void;
  networkId: NetworkId;
  setNetworkId: (id: NetworkId) => void;
  funnelId: string;
  funnel: FunnelDefinition;
  setFunnelId: (id: string) => void;
  campaignId: string;
  setCampaignId: (id: string) => void;
  year: number;
  setYear: (year: number) => void;
  month: number;
  setMonth: (month: number) => void;
  day: number;
  setDay: (day: number) => void;
  period: PeriodPreset;
  setPeriod: (period: PeriodPreset) => void;
  resetFilters: () => void;
}

const STORAGE_KEY = "dash-5-unified-context";

const UnifiedDashboardContext =
  React.createContext<UnifiedDashboardContextValue | null>(null);

function firstFunnel(operation: OperationDefinition) {
  const first = Object.values(operation.funnels)[0];
  if (!first) throw new Error(`A operação ${operation.id} não possui funis.`);
  return first;
}

export function UnifiedDashboardProvider({
  children,
  initialData,
}: {
  children: React.ReactNode;
  initialData?: UnifiedDashboardData;
}) {
  const data = React.useMemo(
    () => initialData ?? emptyDashboardData(),
    [initialData],
  );
  const initialOperationId = Object.keys(data.operations)[0] ?? "alpha";
  const today = React.useMemo(
    () => new Date(data.source.asOf),
    [data.source.asOf],
  );
  const [operationId, setOperationIdState] =
    React.useState<OperationId>(initialOperationId);
  const [networkId, setNetworkId] = React.useState<NetworkId>("all");
  const [funnelId, setFunnelIdState] = React.useState<string>(
    firstFunnel(data.operations[initialOperationId]).id,
  );
  const [campaignId, setCampaignId] = React.useState("all");
  const [year, setYear] = React.useState(today.getUTCFullYear());
  const [month, setMonth] = React.useState(today.getUTCMonth());
  const [day, setDay] = React.useState(today.getUTCDate());
  const [period, setPeriod] = React.useState<PeriodPreset>("30d");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<{
          operationId: OperationId;
          networkId: NetworkId;
          funnelId: string;
          campaignId: string;
          year: number;
          month: number;
          day: number;
          period: PeriodPreset;
        }>;
        const nextOperationId =
          parsed.operationId && data.operations[parsed.operationId]
            ? parsed.operationId
            : initialOperationId;
        const nextOperation = data.operations[nextOperationId];
        const nextFunnelId =
          parsed.funnelId && nextOperation.funnels[parsed.funnelId]
            ? parsed.funnelId
            : firstFunnel(nextOperation).id;

        // Restaura o contexto guardado só depois de montar: servidor e
        // navegador desenham a mesma primeira tela.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOperationIdState(nextOperationId);
        setNetworkId(
          ["all", "meta", "google", "youtube"].includes(parsed.networkId ?? "")
            ? parsed.networkId!
            : "all",
        );
        setFunnelIdState(nextFunnelId);
        setCampaignId(parsed.campaignId ?? "all");
        setYear(
          Number.isInteger(parsed.year) &&
            parsed.year! >= 2000 &&
            parsed.year! <= today.getUTCFullYear()
            ? parsed.year!
            : today.getUTCFullYear(),
        );
        setMonth(
          Number.isInteger(parsed.month) &&
            parsed.month! >= 0 &&
            parsed.month! < 12
            ? parsed.month!
            : today.getUTCMonth(),
        );
        setDay(
          Number.isInteger(parsed.day) && parsed.day! >= 1 && parsed.day! <= 31
            ? parsed.day!
            : today.getUTCDate(),
        );
        setPeriod(
          ["7d", "30d", "month", "custom"].includes(parsed.period ?? "")
            ? parsed.period!
            : "30d",
        );
      }
    } catch {
      // A dashboard continua com o contexto padrão caso o storage esteja inválido.
    } finally {
      setHydrated(true);
    }
  }, [data, initialOperationId, today]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          operationId,
          networkId,
          funnelId,
          campaignId,
          year,
          month,
          day,
          period,
        }),
      );
    } catch {
      /* Storage pode estar indisponível no modo privado. */
    }
  }, [
    campaignId,
    day,
    funnelId,
    hydrated,
    month,
    networkId,
    operationId,
    period,
    year,
  ]);

  const operation =
    data.operations[operationId] ?? data.operations[initialOperationId];
  const funnel = operation.funnels[funnelId] ?? firstFunnel(operation);

  const setOperationId = React.useCallback(
    (id: OperationId) => {
      const next = data.operations[id];
      if (!next) return;
      setOperationIdState(id);
      setNetworkId("all");
      setFunnelIdState(firstFunnel(next).id);
      setCampaignId("all");
    },
    [data],
  );

  const setFunnelId = React.useCallback(
    (id: string) => {
      if (operation.funnels[id]) setFunnelIdState(id);
    },
    [operation.funnels],
  );

  const resetFilters = React.useCallback(() => {
    const initialOperation = data.operations[initialOperationId];
    const current = new Date(data.source.asOf);
    setOperationIdState(initialOperationId);
    setNetworkId("all");
    setFunnelIdState(firstFunnel(initialOperation).id);
    setCampaignId("all");
    setYear(current.getUTCFullYear());
    setMonth(current.getUTCMonth());
    setDay(current.getUTCDate());
    setPeriod("30d");
  }, [data, initialOperationId]);

  const value = React.useMemo<UnifiedDashboardContextValue>(
    () => ({
      data,
      operationId,
      operation,
      setOperationId,
      networkId,
      setNetworkId,
      funnelId: funnel.id,
      funnel,
      setFunnelId,
      campaignId,
      setCampaignId,
      year,
      setYear,
      month,
      setMonth,
      day,
      setDay,
      period,
      setPeriod,
      resetFilters,
    }),
    [
      data,
      campaignId,
      day,
      funnel,
      month,
      networkId,
      operation,
      operationId,
      period,
      resetFilters,
      setFunnelId,
      setOperationId,
      year,
    ],
  );

  return (
    <UnifiedDashboardContext.Provider value={value}>
      {children}
    </UnifiedDashboardContext.Provider>
  );
}

export function useUnifiedDashboard() {
  const context = React.useContext(UnifiedDashboardContext);
  if (!context) {
    throw new Error(
      "useUnifiedDashboard precisa estar dentro de UnifiedDashboardProvider.",
    );
  }
  return context;
}
