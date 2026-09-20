"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Activity,
  CreditCard,
  Eye,
  Laptop,
  MapPin,
  MousePointerClick,
  Package,
  ShoppingBag,
  Smartphone,
  Tablet,
  Wifi,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type {
  LiveSnapshot,
  LiveSession,
} from "@/features/analytics/live-queries";
import {
  resolveCountry,
  type LiveGlobePoint,
} from "@/features/analytics/live-globe-data";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** O mapa animado usa Canvas — entra no browser e fora do bundle inicial. */
const LiveWorldMap = dynamic(
  () =>
    import("@/features/analytics/live-world-map").then((m) => m.LiveWorldMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-[440px] w-full rounded-xl sm:h-[520px] lg:h-full lg:min-h-[560px]" />
    ),
  },
);

const POLL_MS = 5000;

const EVENT_LABEL: Record<string, string> = {
  page_view: "Entrou na página",
  view_content: "Visualizou o produto",
  click_buy: "Clicou em comprar",
  checkout_opened: "Abriu o checkout",
  checkout_contact_filled: "Preencheu o contacto",
  checkout_payment_selected: "Escolheu o pagamento",
  payment_created: "Gerou o pagamento",
};

const EVENT_ICON: Record<string, React.ElementType> = {
  page_view: Eye,
  view_content: Eye,
  click_buy: MousePointerClick,
  checkout_opened: CreditCard,
  checkout_contact_filled: CreditCard,
  checkout_payment_selected: CreditCard,
  payment_created: CreditCard,
};

const EVENT_TONE: Record<string, string> = {
  page_view: "text-muted-foreground",
  view_content: "text-info",
  click_buy: "text-warning",
  checkout_opened: "text-primary",
  checkout_contact_filled: "text-primary",
  checkout_payment_selected: "text-primary",
  payment_created: "text-success",
};

function DeviceIcon({ type }: { type: string | null }) {
  const Icon =
    type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Laptop;
  return <Icon className="size-3.5 shrink-0" />;
}

function timeAgo(date: string | Date): string {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s}s`;
}

/** Hash estável para espalhar cidades do mesmo país à volta do centroide. */
function hashOffset(seed: string): [number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return [((hash % 100) / 100) * 6 - 3, (((hash >> 8) % 100) / 100) * 6 - 3];
}

/**
 * Agrupa as sessões online por país/cidade e converte em pontos do globo.
 * Sessões sem geolocalização ficam de fora — sem coordenadas não há ponto.
 */
function sessionsToMapPoints(sessions: LiveSession[]): LiveGlobePoint[] {
  const grouped = new Map<string, LiveGlobePoint>();

  for (const session of sessions) {
    const country = resolveCountry(session.countryCode);
    if (!country || !session.countryCode) continue;

    const key = `${session.countryCode}:${session.city ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.users += 1;
      continue;
    }

    const [latOffset, lonOffset] = session.city ? hashOffset(key) : [0, 0];
    grouped.set(key, {
      id: key,
      lat: country.lat + latOffset,
      lon: country.lon + lonOffset,
      country: country.name,
      countryCode: session.countryCode.toUpperCase(),
      city: session.city,
      users: 1,
    });
  }

  return [...grouped.values()];
}

/* -------------------------------------------------------------------------- */
/* Mini stat (grade 2×2 do painel esquerdo)                                    */
/* -------------------------------------------------------------------------- */

function MiniStat({
  label,
  value,
  icon: Icon,
  live,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  live?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {label}
        {live && (
          <span className="bg-success ml-auto size-1.5 animate-pulse rounded-full" />
        )}
      </p>
      <p className="mt-1.5 text-xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Comportamento dos clientes — 3 círculos ligados                             */
/* -------------------------------------------------------------------------- */

function BehaviorStage({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "info" | "warning" | "success";
}) {
  const ring = {
    info: "border-info/40 text-info bg-info/10",
    warning:
      "border-warning/40 text-warning-foreground dark:text-warning bg-warning/10",
    success: "border-success/40 text-success bg-success/10",
  }[tone];

  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full border-2 text-lg font-bold tabular-nums",
          ring,
        )}
      >
        {count}
      </div>
      <p className="text-muted-foreground text-center text-xs leading-tight">
        {label}
      </p>
    </div>
  );
}

