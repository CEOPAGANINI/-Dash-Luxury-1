"use client";

import {
  Activity,
  Ban,
  BrainCircuit,
  FlaskConical,
  GitCompareArrows,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";

const items = [
  {
    key: "anomaly",
    label: "Detecção de anomalias",
    status: "Ativa e explicável",
    variant: "success" as const,
    icon: Activity,
    description:
      "Combina limites de negócio, variação histórica e volume mínimo. Não dispara por oscilação pequena isolada.",
  },
  {
    key: "forecast",
    label: "Previsão financeira",
    status: "Aguardando histórico real",
    variant: "warning" as const,
    icon: BrainCircuit,
    description:
      "Não gera previsão fictícia. Requer série real, erro histórico, horizonte e intervalo de confiança.",
  },
  {
    key: "causality",
    label: "Causalidade",
    status: "Não confirmada",
    variant: "muted" as const,
    icon: FlaskConical,
    description:
      "As causas exibidas são associações. Confirmação exige teste A/B, holdout, lift ou desenho quase experimental.",
  },
  {
    key: "incrementality",
    label: "Incrementalidade",
    status: "Estimativa demonstrativa",
    variant: "info" as const,
    icon: GitCompareArrows,
    description:
      "Atribuição de plataforma, first-party, assistida e incremental permanecem separadas para evitar dupla contagem.",
  },
];

export function AdvancedAnalyticsReadiness({
  model,
}: {
  model: ExecutiveDashboardModel;
}) {
  const volume = model.snapshot.pedidos;

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              Camada de ciência de dados
            </CardTitle>
            <CardDescription className="mt-1">
              Modelos só são liberados quando dados, amostra e validação
              suportam a conclusão.
            </CardDescription>
          </div>
          <Badge variant={volume >= 180 ? "success" : "warning"}>
            {volume.toLocaleString("pt-BR")} pedidos na amostra
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                <item.icon className="size-4" />
              </span>
              <Badge variant={item.variant}>{item.status}</Badge>
            </div>
            <h3 className="mt-3 text-sm font-bold">{item.label}</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {item.description}
            </p>
          </article>
        ))}
        <div className="bg-muted/45 md:col-span-2 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5">
          <Ban className="text-warning mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Proteção executiva:</strong> nenhuma recomendação de
            orçamento é automatizada enquanto custos, atribuição e qualidade das
            fontes estiverem marcados como estimados ou provisórios.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
