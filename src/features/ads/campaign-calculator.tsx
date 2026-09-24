"use client";

import * as React from "react";
import { useCampaignDemo } from "./demo-store";
import { CampaignDemoControls } from "./campaign-demo-controls";
import Link from "next/link";
import {
  AlertOctagon,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Info,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProfitGuardrails } from "@/features/guardrails/rules";
import { VereditoBadge } from "@/features/guardrails/veredito-badge";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { cn } from "@/lib/utils";
import { diagnosticar, simular, type Gravidade } from "./diagnostico";
import {
  NETWORK_LABEL,
  STATUS_LABEL,
  type AdNetwork,
  type CampaignTree,
} from "./types";

/*
  A calculadora.

  Em cima, o que entra: a rede e as campanhas (uma, várias, ou todas da
  rede). Embaixo, o que sai: a nota, o placar do conjunto, os achados em
  três pilhas — falhas, pontos fracos, pontos fortes — e um simulador de
  verba. Tudo calculado no navegador, na hora, pelas regras de
  diagnostico.ts.
*/

const GRAVIDADE: Record<
  Gravidade,
  { label: string; icon: React.ElementType; classe: string; variant: "destructive" | "warning" | "success" | "info" }
> = {
  falha: { label: "Falhas", icon: AlertOctagon, classe: "text-destructive", variant: "destructive" },
  fraco: { label: "Pontos fracos", icon: AlertTriangle, classe: "text-warning", variant: "warning" },
  forte: { label: "Pontos fortes", icon: CheckCircle2, classe: "text-success", variant: "success" },
  info: { label: "Para saber", icon: Info, classe: "text-muted-foreground", variant: "info" },
};

const ORDEM_GRAVIDADE: Gravidade[] = ["falha", "fraco", "forte", "info"];

function Numero({ rotulo, valor, tom, nota }: { rotulo: string; valor: string; tom?: "success" | "warning" | "destructive"; nota?: string }) {
  return (
    <div className="bg-muted/20 min-w-0 rounded-xl border px-3 py-2.5">
      <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">{rotulo}</span>
      <span className={cn("mt-1 block text-lg leading-6 font-extrabold tracking-tight tabular-nums", tom === "success" && "text-success", tom === "warning" && "text-warning", tom === "destructive" && "text-destructive")}>
        {valor}
      </span>
      {nota && <span className="text-muted-foreground block text-[0.6875rem] leading-4">{nota}</span>}
    </div>
  );
}

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) => (v === null ? "—" : formatCurrency(v / 100, v < 10_000 ? 2 : 0));

