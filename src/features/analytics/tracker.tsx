"use client";

import * as React from "react";
import {
  sanitizeTrackAttribution,
  sanitizeTrackPage,
  sanitizeTrackReferrer,
  TRACK_ATTRIBUTION_KEYS,
} from "./track-privacy";

const STORAGE_KEY = "infinity:aid";
const HEARTBEAT_MS = 30_000;
let fallbackAnonymousId: string | undefined;

/** ID anônimo persistente por navegador (não identifica a pessoa). */
function getAnonymousId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    fallbackAnonymousId ??= `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return fallbackAnonymousId;
  }
}

function collectUtm(): Record<string, string> {
  const utm: Record<string, string> = {};
  try {
    const p = new URLSearchParams(window.location.search);
    for (const k of TRACK_ATTRIBUTION_KEYS) {
      const v = p.get(k);
      if (v) utm[k] = v.slice(0, 200);
    }
  } catch {
    /* ignora */
  }
  return utm;
}

export function sendTrack(event: string, extra: Record<string, unknown> = {}) {
  try {
    const payload = JSON.stringify({
      anonymousId: getAnonymousId(),
      event,
      ...extra,
      page: sanitizeTrackPage(extra.page ?? window.location.pathname),
      referrer: sanitizeTrackReferrer(extra.referrer ?? document.referrer),
      utm: sanitizeTrackAttribution(extra.utm ?? collectUtm()),
    });
    // keepalive garante o envio mesmo se a página estiver a fechar.
    fetch("/api/public/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      referrerPolicy: "no-referrer",
    }).catch(() => {});
  } catch {
    /* rastreamento nunca quebra a página */
  }
}

interface TrackerProps {
  /** Evento disparado ao carregar, além do page_view */
  event?: "view_content" | "checkout_opened";
  productSlug?: string;
  checkoutId?: string;
  valueCents?: number;
  currency?: string;
}

/**
 * Rastreador das páginas públicas: regista a visita, mantém a sessão viva
 * enquanto a aba está aberta e alimenta o Live View.
 */
export function Tracker({
  event,
  productSlug,
  checkoutId,
  valueCents,
  currency,
}: TrackerProps) {
  React.useEffect(() => {
    const extra = { productSlug, checkoutId, valueCents, currency };
    sendTrack("page_view", extra);
    if (event) sendTrack(event, extra);

    const beat = setInterval(() => {
      if (document.visibilityState === "visible")
        sendTrack("heartbeat", { checkoutId });
    }, HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, [event, productSlug, checkoutId, valueCents, currency]);

  return null;
}
