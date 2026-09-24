"use client";

import * as React from "react";
import { CheckCircle2, CircleDot, Clock3, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BlockPicker } from "@/components/ui/block-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecutiveRisk } from "@/domain/analytics";
import { formatCompactCurrency } from "@/shared/formatters/dashboard";

const statuses = [
  "Novo",
  "Analisando",
  "Aprovado",
  "Executando",
  "Concluído",
  "Descartado",
] as const;
type PlanStatus = (typeof statuses)[number];

function statusIcon(status: PlanStatus) {
  if (status === "Concluído")
    return <CheckCircle2 className="text-success size-4" />;
  if (status === "Executando")
    return <PlayCircle className="text-info size-4" />;
  if (status === "Analisando" || status === "Aprovado")
    return <Clock3 className="text-warning size-4" />;
  return <CircleDot className="text-muted-foreground size-4" />;
}

export function ExecutiveActionPlan({ risks }: { risks: ExecutiveRisk[] }) {
  const [plan, setPlan] = React.useState<Record<string, PlanStatus>>(() =>
    Object.fromEntries(risks.map((risk) => [risk.id, "Novo"])),
  );

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("dashboard-ceo-action-plan");
      if (saved) {
        const restored = JSON.parse(saved) as Record<string, PlanStatus>;
        // Leitura do armazenamento só depois de montar, para o servidor e o
        // navegador desenharem a mesma primeira tela.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlan((current) => ({ ...current, ...restored }));
      }
    } catch {
      // O plano continua funcional em memória quando o armazenamento está indisponível.
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        "dashboard-ceo-action-plan",
        JSON.stringify(plan),
      );
    } catch {
      // Falha de armazenamento não bloqueia a tomada de decisão na sessão atual.
    }
  }, [plan]);

  /* Risco novo sem status ainda conta como "Novo" — derivado na leitura,
     sem um efeito que dispare outro render. */
  const planoCompleto = React.useMemo(() => {
    const next = { ...plan };
    risks.forEach((risk) => {
      if (!next[risk.id]) next[risk.id] = "Novo";
    });
    return next;
  }, [plan, risks]);

  function advance(id: string) {
    setPlan((current) => {
      const status = current[id] ?? "Novo";
      const index = statuses.indexOf(status);
      const next =
        statuses[Math.min(index + 1, statuses.length - 2)] ?? "Executando";
      return { ...current, [id]: next };
    });
  }

  return (
    <Card id="action-plan" className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Plano de ação executivo</CardTitle>
            <CardDescription className="mt-1">
              Converte diagnóstico em responsabilidade, prazo e acompanhamento.
            </CardDescription>
          </div>
          <Badge variant="outline">{risks.length} {risks.length === 1 ? "ação" : "ações"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-5">
        {risks.map((risk) => {
          const status = planoCompleto[risk.id] ?? "Novo";
          return (
            <article
              key={risk.id}
              className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(0,1fr)_150px_140px_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{risk.severity}</Badge>
                  <span className="text-muted-foreground text-xs">
                    Confiança {risk.confidence}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-bold">{risk.action}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {risk.owner} · {risk.horizon} · impacto{" "}
                  {formatCompactCurrency(risk.impact)}
                </p>
              </div>
              <div className="grid gap-1 text-xs font-semibold">
                Status
                <BlockPicker
                  ariaLabel={`Status de ${risk.action}`}
                  size="sm"
                  collapsible
                  value={status}
                  onChange={(v) =>
                    setPlan((current) => ({
                      ...current,
                      [risk.id]: v as PlanStatus,
                    }))
                  }
                  options={statuses.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                />
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {statusIcon(status)}
                {status}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => advance(risk.id)}
                disabled={status === "Concluído" || status === "Descartado"}
              >
                Avançar
              </Button>
            </article>
          );
        })}
      </CardContent>
    </Card>
  );
}
