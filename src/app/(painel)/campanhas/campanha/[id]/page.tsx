import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  ScrollText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { VereditoBadge } from "@/features/guardrails/veredito-badge";
import { campaignClass, campaignClassLabel } from "@/features/ads/campaign-classes";
import { CampaignDetailForm } from "@/features/ads/campaign-detail";
import { CampaignDrilldown } from "@/features/ads/campaign-drilldown";
import {
  CELULA_ESTADO,
  decisaoDaCampanha,
} from "@/features/ads/campaign-preview-table";
import { diagnosticar, type Gravidade } from "@/features/ads/diagnostico";
import type { Decisao } from "@/features/guardrails/rules";
import {
  getCampaignPageData,
  type CampaignSearchParams,
} from "@/features/ads/page-data";
import { listCampaignChangeLog } from "@/features/ads/queries";
import {
  NETWORK_LABEL,
  STATUS_LABEL,
  derivadas,
} from "@/features/ads/types";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: CampaignSearchParams;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { tree } = await getCampaignPageData(searchParams);
  const c = tree.campanhas.find((x) => x.id === decodeURIComponent(id));
  // Aqui a resposta ainda não começou a ser enviada, então o 404 chega
  // com o código certo (dentro da página, o loading já teria mandado 200).
  if (!c) notFound();
  return { title: `Campanha · ${c.name}` };
}

const GRAVIDADE: Record<Gravidade, { label: string; icon: React.ElementType; classe: string }> = {
  falha: { label: "Falha", icon: AlertOctagon, classe: "text-destructive" },
  fraco: { label: "Ponto fraco", icon: AlertTriangle, classe: "text-warning" },
  forte: { label: "Ponto forte", icon: CheckCircle2, classe: "text-success" },
  info: { label: "Para saber", icon: Info, classe: "text-muted-foreground" },
};

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) => (v === null ? "—" : formatCurrency(v / 100, v < 10_000 ? 2 : 0));

const REGRA_LABEL: Record<Decisao["regra"], string> = {
  nenhuma: "Nenhuma",
  margemMinima: "Margem mínima",
  roasMinimo: "ROAS mínimo",
  roasPausa: "ROAS de pausa",
  gastoMaximoDia: "Teto por dia",
  escalaMaxima: "Escala máxima",
  pausarDiaNegativo: "Dia negativo",
  diasToleranciaNegativo: "Dias negativos",
  aprovacaoAcimaDe: "Aprovação",
};

/** Um quadradinho de métrica relacionada dentro de um bloco do relatório. */
function Mini({ rotulo, valor, nota, tom, texto }: { rotulo: string; valor: string; nota?: string; tom?: "success" | "warning" | "destructive"; texto?: boolean }) {
  return (
    <div className="campanha-relatorio-mini-item" data-tom={tom} data-texto={texto || undefined}>
      <span className="campanha-numero-rotulo">{rotulo}</span>
      <b>{valor}</b>
      {nota && <small>{nota}</small>}
    </div>
  );
}

function Numero({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string; tom?: "success" | "warning" | "destructive" }) {
  return (
    <div className="campanha-numero" data-tom={tom}>
      <span className="campanha-numero-rotulo">{rotulo}</span>
      <span className="campanha-numero-valor">{valor}</span>
      {nota && <span className="campanha-numero-nota">{nota}</span>}
    </div>
  );
}

/**
 * A página da campanha: tudo o que existe sobre ela num lugar só — a
 * tabela, os números e o que eles significam, a decisão do freio de mão,
 * o diagnóstico, os conjuntos e anúncios, a edição e o diário.
 */
