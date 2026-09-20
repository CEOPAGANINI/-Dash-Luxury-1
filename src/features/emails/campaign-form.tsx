"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Send, TestTube } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  sendCampaignAction,
  type EmailActionResult,
} from "@/features/emails/actions";
import { SEGMENTS, type SegmentKey } from "@/features/emails/types";
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

const VARIABLES = [
  { token: "{{PRIMEIRO_NOME}}", desc: "Primeiro nome" },
  { token: "{{NOME}}", desc: "Nome completo" },
  { token: "{{EMAIL}}", desc: "E-mail" },
  { token: "{{LOJA_URL}}", desc: "Endereço da loja" },
];

export function CampaignForm({
  counts,
  resendReady,
}: {
  counts: Record<string, number>;
  resendReady: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    EmailActionResult | null,
    FormData
  >(sendCampaignAction, null);
  const [segment, setSegment] = React.useState<SegmentKey>("pending");
  const [mode, setMode] = React.useState<"test" | "send">("test");

  const total = counts[segment] ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Novo disparo</CardTitle>
        <CardDescription>
          Escolha o segmento, escreva a mensagem e envie primeiro um teste para
          si.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="mode" value={mode} />

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

          {/* Segmento */}
          <div className="space-y-2">
            <Label>Destinatários</Label>
            <input type="hidden" name="segment" value={segment} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SEGMENTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSegment(s.key)}
                  className={cn(
                    "rounded-lg border-2 p-3 text-left transition-colors",
                    segment === s.key
                      ? "border-primary bg-accent/40"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className="text-primary text-sm font-bold">
                      {counts[s.key] ?? 0}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {s.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Assunto</Label>
            <Input
              id="subject"
              name="subject"
              placeholder="Ex.: A sua referência Multibanco ainda está válida"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Mensagem</Label>
            <textarea
              id="body"
              name="body"
              rows={8}
              required
              defaultValue={"Olá {{PRIMEIRO_NOME}},\n\n"}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
            <p className="text-muted-foreground text-xs">
              Variáveis disponíveis:{" "}
              {VARIABLES.map((v) => (
                <code
                  key={v.token}
                  className="bg-muted mr-1 rounded px-1 py-0.5 font-mono text-[11px]"
                  title={v.desc}
                >
                  {v.token}
                </code>
              ))}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testEmail">E-mail para receber o teste</Label>
            <Input
              id="testEmail"
              name="testEmail"
              type="email"
              placeholder="voce@exemplo.pt"
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="submit"
              variant="outline"
              loading={pending && mode === "test"}
              disabled={!resendReady}
              onClick={() => setMode("test")}
            >
              <TestTube /> Enviar teste
            </Button>
            <Button
              type="submit"
              loading={pending && mode === "send"}
              disabled={!resendReady || total === 0}
              onClick={() => setMode("send")}
            >
              <Send /> Enviar para {total}{" "}
              {total === 1 ? "cliente" : "clientes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
