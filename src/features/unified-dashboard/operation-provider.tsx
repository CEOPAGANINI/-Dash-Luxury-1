"use client";

import * as React from "react";

import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import type {
  FunnelDefinition,
  NetworkId,
  OperationDefinition,
  OperationId,
  PeriodPreset,
} from "@/features/unified-dashboard/types";

interface UnifiedDashboardContextValue {
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
}: {
  children: React.ReactNode;
}) {
  const [operationId, setOperationIdState] =
    React.useState<OperationId>("alpha");
  const [networkId, setNetworkId] = React.useState<NetworkId>("all");
  const [funnelId, setFunnelIdState] = React.useState<string>(
    firstFunnel(unifiedDemoData.operations.alpha).id,
  );
  const [campaignId, setCampaignId] = React.useState("all");
  const [year, setYear] = React.useState(2026);
  const [month, setMonth] = React.useState(7);
  const [day, setDay] = React.useState(19);
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
          parsed.operationId && unifiedDemoData.operations[parsed.operationId]
            ? parsed.operationId
            : "alpha";
        const nextOperation = unifiedDemoData.operations[nextOperationId];
        const nextFunnelId =
          parsed.funnelId && nextOperation.funnels[parsed.funnelId]
            ? parsed.funnelId
            : firstFunnel(nextOperation).id;

        // Restaura o contexto guardado só depois de montar: servidor e
        // navegador desenham a mesma primeira tela.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOperationIdState(nextOperationId);
        setNetworkId(parsed.networkId ?? "all");
        setFunnelIdState(nextFunnelId);
        setCampaignId(parsed.campaignId ?? "all");
        setYear(parsed.year ?? 2026);
        setMonth(parsed.month ?? 7);
        setDay(parsed.day ?? 19);
        setPeriod(parsed.period ?? "30d");
      }
    } catch {
      // A dashboard continua com o contexto padrão caso o storage esteja inválido.
    } finally {
      setHydrated(true);
    }
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
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

  const operation = unifiedDemoData.operations[operationId];
  const funnel = operation.funnels[funnelId] ?? firstFunnel(operation);

  const setOperationId = React.useCallback((id: OperationId) => {
    const next = unifiedDemoData.operations[id];
    setOperationIdState(id);
    setNetworkId("all");
    setFunnelIdState(firstFunnel(next).id);
    setCampaignId("all");
  }, []);

  const setFunnelId = React.useCallback(
    (id: string) => {
      if (operation.funnels[id]) setFunnelIdState(id);
    },
    [operation.funnels],
  );

  const resetFilters = React.useCallback(() => {
    const initialOperation = unifiedDemoData.operations.alpha;
    setOperationIdState("alpha");
    setNetworkId("all");
    setFunnelIdState(firstFunnel(initialOperation).id);
    setCampaignId("all");
    setYear(2026);
    setMonth(7);
    setDay(19);
    setPeriod("30d");
  }, []);

  const value = React.useMemo<UnifiedDashboardContextValue>(
    () => ({
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
