"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

import type { AdMetrics } from "./types";

/*
  As taxas que saem do retorno antes de virar lucro: a porcentagem do
  gateway de pagamento (a mesma para todas as campanhas). O lucro de uma
  campanha é o retorno menos a taxa do gateway menos o tráfego (o que
  foi investido em mídia). A taxa fica neste navegador; muda no próprio
  card da campanha.
*/

export const TAXAS_KEY = "dash-luxury:taxas:v1";
export const GATEWAY_PADRAO = 0;

const schema = z.object({
  version: z.literal(1),
  /** Porcentagem do gateway, de 0 a 100 (4,99 = 4,99%). */
  gatewayPercentual: z.number().min(0).max(100),
});
export type Taxas = z.infer<typeof schema>;

type Snapshot = { gatewayPercentual: number; notice: string };
const EMPTY: Snapshot = { gatewayPercentual: GATEWAY_PADRAO, notice: "" };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function restoreTaxas(raw: string): Taxas | null {
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Arredonda uma porcentagem do gateway para duas casas, dentro de 0 a 100. */
export function normalizarGateway(valor: number): number {
  if (!Number.isFinite(valor)) return GATEWAY_PADRAO;
  return Math.max(0, Math.min(100, Math.round(valor * 100) / 100));
}

/* O lucro de uma campanha, em centavos: o retorno (receita atribuída)
   menos a taxa do gateway sobre esse retorno menos o tráfego (o
   investimento em mídia). Pode ser negativo. */
export function lucroDaCampanha(m: AdMetrics, gatewayPercentual: number) {
  const gatewayCents = Math.round((m.revenueCents * normalizarGateway(gatewayPercentual)) / 100);
  return {
    retornoCents: m.revenueCents,
    gatewayCents,
    trafegoCents: m.spendCents,
    lucroCents: m.revenueCents - gatewayCents - m.spendCents,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(TAXAS_KEY);
    const restored = raw ? restoreTaxas(raw) : null;
    snapshot = { gatewayPercentual: restored?.gatewayPercentual ?? GATEWAY_PADRAO, notice: raw && !restored ? "As taxas salvas não puderam ser lidas." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: a taxa vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === TAXAS_KEY || event.key === null) {
    load();
    notify();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    load();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

/** A porcentagem do gateway e como mudá-la. */
export function useTaxas() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    gatewayPercentual: state.gatewayPercentual,
    notice: state.notice,
    definirGateway: (valor: number) => {
      const gatewayPercentual = normalizarGateway(valor);
      let notice = "";
      try {
        localStorage.setItem(TAXAS_KEY, JSON.stringify({ version: 1, gatewayPercentual }));
      } catch {
        notice = "Armazenamento indisponível: a taxa vale só nesta sessão.";
      }
      snapshot = { gatewayPercentual, notice };
      notify();
    },
  };
}
