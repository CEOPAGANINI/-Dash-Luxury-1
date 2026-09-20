import { and, eq, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { analyticsEvents, visitorSessions } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

/** Eventos aceitos pelo endpoint público de rastreamento. */
export const TRACK_EVENTS = [
  "page_view",
  "heartbeat",
  "view_content",
  "click_buy",
  "checkout_opened",
  "checkout_contact_filled",
  "checkout_payment_selected",
  "payment_created",
] as const;

export type TrackEvent = (typeof TRACK_EVENTS)[number];

export interface TrackInput {
  anonymousId: string;
  event: TrackEvent;
  page?: string;
  referrer?: string;
  utm?: Record<string, string>;
  productSlug?: string;
  valueCents?: number;
  currency?: string;
  properties?: Record<string, unknown>;
}

export interface RequestContext {
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
}

/** Mascara o IP: mantém só os 2 primeiros octetos (RGPD). */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.split(".");
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.x.x`;
  const v6 = ip.split(":");
  if (v6.length > 2) return `${v6[0]}:${v6[1]}:x:x`;
  return "x.x.x.x";
}

export function parseUserAgent(ua: string | null): {
  deviceType: string;
  browser: string;
  os: string;
} {
  const s = ua ?? "";
  const deviceType = /iPad|Tablet/i.test(s)
    ? "tablet"
    : /Mobi|Android|iPhone/i.test(s)
      ? "mobile"
      : "desktop";

  const browser = /Edg\//i.test(s)
    ? "Edge"
    : /OPR\/|Opera/i.test(s)
      ? "Opera"
      : /Chrome\//i.test(s)
        ? "Chrome"
        : /Safari\//i.test(s)
          ? "Safari"
          : /Firefox\//i.test(s)
            ? "Firefox"
            : "Outro";

  const os = /Windows/i.test(s)
    ? "Windows"
    : /Android/i.test(s)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(s)
        ? "iOS"
        : /Mac OS/i.test(s)
          ? "macOS"
          : /Linux/i.test(s)
            ? "Linux"
            : "Outro";

  return { deviceType, browser, os };
}

/**
 * Registra um evento de rastreamento e mantém a sessão do visitante viva.
 *
 * Privacidade: o IP é sempre mascarado antes de gravar, e o identificador da
 * sessão é anônimo (gerado no navegador, sem ligação a identidade).
 */
export async function recordTrackEvent(
  input: TrackInput,
  ctx: RequestContext,
): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const { deviceType, browser, os } = parseUserAgent(ctx.userAgent);
  const now = new Date();

  // Sessão: cria na primeira visita, atualiza nas seguintes.
  const [session] = await db
    .insert(visitorSessions)
    .values({
      workspaceId,
      anonymousId: input.anonymousId,
      firstPage: input.page,
      currentPage: input.page,
      referrer: input.referrer,
      utm: input.utm ?? {},
      deviceType,
      browser,
      os,
      countryCode: ctx.country,
      city: ctx.city,
      ipMasked: maskIp(ctx.ip),
      pageViews: input.event === "page_view" ? 1 : 0,
      isActive: true,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [visitorSessions.workspaceId, visitorSessions.anonymousId],
      set: {
        currentPage: input.page,
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
        pageViews:
          input.event === "page_view"
            ? sql`${visitorSessions.pageViews} + 1`
            : sql`${visitorSessions.pageViews}`,
        durationSeconds: sql`greatest(0, extract(epoch from (${now.toISOString()}::timestamptz - ${visitorSessions.createdAt}))::int)`,
      },
    })
    .returning({ id: visitorSessions.id });

  // Heartbeat só mantém a sessão viva; não polui o feed de eventos.
  if (input.event === "heartbeat") return;

  await db.insert(analyticsEvents).values({
    workspaceId,
    sessionId: session.id,
    eventName: input.event,
    eventId: `${input.anonymousId}_${input.event}_${now.getTime()}`,
    page: input.page,
    valueCents: input.valueCents,
    currency: input.currency,
    properties: {
      ...(input.properties ?? {}),
      ...(input.productSlug ? { productSlug: input.productSlug } : {}),
    },
    occurredAt: now,
  });
}

/** Marca como inativas as sessões sem atividade há mais de 5 minutos. */
export async function expireStaleSessions(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(visitorSessions)
    .set({ isActive: false })
    .where(
      and(
        eq(visitorSessions.workspaceId, workspaceId),
        eq(visitorSessions.isActive, true),
        sql`${visitorSessions.lastSeenAt} < now() - interval '5 minutes'`,
      ),
    );
}
