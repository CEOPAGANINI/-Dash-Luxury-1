"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  buildDailyRevenue,
  funnelForDate,
} from "@/features/unified-dashboard/analytics";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import { BoardPager } from "@/components/dashboard/board-pager";
import { BlockPicker } from "@/components/ui/block-picker";

/**
 * Módulos legados de diagnóstico, preservados fora da análise de aquisição real.
 * Uma seção explícita entrega somente aquele módulo, sem navegação aninhada.
 * A rota de diagnósticos mantém, por compatibilidade, suas duas páginas antigas.
 * Estes componentes ainda usam o modelo legado da operação; seus cálculos não
 * devem ser confundidos com o contrato de dados reais de acquisition-analytics.
 */

/** Faixas de idade da rosca, na ordem em que os dados chegam. */
const AGE_BANDS = ["18–24", "25–34", "35–44", "45–54", "55+"];
const AGE_COLORS = [
  "var(--color-success)",
  "color-mix(in oklab, var(--color-success) 55%, white)",
  "var(--color-warning)",
  "var(--color-destructive)",
  "var(--color-muted-foreground)",
];

/** Status nunca é só cor: cada um leva o próprio texto. */
function statusTone(status: string) {
  if (/Saud|Escalar|Bom/i.test(status)) return "text-success";
  if (/Aten|Manter|Validar|Teste/i.test(status)) return "text-warning";
  if (/Crít|Reduzir|Pausar|Ruim/i.test(status)) return "text-destructive";
  return "text-muted-foreground";
}

/** Cabeçalho de módulo: etiqueta, título e uma frase de explicação. */
function ModuleHead({
  icon,
  kicker,
  title,
  description,
  aside,
}: {
  icon: string;
  kicker: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    /* Cabeçalho enxuto: ele se repete em quatro painéis, então cada linha a
       mais aqui empurra a página inteira para baixo quatro vezes. */
    <header className="acquisition-module-head acquisition-block flex flex-wrap items-center gap-3 px-4 py-4">
      <span
        aria-hidden
        className="acquisition-block acquisition-module-icon text-muted-foreground grid size-10 shrink-0 place-items-center text-sm"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-center">
        <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
          {kicker}
        </span>
        <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight text-balance break-words">
          {title}
        </h3>
        <p className="text-muted-foreground mt-0.5 text-xs leading-5">
          {description}
        </p>
      </div>
      {/* O contexto ocupa seu próprio bloco e pode passar à linha seguinte. */}
      {aside && (
        <div className="acquisition-module-context shrink-0">{aside}</div>
      )}
    </header>
  );
}

/** Caixa de um número, com o rótulo em cima e o valor em destaque. */
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    /* justify-center: numa caixa baixa não muda nada, e numa caixa alta —
       quando as seis caixinhas dividem a altura de um painel — o rótulo e o
       número ficam no meio dela em vez de encostados no topo. */
    <div className="acquisition-block acquisition-metric @container flex min-w-0 flex-col items-center justify-center gap-1 px-3 py-3 text-center">
      {/* break-words: "Custo/venda" não tem espaço para quebrar sozinho e
          transbordava da caixinha nas colunas estreitas. */}
      <span className="text-muted-foreground block text-[0.6875rem] leading-tight font-bold tracking-wide break-words uppercase">
        {label}
      </span>
      {/* O número mantém a mesma escala entre os blocos, sem reticências. */}
      <b
        className={cn(
          "block max-w-full text-sm leading-5 font-extrabold break-words tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </b>
    </div>
  );
}

export type TrafficDiagnosticSection =
  "behavior" | "funnel" | "audience" | "creatives";

export function TrafficDiagnostics({
  section,
  unavailable = false,
}: { section?: TrafficDiagnosticSection; unavailable?: boolean } = {}) {
  if (unavailable) {
    return <UnavailableDiagnostic section={section ?? "funnel"} />;
  }
  return <LegacyTrafficDiagnostics section={section} />;
}

