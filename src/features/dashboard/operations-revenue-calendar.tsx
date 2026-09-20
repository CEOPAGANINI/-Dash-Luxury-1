"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Sparkles,
  X,
} from "lucide-react";

import type { DemoRevenueDay } from "@/lib/demo-data";
import { dailyAdSpend, financeSummary, hashDate } from "@/domain/finance";
import { BlockPicker } from "@/components/ui/block-picker";
import { cn } from "@/lib/utils";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/shared/formatters/dashboard";
import type { CalendarMonth } from "@/features/dashboard/year-calendar";

interface HourlyPoint {
  hour: string;
  valor: number;
}

interface OperationsRevenueCalendarProps {
  days: DemoRevenueDay[];
  selectedDates: string[] | null;
  onSelectedDatesChange: (dates: string[] | null) => void;
  minMonth: CalendarMonth;
  maxMonth: CalendarMonth;
  dailyGoal: number;
  /** Escala de horas de cada dia ("AAAA-MM-DD" → 24 pontos): habilita o
      mini pilar de 24h dentro de cada célula do calendário. */
  hourlyByDay?: Record<string, HourlyPoint[]>;
}

type TrafficNetworkName = "Face ADS" | "Google ADS" | "YouTube ADS";

interface TrafficNetwork {
  name: TrafficNetworkName;
  short: string;
  color: string;
}

interface HoverState {
  data: DemoRevenueDay;
  left: number;
  top: number;
  opensLeft: boolean;
}

const NETWORKS: TrafficNetwork[] = [
  { name: "Face ADS", short: "Face", color: "#f5f5f5" },
  { name: "Google ADS", short: "Google", color: "#a8a8a8" },
  { name: "YouTube ADS", short: "YT", color: "#6a6a6a" },
];

interface ReturnFilter {
  id: string;
  label: string;
  color: string;
  test: (roas: number) => boolean;
}

/**
 * Faixas relativas ao ROAS de equilíbrio da operação. Isso evita tratar 1,5x
 * como “bom” para todo produto: quando custos e margem mudam, os limites do
 * calendário mudam junto. A base demonstrativa vem das próprias premissas do
 * domínio financeiro e deve ser substituída pelos custos reais da empresa.
 */
