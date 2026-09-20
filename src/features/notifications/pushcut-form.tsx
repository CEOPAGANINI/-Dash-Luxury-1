"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Smartphone } from "lucide-react";

import {
  savePushcutAction,
  type PushcutActionResult,
} from "@/features/notifications/pushcut-actions";
import type { PushcutStatus } from "@/features/notifications/pushcut";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const EVENTS = [
  {
    value: "payment_approved",
    label: "Pagamento confirmado",
    hint: "a venda que interessa",
  },
  { value: "payment_refused", label: "Pagamento recusado ou expirado" },
  { value: "refund", label: "Reembolso" },
  { value: "chargeback", label: "Chargeback" },
  { value: "webhook_error", label: "Erro de webhook" },
];

export function PushcutForm({ status }: { status: PushcutStatus }) {
  const [state, formAction, pending] = useActionState<
    PushcutActionResult | null,
    FormData
  >(savePushcutAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4" /> Pushcut — push no telemóvel
        </CardTitle>
        <CardDescription>
          Receba um alerta no iPhone ou Apple Watch a cada venda confirmada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          <AlertCircle />
          <AlertDescription>
            Na app Pushcut: crie uma <strong>Notification</strong> (dê-lhe um
            nome, ex.: <code className="font-mono text-xs">Venda</code>) e copie
            a chave em <strong>Account → API key</strong>. Cole os dois abaixo.
          </AlertDescription>
        </Alert>

        <form action={formAction} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.ok && state.message && (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Chave de API</Label>
              <Input
                id="apiKey"
                name="apiKey"
                type="password"
                placeholder={
                  status.configured ? "•••••••• (já guardada)" : "Cole aqui"
                }
                required
              />
              <p className="text-muted-foreground text-xs">
                Guardada cifrada. Nunca chega ao navegador.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notificationName">Nome da notificação</Label>
              <Input
                id="notificationName"
                name="notificationName"
                placeholder="Venda"
                defaultValue={status.notificationName}
                required
              />
              <p className="text-muted-foreground text-xs">
                Exatamente como está na app Pushcut.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Avisar quando</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVENTS.map((e) => (
                <label key={e.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="events"
                    value={e.value}
                    defaultChecked={status.events.includes(e.value)}
                    className="accent-primary mt-0.5 size-4"
                  />
                  <span>
                    {e.label}
                    {e.hint && (
                      <span className="text-muted-foreground block text-xs">
                        {e.hint}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" loading={pending}>
            {status.configured ? "Atualizar e testar" : "Ligar e enviar teste"}
          </Button>
          <p className="text-muted-foreground text-xs">
            Ao guardar, enviamos um push real de confirmação — se algo estiver
            errado, você descobre agora e não numa venda.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
