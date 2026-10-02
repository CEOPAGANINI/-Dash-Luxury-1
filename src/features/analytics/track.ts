import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  analyticsEvents,
  checkouts,
  visitorSessions,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import {
  getOrCreateDefaultWorkspace,
  getPublicWorkspaceId,
} from "@/lib/workspace";
import {
  sanitizeTrackAttribution,
  sanitizeTrackPage,
  sanitizeTrackReferrer,
} from "./track-privacy";

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
  checkoutId?: string;
  valueCents?: number;
  currency?: string;
  properties?: Record<string, unknown>;
}

export interface RequestContext {
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  /** Definida pelo servidor após validar a origem CORS, nunca pelo corpo. */
  siteOrigin?: string | null;
}

export class InvalidTrackTarget extends Error {}

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
  let workspaceId: string | undefined;
  if (input.checkoutId) {
    const [checkout] = await db
      .select({ workspaceId: checkouts.workspaceId })
      .from(checkouts)
      .where(
        and(
          eq(checkouts.id, input.checkoutId),
          eq(checkouts.status, "published"),
          isNull(checkouts.deletedAt),
        ),
      )
      .limit(1);
    if (!checkout) throw new InvalidTrackTarget();
    workspaceId = checkout.workspaceId;
  }
  if (ctx.siteOrigin) {
    const hostname = new URL(ctx.siteOrigin).hostname;
    const [site] = await db
      .select({ workspaceId: vpsSites.workspaceId })
      .from(vpsSiteDomains)
      .innerJoin(vpsSites, eq(vpsSites.id, vpsSiteDomains.siteId))
      .where(
        and(
          eq(vpsSiteDomains.hostname, hostname),
          eq(vpsSiteDomains.dnsStatus, "ok"),
          isNull(vpsSites.deletedAt),
        ),
      )
      .limit(1);
    if (!site || (workspaceId && workspaceId !== site.workspaceId))
      throw new InvalidTrackTarget();
    workspaceId = site.workspaceId;
  }
  workspaceId ??= await getPublicWorkspaceId();
  const { deviceType, browser, os } = parseUserAgent(ctx.userAgent);
  const now = new Date();
  // Enforce privacy at the database boundary, including callers without the browser tracker.
  const page = sanitizeTrackPage(input.page);
  const referrer = sanitizeTrackReferrer(input.referrer);
  const utm = sanitizeTrackAttribution(input.utm);

  // Sessão: cria na primeira visita, atualiza nas seguintes.
  const [session] = await db
    .insert(visitorSessions)
    .values({
      workspaceId,
      anonymousId: input.anonymousId,
      firstPage: page,
      currentPage: page,
      referrer,
      utm,
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
        currentPage: page,
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
    checkoutId: input.checkoutId,
    eventName: input.event,
    eventId: crypto.randomUUID(),
    page,
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
