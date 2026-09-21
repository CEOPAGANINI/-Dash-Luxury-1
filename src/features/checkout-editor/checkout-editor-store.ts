"use client";

import { useSyncExternalStore } from "react";

import { CONFIG_PADRAO, restoreCheckoutConfig, type CheckoutConfig } from "./checkout-config";

/*
  A arrumação do checkout enquanto se mexe nela: fica neste navegador,
  para não se perder ao recarregar a página. Quando houver um checkout
  escolhido, é esta configuração que vai para checkouts.config.
*/

export const CHECKOUT_EDITOR_KEY = "dash-luxury:checkout-editor:v1";

type Snapshot = { config: CheckoutConfig; notice: string };
const EMPTY: Snapshot = { config: CONFIG_PADRAO, notice: "" };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load() {
  try {
    const raw = localStorage.getItem(CHECKOUT_EDITOR_KEY);
    const lido = raw ? restoreCheckoutConfig(raw) : null;
    snapshot = { config: lido ?? CONFIG_PADRAO, notice: raw && !lido ? "O checkout salvo não pôde ser lido." : "" };
  } catch {
    snapshot = { ...snapshot, notice: "Armazenamento indisponível: o checkout vale só nesta sessão." };
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === CHECKOUT_EDITOR_KEY || event.key === null) {
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

/** A configuração do editor e como guardá-la. */
export function useCheckoutDraft() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  return {
    config: state.config,
    notice: state.notice,
    guardar: (nova: CheckoutConfig) => {
      let notice = "";
      try {
        localStorage.setItem(CHECKOUT_EDITOR_KEY, JSON.stringify(nova));
      } catch {
        notice = "Armazenamento indisponível: o checkout vale só nesta sessão.";
      }
      snapshot = { config: nova, notice };
      notify();
    },
  };
}
