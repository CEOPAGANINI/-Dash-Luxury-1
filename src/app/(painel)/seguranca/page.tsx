import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  demoRevenueByYear,
  demoRevenueCurrentWeek,
} from "@/lib/demo-data";
import { buildExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";
import { unifiedDemoData } from "@/features/unified-dashboard/demo-data";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import { getGuardrails } from "@/features/guardrails/queries";
import {
  avaliarGuardrails,
  type Decisao,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";
import { GuardrailsForm } from "@/features/guardrails/guardrails-form";
import { VereditoBadge } from "@/features/guardrails/veredito-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Segurança" };
export const dynamic = "force-dynamic";

/*
  Segurança baseada em lucro.

  A página tem três partes, nesta ordem, porque é assim que alguém a lê:
  primeiro o que o freio decidiria AGORA com os números de hoje; depois a
  mesma decisão por rede, para ver de onde vem o problema; e só então as
  regras, para ajustar quando a decisão não bate com o que a pessoa faria.

  Os números de hoje vêm do mesmo modelo da Visão geral — a mesma leitura,
  os mesmos 7 dias. Quando a sincronização real entrar, é só a fonte que
  muda; a decisão continua sendo desta página.
*/

const ORDEM_REGRAS: {
  regra: keyof ProfitGuardrails | "nenhuma";
  titulo: string;
  texto: string;
}[] = [
  {
    regra: "pausarDiaNegativo",
    titulo: "1. Prejuízo repetido",
    texto:
      "Se o resultado fechou negativo pelos dias tolerados, a verba para. Nenhuma outra regra é olhada.",
  },
  {
    regra: "roasPausa",
    titulo: "2. ROAS de pausa",
    texto:
      "Cada real de mídia devolvendo menos de um real é prejuízo na certa. Para.",
  },
  {
    regra: "roasMinimo",
    titulo: "3. ROAS mínimo",
    texto:
      "Devolve mais que um real, mas menos que o mínimo. A verba deve cair até voltar à faixa.",
  },
  {
    regra: "gastoMaximoDia",
    titulo: "4. Teto diário",
    texto: "Encostou no teto de gasto do dia: nada sobe, mesmo com retorno bom.",
  },
  {
    regra: "margemMinima",
    titulo: "5. Margem mínima",
    texto:
      "ROAS bom com margem magra é escala que não vira lucro. A verba fica como está.",
  },
  {
    regra: "nenhuma",
    titulo: "6. Tudo passou",
    texto:
      "Pode escalar, dentro do aumento máximo — e acima do valor de aprovação, alguém confirma antes.",
  },
];

function Numero({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: string;
  tom?: "success" | "warning" | "destructive";
}) {
  return (
    <div className="bg-muted/20 min-w-0 rounded-xl border px-3 py-2.5">
      <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
        {rotulo}
      </span>
      <span
        className={cn(
          "mt-1 block text-lg leading-6 font-extrabold tracking-tight tabular-nums",
          tom === "success" && "text-success",
          tom === "warning" && "text-warning",
          tom === "destructive" && "text-destructive",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

function DecisaoDoDia({
  decisao,
  leitura,
}: {
  decisao: Decisao;
  leitura: { gasto: number; receita: number; lucro: number; margem: number };
}) {
  return (
    <Card className="gap-4 py-5">
      <CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[0.6875rem] font-extrabold tracking-[0.12em] uppercase">
              Decisão de hoje · últimos 7 dias
            </p>
            <h3 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight sm:text-xl">
              O freio de mão diz:
              <VereditoBadge
                veredito={decisao.veredito}
                className="px-2.5 py-1 text-sm"
              />
            </h3>
            <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
              {decisao.motivo}
            </p>
          </div>
          {decisao.veredito === "escalar" && (
            <div className="shrink-0 text-right">
              <span className="text-muted-foreground block text-[0.6875rem] font-extrabold tracking-wide uppercase">
                Aumento liberado
              </span>
              <span className="text-success block text-2xl font-extrabold tabular-nums">
                +{formatCurrency(decisao.aumentoEmReais)}
              </span>
              {decisao.exigeAprovacao && (
                <Badge variant="warning" className="mt-1">
                  Aguarda aprovação
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <Numero rotulo="Gasto em mídia" valor={formatCurrency(leitura.gasto)} />
          <Numero rotulo="Receita líquida" valor={formatCurrency(leitura.receita)} />
          <Numero
            rotulo="ROAS"
            valor={formatRatio(decisao.roas)}
            tom={
              decisao.regra === "roasPausa"
                ? "destructive"
                : decisao.regra === "roasMinimo"
                  ? "warning"
                  : "success"
            }
          />
          <Numero
            rotulo="Margem"
            valor={formatPercent(leitura.margem)}
            tom={decisao.regra === "margemMinima" ? "warning" : undefined}
          />
          <Numero
            rotulo="Lucro de contribuição"
            valor={formatCurrency(leitura.lucro)}
            tom={leitura.lucro < 0 ? "destructive" : "success"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SegurancaPage() {
  const { regras, persistidas } = await getGuardrails();
  const bancoConfigurado = isDatabaseConfigured();

  const { snapshot } = buildExecutiveDashboardModel({
    days: demoRevenueByYear,
    anchorDays: demoRevenueCurrentWeek,
    period: "7d",
  });

  const leitura = {
    gasto: snapshot.gastoMidia,
    receita: snapshot.receitaLiquida,
    lucro: snapshot.lucroContribuicao,
    margem: snapshot.margemContribuicao,
    diasSeguidosNegativos: snapshot.lucroContribuicao < 0 ? 1 : 0,
  };
  const decisao = avaliarGuardrails(leitura, regras);

  /* A mesma régua, rede por rede: é aqui que se vê de onde vem o problema
     quando a decisão geral não agrada. */
  const redes = unifiedDemoData.operations.alpha.networks.map((rede) => {
    const margem =
      rede.checkoutRevenue > 0 ? rede.profit / rede.checkoutRevenue : 0;
    return {
      rede,
      margem,
      decisao: avaliarGuardrails(
        {
          gasto: rede.spend,
          receita: rede.checkoutRevenue,
          lucro: rede.profit,
          margem,
          diasSeguidosNegativos: rede.profit < 0 ? 1 : 0,
        },
        regras,
      ),
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
            Freio de mão
          </p>
          <h2 className="mt-1 text-[clamp(1.75rem,1.4rem+1vw,2.6rem)] leading-none font-extrabold tracking-[-0.045em]">
            Segurança baseada em lucro
          </h2>
          <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
            Regras que decidem, pelos números, se a verba de anúncio pode
            subir, deve ficar, cair ou parar. Qualquer agente que venha a
            mexer em orçamento passa por aqui antes — e é a decisão desta
            página que vale.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={persistidas ? "success" : "warning"}>
            {persistidas ? "Regras salvas" : "Regras padrão"}
          </Badge>
          <Badge variant={bancoConfigurado ? "success" : "muted"}>
            {bancoConfigurado ? "Banco conectado" : "Sem banco"}
          </Badge>
        </div>
      </header>

      <DecisaoDoDia decisao={decisao} leitura={leitura} />

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
              Por rede
            </span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">
              A mesma régua em cada rede
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Onde a verba pode subir e onde ela deve parar. Cada linha é uma
              decisão separada, com o motivo.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/campanhas">
              Ver campanhas <ArrowRight />
            </Link>
          </Button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
              <tr>
                <th className="border-b px-4 py-3 font-extrabold">Rede</th>
                <th className="border-b px-3 py-3 text-right font-extrabold">Gasto</th>
                <th className="border-b px-3 py-3 text-right font-extrabold">Receita</th>
                <th className="border-b px-3 py-3 text-right font-extrabold">ROAS</th>
                <th className="border-b px-3 py-3 text-right font-extrabold">Margem</th>
                <th className="border-b px-3 py-3 font-extrabold">Decisão</th>
                <th className="border-b px-3 py-3 font-extrabold">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {redes.map(({ rede, margem, decisao: d }) => (
                <tr key={rede.id} className="hover:bg-muted/20">
                  <td className="border-b px-4 py-3">
                    <span className="flex items-center gap-2">
                      <i
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: rede.color }}
                      />
                      <b>{rede.name}</b>
                    </span>
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatCurrency(rede.spend)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatCurrency(rede.checkoutRevenue)}
                  </td>
                  <td className="border-b px-3 py-3 text-right tabular-nums">
                    {formatRatio(d.roas)}
                  </td>
                  <td
                    className={cn(
                      "border-b px-3 py-3 text-right tabular-nums",
                      margem < 0 && "text-destructive",
                    )}
                  >
                    {formatPercent(margem)}
                  </td>
                  <td className="border-b px-3 py-3">
                    <VereditoBadge veredito={d.veredito} />
                  </td>
                  <td className="text-muted-foreground max-w-md border-b px-3 py-3 text-xs leading-5">
                    {d.motivo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-card overflow-hidden rounded-2xl border">
        <header className="flex items-start gap-2.5 border-b px-4 py-3">
          <span
            aria-hidden
            className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border"
          >
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
              Regras
            </span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">
              Ajustar o freio de mão
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Cada campo diz o que faz. Salvou, a decisão acima e os alertas
              passam a usar o novo valor.
            </p>
          </div>
        </header>
        <div className="px-4 py-4">
          <GuardrailsForm regras={regras} persistidas={persistidas} />
        </div>
      </section>

      <section className="bg-card overflow-hidden rounded-2xl border">
        <header className="flex items-start gap-2.5 border-b px-4 py-3">
          <span
            aria-hidden
            className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border"
          >
            <ListChecks className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
              Como decide
            </span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">
              A ordem das regras
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Da mais restritiva para a menos. A primeira que dispara decide —
              a marcada é a que decidiu hoje.
            </p>
          </div>
        </header>
        <ol className="divide-border/60 grid divide-y md:grid-cols-2 md:divide-y-0 xl:grid-cols-3">
          {ORDEM_REGRAS.map((item) => {
            const ativa = item.regra === decisao.regra;
            return (
              <li
                key={item.titulo}
                className={cn(
                  "flex items-start gap-2.5 px-4 py-3",
                  ativa && "bg-muted/30",
                )}
              >
                <ShieldCheck
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    ativa ? "text-foreground" : "text-muted-foreground/50",
                  )}
                />
                <span className="min-w-0">
                  <b className="flex items-center gap-2 text-sm leading-5 font-extrabold">
                    {item.titulo}
                    {ativa && <Badge variant="outline">decidiu hoje</Badge>}
                  </b>
                  <span className="text-muted-foreground block text-xs leading-5">
                    {item.texto}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
