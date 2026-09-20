"use client";

import type { AcquisitionRow, CampaignRow } from "@/domain/analytics";
import {
  formatCompactCurrency,
  formatPercent,
  formatRatio,
} from "@/shared/formatters/dashboard";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** O que fazer com a campanha, dito como se fala. */
const ACTION_LABEL: Record<CampaignRow["action"], string> = {
  Escalar: "Pode investir mais",
  Manter: "Deixar como está",
  Reduzir: "Está dando prejuízo",
  Validar: "Vale investigar",
};

const ACTION_VARIANT: Record<
  CampaignRow["action"],
  "success" | "muted" | "destructive" | "warning"
> = {
  Escalar: "success",
  Manter: "muted",
  Reduzir: "destructive",
  Validar: "warning",
};

/**
 * O caminho do dinheiro dentro de cada rede: quanto cada campanha gastou,
 * quanto trouxe e o que sobrou. É o nível entre a rede (Face, Google,
 * YouTube) e o criativo — sem ele não dá para saber de onde, dentro da
 * rede, vem o lucro ou o prejuízo.
 */
export function CampaignBreakdown({
  networks,
  campaigns,
}: {
  networks: AcquisitionRow[];
  campaigns: CampaignRow[];
}) {
  const visiveis = networks.filter((network) =>
    campaigns.some((campaign) => campaign.channel === network.name),
  );

  if (visiveis.length === 0) return null;

  return (
    <Card id="campaign-breakdown" className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-lg">Campanhas de cada rede</CardTitle>
        <CardDescription className="mt-1 max-w-3xl">
          Dentro de cada rede, quanto cada campanha gastou em anúncio, quanto
          trouxe de venda e o que sobrou depois de pagar essa mídia.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-5">
        {visiveis.map((network) => {
          const doCanal = campaigns.filter(
            (campaign) => campaign.channel === network.name,
          );

          return (
            <section
              key={network.name}
              aria-label={`Campanhas de ${network.name}`}
            >
              {/* Cabeçalho da rede: o total, para comparar com as partes. */}
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-2">
                <h4 className="flex items-center gap-2 text-base font-bold">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: network.color }}
                    aria-hidden
                  />
                  {network.name}
                </h4>
                <p className="text-muted-foreground text-sm">
                  Gastou{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCompactCurrency(network.spend)}
                  </strong>{" "}
                  e trouxe{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCompactCurrency(network.revenue)}
                  </strong>
                </p>
              </div>

              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
                {doCanal.map((campaign) => {
                  const positiva = campaign.contribution >= 0;

                  return (
                    <div
                      key={campaign.id}
                      className="rounded-xl border p-3.5 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug font-bold">
                          {campaign.name}
                        </p>
                        <Badge
                          variant={ACTION_VARIANT[campaign.action]}
                          className="shrink-0 text-xs"
                        >
                          {ACTION_LABEL[campaign.action]}
                        </Badge>
                      </div>

                      {/* A frase que resume a campanha em dinheiro. */}
                      <p className="mt-2 text-sm leading-6">
                        Gastou{" "}
                        <strong className="tabular-nums">
                          {formatCompactCurrency(campaign.spend)}
                        </strong>{" "}
                        e trouxe{" "}
                        <strong className="tabular-nums">
                          {formatCompactCurrency(campaign.revenue)}
                        </strong>
                        .
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-sm font-bold",
                          positiva ? "text-success" : "text-destructive",
                        )}
                      >
                        {positiva ? "Sobraram " : "Faltaram "}
                        <span className="tabular-nums">
                          {formatCompactCurrency(
                            Math.abs(campaign.contribution),
                          )}
                        </span>
                      </p>

                      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-2.5 text-sm">
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Cada R$ 1 virou
                          </dt>
                          <dd className="font-bold tabular-nums">
                            {formatRatio(campaign.roas)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">ROI</dt>
                          <dd className="font-bold tabular-nums">
                            {formatPercent(campaign.roi)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-xs">
                            Custo por venda
                          </dt>
                          <dd className="font-bold tabular-nums">
                            {formatCompactCurrency(campaign.cpa)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
