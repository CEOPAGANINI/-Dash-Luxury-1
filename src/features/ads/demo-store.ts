"use client";

import { useSyncExternalStore } from "react";
import type { ProfitGuardrails } from "@/features/guardrails/rules";
import type { ResultadoAds } from "./actions";
import { demoCampaignRows } from "./demo-campaigns";
import {
  createDemoCampaign,
  restoreDemoRows,
  updateDemoEntity,
} from "./demo-simulation";
import type { CampaignRow } from "./types";
import { resetDemoCampaignClasses } from "./campaign-class-store";

export const CAMPAIGN_DEMO_KEY = "dash-luxury:campaign-sandbox:v1";
export type CampaignFormAction = (
  previous: ResultadoAds | null,
  form: FormData,
) => Promise<ResultadoAds>;
type DemoSnapshot = { rows: CampaignRow[]; notice: string; revision: number };

// Snapshot constante para SSR. Mutação acontece apenas no navegador, por eventos.
const initial: DemoSnapshot = {
  rows: demoCampaignRows(),
  notice: "",
  revision: 0,
};
let snapshot = initial;
let initialized = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function loadStorage() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_DEMO_KEY);
    const rows = raw ? restoreDemoRows(raw) : demoCampaignRows();
    snapshot = {
      rows: rows ?? demoCampaignRows(),
      notice:
        raw && !rows
          ? "O exemplo salvo era incompatível. Os exemplos originais foram recarregados."
          : "",
      revision: snapshot.revision + 1,
    };
  } catch {
    snapshot = {
      ...snapshot,
      notice:
        "Armazenamento bloqueado: seus testes durarão apenas enquanto esta página estiver aberta.",
    };
  }
}
function onStorage(event: StorageEvent) {
  if (event.key === CAMPAIGN_DEMO_KEY || event.key === null) {
    loadStorage();
    notify();
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  if (!initialized) {
    initialized = true;
    loadStorage();
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}
function commit(rows: CampaignRow[], message: string, reset = false) {
  let notice = message;
  try {
    localStorage.setItem(
      CAMPAIGN_DEMO_KEY,
      JSON.stringify({ version: 1, rows }),
    );
    notice += " Salvo somente neste navegador.";
  } catch {
    notice +=
      " Armazenamento indisponível; alteração mantida somente nesta sessão.";
  }
  snapshot = { rows, notice, revision: snapshot.revision + (reset ? 1 : 0) };
  notify();
}

export function resetCampaignDemo() {
  resetDemoCampaignClasses();
  commit(demoCampaignRows(), "Exemplos das três redes restaurados.", true);
}

export function useCampaignDemo() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initial,
  );
  return {
    ...state,
    create:
      (regras: ProfitGuardrails): CampaignFormAction =>
      async (_previous, form) => {
        const change = createDemoCampaign(
          snapshot.rows,
          form,
          `demo-local-${crypto.randomUUID()}`,
          regras,
        );
        if (change.result.ok) commit(change.rows, change.result.mensagem);
        return change.result;
      },
    update:
      (regras: ProfitGuardrails): CampaignFormAction =>
      async (_previous, form) => {
        const change = updateDemoEntity(snapshot.rows, form, regras);
        if (change.result.ok) commit(change.rows, change.result.mensagem);
        return change.result;
      },
  };
}
