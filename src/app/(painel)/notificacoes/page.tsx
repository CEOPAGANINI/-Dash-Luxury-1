import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  Database,
  Gauge,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Target,
  TrendingDown,
  XCircle,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { listNotifications } from "@/features/notifications/queries";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import { avaliarAgora } from "@/features/notifications/avaliar-agora";
import { GerarAvisosButton } from "@/features/notifications/gerar-button";
import type { Severidade } from "@/features/notifications/rules";
import { getPushcutStatus } from "@/features/notifications/pushcut";
import {
  testPushcutAction,
  togglePushcutAction,
} from "@/features/notifications/pushcut-actions";
import { PushcutForm } from "@/features/notifications/pushcut-form";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Notificações" };
export const dynamic = "force-dynamic";

const EVENT_ICON: Record<string, React.ElementType> = {
  payment_approved: CreditCard,
  payment_refused: XCircle,
  payment_pending: CreditCard,
  order_created: ShoppingBag,
  refund: RotateCcw,
  chargeback: AlertTriangle,
  webhook_error: AlertTriangle,
  profit_negative: TrendingDown,
  margin_low: TrendingDown,
  guardrail: ShieldAlert,
  goal_behind: Target,
};

const EVENT_TONE: Record<string, string> = {
  payment_approved: "text-success",
  payment_refused: "text-destructive",
  payment_pending: "text-warning",
  order_created: "text-info",
  refund: "text-muted-foreground",
  chargeback: "text-destructive",
  webhook_error: "text-destructive",
  profit_negative: "text-destructive",
  margin_low: "text-warning",
  guardrail: "text-warning",
  goal_behind: "text-warning",
};

const SEVERIDADE: Record<
  Severidade,
  { label: string; variant: "destructive" | "warning" | "info" }
> = {
  critico: { label: "Crítico", variant: "destructive" },
  atencao: { label: "Atenção", variant: "warning" },
  informativo: { label: "Informativo", variant: "info" },
};

