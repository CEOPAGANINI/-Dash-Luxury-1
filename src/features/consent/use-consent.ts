"use client";

import { useSyncExternalStore } from "react";

export const CONSENT_KEY = "infinity:consent";
export const CONSENT_EVENT = "infinity:consent-changed";

export type ConsentValue = "accepted" | "rejected";

function read(): ConsentValue | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: ConsentValue) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
  } catch {
    /* ignora */
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Lê a decisão de cookies como fonte externa de estado.
 *
 * `useSyncExternalStore` evita efeitos + setState (que causariam um flash do
 * aviso a cada render) e mantém todas as abas sincronizadas.
 *
 * No servidor devolve `undefined`: nada de consentimento é assumido antes de
 * o navegador confirmar.
 */
export function useConsent(): ConsentValue | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