export default async function CampanhaPage({ params, searchParams }: Props) {
  const { id: bruto } = await params;
  const id = decodeURIComponent(bruto);
  const { tree, regras } = await getCampaignPageData(searchParams);
  const c = tree.campanhas.find((x) => x.id === id);
  if (!c) notFound();

  const d = derivadas(c.metrics);
  const dec = decisaoDaCampanha(c.metrics, regras);
  const diagnostico = diagnosticar([c], regras);
  const conversao = c.metrics.clicks > 0 ? c.metrics.purchases / c.metrics.clicks : null;
  const ticket = c.metrics.purchases > 0 ? c.metrics.revenueCents / c.metrics.purchases : null;
  const idsTodos = [c.id, ...c.adSets.flatMap((s) => [s.id, ...s.ads.map((a) => a.id)])];
  const diario = tree.modo === "banco" ? await listCampaignChangeLog(idsTodos) : [];

  // Métricas relacionadas de cada bloco do relatório, para nenhum ficar vazio.
  const porGravidade = { falha: 0, fraco: 0, forte: 0, info: 0 } as Record<Gravidade, number>;
  for (const a of diagnostico.achados) porGravidade[a.gravidade] += 1;
  const anunciosTodos = c.adSets.flatMap((s) => s.ads.map((a) => ({ conjunto: s, anuncio: a })));
  const comRoas = anunciosTodos
    .map(({ anuncio }) => ({ nome: anuncio.name, roas: derivadas(anuncio.metrics).roas }))
    .filter((x): x is { nome: string; roas: number } => x.roas !== null);
  const estrutura = {
    anuncios: anunciosTodos.length,
    conjuntosAtivos: c.adSets.filter((s) => s.status === "active").length,
    conjuntosPausados: c.adSets.filter((s) => s.status === "paused").length,
    anunciosAtivos: anunciosTodos.filter(({ anuncio }) => anuncio.status === "active").length,
    anunciosPausados: anunciosTodos.filter(({ anuncio }) => anuncio.status === "paused").length,
    orcamentoConjuntosCents: c.adSets.reduce((s, x) => s + (x.dailyBudgetCents ?? 0), 0),
    maiorConjunto: [...c.adSets].sort((a, b) => b.metrics.spendCents - a.metrics.spendCents)[0] ?? null,
    melhorAnuncio: comRoas.length ? [...comRoas].sort((a, b) => b.roas - a.roas)[0] : null,
    piorAnuncio: comRoas.length > 1 ? [...comRoas].sort((a, b) => a.roas - b.roas)[0] : null,
  };
  const sufixo = tree.modo === "banco" ? "?modo=real" : "";

  return (
    <div className="campanha-pagina">
      {/* O topo (voltar + título) também é ponto de parada da rolagem;
          sem isso a rolagem por seção pularia direto para a seção 01. */}
      <div className="campanha-topo">
      <Link href={`/campanhas/${c.network}/classes${sufixo}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> Voltar ao quadro por classe
      </Link>

      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
            {NETWORK_LABEL[c.network]} · {campaignClassLabel(campaignClass(c))}
          </p>
          <h2 className="mt-1 flex flex-wrap items-center gap-3 text-[clamp(1.5rem,1.2rem+1vw,2.2rem)] leading-none font-extrabold tracking-[-0.045em]">
            {c.name}
            <span className={cn("rounded-md px-2 py-1 text-sm font-bold", CELULA_ESTADO[c.status])}>{STATUS_LABEL[c.status]}</span>
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {c.objective ? `${c.objective} · ` : ""}
            {c.source === "meta" ? `No Meta (id ${c.externalId})` : c.source === "demo" ? "Campanha de demonstração" : "Só neste painel — ainda não existe na rede"}
            {c.syncedAt ? ` · sincronizada ${formatDateTime(c.syncedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dec && <VereditoBadge veredito={dec.veredito} className="px-2.5 py-1 text-sm" />}
          <Badge variant={diagnostico.rotulo === "Saudável" ? "success" : diagnostico.rotulo === "Atenção" ? "warning" : diagnostico.rotulo === "Crítico" ? "destructive" : "muted"} className="px-2.5 py-1 text-sm">
            Nota {diagnostico.nota} · {diagnostico.rotulo}
          </Badge>
        </div>
      </header>
      </div>

      {/* A página é uma pilha de seções de largura total, uma abaixo da
          outra, com o mesmo cabeçalho (número · título e descrição · selo).
          Rolou para baixo, mudou de seção. As três faixas (03, 04 e 05)
          vêm sem cabeçalho: só a campanha e os dados. */}
      <section aria-labelledby="sessao-metricas" className="sessao" data-sessao="01">
        <header className="sessao-cabecalho">
          <span className="sessao-numero">01</span>
          <div className="sessao-titulo">
            <h3 id="sessao-metricas">Métricas da campanha</h3>
            <p>Últimos 7 dias · {c.dailyBudgetCents !== null ? `orçamento ${formatCurrency(c.dailyBudgetCents / 100)}/dia` : "sem orçamento diário"}</p>
          </div>
          <span className="sessao-selo">12 métricas</span>
        </header>
        <div className="sessao-corpo campanha-metricas-grade">
          <Numero rotulo="Gasto" valor={cents(c.metrics.spendCents)} nota="Mídia paga" />
          <Numero rotulo="Receita" valor={cents(c.metrics.revenueCents)} nota="Vendas atribuídas" />
          <Numero rotulo="Sobra depois da mídia" valor={c.metrics.spendCents ? formatCompactCurrency((c.metrics.revenueCents - c.metrics.spendCents) / 100) : "—"} tom={c.metrics.spendCents ? (c.metrics.revenueCents - c.metrics.spendCents < 0 ? "destructive" : "success") : undefined} nota="Antes de produto e taxas" />
          <Numero rotulo="ROAS" valor={d.roas === null ? "—" : formatRatio(d.roas)} tom={d.roas === null ? undefined : d.roas < regras.roasPausa ? "destructive" : d.roas < regras.roasMinimo ? "warning" : "success"} nota={`Mínimo ${formatRatio(regras.roasMinimo, 1)}`} />
          <Numero rotulo="Compras" valor={c.metrics.purchases ? formatInteger(c.metrics.purchases) : "—"} nota={ticket ? `ticket ${centsExatos(ticket)}` : "sem ticket"} />
          <Numero rotulo="CPA" valor={centsExatos(d.cpaCents)} nota="Custo por venda" />
          <Numero rotulo="Impressões" valor={c.metrics.impressions ? formatInteger(c.metrics.impressions) : "—"} nota="Vezes que apareceu" />
          <Numero rotulo="Cliques" valor={c.metrics.clicks ? formatInteger(c.metrics.clicks) : "—"} nota="Visitas geradas" />
          <Numero rotulo="CTR" valor={d.ctr === null ? "—" : formatPercent(d.ctr, 2)} nota="Impressão → clique" />
          <Numero rotulo="Conversão" valor={conversao === null ? "—" : formatPercent(conversao, 2)} nota="Clique → compra" />
          <Numero rotulo="CPC" valor={centsExatos(d.cpcCents)} nota="Custo por clique" />
          <Numero rotulo="CPM" valor={centsExatos(d.cpmCents)} nota="Custo por mil impressões" />
        </div>
      </section>

      <section aria-labelledby="sessao-relatorio" className="sessao" data-sessao="02">
        <header className="sessao-cabecalho">
          <span className="sessao-numero">02</span>
          <div className="sessao-titulo">
            <h3 id="sessao-relatorio">Relatório da campanha</h3>
            <p>Nota, freio de mão e diagnóstico de cada elo: anúncio → clique → compra → dinheiro.</p>
          </div>
          <span className="sessao-selo">Nota {diagnostico.nota} · {diagnostico.rotulo}</span>
        </header>
        <div className="sessao-corpo campanha-relatorio-grade">
          {/* Bloco 1 · Nota de saúde e o que a compõe */}
          <div className="campanha-relatorio-secao" data-bloco="nota">
            <h4>Nota de saúde</h4>
            <div className="campanha-relatorio-nota" data-rotulo={diagnostico.rotulo}>
              <strong className="campanha-relatorio-nota-valor">{diagnostico.nota}</strong>
              <span className="campanha-relatorio-nota-selo">{diagnostico.rotulo}</span>
            </div>
            <div className="campanha-relatorio-mini">
              <Mini rotulo="Falhas" valor={String(porGravidade.falha)} tom={porGravidade.falha ? "destructive" : undefined} nota="tiram 20 a 40" />
              <Mini rotulo="Pontos fracos" valor={String(porGravidade.fraco)} tom={porGravidade.fraco ? "warning" : undefined} nota="tiram 5 a 15" />
              <Mini rotulo="Pontos fortes" valor={String(porGravidade.forte)} tom={porGravidade.forte ? "success" : undefined} nota="seguram a nota" />
              <Mini rotulo="Para saber" valor={String(porGravidade.info)} nota="não pesam" />
              <Mini rotulo="Meta" valor="75+" nota="50 a 74 atenção" />
              <Mini rotulo="Falta para saudável" valor={diagnostico.nota >= 75 ? "0" : String(75 - diagnostico.nota)} tom={diagnostico.nota >= 75 ? "success" : "warning"} nota={diagnostico.nota >= 75 ? "meta atingida" : "pontos"} />
            </div>
          </div>

          {/* Bloco 2 · Freio de mão e as regras que entraram na conta */}
          <div className="campanha-relatorio-secao" data-bloco="freio">
            <h4>Freio de mão</h4>
            <div className="campanha-relatorio-principal">
              {dec ? (
                <>
                  <VereditoBadge veredito={dec.veredito} className="justify-self-center" />
                  <p>{dec.motivo}</p>
                </>
              ) : (
                <p className="campanha-relatorio-nota-texto">Sem gasto nos últimos 7 dias — não há o que avaliar ainda.</p>
              )}
            </div>
            <div className="campanha-relatorio-mini">
              <Mini rotulo="ROAS usado" valor={dec ? formatRatio(dec.roas) : "—"} tom={dec ? (dec.roas < regras.roasPausa ? "destructive" : dec.roas < regras.roasMinimo ? "warning" : "success") : undefined} nota="últimos 7 dias" />
              <Mini rotulo="ROAS mínimo" valor={formatRatio(regras.roasMinimo, 1)} nota="abaixo, reduz" />
              <Mini rotulo="ROAS de pausa" valor={formatRatio(regras.roasPausa, 1)} nota="abaixo, pausa" />
              <Mini rotulo="Margem sobre mídia" valor={d.margem === null ? "—" : formatPercent(d.margem, 1)} tom={d.margem === null ? undefined : d.margem < regras.margemMinima ? "warning" : "success"} nota={`mínima ${formatPercent(regras.margemMinima, 0)}`} />
              <Mini rotulo="Escala liberada" valor={dec ? formatPercent(dec.escalaPermitida, 0) : "—"} nota={`teto ${formatPercent(regras.escalaMaxima, 0)}`} />
              <Mini rotulo="Aumento em R$" valor={dec && dec.aumentoEmReais > 0 ? formatCurrency(dec.aumentoEmReais) : "—"} nota={dec?.exigeAprovacao ? "pede aprovação" : `livre até ${formatCurrency(regras.aprovacaoAcimaDe)}`} />
              <Mini rotulo="Regra que decidiu" valor={dec ? REGRA_LABEL[dec.regra] : "—"} nota={dec ? (dec.regra === "nenhuma" ? "tudo passou" : "travou aqui") : "sem dados"} />
              <Mini rotulo="Teto por dia" valor={regras.gastoMaximoDia > 0 ? formatCurrency(regras.gastoMaximoDia) : "sem teto"} nota={c.dailyBudgetCents !== null ? `hoje ${formatCurrency(c.dailyBudgetCents / 100)}` : "sem orçamento"} />
              <Mini rotulo="Dia no prejuízo" valor={regras.pausarDiaNegativo ? "pausa" : "avisa"} nota={`após ${regras.diasToleranciaNegativo} dia(s)`} />
            </div>
          </div>

          {/* Bloco 3 · Diagnóstico: cada elo da corrente e os achados */}
          <div className="campanha-relatorio-secao" data-bloco="diagnostico">
            <h4>Diagnóstico · {diagnostico.achados.length} {diagnostico.achados.length === 1 ? "achado" : "achados"}</h4>
            <div className="campanha-relatorio-mini" data-colunas="2">
              <Mini rotulo="Anúncio → clique" valor={d.ctr === null ? "—" : formatPercent(d.ctr, 2)} nota="CTR · bom acima de 1,5%" tom={d.ctr === null ? undefined : d.ctr >= 0.015 ? "success" : d.ctr >= 0.008 ? "warning" : "destructive"} />
              <Mini rotulo="Clique → compra" valor={conversao === null ? "—" : formatPercent(conversao, 2)} nota="conversão · bom acima de 1%" tom={conversao === null ? undefined : conversao >= 0.01 ? "success" : conversao >= 0.005 ? "warning" : "destructive"} />
              <Mini rotulo="Compra → dinheiro" valor={ticket ? centsExatos(ticket) : "—"} nota="ticket médio" />
              <Mini rotulo="Dinheiro → retorno" valor={d.roas === null ? "—" : formatRatio(d.roas)} nota={`ROAS · mínimo ${formatRatio(regras.roasMinimo, 1)}`} tom={d.roas === null ? undefined : d.roas < regras.roasPausa ? "destructive" : d.roas < regras.roasMinimo ? "warning" : "success"} />
              <Mini rotulo="Custo por clique" valor={centsExatos(d.cpcCents)} nota="CPC" />
              <Mini rotulo="Custo por mil" valor={centsExatos(d.cpmCents)} nota="CPM" />
              <Mini rotulo="Impressões por compra" valor={c.metrics.purchases ? formatInteger(Math.round(c.metrics.impressions / c.metrics.purchases)) : "—"} nota="quantas vezes aparece até vender" />
              <Mini rotulo="Cliques por compra" valor={c.metrics.purchases ? formatInteger(Math.round(c.metrics.clicks / c.metrics.purchases)) : "—"} nota="quantas visitas até vender" />
            </div>
            {diagnostico.achados.length === 0 ? (
              <p className="campanha-relatorio-nota-texto">Nada a apontar.</p>
            ) : (
              <ul className="campanha-relatorio-achados">
                {diagnostico.achados.map((a) => {
                  const g = GRAVIDADE[a.gravidade];
                  const Icon = g.icon;
                  return (
                    <li key={a.id} className="campanha-relatorio-achado" data-gravidade={a.gravidade}>
                      <span className="campanha-relatorio-achado-tipo">
                        <Icon aria-hidden className={cn("size-3.5 shrink-0", g.classe)} />
                        {g.label}
                      </span>
                      <p className="campanha-relatorio-achado-titulo">{a.titulo}</p>
                      <p className="campanha-relatorio-achado-texto">{a.explicacao}</p>
                      <p className="campanha-relatorio-achado-acao"><b>O que fazer:</b> {a.acao}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Bloco 4 · Estrutura: conjuntos, anúncios e onde está o dinheiro */}
          <div className="campanha-relatorio-secao" data-bloco="estrutura">
            <h4>Estrutura</h4>
            <div className="campanha-relatorio-mini">
              <Mini rotulo="Conjuntos" valor={String(c.adSets.length)} nota={`${estrutura.conjuntosAtivos} ativos`} />
              <Mini rotulo="Anúncios" valor={String(estrutura.anuncios)} nota={`${estrutura.anunciosAtivos} ativos`} />
              <Mini rotulo="Pausados" valor={String(estrutura.conjuntosPausados + estrutura.anunciosPausados)} nota={`${estrutura.conjuntosPausados} conj. · ${estrutura.anunciosPausados} anúncios`} tom={estrutura.conjuntosPausados + estrutura.anunciosPausados ? "warning" : undefined} />
              <Mini rotulo="Orçamento dos conjuntos" valor={estrutura.orcamentoConjuntosCents > 0 ? formatCurrency(estrutura.orcamentoConjuntosCents / 100) : "—"} nota="por dia, somado" />
              <Mini rotulo="Gasto médio por conjunto" valor={c.adSets.length ? cents(c.metrics.spendCents / c.adSets.length) : "—"} nota="7 dias" />
              <Mini rotulo="Anúncios por conjunto" valor={c.adSets.length ? (estrutura.anuncios / c.adSets.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"} nota="média" />
              <Mini rotulo="Conjunto que mais gasta" valor={estrutura.maiorConjunto ? estrutura.maiorConjunto.name : "—"} nota={estrutura.maiorConjunto && c.metrics.spendCents ? `${formatPercent(estrutura.maiorConjunto.metrics.spendCents / c.metrics.spendCents, 0)} do gasto` : "sem gasto"} texto />
              <Mini rotulo="Anúncio com melhor ROAS" valor={estrutura.melhorAnuncio ? estrutura.melhorAnuncio.nome : "—"} nota={estrutura.melhorAnuncio ? formatRatio(estrutura.melhorAnuncio.roas) : "sem dados"} tom={estrutura.melhorAnuncio ? "success" : undefined} texto />
              <Mini rotulo="Anúncio com pior ROAS" valor={estrutura.piorAnuncio ? estrutura.piorAnuncio.nome : "—"} nota={estrutura.piorAnuncio ? formatRatio(estrutura.piorAnuncio.roas) : "sem dados"} tom={estrutura.piorAnuncio && estrutura.piorAnuncio.roas < regras.roasMinimo ? "destructive" : undefined} texto />
            </div>
          </div>
        </div>
      </section>

      <CampaignDrilldown campanha={c} primeira={3} />

      <section aria-labelledby="sessao-editar" className="sessao" data-sessao="06">
        <header className="sessao-cabecalho">
          <span className="sessao-numero">06</span>
          <div className="sessao-titulo">
            <h3 id="sessao-editar">Editar</h3>
            <p>Nome, estado e orçamento diário. Passa pelo freio de mão.</p>
          </div>
          <span className="sessao-selo">{STATUS_LABEL[c.status]}</span>
        </header>
        <div className="sessao-corpo sessao-corpo-bloco">
          <CampaignDetailForm campanha={c} />
        </div>
      </section>

      {tree.modo === "banco" && (
        <section aria-labelledby="sessao-diario" className="sessao" data-sessao="07">
          <header className="sessao-cabecalho">
            <span className="sessao-numero">07</span>
            <div className="sessao-titulo">
              <h3 id="sessao-diario"><ScrollText aria-hidden className="mr-1.5 inline size-4 align-[-2px]" />Diário de mudanças</h3>
              <p>Tudo o que foi alterado nesta campanha, com quem fez e se chegou à rede.</p>
            </div>
            <span className="sessao-selo">{diario.length} registro(s)</span>
          </header>
          <div className="sessao-corpo sessao-corpo-bloco">
            {diario.length === 0 ? (
              <p className="campaign-drill-vazio">Nenhuma mudança registrada ainda.</p>
            ) : (
              <ul className="campanha-diario">
                {diario.map((m) => (
                  <li key={m.id}>
                    <span className="campanha-diario-quando">{formatDateTime(m.createdAt)}</span>
                    <span className="campanha-diario-oque">
                      <b>{m.entityName}</b> · {m.field}
                      {m.before !== null || m.after !== null ? <>: <span className="line-through opacity-60">{m.before ?? "—"}</span> → <b>{m.after ?? "—"}</b></> : null}
                      {m.error && <span className="text-destructive block text-xs">{m.error}</span>}
                    </span>
                    <span className="campanha-diario-quem">{m.appliedRemote ? "aplicado na rede" : "só aqui"} · {m.actor ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