/*
  Notificações.

  Duas fontes alimentam esta página: os eventos do gateway (cada pagamento
  confirmado ou recusado vira um aviso) e as regras — que leem os números
  do painel e avisam quando algo pede atenção antes de virar prejuízo.

  A prévia das regras aparece sempre, com ou sem banco: é o que elas
  diriam agora. O botão grava na lista o que ainda não está lá.
*/
export default async function NotificacoesPage() {
  const bancoConfigurado = isDatabaseConfigured();

  const [{ avisos, regrasPersistidas }, rows, pushcut] = await Promise.all([
    avaliarAgora(),
    bancoConfigurado ? listNotifications() : Promise.resolve([]),
    bancoConfigurado ? getPushcutStatus() : Promise.resolve(null),
  ]);
  const unread = rows.filter((n) => !n.readAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Notificações</h2>
          <p className="text-muted-foreground text-sm">
            {bancoConfigurado
              ? `${unread.length > 0 ? `${unread.length} por ler` : "Tudo lido"} · geradas pelos eventos do gateway e pelas regras do painel`
              : "Sem banco, a lista fica vazia — mas as regras já mostram abaixo o que avisariam agora."}
          </p>
        </div>
        {unread.length > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button variant="outline" type="submit">
              <CheckCheck /> Marcar todas como lidas
            </Button>
          </form>
        )}
      </div>

      {/* As regras: o que elas diriam agora. */}
      <section className="bg-card overflow-hidden rounded-2xl border">
        <header className="flex items-start gap-2.5 border-b px-4 py-3">
          <span
            aria-hidden
            className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border"
          >
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
              Regras do painel
            </span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">
              O que as regras avisariam agora
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Lidas dos últimos 7 dias da Visão geral, com o freio de mão de{" "}
              <Link href="/seguranca" className="font-bold underline-offset-2 hover:underline">
                Segurança
              </Link>
              {regrasPersistidas ? "" : " (regras padrão)"}. Cada aviso é gravado uma vez a cada 24 horas.
            </p>
          </div>
          <Badge variant={avisos.length === 0 ? "success" : "warning"}>
            {avisos.length === 0 ? "Nada a avisar" : `${avisos.length} aviso(s)`}
          </Badge>
        </header>

        {avisos.length === 0 ? (
          <p className="text-muted-foreground px-4 py-4 text-sm">
            Nenhuma regra disparou: chargeback, margem, lucro, aprovação e
            meta estão dentro do esperado.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {avisos.map((a) => {
              const Icon = EVENT_ICON[a.eventType] ?? Bell;
              return (
                <li key={a.chave} className="flex items-start gap-3 px-4 py-3">
                  <Icon
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-4.5 shrink-0",
                      EVENT_TONE[a.eventType] ?? "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <Badge variant={SEVERIDADE[a.severidade].variant}>
                        {SEVERIDADE[a.severidade].label}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                      {a.body}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={a.href}>Abrir</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t px-4 py-3">
          <GerarAvisosButton disabled={!bancoConfigurado || avisos.length === 0} />
        </div>
      </section>

      {!bancoConfigurado && (
        <EmptyState
          icon={Database}
          title="Banco de dados não conectado"
          description="Configure o Supabase para guardar a lista de notificações e receber os avisos do gateway."
          className="min-h-[220px]"
        />
      )}

      {/* Pushcut */}
      {pushcut && (
        <div id="pushcut" className="scroll-mt-20 space-y-3">
          <PushcutForm status={pushcut} />

          {pushcut.configured && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm">
              <Badge variant={pushcut.isActive ? "success" : "muted"}>
                {pushcut.isActive ? "Ativo" : "Pausado"}
              </Badge>
              {pushcut.lastEventAt && (
                <span className="text-muted-foreground text-xs">
                  Último envio: {formatDateTime(pushcut.lastEventAt)}
                </span>
              )}
              {pushcut.lastError && (
                <span className="text-destructive text-xs">
                  {pushcut.lastError}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <form action={testPushcutAction}>
                  <Button size="sm" variant="outline" type="submit">
                    Enviar teste
                  </Button>
                </form>
                <form action={togglePushcutAction}>
                  <input
                    type="hidden"
                    name="active"
                    value={String(!pushcut.isActive)}
                  />
                  <Button size="sm" variant="ghost" type="submit">
                    {pushcut.isActive ? "Pausar" : "Reativar"}
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {bancoConfigurado &&
        (rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação ainda"
            description="Quando um pagamento for confirmado, recusado, houver erro de webhook ou uma regra disparar, aparece aqui."
            className="min-h-[320px]"
          />
        ) : (
          <div className="space-y-2">
            {rows.map((n) => {
              const Icon = EVENT_ICON[n.eventType] ?? Bell;
              const isUnread = !n.readAt;

              return (
                <Card
                  key={n.id}
                  className={cn(
                    "py-4",
                    isUnread && "border-primary/40 bg-accent/20",
                  )}
                >
                  <CardContent className="flex flex-wrap items-start gap-3 px-4">
                    <Icon
                      className={cn(
                        "mt-0.5 size-5 shrink-0",
                        EVENT_TONE[n.eventType] ?? "text-muted-foreground",
                      )}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{n.title}</p>
                        {isUnread && <Badge variant="info">Nova</Badge>}
                        {n.valueCents !== null && (
                          <Badge variant={n.valueCents < 0 ? "destructive" : "success"}>
                            {formatMoney(n.valueCents)}
                          </Badge>
                        )}
                      </div>
                      {n.body && (
                        <p className="text-muted-foreground mt-0.5 text-sm">
                          {n.body}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatDateTime(n.createdAt)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {n.href && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={n.href}>Abrir</Link>
                        </Button>
                      )}
                      {isUnread && (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="id" value={n.id} />
                          <Button size="sm" variant="ghost" type="submit">
                            <CheckCheck />
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
    </div>
  );
}