export function CampaignCalculator({
  tree: suppliedTree,
  regras,
}: {
  tree: CampaignTree;
  regras: ProfitGuardrails;
}) {
  const simulation = useCampaignDemo();
  const tree = suppliedTree.modo === "demo" ? { ...suppliedTree, campanhas: simulation.rows } : suppliedTree;
  const [rede, setRede] = React.useState<AdNetwork | "all">("all");
  const [selecionadas, setSelecionadas] = React.useState<Set<string> | null>(null);
  const [variacao, setVariacao] = React.useState(20);
  const [margem, setMargem] = React.useState(40);

  const daRede = tree.campanhas.filter((c) => rede === "all" || c.network === rede);
  const escolhidas = daRede.filter((c) => selecionadas === null || selecionadas.has(c.id));
  const diagnostico = React.useMemo(() => diagnosticar(escolhidas, regras), [escolhidas, regras]);
  const cenario = simular(diagnostico.totais, variacao / 100, margem / 100);

  function alternar(id: string) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual ?? tree.campanhas.map((c) => c.id));
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }
  function soEsta(id: string) {
    setSelecionadas(new Set([id]));
  }
  function todasDaRede() {
    setSelecionadas(new Set(daRede.map((c) => c.id)));
  }

  const notaTom =
    diagnostico.rotulo === "Saudável" ? "success" : diagnostico.rotulo === "Atenção" ? "warning" : diagnostico.rotulo === "Crítico" ? "destructive" : undefined;

  return (
    <div className="space-y-4">
      {tree.modo === "demo" && <>
        <p className="campaign-note">Campanhas de exemplo, salvas só neste navegador · simular não altera nenhum orçamento.</p>
        <CampaignDemoControls page="calculadora" />
      </>}
      {/* O que entra */}
      <section className="bg-card overflow-hidden rounded-2xl border">
        <header className="flex items-start gap-2.5 border-b px-4 py-3">
          <span aria-hidden className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border">
            <Calculator className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">Calculadora</span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">O que está acontecendo com as campanhas</h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              Escolha a rede e marque uma, várias ou todas as campanhas. O diagnóstico lê os últimos 7 dias e explica cada elo: anúncio → clique → compra → dinheiro.
              {tree.modo === "demo" && " Números de demonstração."}
            </p>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {(
            [{ id: "all", label: "Todas as redes" }, ...(Object.keys(NETWORK_LABEL) as AdNetwork[]).map((id) => ({ id, label: NETWORK_LABEL[id] }))] as { id: AdNetwork | "all"; label: string }[]
          ).map((item) => (
            <Button key={item.id} size="sm" variant={rede === item.id ? "default" : "outline"} onClick={() => setRede(item.id)}>
              {item.label}
            </Button>
          ))}
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={todasDaRede}>Marcar todas</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())}>Limpar</Button>
          </span>
        </div>

        <ul className="grid gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
          {daRede.map((c) => {
            const marcada = selecionadas === null || selecionadas.has(c.id);
            const leitura = diagnostico.campanhas.find((l) => l.id === c.id);
            return (
              <li key={c.id} className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", marcada ? "border-foreground/40 bg-muted/30" : "bg-card")}>
                {/* O rótulo inteiro marca a campanha: o alvo é o cartão, não os 16px da caixa. */}
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={marcada} onChange={() => alternar(c.id)} aria-label={`Incluir ${c.name}`} className="accent-foreground mt-1 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{c.name}</b>
                    <span className="text-muted-foreground block text-[0.6875rem] leading-4">
                      {NETWORK_LABEL[c.network]} · {STATUS_LABEL[c.status]} · gasto {cents(c.metrics.spendCents)}
                    </span>
                    {marcada && leitura && leitura.metrics.spendCents > 0 && (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant={leitura.nota >= 75 ? "success" : leitura.nota >= 50 ? "warning" : "destructive"}>nota {leitura.nota}</Badge>
                        {leitura.decisao && <VereditoBadge veredito={leitura.decisao.veredito} />}
                      </span>
                    )}
                  </span>
                </label>
                <button type="button" onClick={() => soEsta(c.id)} className="text-muted-foreground hover:text-foreground min-h-8 shrink-0 px-2 text-xs font-bold underline-offset-2 hover:underline">
                  Analisar só esta<span className="sr-only">: {c.name}</span>
                </button>
              </li>
            );
          })}
          {daRede.length === 0 && (
            <li className="text-muted-foreground col-span-full py-6 text-center text-sm">Nenhuma campanha nesta rede.</li>
          )}
        </ul>
      </section>

      {/* O que sai */}
      {escolhidas.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed px-4 py-10 text-center text-sm">Marque ao menos uma campanha para ver o diagnóstico.</p>
      ) : (
        <>
          <section className="bg-card rounded-2xl border px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-[0.6875rem] font-extrabold tracking-[0.12em] uppercase">
                  Visão geral · {escolhidas.length} {escolhidas.length === 1 ? "campanha" : "campanhas"} · últimos 7 dias
                </p>
                <h3 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight sm:text-xl">
                  Nota {diagnostico.nota}
                  <Badge variant={notaTom ?? "muted"} className="px-2.5 py-1 text-sm">{diagnostico.rotulo}</Badge>
                  {diagnostico.decisao && <VereditoBadge veredito={diagnostico.decisao.veredito} className="px-2.5 py-1 text-sm" />}
                </h3>
                <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                  {diagnostico.comDados === 0
                    ? "Nenhuma das campanhas marcadas gastou nos últimos 7 dias — não há o que diagnosticar ainda."
                    : diagnostico.decisao?.motivo}
                </p>
              </div>
              <span className="text-muted-foreground text-xs">
                Regras do <Link href="/seguranca" className="font-bold underline-offset-2 hover:underline">freio de mão</Link>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <Numero rotulo="Gasto" valor={cents(diagnostico.totais.spendCents)} />
              <Numero rotulo="Receita" valor={cents(diagnostico.totais.revenueCents)} />
              <Numero
                rotulo="Sobra depois da mídia"
                valor={diagnostico.totais.spendCents ? formatCompactCurrency(diagnostico.lucroMidiaCents / 100) : "—"}
                tom={diagnostico.lucroMidiaCents < 0 ? "destructive" : "success"}
                nota="Antes de produto e taxas."
              />
              <Numero
                rotulo="ROAS"
                valor={diagnostico.derivadas.roas === null ? "—" : formatRatio(diagnostico.derivadas.roas)}
                tom={diagnostico.derivadas.roas === null ? undefined : diagnostico.derivadas.roas < regras.roasPausa ? "destructive" : diagnostico.derivadas.roas < regras.roasMinimo ? "warning" : "success"}
                nota={`Mínimo ${formatRatio(regras.roasMinimo, 1)}`}
              />
              <Numero rotulo="CTR" valor={diagnostico.derivadas.ctr === null ? "—" : formatPercent(diagnostico.derivadas.ctr, 2)} nota="Impressão → clique" />
              <Numero rotulo="Conversão" valor={diagnostico.conversao === null ? "—" : formatPercent(diagnostico.conversao, 2)} nota="Clique → compra" />
              <Numero rotulo="Compras" valor={diagnostico.totais.purchases ? formatInteger(diagnostico.totais.purchases) : "—"} />
              <Numero rotulo="CPA" valor={centsExatos(diagnostico.derivadas.cpaCents)} nota="Custo por venda" />
              <Numero rotulo="Ticket" valor={centsExatos(diagnostico.ticketCents)} nota="Receita por venda" />
              <Numero rotulo="CPC" valor={centsExatos(diagnostico.derivadas.cpcCents)} />
              <Numero rotulo="CPM" valor={centsExatos(diagnostico.derivadas.cpmCents)} />
              <Numero rotulo="Cliques" valor={diagnostico.totais.clicks ? formatInteger(diagnostico.totais.clicks) : "—"} />
            </div>
          </section>

          {/*
            Achados em pilhas.

            Fluxo em colunas, e não grade: os quatro montes têm alturas
            muito diferentes — um pode ter dois achados e o vizinho vinte.
            Numa grade de duas colunas a célula curta esticava até à altura
            da alta, e o cartão de "falha" ficava com 839px ocos por dentro.
            No fluxo em colunas cada cartão fica na sua altura natural e o
            conteúdo reparte-se sozinho entre as duas colunas.
          */}
          <div className="grid gap-4 lg:block lg:columns-2 lg:gap-x-4">
            {ORDEM_GRAVIDADE.map((g) => {
              const lista = diagnostico.achados.filter((a) => a.gravidade === g);
              const def = GRAVIDADE[g];
              const Icon = def.icon;
              return (
                <section
                  key={g}
                  /* break-inside-avoid: o cartão não pode ser partido ao
                     meio entre uma coluna e a outra. */
                  className="bg-card overflow-hidden rounded-2xl border lg:mb-4 lg:break-inside-avoid"
                >
                  <header className="flex items-center gap-2 border-b px-4 py-2.5">
                    <Icon aria-hidden className={cn("size-4", def.classe)} />
                    <b className="text-sm font-extrabold">{def.label}</b>
                    <Badge variant={lista.length ? def.variant : "muted"} className="ml-auto">{lista.length}</Badge>
                  </header>
                  {lista.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-4 text-xs">
                      {g === "falha" ? "Nenhuma falha grave — nada está perdendo dinheiro na certa." : g === "fraco" ? "Nenhum ponto fraco encontrado." : g === "forte" ? "Nenhum ponto forte se destacou ainda." : "Nada a acrescentar."}
                    </p>
                  ) : (
                    <ul className="divide-border/60 divide-y">
                      {lista.map((a) => (
                        <li key={a.id} className="px-4 py-3">
                          <p className="text-sm font-semibold">
                            {a.titulo}
                            {a.campanhaNome && escolhidas.length > 1 && (
                              <span className="text-muted-foreground ml-1.5 text-[0.6875rem] font-bold">· {a.campanhaNome}</span>
                            )}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs leading-5">{a.explicacao}</p>
                          <p className="mt-1 text-xs leading-5"><b>O que fazer:</b> {a.acao}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          {/* Por campanha */}
          {escolhidas.length > 1 && (
            <section className="bg-card overflow-hidden rounded-2xl border">
              <header className="border-b px-4 py-2.5">
                <b className="text-sm font-extrabold">Campanha por campanha</b>
                <p className="text-muted-foreground text-xs">A nota pesa cada elo; o freio de mão decide sobre a verba.</p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/45 text-muted-foreground text-left text-[11px] tracking-wide uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-extrabold">Campanha</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">Nota</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">Gasto</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">Fatia</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">ROAS</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">CTR</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">Conv.</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">CPA</th>
                      <th className="px-2 py-2.5 font-extrabold">Freio</th>
                      <th className="px-2 py-2.5 text-right font-extrabold">Achados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostico.campanhas.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-2.5"><b>{l.nome}</b><small className="text-muted-foreground block">{NETWORK_LABEL[l.network]}</small></td>
                        <td className="px-2 py-2.5 text-right">
                          {l.metrics.spendCents ? <Badge variant={l.nota >= 75 ? "success" : l.nota >= 50 ? "warning" : "destructive"}>{l.nota}</Badge> : "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{cents(l.metrics.spendCents)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{l.fatiaGasto ? formatPercent(l.fatiaGasto, 0) : "—"}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{l.derivadas.roas === null ? "—" : formatRatio(l.derivadas.roas)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{l.derivadas.ctr === null ? "—" : formatPercent(l.derivadas.ctr, 2)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{l.conversao === null ? "—" : formatPercent(l.conversao, 2)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{centsExatos(l.derivadas.cpaCents)}</td>
                        <td className="px-2 py-2.5">{l.decisao ? <VereditoBadge veredito={l.decisao.veredito} /> : "—"}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {l.achados.filter((a) => a.gravidade === "falha").length}🔴 {l.achados.filter((a) => a.gravidade === "fraco").length}🟡 {l.achados.filter((a) => a.gravidade === "forte").length}🟢
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Simulador */}
          {diagnostico.comDados > 0 && (
            <section className="bg-card overflow-hidden rounded-2xl border">
              <header className="flex items-start gap-2.5 border-b px-4 py-3">
                <span aria-hidden className="text-muted-foreground bg-muted grid size-8 shrink-0 place-items-center rounded-lg border">
                  <SlidersHorizontal className="size-4" />
                </span>
                <div className="min-w-0">
                  <b className="block text-sm font-extrabold">E se a verba mudar?</b>
                  <p className="text-muted-foreground text-xs leading-5">
                    Mexa na verba e na margem do produto. O simulador assume que o ROAS cai um pouco quando a verba sobe (leilão mais caro) — comportamento comum, não promessa.
                  </p>
                </div>
              </header>
              <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="space-y-4">
                  <label className="block">
                    <span className="flex justify-between text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
                      Variação da verba <b className="tabular-nums">{variacao > 0 ? "+" : ""}{variacao}%</b>
                    </span>
                    <input type="range" min={-80} max={100} step={5} value={variacao} onChange={(e) => setVariacao(Number(e.target.value))} className="accent-foreground mt-2 w-full" />
                  </label>
                  <label className="block">
                    <span className="flex justify-between text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
                      Margem do produto <b className="tabular-nums">{margem}%</b>
                    </span>
                    <input type="range" min={5} max={95} step={5} value={margem} onChange={(e) => setMargem(Number(e.target.value))} className="accent-foreground mt-2 w-full" />
                    <span className="text-muted-foreground block text-[0.6875rem] leading-4">O que sobra da receita depois de produto e taxas, antes da mídia.</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Numero rotulo="Gasto novo" valor={formatCompactCurrency(cenario.gastoNovoCents / 100)} nota={`hoje ${cents(diagnostico.totais.spendCents)}`} />
                  <Numero rotulo="Receita projetada" valor={formatCompactCurrency(cenario.receitaNovaCents / 100)} nota={`hoje ${cents(diagnostico.totais.revenueCents)}`} />
                  <Numero rotulo="ROAS projetado" valor={formatRatio(cenario.roasNovo)} nota={`hoje ${diagnostico.derivadas.roas === null ? "—" : formatRatio(diagnostico.derivadas.roas)}`} />
                  <Numero rotulo="Lucro hoje" valor={formatCompactCurrency(cenario.lucroAtualCents / 100)} tom={cenario.lucroAtualCents < 0 ? "destructive" : "success"} nota="Com esta margem." />
                  <Numero rotulo="Lucro projetado" valor={formatCompactCurrency(cenario.lucroNovoCents / 100)} tom={cenario.lucroNovoCents < 0 ? "destructive" : cenario.lucroNovoCents >= cenario.lucroAtualCents ? "success" : "warning"} nota={cenario.lucroNovoCents >= cenario.lucroAtualCents ? "Compensa." : "Piora o resultado."} />
                  <Numero rotulo="ROAS de equilíbrio" valor={cenario.roasEquilibrio === null ? "—" : formatRatio(cenario.roasEquilibrio)} nota="Abaixo disso, a mídia come a margem." tom={diagnostico.derivadas.roas !== null && cenario.roasEquilibrio !== null && diagnostico.derivadas.roas < cenario.roasEquilibrio ? "destructive" : undefined} />
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
