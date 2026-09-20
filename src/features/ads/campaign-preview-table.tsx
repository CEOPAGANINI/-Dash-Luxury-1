import type * as React from "react";
import Link from "next/link";

import {
  avaliarGuardrails,
  VEREDITOS,
  type ProfitGuardrails,
  type Veredito,
} from "@/features/guardrails/rules";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { cn } from "@/lib/utils";
import {
  NETWORK_LABEL,
  STATUS_LABEL,
  derivadas,
  type AdMetrics,
  type AdStatus,
  type CampaignRow,
} from "./types";

/*
  A "tabela" de uma campanha: a linha no jeito de quadro de tarefas, com
  estado e freio em células coloridas e os números dos últimos 7 dias.
  Aparece ao passar o mouse no cartão e abre a página da campanha.
*/

export const CELULA_ESTADO: Record<AdStatus, string> = {
  active: "bg-success text-success-foreground",
  paused: "bg-warning text-warning-foreground",
  archived: "bg-muted text-muted-foreground",
};
export const CELULA_FREIO: Record<Veredito, string> = {
  escalar: "bg-success text-success-foreground",
  manter: "bg-[#909090] text-[#121212]",
  reduzir: "bg-warning text-warning-foreground",
  pausar: "bg-destructive text-destructive-foreground",
};

export function decisaoDaCampanha(m: AdMetrics, regras: ProfitGuardrails) {
  if (m.spendCents === 0) return null;
  const gasto = m.spendCents / 100;
  const receita = m.revenueCents / 100;
  return avaliarGuardrails(
    {
      gasto,
      receita,
      lucro: receita - gasto,
      margem: derivadas(m).margem ?? 0,
      diasSeguidosNegativos: receita - gasto < 0 ? 1 : 0,
    },
    regras,
  );
}

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) =>
  v === null ? "—" : formatCurrency(v / 100, v < 10_000 ? 2 : 0);

export function CampaignPreviewTable({
  campanha: c,
  regras,
  compacta = false,
}: {
  campanha: CampaignRow;
  regras: ProfitGuardrails;
  compacta?: boolean;
}) {
  const d = derivadas(c.metrics);
  const dec = decisaoDaCampanha(c.metrics, regras);
  const conversao = c.metrics.clicks > 0 ? c.metrics.purchases / c.metrics.clicks : null;
  const colunas: [string, React.ReactNode][] = [
    ["Estado", <span key="e" className={cn("block px-2 py-1 text-center text-xs font-bold", CELULA_ESTADO[c.status])}>{STATUS_LABEL[c.status]}</span>],
    ["Orç./dia", c.dailyBudgetCents === null ? "—" : formatCurrency(c.dailyBudgetCents / 100)],
    ["Freio", dec ? <span key="f" title={dec.motivo} className={cn("block px-2 py-1 text-center text-xs font-bold", CELULA_FREIO[dec.veredito])}>{VEREDITOS[dec.veredito].label}</span> : <span key="f" className="text-muted-foreground text-xs">sem gasto</span>],
    ["Gasto", cents(c.metrics.spendCents)],
    ["Receita", cents(c.metrics.revenueCents)],
    ["ROAS", <span key="r" className={cn("font-semibold", d.roas !== null && (d.roas < regras.roasPausa ? "text-destructive" : d.roas < regras.roasMinimo ? "text-warning" : "text-success"))}>{d.roas === null ? "—" : formatRatio(d.roas)}</span>],
    ["CPA", centsExatos(d.cpaCents)],
    ["Compras", c.metrics.purchases ? formatInteger(c.metrics.purchases) : "—"],
  ];
  if (!compacta) {
    colunas.push(
      ["Impressões", c.metrics.impressions ? formatInteger(c.metrics.impressions) : "—"],
      ["Cliques", c.metrics.clicks ? formatInteger(c.metrics.clicks) : "—"],
      ["CTR", d.ctr === null ? "—" : formatPercent(d.ctr, 2)],
      ["Conversão", conversao === null ? "—" : formatPercent(conversao, 2)],
      ["CPC", centsExatos(d.cpcCents)],
      ["CPM", centsExatos(d.cpmCents)],
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="text-muted-foreground text-center text-[0.6875rem] tracking-wide uppercase">
          <tr>
            <th className="border-r border-b px-2 py-1.5 text-left font-medium">Campanha</th>
            {colunas.map(([rotulo]) => (
              <th key={rotulo} className="border-r border-b px-2 py-1.5 font-medium last:border-r-0">{rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-r p-0">
              <Link
                href={`/campanhas/campanha/${encodeURIComponent(c.id)}${c.source === "demo" ? "" : "?modo=real"}`}
                className="bg-foreground/10 hover:bg-foreground/20 block px-2 py-1.5"
              >
                <b className="block truncate">{c.name}</b>
                <small className="text-muted-foreground">{NETWORK_LABEL[c.network]}{c.objective ? ` · ${c.objective}` : ""}</small>
              </Link>
            </td>
            {colunas.map(([rotulo, valor]) => (
              <td key={rotulo} className={cn("border-r text-center tabular-nums last:border-r-0", rotulo === "Estado" || rotulo === "Freio" ? "p-0" : "px-2 py-1.5")}>
                {valor}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