const UNAVAILABLE_DIAGNOSTICS = {
  funnel: {
    title: "Funil do tráfego",
    description:
      "Sem dados de eventos por etapa. Integre impressões, cliques, visitas, checkout e compras para medir conversão e custo por etapa sem estimativas.",
  },
  audience: {
    title: "Público e demográficos",
    description:
      "Sem dados de idade, composição do público ou retenção. Essas distribuições dependem de métricas agregadas das plataformas e não podem ser inferidas da receita.",
  },
  creatives: {
    title: "Creative Intelligence",
    description:
      "Sem dados por anúncio ou campanha. A análise de atenção, cliques, compras, frequência e retenção precisa de identificadores e métricas reais dos criativos.",
  },
  behavior: {
    title: "Comportamento do dia",
    description:
      "Sem dados de vendas por horário. É necessário receber os eventos no fuso da conta; totais diários não serão distribuídos artificialmente entre as horas.",
  },
} satisfies Record<
  TrafficDiagnosticSection,
  { title: string; description: string }
>;

function UnavailableDiagnostic({
  section,
}: {
  section: TrafficDiagnosticSection;
}) {
  const info = UNAVAILABLE_DIAGNOSTICS[section];
  return (
    <section
      className="acquisition-module flex min-w-0 flex-col gap-4"
      aria-label={info.title}
    >
      <header className="acquisition-block grid gap-2 p-5 text-center">
        <h3 className="text-lg font-bold">{info.title}</h3>
        <p className="text-muted-foreground text-sm leading-6">
          {info.description}
        </p>
        <p role="status" className="text-sm font-bold">
          Sem dados
        </p>
      </header>
      {section === "funnel" ? (
        <ol
          className="grid min-w-0 gap-3"
          aria-label="Etapas do funil sem dados"
        >
          {[
            "Impressões",
            "Cliques no link",
            "Visitas à página",
            "Início de checkout",
            "Compras",
            "Aprovadas",
            "Liquidadas",
          ].map((stage) => (
            <li
              key={stage}
              className="acquisition-block grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4"
            >
              <span className="text-sm font-semibold">{stage}</span>
              <span className="text-muted-foreground" aria-label="Sem dados">
                —
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="acquisition-block flex flex-wrap justify-center gap-4 p-4 text-sm font-semibold">
        <Link href="/integracoes" className="underline underline-offset-4">
          Configurar integrações
        </Link>
        {section === "creatives" ? (
          <Link href="/campanhas" className="underline underline-offset-4">
            Gerenciar campanhas
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function LegacyTrafficDiagnostics({
  section,
}: {
  section?: TrafficDiagnosticSection;
}) {
  const {
    operation,
    networkId,
    funnel,
    campaignId,
    setCampaignId,
    year,
    month,
    day,
  } = useUnifiedDashboard();

  /** Hora aberta no detalhe. Null = nenhuma escolhida ainda. */
  const [openHour, setOpenHour] = React.useState<number | null>(null);

  /* A rede escolhida vem das caixas do calendário e vale para a página toda.
     Sem rede, valem os totais da operação. */
  const network =
    networkId === "all"
      ? null
      : (operation.networks.find((item) => item.id === networkId) ?? null);
  const share = network
    ? operation.kpis.netRevenue > 0
      ? network.checkoutRevenue / operation.kpis.netRevenue
      : 0
    : 1;

  const days = React.useMemo(
    () => buildDailyRevenue(operation, year, month),
    [operation, year, month],
  );
  const selected = days.find((point) => point.day === day) ?? days[0];

  /*
    O dado por hora vem como um total. Para mostrar recebido, pendente e
    recusado hora a hora, aplicamos a mesma proporção do dia — é a leitura
    do dia distribuída nas horas, e não um número novo: a soma das 24 horas
    continua batendo com o total do dia.
  */
  const dayTotal = Math.max(selected.total, 1);
  const mix = {
    received: selected.received / dayTotal,
    pending: selected.pending / dayTotal,
    refused: selected.refused / dayTotal,
  };
  const hours = selected.hourly.map((raw, hour) => {
    const total = Math.round(raw * share);
    const received = Math.round(total * mix.received);
    const pending = Math.round(total * mix.pending);
    return {
      hour,
      total,
      received,
      pending,
      refused: Math.max(total - received - pending, 0),
    };
  });
  const maxHour = Math.max(...hours.map((item) => item.total), 1);
  const peakHour = hours.reduce(
    (best, item) => (item.total > best.total ? item : best),
    hours[0],
  ).hour;
  const dayReceived = Math.round(selected.received * share);
  const dayProcessed = Math.round(selected.total * share);

  const campaigns = operation.campaigns.filter(
    (item) => !network || item.network === network.id,
  );
  const campaign =
    campaignId === "all"
      ? null
      : (campaigns.find((item) => item.id === campaignId) ?? null);
  const creatives = campaign ? [campaign] : campaigns;

  /* Sem useMemo aqui de propósito: a lista de criativos é montada a cada
     render, então a memoização manual não se sustentava e o React Compiler
     desistia de otimizar o componente inteiro. O cálculo é barato — sete
     etapas — e o compilador cuida do resto. */
  const dayFunnel = funnelForDate(
    funnel,
    new Date(year, month, selected.day),
    operation,
    campaign,
  );

  /* O mesmo funil do dia anterior, só para dizer se cada etapa ficou mais
     cara ou mais barata. No dia 1 o Date resolve sozinho para o último dia do
     mês passado, que é exatamente o dia anterior. */
  const previousDayFunnel = funnelForDate(
    funnel,
    new Date(year, month, selected.day - 1),
    operation,
    campaign,
  );

  /* A maior queda entre duas etapas é onde a atenção deve ir primeiro. O
     cálculo fica aqui fora porque antes ele era refeito dentro do map, uma
     vez para cada uma das sete etapas. */
  const biggestLossStage = dayFunnel.stages.reduce(
    (worst, stage, position) => {
      if (position === 0) return worst;
      const drop = (dayFunnel.stages[position - 1]?.[1] ?? 0) - stage[1];
      return drop > worst.drop ? { position, drop } : worst;
    },
    { position: -1, drop: -1 },
  ).position;

  const spend = creatives.reduce((sum, item) => sum + item.spend, 0);
  const revenue = creatives.reduce(
    (sum, item) => sum + item.checkoutRevenue,
    0,
  );
  const purchases = creatives.reduce((sum, item) => sum + item.purchases, 0);
  const clicks = creatives.reduce((sum, item) => sum + item.clicks, 0);
  const impressions = creatives.reduce(
    (sum, item) => sum + item.impressions,
    0,
  );

  const openHourData = openHour === null ? null : hours[openHour];

  /*
    @container: as grades de dentro de cada painel passam a medir a COLUNA
    onde estão, e não a janela. Era isso que cortava os rótulos dos
    criativos — num monitor largo o sm: valia, mas a coluna tinha 475px e
    três caixinhas por linha viravam "CU…", "CO…", "FR…".
  */
  const panel = "acquisition-module @container flex min-w-0 flex-col gap-3";
  const focusRing =
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2";

  const painelComportamento = (
    <section
      className={cn(panel, "3xl:col-span-4")}
      aria-label="Comportamento do dia"
    >
      <ModuleHead
        icon="▥"
        kicker="Receita por hora"
        title="Comportamento do dia"
        description="As 24 horas do dia em colunas: verde é o que já entrou, amarelo o que ainda está pendente e vermelho o recusado."
        aside={
          <span className="acquisition-block text-muted-foreground block px-3 py-2 text-center text-xs font-bold">
            {network?.name ?? "Todas"}
          </span>
        }
      />
      <div className="acquisition-module-body flex flex-1 flex-col gap-3">
        <ul
          aria-label="Legenda dos pagamentos"
          className="acquisition-payment-legend text-muted-foreground grid grid-cols-3 gap-2 text-xs"
        >
          <li className="acquisition-block flex flex-wrap items-center justify-center gap-2 px-2 py-3 font-bold">
            <i aria-hidden className="bg-success size-2.5 rounded-full" />
            Recebido
          </li>
          <li className="acquisition-block flex flex-wrap items-center justify-center gap-2 px-2 py-3 font-bold">
            <i aria-hidden className="bg-warning size-2.5 rounded-full" />
            Pendente
          </li>
          <li className="acquisition-block flex flex-wrap items-center justify-center gap-2 px-2 py-3 font-bold">
            <i aria-hidden className="bg-destructive size-2.5 rounded-full" />
            Recusado
          </li>
        </ul>

        {/* As 24 horas em colunas em pé, como num gráfico de barras: a
                  altura é o total da hora e cada cor é uma parte dele. Assim o
                  dia inteiro cabe numa faixa curta, em vez de 24 linhas que
                  esticavam a coluna por mais de mil pixels. Nenhum texto é
                  girado: as horas aparecem de 4 em 4 embaixo do gráfico e o
                  valor exato de cada hora vem no clique e no tooltip. */}
        {/* O gráfico cresce com o painel — é ele que ocupa a sobra
                  quando a coluna estica — mas até 30rem: com 24 barras, além
                  disso ele vira um paredão e não se lê melhor. */}
        <div className="acquisition-block acquisition-hour-chart flex min-h-60 flex-1 flex-col gap-3 p-4">
          <div
            className="relative flex max-h-[30rem] min-h-40 flex-1 items-end gap-px @xs:gap-0.5"
            role="group"
            aria-label="Receita hora a hora"
          >
            {dayProcessed === 0 && (
              <p className="text-muted-foreground pointer-events-none absolute inset-0 grid place-items-center p-3 text-center text-sm">
                Nenhuma receita registrada neste dia.
              </p>
            )}
            {hours.map((item) => {
              const isPeak = dayProcessed > 0 && item.hour === peakHour;
              const isOpen = item.hour === openHour;
              const label = `${String(item.hour).padStart(2, "0")}h`;
              const height = (item.total / maxHour) * 100;
              const inside = Math.max(item.total, 1);
              return (
                <button
                  key={item.hour}
                  type="button"
                  onClick={() => setOpenHour(isOpen ? null : item.hour)}
                  aria-pressed={isOpen}
                  title={`${label}: ${formatCurrency(item.received)} recebido, ${formatCurrency(item.pending)} pendente, ${formatCurrency(item.refused)} recusado`}
                  aria-label={`${label}, total de ${formatCurrency(item.total)}${isPeak ? ", horário de pico" : ""}`}
                  className={cn(
                    "flex h-full min-w-0 flex-1 flex-col justify-end transition-colors motion-reduce:transition-none",
                    focusRing,
                    isOpen ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex w-full flex-col justify-end overflow-hidden",
                      isOpen && "ring-primary ring-2",
                    )}
                    style={{ height: `${height}%` }}
                  >
                    <span
                      className="bg-destructive w-full shrink-0"
                      style={{
                        height: `${(item.refused / inside) * 100}%`,
                      }}
                    />
                    <span
                      className="bg-warning w-full shrink-0"
                      style={{
                        height: `${(item.pending / inside) * 100}%`,
                      }}
                    />
                    <span
                      className="bg-success w-full shrink-0"
                      style={{
                        height: `${(item.received / inside) * 100}%`,
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Régua das horas: uma marca a cada 4 horas, na mesma divisão
                  do gráfico, para o eixo continuar legível numa coluna
                  estreita. */}
          <div aria-hidden className="flex gap-px @xs:gap-0.5">
            {hours.map((item) => (
              <span
                key={item.hour}
                className={cn(
                  "min-w-0 flex-1 text-center text-[0.625rem] leading-none font-bold tabular-nums",
                  dayProcessed > 0 && item.hour === peakHour
                    ? "text-warning"
                    : "text-muted-foreground",
                )}
              >
                {item.hour % 4 === 0 || item.hour === peakHour
                  ? String(item.hour).padStart(2, "0")
                  : ""}
              </span>
            ))}
          </div>
        </div>

        {/* Detalhe da hora escolhida — o mesmo conteúdo do tooltip,
                  fixo na página para quem não usa mouse.

                  A caixa está sempre aqui, com o convite no lugar do detalhe
                  enquanto nenhuma hora foi clicada: se ela aparecesse só
                  depois do clique, o painel crescia 80px e empurrava a linha
                  inteira do dashboard a cada barra clicada. */}
        {/* A altura mínima preserva o espaço; detalhes podem crescer sem cortes. */}
        <div
          role="status"
          className="acquisition-block acquisition-hour-detail flex min-h-[7.75rem] flex-col justify-center gap-3 p-4 text-center text-sm"
        >
          <b className="block font-extrabold">
            {openHourData
              ? `${String(openHourData.hour).padStart(2, "0")}h · ${formatCurrency(openHourData.total)}`
              : "Hora a hora"}
          </b>
          {openHourData ? (
            <div className="grid grid-cols-1 gap-2 @sm:grid-cols-3">
              <Metric
                label="Recebido"
                value={formatCurrency(openHourData.received)}
              />
              <Metric
                label="Pendente"
                value={formatCurrency(openHourData.pending)}
              />
              <Metric
                label="Recusado"
                value={formatCurrency(openHourData.refused)}
              />
            </div>
          ) : (
            <p className="text-muted-foreground leading-6">
              Selecione uma hora para consultar os valores recebidos, pendentes
              e recusados.
            </p>
          )}
        </div>

        <div className="acquisition-metric-grid grid auto-rows-fr grid-cols-2 gap-3">
          <Metric
            label="Total recebido"
            value={formatCompactCurrency(dayReceived)}
            tone="good"
          />
          <Metric
            label="Aprovação do dia"
            value={formatPercent(dayReceived / Math.max(dayProcessed, 1))}
          />
          <Metric label="Dia analisado" value={`Dia ${selected.day}`} />
          <Metric
            label="Horário de pico"
            value={
              dayProcessed > 0 ? `${String(peakHour).padStart(2, "0")}h` : "—"
            }
          />
        </div>
      </div>
    </section>
  );

  const painelFunil = (
    <section
      className={cn(panel, "3xl:col-span-4")}
      aria-label="Funil do tráfego"
    >
      <ModuleHead
        icon="▤"
        kicker="Análise"
        title="Funil do tráfego"
        description="Cada etapa do caminho até a compra: quantas pessoas chegaram, quantas passaram para a etapa seguinte e quanto custou cada uma."
      />
      {/* Uma lista ordenada, e não uma pilha de divs: a ordem das etapas
                é o conteúdo aqui — quem ouve a página precisa saber que são
                sete passos e em qual deles está. */}
      {/* justify-between: se a coluna esticar, as sete etapas se distribuem
            pela altura em vez de amontoar no alto e deixar um vão embaixo. */}
      <ol className="acquisition-funnel-list flex flex-1 flex-col justify-between gap-3">
        {dayFunnel.stages.map(([label, value, rate, cost], index) => {
          const width = Math.max(100 - index * 8, 46);
          const previous = dayFunnel.stages[index - 1]?.[1] ?? value;
          const lost = Math.max(previous - value, 0);
          const isWorst = biggestLossStage === index && lost > 0;
          /* A cor caminha do roxo do topo ao rosa do fim conforme a
                   etapa desce — só a posição, sem significado próprio. */
          const mix = (index / Math.max(dayFunnel.stages.length - 1, 1)) * 100;
          const previousCost = previousDayFunnel.stages[index]?.[3] ?? 0;
          const costDelta =
            previousCost > 0 ? (cost - previousCost) / previousCost : null;
          return (
            /* Num painel largo a etapa é uma linha: bloco, pílula e
                     custo lado a lado. Num painel estreito — o celular, ou
                     esta coluna quando a tela encolhe — sobrariam 93px para o
                     bloco e o funil parava de afunilar; então a pílula e o
                     custo descem para baixo do bloco, que fica com a largura
                     inteira. O @sm:contents devolve os três à mesma linha sem
                     mudar a ordem do HTML. */
            <li
              key={label}
              className="acquisition-block acquisition-funnel-step flex flex-col items-center gap-3 p-3 @sm:flex-row"
            >
              {/* O bloco da etapa, centrado e mais estreito a cada passo. */}
              <div className="flex w-full min-w-0 flex-col items-center @sm:flex-1">
                <div
                  className="traffic-funnel-stage-bar @container flex flex-col items-center justify-center gap-1 px-2 pt-2 text-center text-white"
                  style={
                    {
                      "--traffic-stage-width": `${width}%`,
                      "--traffic-stage-mix": `${mix}%`,
                    } as React.CSSProperties
                  }
                >
                  <span className="max-w-full text-xs leading-4 font-bold text-balance break-words">
                    {label}
                  </span>
                  {/* O bloco mais estreito do funil tem ~100px: um dia de
                            volume alto colocaria "186.948" ali dentro e o
                            número passaria da borda. Abaixo de 7rem de bloco
                            ele desce um tamanho em vez de vazar. */}
                  <b className="text-xl leading-tight font-black tabular-nums @min-[7rem]:text-2xl">
                    {formatInteger(value)}
                  </b>
                </div>
                {isWorst && (
                  <span className="text-destructive mt-0.5 text-center text-[0.6875rem] leading-4 font-bold">
                    Maior perda: saíram {formatInteger(lost)} de{" "}
                    {formatInteger(previous)}
                  </span>
                )}
              </div>

              <div className="flex w-full items-center justify-center gap-2 @sm:contents">
                {/* O traço e a pílula com a conversão da etapa anterior
                          para esta. Na primeira não existe etapa anterior, e um
                          traço é mais honesto que "100%". */}
                <span
                  className="acquisition-block acquisition-funnel-rate text-muted-foreground grid min-h-16 w-20 shrink-0 place-content-center gap-1 px-2 py-2 text-center text-xs font-bold tabular-nums"
                  title={
                    index === 0
                      ? "Primeira etapa do funil: não há etapa anterior para comparar."
                      : `${formatPercent(rate, 2)} de quem passou pela etapa anterior chegou aqui.`
                  }
                >
                  <span className="text-[0.625rem] uppercase">Conversão</span>
                  {index === 0 ? "—" : formatPercent(rate, 2)}
                  <span className="sr-only">
                    {index === 0 ? "sem etapa anterior" : "da etapa anterior"}
                  </span>
                </span>

                {/* Quanto custou cada unidade desta etapa, e se ela ficou
                          mais cara ou mais barata que ontem. */}
                <div className="acquisition-block acquisition-funnel-cost w-32 shrink-0 space-y-1 px-2 py-2 text-center">
                  <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-semibold break-words">
                    Custo/{label}
                  </span>
                  <b className="block text-sm leading-5 font-extrabold tabular-nums">
                    {formatCurrency(cost, 2)}
                  </b>
                  {/* A variação usa texto, além da cor, para indicar o custo. */}
                  <span
                    className={cn(
                      "block text-[0.6875rem] leading-4 font-bold",
                      costDelta === null && "text-muted-foreground",
                      costDelta !== null && costDelta > 0 && "text-destructive",
                      costDelta !== null && costDelta <= 0 && "text-success",
                    )}
                  >
                    {costDelta === null
                      ? "sem custo ontem"
                      : `${formatPercent(
                          Math.abs(costDelta),
                          1,
                        )} ${costDelta > 0 ? "mais caro" : "mais barato"}`}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="acquisition-block acquisition-module-note text-muted-foreground px-4 py-3 text-center text-xs leading-5">
        A porcentagem no meio é quanto passou da etapa de cima para esta. O
        custo é comparado com o dia anterior ao que está escolhido no
        calendário.
      </p>
    </section>
  );

  const painelPublico = (
    <section
      className={cn(panel, "3xl:col-span-4")}
      aria-label="Público e demográficos"
    >
      <ModuleHead
        icon="◔"
        kicker="Público"
        title="Demográficos"
        description="Distribuição de idade estimada para o recorte atual."
      />
      {/* Coluna, e não linha: numa caixa alta e estreita a rosca fica em
            cima com a largura que tiver, e as faixas de idade se espalham
            embaixo até o pé do painel. Deitados, os dois ocupavam 300px no
            meio de 800 e o resto era fundo. */}
      <div className="acquisition-module-body flex flex-1 flex-col items-center gap-3">
        <div className="acquisition-block acquisition-audience-chart grid w-full place-items-center p-5">
          <div
            role="img"
            data-dashboard-chart="donut"
            data-dashboard-chart-part="ring"
            aria-label={`Idade de quem compra: ${dayFunnel.demographics
              .map((value, index) => `${AGE_BANDS[index]} ${value}%`)
              .join(", ")}`}
            className="relative aspect-square w-full max-w-[11rem] shrink-0 self-center rounded-full"
            style={{
              background: `conic-gradient(${dayFunnel.demographics
                .map((value, index) => {
                  const start = dayFunnel.demographics
                    .slice(0, index)
                    .reduce((sum, item) => sum + item, 0);
                  return `${AGE_COLORS[index]} ${start}% ${start + value}%`;
                })
                .join(", ")})`,
            }}
          >
            {/* O furo do meio acompanha o tamanho da rosca: em porcentagem,
                e não em pixels fixos, senão numa rosca de 256px ele viraria um
                aro fininho. */}
            <div
              className="bg-card absolute inset-[22%] grid place-items-center rounded-full text-center"
              data-dashboard-chart-part="hole"
            >
              <div>
                <b className="block text-2xl leading-none font-black tabular-nums">
                  {dayFunnel.demographics[1] ?? 0}%
                </b>
                <small className="text-muted-foreground text-xs">
                  25–34 anos
                </small>
              </div>
            </div>
          </div>
        </div>
        {/* auto-rows-fr: as cinco faixas dividem em partes iguais a altura
              que sobra e crescem juntas. Na altura natural elas se amontoavam
              no meio do painel; com content-between sobrava um buraco de
              250px entre uma e outra. */}
        {/* Uma faixa por linha: são cinco, e em duas colunas a última
              ficava sozinha com um buraco do lado. */}
        <ul
          aria-label="Faixas de idade"
          className="acquisition-audience-legend grid w-full min-w-0 flex-1 auto-rows-fr grid-cols-1 gap-3"
        >
          {dayFunnel.demographics.map((value, index) => (
            <li
              key={AGE_BANDS[index]}
              className="acquisition-block grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-center text-xs"
            >
              <i
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: AGE_COLORS[index] }}
              />
              <span className="min-w-0 font-bold">{AGE_BANDS[index]} anos</span>
              <b className="font-extrabold tabular-nums">{value}%</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );

  /* A composição antiga existe somente para a rota de diagnósticos. */
  const painelTrafego = (
    <div className="grid grid-cols-1 items-stretch gap-3 [font-family:var(--font-montserrat),system-ui,sans-serif] lg:max-3xl:grid-cols-2 3xl:grid-cols-12">
      {painelComportamento}
      {painelFunil}
      {painelPublico}
    </div>
  );

  const painelCriativos = (
    <div className="grid grid-cols-1 items-stretch gap-3 [font-family:var(--font-montserrat),system-ui,sans-serif] lg:max-3xl:grid-cols-2 3xl:grid-cols-12">
      <section
        className={cn(panel, "lg:max-3xl:col-span-2 3xl:col-span-12")}
        aria-label="Creative Intelligence"
      >
        <ModuleHead
          icon="✦"
          kicker="Criativos"
          title="Creative Intelligence"
          description="Atenção, clique, compra, custo e sinais de cansaço."
        />
        <div className="acquisition-module-body flex flex-1 flex-col gap-3">
          <div className="acquisition-block acquisition-creative-filter grid items-center gap-3 p-4 @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0 text-center">
              <span
                id="filtro-campanha-rotulo"
                className="text-muted-foreground block text-xs font-extrabold tracking-wide uppercase"
              >
                Campanha
              </span>
              <p className="text-muted-foreground mt-2 text-sm leading-5">
                {campaign
                  ? `${campaign.name} · ${campaign.objective}`
                  : `Visão consolidada de ${network?.name ?? "todas as redes"}.`}
              </p>
            </div>
            <BlockPicker
              id="filtro-campanha"
              labelledBy="filtro-campanha-rotulo"
              stretch
              value={campaignId}
              onChange={setCampaignId}
              options={[
                { value: "all", label: "Todas as campanhas" },
                ...campaigns.map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ]}
            />
          </div>

          {/* Resumo da campanha escolhida. */}
          <div className="acquisition-metric-grid grid auto-rows-fr grid-cols-2 gap-3 @md:grid-cols-3">
            <Metric label="Gasto" value={formatCompactCurrency(spend)} />
            <Metric
              label="Receita"
              value={formatCompactCurrency(revenue)}
              tone="good"
            />
            <Metric
              label="ROAS"
              value={formatRatio(revenue / Math.max(spend, 1))}
            />
            <Metric label="Compras" value={formatInteger(purchases)} />
            <Metric
              label="Custo/venda"
              value={formatCurrency(spend / Math.max(purchases, 1))}
            />
            <Metric
              label="CTR"
              value={formatPercent(clicks / Math.max(impressions, 1), 2)}
            />
          </div>

          {/* A lista tem altura limitada e rolagem própria. A área vazia usa
              somente a altura do aviso; tabIndex permite navegar pelo teclado. */}
          <div
            tabIndex={0}
            role="group"
            aria-label="Lista de criativos"
            className={cn(
              /* Fichas largas: em 2500px de painel cabem três por linha, em
                 1830 cabem duas, e abaixo de 40rem uma só ocupa a linha. */
              "acquisition-creative-list grid max-h-[40rem] min-h-40 shrink-0 grid-cols-[repeat(auto-fill,minmax(min(100%,40rem),1fr))] gap-3 overflow-y-auto",
              focusRing,
            )}
          >
            {creatives.length === 0 && (
              <div className="acquisition-block acquisition-empty-state col-span-full flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
                <h4 className="text-base font-extrabold">
                  Nenhum criativo disponível
                </h4>
                <p className="text-muted-foreground text-sm leading-6">
                  Os anúncios e seus resultados aparecerão aqui após a conexão
                  das campanhas.
                </p>
              </div>
            )}
            {creatives.map((item) => {
              const rede =
                operation.networks.find((n) => n.id === item.network) ?? null;
              /* Tudo o que a campanha guarda, na mesma ordem de leitura das
                 caixas de rede: primeiro o que ela devolveu, depois o que ela
                 custou, e por fim como o anúncio se comportou. O gancho e a
                 retenção só existem em vídeo — quando não existem, a caixa
                 diz "—" em vez de inventar um zero. */
              const numeros: { label: string; value: string }[] = [
                {
                  label: "Lucro",
                  value: formatCompactCurrency(item.profit),
                },
                {
                  label: "ROAS",
                  value: formatRatio(
                    item.checkoutRevenue / Math.max(item.spend, 1),
                  ),
                },
                {
                  label: "Margem",
                  value: formatPercent(
                    item.profit / Math.max(item.checkoutRevenue, 1),
                  ),
                },
                {
                  label: "Receita na plataforma",
                  value: formatCompactCurrency(item.platformRevenue),
                },
                { label: "Compras", value: formatInteger(item.purchases) },
                {
                  label: "Custo/venda",
                  value: formatCurrency(
                    item.spend / Math.max(item.purchases, 1),
                  ),
                },
                {
                  label: "Clientes novos",
                  value: formatInteger(item.newCustomers),
                },
                {
                  label: "NC-CAC",
                  value: formatCurrency(
                    item.spend / Math.max(item.newCustomers, 1),
                  ),
                },
                {
                  label: "Impressões",
                  value: formatInteger(item.impressions),
                },
                { label: "Cliques", value: formatInteger(item.clicks) },
                {
                  label: "CPM",
                  value: formatCurrency(
                    (item.spend / Math.max(item.impressions, 1)) * 1000,
                    2,
                  ),
                },
                {
                  label: "CTR",
                  value: formatPercent(
                    item.clicks / Math.max(item.impressions, 1),
                    2,
                  ),
                },
                {
                  label: "Conversão",
                  value: formatPercent(
                    item.purchases / Math.max(item.clicks, 1),
                    2,
                  ),
                },
                {
                  label: "Frequência",
                  value: formatRatio(item.frequency, 1),
                },
                {
                  label: "Gancho (3s)",
                  value: item.hook === null ? "—" : formatPercent(item.hook, 1),
                },
                {
                  label: "Retenção",
                  value: item.hold === null ? "—" : formatPercent(item.hold, 1),
                },
              ];

              return (
                <article
                  key={item.id}
                  className="acquisition-block acquisition-creative-card @container flex min-w-0 flex-col gap-3 p-3"
                >
                  <div className="acquisition-block acquisition-creative-title flex flex-wrap items-center justify-center gap-3 p-3 text-center">
                    <h4 className="flex min-w-0 flex-1 items-center justify-center gap-2 text-base leading-5 font-extrabold text-balance">
                      <i
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            rede?.color ?? "var(--color-muted-foreground)",
                        }}
                      />
                      {item.name}
                    </h4>
                    <span
                      className={cn(
                        "acquisition-block shrink-0 px-3 py-2 text-xs font-bold",
                        statusTone(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="acquisition-block acquisition-creative-summary grid gap-2 p-4 text-center">
                    <span className="text-muted-foreground text-xs font-bold uppercase">
                      Investimento
                    </span>
                    <b className="block text-2xl leading-tight font-black tracking-tight tabular-nums">
                      {formatCompactCurrency(item.spend)}
                    </b>
                    <p className="text-muted-foreground text-xs leading-5">
                      Gasto em {item.objective.toLowerCase()} ·{" "}
                      <b className="text-foreground font-bold tabular-nums">
                        {formatCompactCurrency(item.checkoutRevenue)}
                      </b>{" "}
                      em vendas confirmadas · {rede?.name ?? item.network}
                    </p>
                  </div>
                  <div className="acquisition-metric-grid grid flex-1 auto-rows-fr grid-cols-2 content-start gap-3 @md:grid-cols-4">
                    {numeros.map((numero) => (
                      <Metric
                        key={numero.label}
                        label={numero.label}
                        value={numero.value}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );

  if (section) {
    const sections = {
      behavior: painelComportamento,
      funnel: painelFunil,
      audience: painelPublico,
      creatives: painelCriativos,
    } satisfies Record<TrafficDiagnosticSection, React.ReactNode>;
    return <div className="acquisition-board min-w-0">{sections[section]}</div>;
  }

  return (
    <div className="acquisition-board min-w-0">
      <BoardPager
        ariaLabel="Análises complementares de aquisição"
        menuTitle="Diagnósticos"
        paginateOnMobile
        pages={[
          {
            label: "Tráfego e público",
            short: "Tráfego",
            content: painelTrafego,
          },
          {
            label: "Creative Intelligence",
            short: "Criativos",
            content: painelCriativos,
          },
        ]}
      />
    </div>
  );
}