function CustomerBehaviorCard({ data }: { data: LiveSnapshot | null }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Comportamento agora</CardTitle>
        <CardDescription className="text-xs">
          Onde estão as sessões online neste momento
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="flex items-center">
          <BehaviorStage
            label="Na loja"
            count={data?.browsingNow ?? 0}
            tone="info"
          />
          <div className="mb-6 h-px w-4 shrink-0 bg-gradient-to-r from-info/40 to-warning/40" />
          <BehaviorStage
            label="No checkout"
            count={data?.activeCheckouts ?? 0}
            tone="warning"
          />
          <div className="mb-6 h-px w-4 shrink-0 bg-gradient-to-r from-warning/40 to-success/40" />
          <BehaviorStage
            label="Compraram hoje"
            count={data?.paidOrdersToday ?? 0}
            tone="success"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Localizações e produtos principais                                         */
/* -------------------------------------------------------------------------- */

function TopLocationsCard({ data }: { data: LiveSnapshot | null }) {
  const locations = data?.topLocations ?? [];
  const max = Math.max(1, ...locations.map((l) => l.count));

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <MapPin className="size-3.5" /> Principais localizações
        </CardTitle>
        <CardDescription className="text-xs">
          Visitantes de hoje
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 px-4">
        {locations.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-xs">
            Ainda sem visitantes hoje.
          </p>
        ) : (
          locations.map((loc) => (
            <div key={loc.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium">{loc.label}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {loc.count}
                </span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${Math.max(4, (loc.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsCard({ data }: { data: LiveSnapshot | null }) {
  const productList = data?.topProducts ?? [];

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Package className="size-3.5" /> Produtos mais vendidos
        </CardTitle>
        <CardDescription className="text-xs">Por receita paga</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {productList.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-xs">
            Nenhuma venda confirmada ainda.
          </p>
        ) : (
          productList.map((p) => (
            <div key={p.name} className="flex items-center gap-2.5">
              <div className="bg-muted relative size-9 shrink-0 overflow-hidden rounded-lg border">
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    alt=""
                    fill
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center">
                    <Package className="size-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{p.name}</p>
                <p className="text-muted-foreground text-[11px]">
                  {p.units} {p.units === 1 ? "unidade" : "unidades"}
                </p>
              </div>
              <p className="shrink-0 text-xs font-bold tabular-nums">
                {formatMoney(p.revenueCents, data?.currency ?? "EUR", "pt-PT")}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Componente principal                                                       */
/* -------------------------------------------------------------------------- */

type ConnState = "connected" | "reconnecting" | "disconnected";

export function LiveView() {
  const [data, setData] = React.useState<LiveSnapshot | null>(null);
  const [conn, setConn] = React.useState<ConnState>("reconnecting");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let failures = 0;

    async function poll() {
      try {
        const res = await fetch("/api/live-view", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as LiveSnapshot;
        if (!active) return;
        setData(json);
        setConn("connected");
        failures = 0;
      } catch {
        if (!active) return;
        failures += 1;
        setConn(failures > 2 ? "disconnected" : "reconnecting");
      } finally {
        if (active) setLoading(false);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-[440px] lg:h-full" />
        </div>
      </div>
    );
  }

  const mapPoints = sessionsToMapPoints(data?.sessions ?? []);

  return (
    <div className="space-y-5">
      {/* Status da ligação */}
      <div className="flex items-center gap-2 text-xs">
        {conn === "connected" ? (
          <>
            <span className="bg-success size-2 animate-pulse rounded-full" />
            <span className="text-muted-foreground">
              Ao vivo · atualiza a cada 5s
            </span>
          </>
        ) : conn === "reconnecting" ? (
          <>
            <Wifi className="text-warning size-3.5" />
            <span className="text-muted-foreground">A reconectar…</span>
          </>
        ) : (
          <>
            <WifiOff className="text-destructive size-3.5" />
            <span className="text-destructive">Desligado</span>
          </>
        )}
      </div>

      {/* Hero: painel esquerdo compacto + mapa global à direita */}
      <div className="grid gap-5 lg:grid-cols-[360px_1fr] lg:items-stretch">
        <div className="space-y-3">
          {/* Página vs. Checkout, lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Ver. de página"
              value={data?.pageViewsToday ?? 0}
              icon={Eye}
              live
            />
            <MiniStat
              label="Checkouts agora"
              value={data?.activeCheckouts ?? 0}
              icon={CreditCard}
              live
            />
          </div>
          {/* Pedidos vs. compras, lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Pedidos hoje"
              value={data?.ordersToday ?? 0}
              icon={ShoppingBag}
            />
            <MiniStat
              label="Compras hoje"
              value={data?.paidOrdersToday ?? 0}
              icon={Activity}
            />
          </div>

          <TopLocationsCard data={data} />
          <CustomerBehaviorCard data={data} />
          <TopProductsCard data={data} />
        </div>

        <LiveWorldMap
          points={mapPoints}
          className="order-first lg:order-none"
        />
      </div>

      {/* Funil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Funil das últimas 24 horas
          </CardTitle>
          <CardDescription>
            Sessões únicas que chegaram a cada etapa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {data?.funnel.map((step, i) => {
            const prev = i > 0 ? data.funnel[i - 1].count : null;
            const rate =
              prev && prev > 0 ? Math.round((step.count / prev) * 100) : null;
            return (
              <div key={step.event} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold">{step.count}</span>
                    {rate !== null && (
                      <Badge
                        variant={
                          rate >= 50
                            ? "success"
                            : rate >= 20
                              ? "warning"
                              : "muted"
                        }
                      >
                        {rate}%
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(2, (step.count / Math.max(1, data.funnel[0]?.count ?? 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sessões ativas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pessoas online agora</CardTitle>
            <CardDescription>
              Sessões anónimas com atividade nos últimos 5 minutos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.sessions.length ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Ninguém online neste momento.
                <br />
                <span className="text-xs">
                  Abra a sua landing page noutro separador para ver aparecer
                  aqui.
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                {data.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="bg-success size-2 shrink-0 animate-pulse rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.currentPage ?? "—"}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="flex items-center gap-1">
                          <DeviceIcon type={s.deviceType} />
                          {s.browser}
                        </span>
                        <span>·</span>
                        <span>
                          {s.countryCode ?? "??"}
                          {s.city ? ` · ${s.city}` : ""}
                        </span>
                        <span>·</span>
                        <span>{formatDuration(s.durationSeconds)}</span>
                        {s.utmSource && (
                          <>
                            <span>·</span>
                            <Badge variant="info" className="text-[11px]">
                              {s.utmSource}
                            </Badge>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                      {s.anonymousId.slice(0, 6)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feed de eventos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed de eventos</CardTitle>
            <CardDescription>Últimas ações dos visitantes</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.events.length ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Ainda sem eventos registados.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {data.events.map((e) => {
                  const Icon = EVENT_ICON[e.eventName] ?? Activity;
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          EVENT_TONE[e.eventName] ?? "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {EVENT_LABEL[e.eventName] ?? e.eventName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {e.page ?? ""}
                          {e.countryCode ? ` · ${e.countryCode}` : ""}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {timeAgo(e.occurredAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
