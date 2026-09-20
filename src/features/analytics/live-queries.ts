import { and, desc, eq, gte, like, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import {
  analyticsEvents,
  orderItems,
  orders,
  products,
  visitorSessions,
} from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface LiveSession {
  id: string;
  anonymousId: string;
  currentPage: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  countryCode: string | null;
  city: string | null;
  utmSource: string | null;
  pageViews: number;
  durationSeconds: number;
  lastSeenAt: Date;
}

export interface LiveEvent {
  id: string;
  eventName: string;
  page: string | null;
  occurredAt: Date;
  anonymousId: string | null;
  countryCode: string | null;
  deviceType: string | null;
}

export interface FunnelStep {
  label: string;
  event: string;
  count: number;
}

export interface TopLocation {
  label: string;
  count: number;
}

export interface TopProduct {
  name: string;
  imageUrl: string | null;
  units: number;
  revenueCents: number;
}

export interface LiveSnapshot {
  onlineNow: number;
  visitorsToday: number;
  visitors24h: number;
  pageViewsToday: number;
  /** Sessões online cuja página atual é um checkout. */
  activeCheckouts: number;
  /** Online agora menos quem está no checkout — "a navegar". */
  browsingNow: number;
  ordersToday: number;
  paidOrdersToday: number;
  revenueTodayCents: number;
  currency: string;
  topLocations: TopLocation[];
  topProducts: TopProduct[];
  sessions: LiveSession[];
  events: LiveEvent[];
  funnel: FunnelStep[];
  generatedAt: string;
}

/** Considera "online" quem teve atividade nos últimos 5 minutos. */
const ONLINE_WINDOW = sql`now() - interval '5 minutes'`;
const PAID_STATUSES_SQL = sql`${orders.status} in ('paid','shipped','delivered')`;

/** Nomes de países para exibir ao lado da cidade nas localizações. */
const COUNTRY_NAMES: Record<string, string> = {
  BR: "Brasil",
  PT: "Portugal",
  ES: "Espanha",
  US: "Estados Unidos",
  FR: "França",
  DE: "Alemanha",
  GB: "Reino Unido",
  IT: "Itália",
  AO: "Angola",
  MZ: "Moçambique",
};

function countryLabel(code: string | null, city: string | null): string {
  const name = code
    ? (COUNTRY_NAMES[code.toUpperCase()] ?? code)
    : "Desconhecido";
  return city ? `${city} · ${name}` : name;
}

export async function getLiveSnapshot(): Promise<LiveSnapshot | null> {
  if (!isDatabaseConfigured()) return null;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const ws = eq(visitorSessions.workspaceId, workspaceId);
  const wsOrders = eq(orders.workspaceId, workspaceId);

  const [online] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(and(ws, gte(visitorSessions.lastSeenAt, ONLINE_WINDOW)));

  const [activeCheckout] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(
      and(
        ws,
        gte(visitorSessions.lastSeenAt, ONLINE_WINDOW),
        like(visitorSessions.currentPage, "/checkout/%"),
      ),
    );

  const [today] = await db
    .select({
      visitantes: sql<number>`count(*)::int`,
      views: sql<number>`coalesce(sum(${visitorSessions.pageViews}), 0)::int`,
    })
    .from(visitorSessions)
    .where(
      and(ws, sql`${visitorSessions.createdAt} >= date_trunc('day', now())`),
    );

  const [last24] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(visitorSessions)
    .where(
      and(ws, sql`${visitorSessions.createdAt} >= now() - interval '24 hours'`),
    );

  const [ordersToday] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${PAID_STATUSES_SQL})::int`,
      revenueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${PAID_STATUSES_SQL}), 0)::int`,
    })
    .from(orders)
    .where(and(wsOrders, sql`${orders.createdAt} >= date_trunc('day', now())`));

  const locationRows = await db
    .select({
      countryCode: visitorSessions.countryCode,
      city: visitorSessions.city,
      n: sql<number>`count(*)::int`,
    })
    .from(visitorSessions)
    .where(
      and(
        ws,
        sql`${visitorSessions.createdAt} >= date_trunc('day', now())`,
        sql`${visitorSessions.countryCode} is not null`,
      ),
    )
    .groupBy(visitorSessions.countryCode, visitorSessions.city)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const topProductRows = await db
    .select({
      name: orderItems.productName,
      imageUrl: products.mainImageUrl,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      revenueCents: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(and(wsOrders, PAID_STATUSES_SQL))
    .groupBy(orderItems.productName, products.mainImageUrl)
    .orderBy(desc(sql`sum(${orderItems.totalCents})`))
    .limit(5);

  const sessions = await db
    .select({
      id: visitorSessions.id,
      anonymousId: visitorSessions.anonymousId,
      currentPage: visitorSessions.currentPage,
      deviceType: visitorSessions.deviceType,
      browser: visitorSessions.browser,
      os: visitorSessions.os,
      countryCode: visitorSessions.countryCode,
      city: visitorSessions.city,
      utm: visitorSessions.utm,
      pageViews: visitorSessions.pageViews,
      durationSeconds: visitorSessions.durationSeconds,
      lastSeenAt: visitorSessions.lastSeenAt,
    })
    .from(visitorSessions)
    .where(and(ws, gte(visitorSessions.lastSeenAt, ONLINE_WINDOW)))
    .orderBy(desc(visitorSessions.lastSeenAt))
    .limit(40);

  const events = await db
    .select({
      id: analyticsEvents.id,
      eventName: analyticsEvents.eventName,
      page: analyticsEvents.page,
      occurredAt: analyticsEvents.occurredAt,
      anonymousId: visitorSessions.anonymousId,
      countryCode: visitorSessions.countryCode,
      deviceType: visitorSessions.deviceType,
    })
    .from(analyticsEvents)
    .leftJoin(
      visitorSessions,
      eq(analyticsEvents.sessionId, visitorSessions.id),
    )
    .where(eq(analyticsEvents.workspaceId, workspaceId))
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(50);

  // Funil das últimas 24h
  const funnelRows = await db
    .select({
      eventName: analyticsEvents.eventName,
      n: sql<number>`count(distinct ${analyticsEvents.sessionId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.workspaceId, workspaceId),
        sql`${analyticsEvents.occurredAt} >= now() - interval '24 hours'`,
      ),
    )
    .groupBy(analyticsEvents.eventName);

  const countOf = (name: string) =>
    funnelRows.find((r) => r.eventName === name)?.n ?? 0;

  const funnel: FunnelStep[] = [
    { label: "Visitantes", event: "page_view", count: countOf("page_view") },
    {
      label: "Viu produto",
      event: "view_content",
      count: countOf("view_content"),
    },
    {
      label: "Clicou comprar",
      event: "click_buy",
      count: countOf("click_buy"),
    },
    {
      label: "Abriu checkout",
      event: "checkout_opened",
      count: countOf("checkout_opened"),
    },
    {
      label: "Pagamento criado",
      event: "payment_created",
      count: countOf("payment_created"),
    },
  ];

  const onlineNow = online?.n ?? 0;
  const activeCheckouts = activeCheckout?.n ?? 0;

  return {
    onlineNow,
    visitorsToday: today?.visitantes ?? 0,
    visitors24h: last24?.n ?? 0,
    pageViewsToday: today?.views ?? 0,
    activeCheckouts,
    browsingNow: Math.max(0, onlineNow - activeCheckouts),
    ordersToday: ordersToday?.total ?? 0,
    paidOrdersToday: ordersToday?.paid ?? 0,
    revenueTodayCents: ordersToday?.revenueCents ?? 0,
    currency: "EUR",
    topLocations: locationRows.map((r) => ({
      label: countryLabel(r.countryCode, r.city),
      count: r.n,
    })),
    topProducts: topProductRows
      .filter((r) => r.name)
      .map((r) => ({
        name: r.name as string,
        imageUrl: r.imageUrl,
        units: r.units,
        revenueCents: r.revenueCents,
      })),
    sessions: sessions.map((s) => ({
      id: s.id,
      anonymousId: s.anonymousId,
      currentPage: s.currentPage,
      deviceType: s.deviceType,
      browser: s.browser,
      os: s.os,
      countryCode: s.countryCode,
      city: s.city,
      utmSource: (s.utm as Record<string, string> | null)?.utm_source ?? null,
      pageViews: s.pageViews,
      durationSeconds: s.durationSeconds,
      lastSeenAt: s.lastSeenAt,
    })),
    events,
    funnel,
    generatedAt: new Date().toISOString(),
  };
}
