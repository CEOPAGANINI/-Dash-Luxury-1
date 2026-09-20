"use client";

import * as React from "react";

import { useConsent } from "@/features/consent/use-consent";

/**
 * Só renderiza os filhos depois de o visitante aceitar cookies.
 *
 * Usado para os píxeis de marketing: a lei europeia exige consentimento
 * PRÉVIO — carregar o píxel e só depois perguntar seria infração.
 */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const consent = useConsent();
  if (consent !== "accepted") return null;
  return <>{children}</>;
}