function buildReturnFilters(breakEvenRoas: number): ReturnFilter[] {
  const weak = breakEvenRoas * 1.1;
  const reasonable = breakEvenRoas * 1.3;
  const good = breakEvenRoas * 1.6;
  const ratio = (value: number) =>
    `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

  return [
    {
      id: "roas-below-break-even",
      label: `Abaixo do equilíbrio (${ratio(breakEvenRoas)})`,
      color: "#ef4444",
      test: (roas) => roas < breakEvenRoas,
    },
    {
      id: "roas-weak",
      label: `Fraco · até ${ratio(weak)}`,
      color: "#f59e0b",
      test: (roas) => roas >= breakEvenRoas && roas < weak,
    },
    {
      id: "roas-reasonable",
      label: `Razoável · até ${ratio(reasonable)}`,
      color: "#fcd34d",
      test: (roas) => roas >= weak && roas < reasonable,
    },
    {
      id: "roas-good",
      label: `Bom · até ${ratio(good)}`,
      color: "#bdbdbd",
      test: (roas) => roas >= reasonable && roas < good,
    },
    {
      id: "roas-excellent",
      label: `Excelente · ${ratio(good)}+`,
      color: "#e5e5e5",
      test: (roas) => roas >= good,
    },
  ];
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const WEEKDAYS_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const MS_PER_DAY = 86_400_000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function compactMoney(value: number) {
  return formatCompactCurrency(value, 1_000);
}

function toUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function isoFrom(ms: number) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function monthKey(month: CalendarMonth) {
  return month.year * 12 + month.month;
}

function dateLabel(date: string) {
  const value = new Date(toUtc(date));
  return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
}

const percentage = formatPercent;

/** Mesma técnica do gráfico grande: o pilar inteiro é UM degradê com 24
    faixas chapadas (00h na base, 23h no topo), sem emenda entre as horas.
    A intensidade é relativa ao melhor horário do próprio dia. */
function miniPillarGradient(hours: HourlyPoint[]) {
  if (hours.length === 0) return "transparent";
  const max = Math.max(...hours.map((h) => h.valor), 1);
  const stops = hours.map((h, i) => {
    const ratio = Math.min(Math.max(h.valor / max, 0), 1);
    const alpha = 0.06 + 0.94 * Math.pow(ratio, 0.7);
    const color = `rgba(255,230,0,${alpha.toFixed(3)})`;
    return `${color} ${((i / hours.length) * 100).toFixed(3)}%, ${color} ${(((i + 1) / hours.length) * 100).toFixed(3)}%`;
  });
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

function peakHourIndex(hours: HourlyPoint[]) {
  return hours.reduce(
    (best, h, i) => (h.valor > hours[best].valor ? i : best),
    0,
  );
}

function networkBreakdown(day: DemoRevenueDay) {
  const weights = [
    0.4 + hashDate(day.date, 11) * 0.24,
    0.28 + hashDate(day.date, 23) * 0.2,
    0.16 + hashDate(day.date, 37) * 0.16,
  ];
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const result = {} as Record<TrafficNetworkName, number>;
  let allocated = 0;

  NETWORKS.forEach((network, index) => {
    const value =
      index === NETWORKS.length - 1
        ? Math.max(0, day.aprovada - allocated)
        : Math.round(day.aprovada * (weights[index] / totalWeight));

    result[network.name] = value;
    allocated += value;
  });

  return result;
}

/**
 * Divide o gasto de mídia do dia entre as três redes, com uma eficiência
 * levemente diferente por rede — é isso que faz ROAS e ROI variarem entre elas.
 */
function networkSpendBreakdown(day: DemoRevenueDay) {
  const adSpend = dailyAdSpend(day);
  const breakdown = networkBreakdown(day);
  const salts: Record<TrafficNetworkName, number> = {
    "Face ADS": 91,
    "Google ADS": 97,
    "YouTube ADS": 103,
  };
  const weights = NETWORKS.map(
    (network) =>
      breakdown[network.name] *
      (0.75 + hashDate(day.date, salts[network.name]) * 0.55),
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const result = {} as Record<TrafficNetworkName, number>;
  let allocated = 0;

  NETWORKS.forEach((network, index) => {
    const value =
      index === NETWORKS.length - 1
        ? Math.max(0, adSpend - allocated)
        : Math.round(adSpend * (weights[index] / totalWeight));
    result[network.name] = value;
    allocated += value;
  });

  return result;
}

function derivedDay(day: DemoRevenueDay, dailyGoal: number) {
  const gross = day.aprovada + day.pendente + day.recusada;
  const resolved = day.aprovada + day.recusada;
  const efficiency = resolved > 0 ? day.aprovada / resolved : 0;
  const approvalRate = gross > 0 ? day.aprovada / gross : 0;
  const ticket = day.pedidos > 0 ? day.aprovada / day.pedidos : 0;
  const adSpend = dailyAdSpend(day);
  const financial = financeSummary([day]);
  const roas = day.aprovada / Math.max(adSpend, 1);
  const totalInvestment =
    adSpend +
    financial.taxas +
    financial.custoProduto +
    financial.reembolso +
    financial.chargeback;
  const roi = financial.lucroContribuicao / Math.max(totalInvestment, 1);
  const nonMediaRate =
    day.aprovada > 0
      ? (financial.taxas +
          financial.custoProduto +
          financial.reembolso +
          financial.chargeback) /
        day.aprovada
      : 0;
  const breakEvenRoas = 1 / Math.max(0.2, 1 - Math.min(nonMediaRate, 0.8));
  const goalProgress = dailyGoal > 0 ? day.aprovada / dailyGoal : 0;
  const provisional = hashDate(day.date, 81) > 0.78;
  const divergence = day.recusada / Math.max(gross, 1) > 0.095;
  const status = divergence
    ? "Com divergência"
    : provisional
      ? "Provisório"
      : "Fechado";

  const tier =
    roas >= breakEvenRoas * 1.6
      ? { label: "Excelente", tone: "green" as const, color: "#e5e5e5" }
      : roas >= breakEvenRoas * 1.15
        ? { label: "Estável", tone: "yellow" as const, color: "#fcd34d" }
        : {
            label: roas >= breakEvenRoas ? "Atenção" : "Abaixo do equilíbrio",
            tone: "red" as const,
            color: "#ef4444",
          };

  return {
    gross,
    efficiency,
    approvalRate,
    ticket,
    adSpend,
    roas,
    roi,
    breakEvenRoas,
    contributionProfit: financial.lucroContribuicao,
    contributionMargin: financial.margemContribuicao,
    goalProgress,
    status,
    tier,
  };
}

function selectedDaysSorted(
  days: DemoRevenueDay[],
  selectedDates: string[] | null,
) {
  if (!selectedDates) return [];
  const selected = new Set(selectedDates);
  return days.filter((day) => selected.has(day.date));
}

function executiveInsight(day: DemoRevenueDay, dailyGoal: number) {
  const info = derivedDay(day, dailyGoal);
  const missing = dailyGoal - day.aprovada;
  const pendingShare = day.pendente / Math.max(info.gross, 1);

  if (info.roas < 1.2) {
    return "O retorno está abaixo da faixa segura. Revise custo de mídia, criativo e qualidade do tráfego antes de escalar.";
  }

  if (pendingShare > 0.15) {
    return `${percentage(pendingShare)} da receita ainda está pendente. A recuperação desses pagamentos pode elevar o desempenho do dia.`;
  }

  if (missing > 0) {
    return `Faltaram ${formatCurrency(missing)} para atingir a meta diária. Compare as três redes e priorize a origem com maior eficiência.`;
  }

  return `A meta foi superada em ${formatCurrency(Math.abs(missing))}. Vale identificar quais campanhas sustentaram o melhor retorno.`;
}

export function OperationsRevenueCalendar({
  days,
  selectedDates,
  onSelectedDatesChange,
  minMonth,
  maxMonth,
  dailyGoal,
  hourlyByDay,
}: OperationsRevenueCalendarProps) {
  const byDate = React.useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );
  const min = monthKey(minMonth);
  const max = monthKey(maxMonth);
  // Abre no mês de hoje (não no último mês navegável, que pode estar anos
  // à frente), respeitando os limites.
  const [viewMonth, setViewMonth] = React.useState(() => {
    const agora = new Date();
    const mesAtual = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
    return Math.min(max, Math.max(min, mesAtual));
  });
  const [activeNetworks, setActiveNetworks] = React.useState<
    Set<TrafficNetworkName>
  >(() => new Set(NETWORKS.map((network) => network.name)));
  const [daySelections, setDaySelections] = React.useState<
    Map<string, Set<TrafficNetworkName>>
  >(() => new Map());
  const [hover, setHover] = React.useState<HoverState | null>(null);
  /** Dia "fixado" pelo clique: abre o painel completo de detalhes, que só
      fecha no X, no Esc ou clicando fora. */
  const [pinnedDate, setPinnedDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pinnedDate) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedDate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedDate]);

  const selectedSet = React.useMemo<Set<string>>(
    () => new Set<string>(selectedDates ?? []),
    [selectedDates],
  );
  const year = Math.floor(viewMonth / 12);
  const month = viewMonth % 12;

  const cells = React.useMemo(() => {
    const first = Date.UTC(year, month, 1);
    const before = (new Date(first).getUTCDay() + 6) % 7;
    const list: string[] = [];

    for (let index = before; index > 0; index -= 1) {
      list.push(isoFrom(first - index * MS_PER_DAY));
    }

    const monthDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= monthDays; day += 1) {
      list.push(isoFrom(Date.UTC(year, month, day)));
    }

    while (list.length % 7 !== 0) {
      list.push(isoFrom(toUtc(list[list.length - 1]) + MS_PER_DAY));
    }

    return list;
  }, [month, year]);

  const weeks = React.useMemo(() => {
    const result: string[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
      result.push(cells.slice(index, index + 7));
    }
    return result;
  }, [cells]);

  const monthDays = React.useMemo(
    () =>
      days.filter((day) => {
        const date = new Date(toUtc(day.date));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month;
      }),
    [days, month, year],
  );

  const selectedRows = React.useMemo(
    () => selectedDaysSorted(days, selectedDates),
    [days, selectedDates],
  );

  const breakEvenRoas = React.useMemo(() => {
    if (monthDays.length === 0) return 1.35;
    const summary = financeSummary(monthDays);
    const nonMediaCosts =
      summary.taxas +
      summary.custoProduto +
      summary.reembolso +
      summary.chargeback;
    const nonMediaRate =
      summary.caixaRecebido > 0 ? nonMediaCosts / summary.caixaRecebido : 0;
    return 1 / Math.max(0.2, 1 - Math.min(nonMediaRate, 0.8));
  }, [monthDays]);

  const returnFilters = React.useMemo(
    () => buildReturnFilters(breakEvenRoas),
    [breakEvenRoas],
  );

  /** Datas do mês visível que caem em cada faixa de ROAS. */
  const returnFilterMatches = React.useMemo(() => {
    const matches = new Map<string, string[]>(
      returnFilters.map((f) => [f.id, []]),
    );
    monthDays.forEach((day) => {
      const info = derivedDay(day, dailyGoal);
      returnFilters.forEach((filter) => {
        if (filter.test(info.roas)) matches.get(filter.id)?.push(day.date);
      });
    });
    return matches;
  }, [monthDays, dailyGoal, returnFilters]);

  function returnFilterActive(id: string) {
    const dates = returnFilterMatches.get(id) ?? [];
    return (
      dates.length > 0 &&
      dates.length === selectedSet.size &&
      dates.every((date) => selectedSet.has(date))
    );
  }

  /** Seleciona todos os dias do mês naquele nível; clicando de novo, limpa. */
  function applyReturnFilter(id: string) {
    const dates = returnFilterMatches.get(id) ?? [];
    if (dates.length === 0) return;
    onSelectedDatesChange(returnFilterActive(id) ? null : dates);
  }

  function networksForDay(date: string) {
    const override = daySelections.get(date);
    if (override)
      return NETWORKS.filter((network) => override.has(network.name));
    return NETWORKS.filter((network) => activeNetworks.has(network.name));
  }

  function displayedRevenue(day: DemoRevenueDay) {
    const breakdown = networkBreakdown(day);
    return networksForDay(day.date).reduce(
      (sum, network) => sum + breakdown[network.name],
      0,
    );
  }

  function commitSelection(next: Set<string>) {
    const ordered = days
      .filter((day) => next.has(day.date))
      .map((day) => day.date);
    onSelectedDatesChange(ordered.length > 0 ? ordered : null);
  }

  function toggleDay(date: string) {
    if (!byDate.has(date)) return;
    const next = new Set<string>(selectedSet);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    commitSelection(next);
  }

  function toggleWeek(week: string[]) {
    const available = week.filter((date) => byDate.has(date));
    if (available.length === 0) return;

    const allSelected = available.every((date) => selectedSet.has(date));
    const next = new Set<string>(selectedSet);

    available.forEach((date) => {
      if (allSelected) next.delete(date);
      else next.add(date);
    });

    commitSelection(next);
  }

  function toggleNetwork(networkName: TrafficNetworkName | "all") {
    setActiveNetworks((current) => {
      if (networkName === "all") {
        return current.size === NETWORKS.length
          ? new Set<TrafficNetworkName>()
          : new Set<TrafficNetworkName>(
              NETWORKS.map((network) => network.name),
            );
      }

      const next = new Set<TrafficNetworkName>(current);
      if (next.has(networkName)) next.delete(networkName);
      else next.add(networkName);
      return next;
    });
  }

  function toggleDayNetwork(date: string, networkName: TrafficNetworkName) {
    setDaySelections((current) => {
      const next = new Map<string, Set<TrafficNetworkName>>(current);
      const existing = next.get(date);
      const selection: Set<TrafficNetworkName> = existing
        ? new Set<TrafficNetworkName>(existing)
        : new Set<TrafficNetworkName>([networkName]);

      if (existing) {
        if (selection.has(networkName)) selection.delete(networkName);
        else selection.add(networkName);
      }

      next.set(date, selection);
      return next;
    });

    if (!selectedSet.has(date)) {
      const next = new Set<string>(selectedSet);
      next.add(date);
      commitSelection(next);
    }
  }

  function resetDayNetworks(date: string) {
    setDaySelections((current) => {
      const next = new Map<string, Set<TrafficNetworkName>>(current);
      next.delete(date);
      return next;
    });
  }

  function showTooltip(day: DemoRevenueDay, target: HTMLElement) {
    // Com o painel fixado aberto, a espiada de hover só atrapalharia.
    if (pinnedDate) return;
    const rect = target.getBoundingClientRect();
    const width = 354;
    const height = 520;
    const margin = 14;
    const gap = 12;
    const opensLeft = rect.right + gap + width > window.innerWidth - margin;
    const left = opensLeft ? rect.left - width - gap : rect.right + gap;
    const top = Math.max(
      margin,
      Math.min(
        window.innerHeight - height - margin,
        rect.top + rect.height / 2 - height / 2,
      ),
    );

    setHover({
      data: day,
      left: Math.max(margin, left),
      top,
      opensLeft,
    });
  }

  const summaryRows = selectedRows.length > 0 ? selectedRows : monthDays;

  /**
   * Lucro e ROI por rede com alocação proporcional dos custos não-mídia.
   * A alocação é uma estimativa demonstrativa; no banco real deve vir do
   * produto/pedido/canal para que o ROI seja observável, não inferido.
   */
  const networkProfit = React.useMemo(() => {
    const stats = new Map<
      TrafficNetworkName,
      { revenue: number; spend: number }
    >(NETWORKS.map((network) => [network.name, { revenue: 0, spend: 0 }]));
    summaryRows.forEach((day) => {
      const revenue = networkBreakdown(day);
      const spend = networkSpendBreakdown(day);
      NETWORKS.forEach((network) => {
        const entry = stats.get(network.name);
        if (!entry) return;
        entry.revenue += revenue[network.name];
        entry.spend += spend[network.name];
      });
    });

    const summary = financeSummary(summaryRows);
    const totalRevenue =
      Array.from(stats.values()).reduce(
        (sum, entry) => sum + entry.revenue,
        0,
      ) || 1;
    const nonMediaCosts =
      summary.taxas +
      summary.custoProduto +
      summary.reembolso +
      summary.chargeback;
    const byNetwork = new Map<
      TrafficNetworkName,
      { lucro: number; roi: number; roas: number }
    >();
    let totalLucro = 0;
    let totalInvestment = 0;
    let totalMediaSpend = 0;

    stats.forEach((entry, name) => {
      const allocatedNonMedia = nonMediaCosts * (entry.revenue / totalRevenue);
      const investment = entry.spend + allocatedNonMedia;
      const lucro = entry.revenue - investment;
      byNetwork.set(name, {
        lucro,
        roi: investment > 0 ? lucro / investment : 0,
        roas: entry.spend > 0 ? entry.revenue / entry.spend : 0,
      });
      totalLucro += lucro;
      totalInvestment += investment;
      totalMediaSpend += entry.spend;
    });

    return {
      byNetwork,
      total: {
        lucro: totalLucro,
        roi: totalInvestment > 0 ? totalLucro / totalInvestment : 0,
        roas: totalMediaSpend > 0 ? totalRevenue / totalMediaSpend : 0,
      },
    };
  }, [summaryRows]);
  const summaryRevenue = summaryRows.reduce(
    (sum, day) => sum + displayedRevenue(day),
    0,
  );
  const summaryGross = summaryRows.reduce(
    (sum, day) => sum + day.aprovada + day.pendente + day.recusada,
    0,
  );
  const summaryApproved = summaryRows.reduce(
    (sum, day) => sum + day.aprovada,
    0,
  );
  const summaryEfficiency =
    summaryGross > 0 ? summaryApproved / summaryGross : 0;
  const bestDay = summaryRows.reduce<DemoRevenueDay | null>(
    (best, day) =>
      !best || displayedRevenue(day) > displayedRevenue(best) ? day : best,
    null,
  );

  const pinnedDay = pinnedDate ? byDate.get(pinnedDate) : undefined;

  return (
    <section className="orc-shell">
      <style>{`
        .orc-shell {
          --orc-line: var(--border);
          --orc-muted: var(--muted-foreground);
          --orc-ink: var(--foreground);
          position: relative;
          overflow: visible;
          border: 1px solid var(--orc-line);
          border-radius: var(--radius-panel, 24px);
          background:
            radial-gradient(circle at 8% 0%, rgba(24,119,242,.055), transparent 24%),
            radial-gradient(circle at 92% 5%, rgba(14,167,101,.045), transparent 26%),
            linear-gradient(145deg,#1c1d1e 0%,#18191a 100%);
          box-shadow: 0 24px 64px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
        }
        /* O corpo é o "container" das container queries. Os overlays fixos
           (tooltip, modal, backdrop) ficam FORA dele de propósito: layout
           containment mudaria o ancoradouro do position: fixed. */
        .orc-body {
          container-type: inline-size;
          container-name: orc;
        }
        .orc-header {
          display: grid;
          grid-template-columns: minmax(250px,.48fr) minmax(0,1.52fr);
          gap: 22px;
          padding: var(--space-5, 24px);
          border-bottom: 1px solid var(--orc-line);
        }
        .orc-title small {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--success);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .orc-title h3 {
          margin-top: 10px;
          color: var(--orc-ink);
          font-size: clamp(30px,4vw,56px);
          font-weight: 850;
          line-height: 1.02;
          letter-spacing: -.04em;
        }
        .orc-title p {
          max-width: 46ch;
          margin-top: 14px;
          color: var(--muted-foreground);
          font-size: 13.5px;
          line-height: 1.6;
        }
        .orc-controls {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 18px;
        }
        .orc-monthbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .orc-monthbar > button {
          height: var(--control-h, 44px);
          border: 1px solid var(--input);
          border-radius: 11px;
          background: var(--secondary);
          color: var(--foreground);
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 6px 16px rgba(0,0,0,.4);
        }
        .orc-monthbar > button {
          width: var(--control-h, 44px);
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .orc-monthbar > button:disabled { opacity: .35; cursor: not-allowed; }
        .orc-monthbar > button:focus-visible {
          outline: 2px solid var(--success);
          outline-offset: 2px;
        }
        .orc-networkbar {
          display: grid;
          grid-template-columns: repeat(4,minmax(0,1fr));
          gap: 8px;
          padding: 7px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: rgba(255,255,255,.04);
        }
        .orc-network-filter {
          min-width: 0;
          min-height: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--accent);
          color: var(--muted-foreground);
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          opacity: .55;
          transition: .18s ease;
        }
        .orc-network-filter:focus-visible {
          outline: 2px solid var(--success);
          outline-offset: 2px;
          opacity: 1;
        }
        .orc-network-filter i {
          width: 7px;
          height: 7px;
          flex: 0 0 7px;
          border-radius: 50%;
          background: var(--network-color);
          box-shadow: 0 0 8px color-mix(in srgb,var(--network-color) 60%,transparent);
        }
        .orc-network-filter.active {
          color: var(--orc-ink);
          opacity: 1;
          border-color: color-mix(in srgb,var(--network-color) 45%,rgba(255,255,255,.10));
          background: color-mix(in srgb,var(--network-color) 12%,var(--camada-1) 88%);
          box-shadow: 0 7px 18px rgba(0,0,0,.35), 0 0 0 2px color-mix(in srgb,var(--network-color) 6%,transparent);
        }
        .orc-network-filter.all i {
          background: linear-gradient(135deg,#f5f5f5,#a8a8a8,#6a6a6a);
        }
        .orc-net-name {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 800;
        }
        .orc-net-stats {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .orc-net-stats b {
          font-size: 13px;
          font-weight: 850;
          font-variant-numeric: tabular-nums lining-nums;
        }
        .orc-net-stats b.gain { color: var(--success); }
        .orc-net-stats b.loss { color: var(--destructive); }
        .orc-net-stats em {
          color: var(--muted-foreground);
          font-size: 12px;
          font-style: normal;
          font-weight: 700;
          font-variant-numeric: tabular-nums lining-nums;
        }
        .orc-network-filter.active .orc-net-stats em { color: var(--muted-foreground); }
        .orc-returnbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: var(--space-3, 14px) var(--space-5, 24px);
          border-bottom: 1px solid var(--orc-line);
        }
        .orc-break-even-note {
          display: inline-flex;
          min-height: var(--control-h, 44px);
          align-items: center;
          padding: 4px 12px;
          border-radius: 999px;
          background: rgba(255,255,255,.06);
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 800;
          font-variant-numeric: tabular-nums lining-nums;
        }
        .orc-return-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: var(--control-h, 44px);
          padding: 4px 14px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--accent);
          font: inherit;
          cursor: pointer;
          box-shadow: 0 5px 14px rgba(0,0,0,.35);
          transition: .16s ease;
        }
        .orc-return-filter:disabled { opacity: .35; cursor: not-allowed; }
        .orc-return-filter:focus-visible {
          outline: 2px solid var(--success);
          outline-offset: 2px;
        }
        .orc-return-filter i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--filter-color);
          box-shadow: 0 0 8px color-mix(in srgb,var(--filter-color) 60%,transparent);
        }
        .orc-return-filter span {
          color: var(--orc-ink);
          font-size: 13px;
          font-weight: 800;
        }
        .orc-return-filter b {
          color: color-mix(in srgb,var(--filter-color) 72%,#f0f0f0);
          font-size: 12px;
          font-weight: 850;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .orc-return-filter em {
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          color: var(--muted-foreground);
          font-size: 12px;
          font-style: normal;
          font-weight: 750;
          font-variant-numeric: tabular-nums lining-nums;
        }
        .orc-return-filter.active {
          border-color: color-mix(in srgb,var(--filter-color) 50%,rgba(255,255,255,.10));
          background: color-mix(in srgb,var(--filter-color) 12%,var(--camada-1) 88%);
          box-shadow: 0 6px 16px rgba(0,0,0,.4), 0 0 0 2px color-mix(in srgb,var(--filter-color) 10%,transparent);
        }
        .orc-scroll { overflow-x: auto; padding: var(--space-4, 18px) var(--space-4, 20px) var(--space-3, 12px); }
        .orc-calendar { min-width: 1060px; }
        .orc-weekdays {
          display: grid;
          grid-template-columns: repeat(7,minmax(0,1fr)) 132px;
          gap: 10px;
          padding: 0 4px 10px;
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 850;
          letter-spacing: .1em;
          text-align: center;
        }
        .orc-weeks { display: flex; flex-direction: column; gap: 10px; }
        .orc-week {
          display: grid;
          grid-template-columns: minmax(0,1fr) 132px;
          gap: 10px;
          align-items: center;
        }
        .orc-week-grid {
          display: grid;
          grid-template-columns: repeat(7,minmax(0,1fr));
          min-height: 184px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: rgba(255,255,255,.03);
          box-shadow: 0 9px 24px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .orc-day {
          position: relative;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 12px 8px 10px;
          border: 0;
          border-right: 1px solid var(--border);
          background: transparent;
          color: var(--orc-ink);
          cursor: pointer;
          transition: background .18s ease, transform .18s ease, opacity .18s ease;
        }
        .orc-day:last-child { border-right: 0; }
        .orc-day:hover { z-index: 2; background: rgba(255,255,255,.05); transform: translateY(-2px); }
        .orc-day:focus-visible { z-index: 2; outline: 2px solid var(--success); outline-offset: -2px; }
        .orc-day.outside { opacity: .48; }
        .orc-day.selected { background: rgba(14,167,101,.055); box-shadow: inset 0 0 0 2px rgba(14,167,101,.34); }
        .orc-day-number {
          --day-color: #e5e5e5;
          width: 48px;
          height: 48px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,.12);
          background: var(--camada-0);
          color: #fff;
          font-size: 15px;
          font-weight: 850;
          font-variant-numeric: tabular-nums lining-nums;
          box-shadow: 0 0 0 2px var(--day-color), 0 0 17px color-mix(in srgb,var(--day-color) 62%,transparent), inset 0 1px 0 rgba(255,255,255,.18);
          animation: orcPulse 2.2s ease-in-out infinite;
        }
        .orc-day-top {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        /* Mini pilar de 24h do dia: mesma linguagem do gráfico grande —
           moldura clara sobre o cartão escuro, 24 faixas amarelas (00h na
           base) e a hora de pico com halo neon. */
        .orc-mini-pillar {
          position: relative;
          width: 22px;
          height: 52px;
          border: 1.5px solid rgba(255,255,255,.5);
          background: var(--mini-fill);
        }
        .orc-mini-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            to top,
            transparent 0,
            transparent calc(100% / 6 - 1px),
            rgba(255,255,255,.16) calc(100% / 6 - 1px),
            rgba(255,255,255,.16) calc(100% / 6)
          );
        }
        .orc-mini-peak {
          position: absolute;
          left: 0;
          right: 0;
          height: calc(100% / 24);
          pointer-events: none;
          background: rgba(255,230,0,.95);
          box-shadow: 0 0 8px rgba(255,230,0,.9), 0 0 16px rgba(255,230,0,.55);
        }
        .orc-day-total {
          color: var(--foreground);
          font-size: 14px;
          font-weight: 850;
          font-variant-numeric: tabular-nums lining-nums;
          white-space: nowrap;
        }
        .orc-day-total small {
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 750;
        }
        /* Dia da semana dentro do card — só aparece na visão em lista
           (celular), quando a linha de cabeçalho SEG–DOM some. */
        .orc-day-weekday {
          display: none;
          margin-right: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,.07);
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .06em;
        }
        .orc-sharebar {
          width: 100%;
          height: 5px;
          display: flex;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
        }
        .orc-sharebar i { height: 100%; background: var(--network-color); }
        .orc-day-networks {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .orc-day-network {
          min-width: 0;
          min-height: 32px;
          display: grid;
          grid-template-columns: 7px minmax(0,1fr) auto;
          align-items: center;
          gap: 5px;
          padding: 0 6px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--accent);
          color: var(--muted-foreground);
          font: inherit;
          cursor: pointer;
          opacity: .5;
          transition: .16s ease;
        }
        .orc-day-network:focus-visible {
          outline: 2px solid var(--success);
          outline-offset: 1px;
          opacity: 1;
        }
        .orc-day-network i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--network-color);
          box-shadow: 0 0 7px color-mix(in srgb,var(--network-color) 64%,transparent);
        }
        .orc-day-network span {
          overflow: hidden;
          color: inherit;
          font-size: 12px;
          font-weight: 760;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .orc-day-network b {
          color: inherit;
          font-size: 12px;
          font-weight: 820;
          font-variant-numeric: tabular-nums lining-nums;
          white-space: nowrap;
        }
        @media (pointer: coarse) {
          .orc-day-network { min-height: 40px; }
        }
        .orc-day-network.active {
          opacity: 1;
          color: var(--foreground);
          border-color: color-mix(in srgb,var(--network-color) 50%,rgba(255,255,255,.10));
          background: color-mix(in srgb,var(--network-color) 12%,var(--camada-1) 88%);
          box-shadow: 0 4px 12px rgba(0,0,0,.35), 0 0 0 1px color-mix(in srgb,var(--network-color) 7%,transparent);
        }
        .orc-status {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 650;
        }
        .orc-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--status-color); box-shadow: 0 0 7px var(--status-color); }
        .orc-week-button {
          min-height: var(--control-h-touch, 48px);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid var(--input);
          border-radius: 14px;
          background: var(--secondary);
          color: var(--foreground);
          font: inherit;
          font-size: 13px;
          font-weight: 780;
          cursor: pointer;
          box-shadow: 0 7px 18px rgba(0,0,0,.4);
        }
        .orc-week-button:focus-visible {
          outline: 2px solid var(--success);
          outline-offset: 2px;
        }
        .orc-week-button.selected {
          border-color: rgba(14,167,101,.46);
          background: rgba(14,167,101,.07);
          color: var(--success);
        }
        .orc-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
          gap: 10px;
          padding: var(--space-3, 12px) var(--space-4, 20px) var(--space-4, 20px);
        }
        .orc-summary-card {
          min-width: 0;
          min-height: 96px;
          padding: 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius-card, 14px);
          background: var(--card);
          box-shadow: 0 7px 18px rgba(0,0,0,.35);
        }
        .orc-summary-card small {
          color: var(--muted-foreground);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .orc-summary-card strong {
          display: block;
          margin-top: 8px;
          color: var(--foreground);
          font-size: clamp(18px, 1.1rem + 0.4vw, 22px);
          font-weight: 800;
          letter-spacing: -.02em;
          font-variant-numeric: tabular-nums lining-nums;
        }
        .orc-summary-card p {
          margin-top: 6px;
          color: var(--muted-foreground);
          font-size: 12px;
          line-height: 1.5;
        }
        .orc-tooltip {
          position: fixed;
          z-index: 100;
          width: 400px;
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          max-height: calc(100dvh - 24px);
          overflow: auto;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 18px;
          background: radial-gradient(circle at 95% 0%,rgba(24,119,242,.10),transparent 26%), linear-gradient(160deg,#111318 0%,#080a0d 100%);
          color: #fff;
          box-shadow: 0 28px 72px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.055);
          pointer-events: none;
          animation: orcTooltipIn .18s cubic-bezier(.16,1,.3,1);
        }
        .orc-tooltip-inner { padding: 18px; }
        .orc-tooltip-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .orc-tooltip-head small { color: #a8a8a8; font-size: 12px; font-weight: 650; }
        .orc-tooltip-head strong { display: block; margin-top: 5px; color: #f5f7fa; font-size: 14px; font-weight: 750; }
        .orc-tier { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 999px; background: rgba(255,255,255,.035); color: var(--tier-color); font-size: 12px; font-weight: 800; }
        .orc-tier i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
        .orc-tooltip-hero { margin-top: 16px; }
        .orc-tooltip-hero small { color: #9e9e9e; font-size: 12px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
        .orc-tooltip-hero strong { display: block; margin-top: 6px; color: #fff; font-size: clamp(26px, 6cqw, 30px); font-weight: 780; line-height: 1; letter-spacing: -.03em; font-variant-numeric: tabular-nums lining-nums; }
        .orc-distribution { display: flex; height: 6px; margin-top: 14px; overflow: hidden; border-radius: 999px; background: #252830; }
        .orc-distribution i { height: 100%; }
        .orc-money-list { display: grid; gap: 8px; margin-top: 12px; }
        .orc-money-row { display: grid; grid-template-columns: minmax(0,1fr) auto 44px; align-items: center; gap: 8px; }
        .orc-money-row span { display: flex; align-items: center; gap: 8px; color: #c2c2c2; font-size: 12px; }
        .orc-money-row span i { width: 7px; height: 7px; border-radius: 50%; background: var(--row-color); box-shadow: 0 0 7px var(--row-color); }
        .orc-money-row b { color: #fff; font-size: 13px; font-weight: 760; font-variant-numeric: tabular-nums lining-nums; }
        .orc-money-row em { color: #9e9e9e; font-size: 12px; font-style: normal; text-align: right; font-variant-numeric: tabular-nums lining-nums; }
        .orc-tooltip-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; margin-top: 15px; overflow: hidden; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; background: rgba(255,255,255,.07); }
        .orc-tooltip-metrics div { min-height: 64px; padding: 10px; background: rgba(9,11,15,.96); }
        .orc-tooltip-metrics span { color: #9e9e9e; font-size: 12px; font-weight: 750; letter-spacing: .02em; }
        .orc-tooltip-metrics b { display: block; margin-top: 6px; color: #f6f7f9; font-size: 14px; font-weight: 760; font-variant-numeric: tabular-nums lining-nums; }
        .orc-tooltip-networks { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.075); }
        .orc-tooltip-network { display: flex; align-items: center; justify-content: space-between; min-height: 34px; margin-top: 6px; padding: 0 10px; border: 1px solid color-mix(in srgb,var(--network-color) 18%,rgba(255,255,255,.06)); border-radius: 8px; background: color-mix(in srgb,var(--network-color) 5%,rgba(255,255,255,.018)); }
        .orc-tooltip-network span { display: flex; align-items: center; gap: 8px; color: #c2c2c2; font-size: 12px; }
        .orc-tooltip-network span i { width: 7px; height: 7px; border-radius: 50%; background: var(--network-color); box-shadow: 0 0 7px var(--network-color); }
        .orc-tooltip-network b { color: #fff; font-size: 13px; font-variant-numeric: tabular-nums lining-nums; }
        .orc-insight { display: grid; grid-template-columns: 24px 1fr; gap: 10px; margin-top: 14px; padding: 12px; border: 1px solid rgba(24,119,242,.18); border-radius: 10px; background: linear-gradient(145deg,rgba(24,119,242,.10),rgba(24,119,242,.035)); }
        .orc-insight i { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 7px; background: rgba(24,119,242,.14); color: #c2c2c2; font-size: 12px; font-style: normal; }
        .orc-insight p { margin: 0; color: #c2c2c2; font-size: 12.5px; line-height: 1.55; }
        .orc-backdrop {
          position: fixed;
          inset: 0;
          z-index: 110;
          background: rgba(9,11,15,.5);
          backdrop-filter: blur(2px);
          animation: orcTooltipIn .16s ease-out;
        }
        .orc-detail {
          position: fixed;
          z-index: 120;
          top: 50%;
          left: 50%;
          transform: translate(-50%,-50%);
          width: min(460px, calc(100vw - 20px));
          max-height: calc(100vh - 24px);
          max-height: calc(100dvh - 24px);
          overflow: auto;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 18px;
          background: radial-gradient(circle at 95% 0%,rgba(24,119,242,.10),transparent 26%), linear-gradient(160deg,#111318 0%,#080a0d 100%);
          color: #fff;
          box-shadow: 0 32px 90px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.055);
          animation: orcDetailIn .2s cubic-bezier(.16,1,.3,1);
        }
        @keyframes orcDetailIn { from { opacity: 0; transform: translate(-50%,-48%) scale(.96); } to { opacity: 1; transform: translate(-50%,-50%) scale(1); } }
        .orc-detail-close {
          position: absolute;
          top: 10px;
          right: 10px;
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 50%;
          background: rgba(255,255,255,.06);
          color: #c2c2c2;
          cursor: pointer;
        }
        .orc-detail-close:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .orc-detail-close:hover { background: rgba(255,255,255,.12); color: #fff; }
        .orc-detail-hours {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 15px;
          padding: 10px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 12px;
          background: rgba(255,255,255,.03);
        }
        .orc-detail-pillar {
          position: relative;
          flex: 0 0 30px;
          width: 30px;
          height: 110px;
          border: 1.5px solid rgba(255,255,255,.5);
          background: var(--mini-fill);
        }
        .orc-detail-hours small {
          display: block;
          color: #9e9e9e;
          font-size: 12px;
          font-weight: 750;
          letter-spacing: .05em;
          text-transform: uppercase;
        }
        .orc-detail-hours strong {
          display: block;
          margin-top: 6px;
          color: #f5f7fa;
          font-size: 14px;
          font-weight: 780;
        }
        .orc-detail-action {
          width: 100%;
          min-height: var(--control-h-touch, 48px);
          margin-top: 15px;
          padding: 11px;
          border: 1px solid rgba(255,230,0,.4);
          border-radius: 11px;
          background: rgba(255,230,0,.12);
          color: #f59e0b;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          transition: .16s ease;
        }
        .orc-detail-action:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .orc-detail-action:hover { background: rgba(255,230,0,.2); }
        .orc-detail-action.remove {
          border-color: rgba(255,64,93,.4);
          background: rgba(255,64,93,.1);
          color: #ef4444;
        }
        .orc-detail-action.remove:hover { background: rgba(255,64,93,.18); }
        @keyframes orcPulse { 0%,100% { transform: scale(.95); filter: brightness(.95); } 50% { transform: scale(1.07); filter: brightness(1.18); } }
        @keyframes orcTooltipIn { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        /* ============ Adaptação por espaço disponível (container) ============ */

        /* Componente médio: cabeçalho empilha, filtros continuam completos. */
        @container orc (max-width: 900px) {
          .orc-header { grid-template-columns: 1fr; }
          .orc-monthbar { justify-content: flex-start; flex-wrap: wrap; }
        }

        /*
          Componente compacto (celular): o mês deixa de ser uma grade de 7
          colunas e vira uma LISTA cronológica de cards diários — mesma
          informação, mesmos botões, sem nada espremido. O botão da semana
          ocupa a largura toda logo abaixo dos 7 dias.
        */
        @container orc (max-width: 719px) {
          .orc-scroll { overflow-x: visible; padding-inline: 12px; }
          .orc-calendar { min-width: 0; }
          .orc-weekdays { display: none; }
          .orc-week { grid-template-columns: 1fr; gap: 8px; }
          .orc-week-grid {
            grid-template-columns: 1fr;
            min-height: 0;
          }
          .orc-day {
            display: grid;
            grid-template-columns: auto minmax(0,1fr);
            align-items: center;
            column-gap: 14px;
            row-gap: 7px;
            padding: 14px 12px;
            border-right: 0;
            border-bottom: 1px solid var(--border);
          }
          .orc-day:last-child { border-bottom: 0; }
          .orc-day:hover { transform: none; }
          .orc-day-top {
            grid-row: 1 / span 4;
            flex-direction: column;
            gap: 8px;
          }
          .orc-day-total { justify-self: start; display: flex; align-items: center; }
          .orc-day-weekday { display: inline-flex; }
          .orc-sharebar { max-width: 320px; }
          .orc-day-networks { max-width: 320px; }
          .orc-week-button { width: 100%; }
        }

        @container orc (max-width: 560px) {
          .orc-header { padding: 16px; }
          .orc-networkbar { grid-template-columns: repeat(2,1fr); }
          .orc-returnbar { padding-inline: 16px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .orc-day-number { animation: none; }
          .orc-day, .orc-day:hover { transform: none; transition: none; }
        }
      `}</style>

      <div className="orc-body">
        <div className="orc-header">
          <div className="orc-title">
            <small>
              <CalendarDays className="size-3.5" /> Centro diário de decisão
            </small>
            <h3>{MONTHS[month]}</h3>
            <p>
              Clique num dia pra abrir todas as informações dele. Selecione
              semanas, redes de tráfego ou aplique os filtros de ROAS — o
              período escolhido atualiza o gráfico logo abaixo.
            </p>
          </div>

          <div className="orc-controls">
            <div className="orc-monthbar">
              <button
                type="button"
                aria-label="Mês anterior"
                disabled={viewMonth <= min}
                onClick={() =>
                  setViewMonth((value) => Math.max(min, value - 1))
                }
              >
                <ChevronLeft className="size-4" />
              </button>
              <BlockPicker
                ariaLabel="Selecionar mês"
                size="sm"
                value={String(month)}
                onChange={(v) => {
                  const next = year * 12 + Number(v);
                  setViewMonth(Math.min(max, Math.max(min, next)));
                }}
                options={MONTHS.map((label, index) => ({
                  value: String(index),
                  label: label.slice(0, 3),
                  title: label,
                }))}
              />
              <BlockPicker
                ariaLabel="Selecionar ano"
                size="sm"
                value={String(year)}
                onChange={(v) => {
                  const next = Number(v) * 12 + month;
                  setViewMonth(Math.min(max, Math.max(min, next)));
                }}
                options={Array.from(
                  { length: Math.floor(max / 12) - Math.floor(min / 12) + 1 },
                  (_, index) => Math.floor(min / 12) + index,
                ).map((value) => ({ value: String(value), label: String(value) }))}
              />
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={viewMonth >= max}
                onClick={() =>
                  setViewMonth((value) => Math.min(max, value + 1))
                }
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div
              className="orc-networkbar"
              aria-label="Filtrar redes de tráfego"
            >
              <button
                type="button"
                className={cn(
                  "orc-network-filter all",
                  activeNetworks.size === NETWORKS.length && "active",
                )}
                style={{ "--network-color": "#f0f0f0" } as React.CSSProperties}
                onClick={() => toggleNetwork("all")}
                title="Lucro e ROI somados das três redes no período em análise"
              >
                <span className="orc-net-name">
                  <i /> Todas
                </span>
                <span className="orc-net-stats">
                  <b
                    className={networkProfit.total.lucro >= 0 ? "gain" : "loss"}
                  >
                    {compactMoney(networkProfit.total.lucro)}
                  </b>
                  <em>
                    ROI {percentage(networkProfit.total.roi)} · ROAS{" "}
                    {networkProfit.total.roas.toFixed(2)}x
                  </em>
                </span>
              </button>
              {NETWORKS.map((network) => {
                const stats = networkProfit.byNetwork.get(network.name) ?? {
                  lucro: 0,
                  roi: 0,
                  roas: 0,
                };

                return (
                  <button
                    key={network.name}
                    type="button"
                    className={cn(
                      "orc-network-filter",
                      activeNetworks.has(network.name) && "active",
                    )}
                    style={
                      {
                        "--network-color": network.color,
                      } as React.CSSProperties
                    }
                    onClick={() => toggleNetwork(network.name)}
                    title={`Lucro e ROI de ${network.name} com custos não-mídia alocados proporcionalmente (estimativa)`}
                  >
                    <span className="orc-net-name">
                      <i /> {network.name}
                    </span>
                    <span className="orc-net-stats">
                      <b className={stats.lucro >= 0 ? "gain" : "loss"}>
                        {compactMoney(stats.lucro)}
                      </b>
                      <em>
                        ROI {percentage(stats.roi)} · ROAS{" "}
                        {stats.roas.toFixed(2)}x
                      </em>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Filtros de retorno: cada pílula seleciona de uma vez os dias do mês
          naquela faixa de ROAS. */}
        <div className="orc-returnbar" aria-label="Filtros de retorno por ROAS">
          <span className="orc-break-even-note">
            Equilíbrio estimado:{" "}
            {breakEvenRoas.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            x
          </span>
          {returnFilters.map((filter) => {
            const dates = returnFilterMatches.get(filter.id) ?? [];
            const active = returnFilterActive(filter.id);

            return (
              <button
                key={filter.id}
                type="button"
                disabled={dates.length === 0}
                className={cn("orc-return-filter", active && "active")}
                style={
                  { "--filter-color": filter.color } as React.CSSProperties
                }
                onClick={() => applyReturnFilter(filter.id)}
              >
                <i />
                <span>{filter.label}</span>
                <b>{active ? "Selecionado" : "Selecionar"}</b>
                <em>{dates.length}d</em>
              </button>
            );
          })}
        </div>

        <div className="orc-scroll">
          <div className="orc-calendar">
            <div className="orc-weekdays">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
              <span>SEMANA</span>
            </div>

            <div className="orc-weeks">
              {weeks.map((week, weekIndex) => {
                const available = week.filter((date) => byDate.has(date));
                const weekSelected =
                  available.length > 0 &&
                  available.every((date) => selectedSet.has(date));

                return (
                  <div className="orc-week" key={`week-${weekIndex}`}>
                    <div className="orc-week-grid">
                      {week.map((date) => {
                        const day = byDate.get(date);
                        const parsed = new Date(toUtc(date));
                        const outside = parsed.getUTCMonth() !== month;

                        if (!day) {
                          return (
                            <div className="orc-day outside" key={date}>
                              <div
                                className="orc-day-number"
                                style={
                                  {
                                    "--day-color": "#9e9e9e",
                                  } as React.CSSProperties
                                }
                              >
                                {parsed.getUTCDate()}
                              </div>
                            </div>
                          );
                        }

                        const info = derivedDay(day, dailyGoal);
                        const breakdown = networkBreakdown(day);
                        const dayNetworks = networksForDay(date);
                        const activeNames = new Set(
                          dayNetworks.map((network) => network.name),
                        );
                        const dayTotal = displayedRevenue(day);
                        const selected = selectedSet.has(date);
                        const sharesTotal = dayNetworks.reduce(
                          (sum, network) => sum + breakdown[network.name],
                          0,
                        );
                        const dayHours = hourlyByDay?.[date] ?? [];

                        return (
                          <div
                            key={date}
                            className={cn(
                              "orc-day",
                              outside && "outside",
                              selected && "selected",
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setHover(null);
                              setPinnedDate(date);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setHover(null);
                                setPinnedDate(date);
                              }
                            }}
                            onMouseEnter={(event) =>
                              showTooltip(day, event.currentTarget)
                            }
                            onMouseLeave={() => setHover(null)}
                            onFocus={(event) =>
                              showTooltip(day, event.currentTarget)
                            }
                            onBlur={() => setHover(null)}
                          >
                            <div className="orc-day-top">
                              <div
                                className="orc-day-number"
                                style={
                                  {
                                    "--day-color": info.tier.color,
                                  } as React.CSSProperties
                                }
                              >
                                {parsed.getUTCDate()}
                              </div>

                              {dayHours.length > 0 && (
                                <div
                                  className="orc-mini-pillar"
                                  title="Vendas por hora deste dia (00h embaixo, 23h em cima)"
                                  style={
                                    {
                                      "--mini-fill":
                                        miniPillarGradient(dayHours),
                                    } as React.CSSProperties
                                  }
                                >
                                  <div className="orc-mini-grid" />
                                  <div
                                    className="orc-mini-peak"
                                    style={{
                                      bottom: `${(peakHourIndex(dayHours) / dayHours.length) * 100}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>

                            <div className="orc-day-total">
                              <span className="orc-day-weekday">
                                {WEEKDAYS[(parsed.getUTCDay() + 6) % 7]}
                              </span>
                              <small>
                                {daySelections.has(date)
                                  ? "Selecionado"
                                  : "Total"}
                              </small>{" "}
                              {compactMoney(dayTotal)}
                            </div>

                            <div className="orc-sharebar">
                              {dayNetworks.map((network) => (
                                <i
                                  key={network.name}
                                  style={
                                    {
                                      "--network-color": network.color,
                                      width: `${sharesTotal > 0 ? (breakdown[network.name] / sharesTotal) * 100 : 0}%`,
                                    } as React.CSSProperties
                                  }
                                />
                              ))}
                            </div>

                            <div className="orc-day-networks">
                              {NETWORKS.map((network) => (
                                <button
                                  key={network.name}
                                  type="button"
                                  className={cn(
                                    "orc-day-network",
                                    activeNames.has(network.name) && "active",
                                  )}
                                  style={
                                    {
                                      "--network-color": network.color,
                                    } as React.CSSProperties
                                  }
                                  title={`${network.name}: ${formatCurrency(breakdown[network.name])}`}
                                  aria-label={`${network.name}: ${formatCurrency(breakdown[network.name])}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDayNetwork(date, network.name);
                                  }}
                                >
                                  <i />
                                  <span>{network.short}</span>
                                  <b>
                                    {compactMoney(
                                      breakdown[network.name],
                                    ).replace("R$ ", "")}
                                  </b>
                                </button>
                              ))}
                            </div>

                            <div
                              className="orc-status"
                              style={
                                {
                                  "--status-color":
                                    info.status === "Fechado"
                                      ? "var(--success)"
                                      : info.status === "Provisório"
                                        ? "var(--warning)"
                                        : "var(--destructive)",
                                } as React.CSSProperties
                              }
                            >
                              <i /> {info.status}
                              {daySelections.has(date) && (
                                <button
                                  type="button"
                                  aria-label="Restaurar redes deste dia"
                                  title="Restaurar redes deste dia"
                                  className="ml-1 inline-grid size-4 place-items-center rounded-full border border-white/15 bg-white/10"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    resetDayNetworks(date);
                                  }}
                                >
                                  <X className="size-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className={cn(
                        "orc-week-button",
                        weekSelected && "selected",
                      )}
                      disabled={available.length === 0}
                      onClick={() => toggleWeek(week)}
                    >
                      {weekSelected ? (
                        <Check className="size-4" />
                      ) : (
                        <Circle className="size-4" />
                      )}
                      {weekSelected ? "Selecionada" : "Selecionar"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="orc-summary">
          <div className="orc-summary-card">
            <small>Período analisado</small>
            <strong>
              {selectedRows.length > 0
                ? `${selectedRows.length} ${selectedRows.length === 1 ? "dia" : "dias"}`
                : `${MONTHS[month]} de ${year}`}
            </strong>
            <p>
              {selectedRows.length > 0
                ? selectedRows
                    .map((day) => pad(new Date(toUtc(day.date)).getUTCDate()))
                    .join(" · ")
                : "Selecione dias ou uma semana para atualizar o gráfico."}
            </p>
          </div>
          <div className="orc-summary-card">
            <small>Receita exibida</small>
            <strong>{compactMoney(summaryRevenue)}</strong>
            <p>Considera as redes ativas em cada dia.</p>
          </div>
          <div className="orc-summary-card">
            <small>Eficiência média</small>
            <strong>{percentage(summaryEfficiency)}</strong>
            <p>Receita aprovada sobre o faturamento bruto.</p>
          </div>
          <div className="orc-summary-card">
            <small>Melhor dia</small>
            <strong>
              {bestDay ? compactMoney(displayedRevenue(bestDay)) : "—"}
            </strong>
            <p>
              {bestDay ? dateLabel(bestDay.date) : "Sem dados neste período."}
            </p>
          </div>
        </div>
      </div>

      {hover && (
        <aside
          className="orc-tooltip"
          style={{ left: hover.left, top: hover.top }}
          aria-live="polite"
        >
          {(() => {
            const day = hover.data;
            const info = derivedDay(day, dailyGoal);
            const breakdown = networkBreakdown(day);
            const dayNetworks = networksForDay(day.date);
            const gross = info.gross || 1;
            const receivedShare = day.aprovada / gross;
            const pendingShare = day.pendente / gross;
            const refusedShare = day.recusada / gross;
            const parsed = new Date(toUtc(day.date));

            return (
              <div className="orc-tooltip-inner">
                <div className="orc-tooltip-head">
                  <div>
                    <small>
                      {pad(parsed.getUTCDate())} {MONTHS[parsed.getUTCMonth()]}{" "}
                      • {WEEKDAYS_LONG[parsed.getUTCDay()]}
                    </small>
                    <strong>{info.status}</strong>
                  </div>
                  <span
                    className="orc-tier"
                    style={
                      { "--tier-color": info.tier.color } as React.CSSProperties
                    }
                  >
                    <i /> {info.tier.label}
                  </span>
                </div>

                <div className="orc-tooltip-hero">
                  <small>Volume processado</small>
                  <strong>{formatCurrency(info.gross)}</strong>
                </div>

                <div className="orc-distribution">
                  <i
                    style={{
                      width: `${receivedShare * 100}%`,
                      background: "#e5e5e5",
                    }}
                  />
                  <i
                    style={{
                      width: `${pendingShare * 100}%`,
                      background: "#f59e0b",
                    }}
                  />
                  <i
                    style={{
                      width: `${refusedShare * 100}%`,
                      background: "#ef4444",
                    }}
                  />
                </div>

                <div className="orc-money-list">
                  {[
                    ["Recebido", day.aprovada, receivedShare, "#e5e5e5"],
                    ["Pendente", day.pendente, pendingShare, "#f59e0b"],
                    ["Recusado", day.recusada, refusedShare, "#ef4444"],
                  ].map(([label, value, share, color]) => (
                    <div className="orc-money-row" key={String(label)}>
                      <span
                        style={{ "--row-color": color } as React.CSSProperties}
                      >
                        <i /> {label}
                      </span>
                      <b>{formatCurrency(Number(value))}</b>
                      <em>{percentage(Number(share))}</em>
                    </div>
                  ))}
                </div>

                <div className="orc-tooltip-metrics">
                  <div>
                    <span>Eficiência</span>
                    <b>{percentage(info.efficiency)}</b>
                  </div>
                  <div>
                    <span>Pedidos</span>
                    <b>{formatInteger(day.pedidos)}</b>
                  </div>
                  <div>
                    <span>Ticket médio</span>
                    <b>{formatCurrency(info.ticket)}</b>
                  </div>
                  <div>
                    <span>Aprovação</span>
                    <b>
                      {Math.floor(day.tempoAprovacaoSeg / 60)}m
                      {pad(day.tempoAprovacaoSeg % 60)}s
                    </b>
                  </div>
                  <div>
                    <span>ROAS</span>
                    <b>{info.roas.toFixed(2)}x</b>
                  </div>
                  <div>
                    <span>ROI real</span>
                    <b>{percentage(info.roi)}</b>
                  </div>
                  <div>
                    <span>Margem</span>
                    <b>{percentage(info.contributionMargin)}</b>
                  </div>
                  <div>
                    <span>Lucro contrib.</span>
                    <b>{compactMoney(info.contributionProfit)}</b>
                  </div>
                  <div>
                    <span>Equilíbrio</span>
                    <b>{info.breakEvenRoas.toFixed(2)}x</b>
                  </div>
                  <div>
                    <span>Vs. meta</span>
                    <b>{compactMoney(day.aprovada - dailyGoal)}</b>
                  </div>
                </div>

                <div className="orc-tooltip-networks">
                  {dayNetworks.map((network) => (
                    <div
                      className="orc-tooltip-network"
                      key={network.name}
                      style={
                        {
                          "--network-color": network.color,
                        } as React.CSSProperties
                      }
                    >
                      <span>
                        <i /> {network.name}
                      </span>
                      <b>{formatCurrency(breakdown[network.name])}</b>
                    </div>
                  ))}
                </div>

                <div className="orc-insight">
                  <i>
                    <Sparkles className="size-3" />
                  </i>
                  <p>{executiveInsight(day, dailyGoal)}</p>
                </div>
              </div>
            );
          })()}
        </aside>
      )}

      {/* Painel completo do dia: abre no clique e fica fixo até fechar. */}
      {pinnedDay && (
        <>
          <div className="orc-backdrop" onClick={() => setPinnedDate(null)} />
          <aside className="orc-detail" role="dialog" aria-modal="true">
            {(() => {
              const day = pinnedDay;
              const info = derivedDay(day, dailyGoal);
              const breakdown = networkBreakdown(day);
              const dayNetworks = networksForDay(day.date);
              const gross = info.gross || 1;
              const receivedShare = day.aprovada / gross;
              const pendingShare = day.pendente / gross;
              const refusedShare = day.recusada / gross;
              const parsed = new Date(toUtc(day.date));
              const hours = hourlyByDay?.[day.date] ?? [];
              const peakIndex = hours.length > 0 ? peakHourIndex(hours) : null;
              const isInChart = selectedSet.has(day.date);

              return (
                <div className="orc-tooltip-inner">
                  <button
                    type="button"
                    aria-label="Fechar detalhes do dia"
                    className="orc-detail-close"
                    onClick={() => setPinnedDate(null)}
                  >
                    <X className="size-3.5" />
                  </button>

                  <div className="orc-tooltip-head">
                    <div>
                      <small>
                        {pad(parsed.getUTCDate())}{" "}
                        {MONTHS[parsed.getUTCMonth()]} {parsed.getUTCFullYear()}{" "}
                        • {WEEKDAYS_LONG[parsed.getUTCDay()]}
                      </small>
                      <strong>{info.status}</strong>
                    </div>
                    <span
                      className="orc-tier"
                      style={
                        {
                          "--tier-color": info.tier.color,
                        } as React.CSSProperties
                      }
                    >
                      <i /> {info.tier.label}
                    </span>
                  </div>

                  <div className="orc-tooltip-hero">
                    <small>Volume processado</small>
                    <strong>{formatCurrency(info.gross)}</strong>
                  </div>

                  <div className="orc-distribution">
                    <i
                      style={{
                        width: `${receivedShare * 100}%`,
                        background: "#e5e5e5",
                      }}
                    />
                    <i
                      style={{
                        width: `${pendingShare * 100}%`,
                        background: "#f59e0b",
                      }}
                    />
                    <i
                      style={{
                        width: `${refusedShare * 100}%`,
                        background: "#ef4444",
                      }}
                    />
                  </div>

                  <div className="orc-money-list">
                    {[
                      ["Recebido", day.aprovada, receivedShare, "#e5e5e5"],
                      ["Pendente", day.pendente, pendingShare, "#f59e0b"],
                      ["Recusado", day.recusada, refusedShare, "#ef4444"],
                    ].map(([label, value, share, color]) => (
                      <div className="orc-money-row" key={String(label)}>
                        <span
                          style={
                            { "--row-color": color } as React.CSSProperties
                          }
                        >
                          <i /> {label}
                        </span>
                        <b>{formatCurrency(Number(value))}</b>
                        <em>{percentage(Number(share))}</em>
                      </div>
                    ))}
                  </div>

                  <div className="orc-tooltip-metrics">
                    <div>
                      <span>Eficiência</span>
                      <b>{percentage(info.efficiency)}</b>
                    </div>
                    <div>
                      <span>Pedidos</span>
                      <b>{formatInteger(day.pedidos)}</b>
                    </div>
                    <div>
                      <span>Ticket médio</span>
                      <b>{formatCurrency(info.ticket)}</b>
                    </div>
                    <div>
                      <span>Aprovação</span>
                      <b>
                        {Math.floor(day.tempoAprovacaoSeg / 60)}m
                        {pad(day.tempoAprovacaoSeg % 60)}s
                      </b>
                    </div>
                    <div>
                      <span>ROAS</span>
                      <b>{info.roas.toFixed(2)}x</b>
                    </div>
                    <div>
                      <span>ROI real</span>
                      <b>{percentage(info.roi)}</b>
                    </div>
                    <div>
                      <span>Margem</span>
                      <b>{percentage(info.contributionMargin)}</b>
                    </div>
                    <div>
                      <span>Lucro contrib.</span>
                      <b>{compactMoney(info.contributionProfit)}</b>
                    </div>
                    <div>
                      <span>Equilíbrio</span>
                      <b>{info.breakEvenRoas.toFixed(2)}x</b>
                    </div>
                    <div>
                      <span>Vs. meta</span>
                      <b>{compactMoney(day.aprovada - dailyGoal)}</b>
                    </div>
                  </div>

                  {hours.length > 0 && peakIndex !== null && (
                    <div className="orc-detail-hours">
                      <div
                        className="orc-detail-pillar"
                        style={
                          {
                            "--mini-fill": miniPillarGradient(hours),
                          } as React.CSSProperties
                        }
                      >
                        <div className="orc-mini-grid" />
                        <div
                          className="orc-mini-peak"
                          style={{
                            bottom: `${(peakIndex / hours.length) * 100}%`,
                          }}
                        />
                      </div>
                      <div>
                        <small>
                          Vendas por hora (00h embaixo, 23h em cima)
                        </small>
                        <strong>
                          Pico às {hours[peakIndex].hour} ·{" "}
                          {formatCurrency(hours[peakIndex].valor)}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="orc-tooltip-networks">
                    {dayNetworks.map((network) => (
                      <div
                        className="orc-tooltip-network"
                        key={network.name}
                        style={
                          {
                            "--network-color": network.color,
                          } as React.CSSProperties
                        }
                      >
                        <span>
                          <i /> {network.name}
                        </span>
                        <b>{formatCurrency(breakdown[network.name])}</b>
                      </div>
                    ))}
                  </div>

                  <div className="orc-insight">
                    <i>
                      <Sparkles className="size-3" />
                    </i>
                    <p>{executiveInsight(day, dailyGoal)}</p>
                  </div>

                  <button
                    type="button"
                    className={cn("orc-detail-action", isInChart && "remove")}
                    onClick={() => toggleDay(day.date)}
                  >
                    {isInChart
                      ? "Remover este dia do gráfico"
                      : "Adicionar este dia ao gráfico"}
                  </button>
                </div>
              );
            })()}
          </aside>
        </>
      )}
    </section>
  );
}
