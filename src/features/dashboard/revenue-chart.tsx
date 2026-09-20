"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Clock,
  Gauge,
  Percent,
  Receipt,
  ShoppingBag,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDurationSeconds,
} from "@/shared/formatters/dashboard";
import {
  YearCalendar,
  type CalendarDay,
  type CalendarMonth,
} from "@/features/dashboard/year-calendar";

interface RevenueDay {
  day: string;
  /** "AAAA-MM-DD" — só os dias do calendário do ano trazem esse campo. */
  date?: string;
  aprovada: number;
  pendente: number;
  recusada: number;
  pedidos: number;
  tempoAprovacaoSeg: number;
}

interface HourlyPoint {
  hour: string;
  valor: number;
}

interface RevenueChartProps {
  /** Período mostrado por padrão, quando nada está selecionado no calendário. */
  data: RevenueDay[];
  /** Meta de faturamento bruto por dia (linha de referência). */
  goal?: number;
  /** Escala de horas de cada dia, pra mostrar o horário de pico na caixinha de detalhes. */
  hourlyByDay?: Record<string, HourlyPoint[]>;
  /** Ano inteiro; habilita o calendário de seleção no cabeçalho. */
  allDays?: RevenueDay[];
  /** Meses em que a operação realmente rodou — trava a navegação do
      calendário pra não abrir uma página de mês futuro/sem dados. */
  operationMinMonth?: CalendarMonth;
  operationMaxMonth?: CalendarMonth;
  /** Datas controladas externamente pelo calendário executivo. */
  selectedDates?: string[] | null;
  onSelectedDatesChange?: (dates: string[] | null) => void;
  /** Esconde o calendário compacto interno quando outro calendário controla o período. */
  showCalendar?: boolean;
}

/* Paleta de referência: painel grafite escuro #18191a com o amarelo #FFE600
   como cor-herói (brilhos suaves); verde e vermelho ficam reservados pra
   significado positivo/negativo. */
const PALETTE = {
  bg: "#18191a",
  glass: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.09)",
  text: "#f0f0f0",
  textMuted: "#a8aaad",
  textFaint: "#696c70",
  green: "#e5e5e5",
  yellow: "#f59e0b",
  red: "#ef4444",
  blue: "#c2c2c2",
  white: "#1d1e1f",
  line: "#f0f0f0",
};

/** Altura do gráfico: 24 faixas de 15px, o mínimo pra caber o rótulo de
    todas as horas na régua sem os números se encavalarem. */
const PLOT_HEIGHT = 360;
const HOUR_BAND = PLOT_HEIGHT / 24;

/** CSS do pilar por horas: cada dia é uma coluna dividida nas 24 horas
    (00h embaixo, 23h em cima). A intensidade do amarelo em cada faixa mostra
    quanto foi vendido naquela hora, e a hora de pico acende por inteiro. A
    moldura amarela continua pulsando ao redor. A caixinha de detalhes vive
    fora daqui (no nível do cartão), então as animações não interferem nela. */
const PILLAR_STYLES = `
  .rcp-frame {
    position: relative;
    width: 100%;
    max-width: 130px;
    height: 100%;
    padding: 6px;
    border: 2px solid rgba(255,230,0,0.7);
    animation: rcpPulse 2.8s ease-in-out infinite;
    transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  /* Luz amarela respirando na borda: o brilho ao redor do pilar
     cresce e recolhe suavemente, como uma pulsação. */
  @keyframes rcpPulse {
    0%, 100% {
      border-color: rgba(255,230,0,0.45);
      box-shadow: 0 0 0 0 rgba(255,230,0,0.12), 0 0 6px rgba(255,230,0,0.12);
    }
    50% {
      border-color: rgba(255,230,0,0.95);
      box-shadow: 0 0 0 3px rgba(255,230,0,0.12), 0 0 22px rgba(255,230,0,0.4);
    }
  }
  .rcp-frame:hover {
    transform: translateY(-3px);
  }
  .rcp-pillar {
    position: relative;
    width: 100%;
    height: 100%;
    border: 2px solid rgba(255,255,255,0.25);
  }
  /* O preenchimento é UM degradê só, com 24 faixas de cor chapada. Sendo um
     elemento único, não existe emenda entre uma hora e outra — eram essas
     emendas (arredondamento de altura do navegador) que deixavam fiozinhos
     claros aparecendo no meio das cores. */
  .rcp-fill {
    position: absolute;
    inset: 0;
    background: var(--pillar-fill);
  }
  /* Risco preto no fim de cada hora, desenhado por cima do preenchimento
     (preto de propósito: as faixas cheias são amarelas e claras). */
  .rcp-hourgrid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      to top,
      transparent 0,
      transparent calc(100% / 24 - 1px),
      rgba(0,0,0,0.5) calc(100% / 24 - 1px),
      rgba(0,0,0,0.5) calc(100% / 24)
    );
  }
  /* Halo neon na faixa da hora que mais vendeu no dia. */
  .rcp-peak {
    position: absolute;
    left: 0;
    right: 0;
    height: calc(100% / 24);
    pointer-events: none;
    box-shadow: 0 0 14px rgba(255,230,0,.95), 0 0 30px rgba(255,230,0,.6);
  }
  /* Entrada e hover usam keyframes idênticos com nomes diferentes: trocar o
     nome é o que faz o navegador reiniciar a animação no hover. */
  @keyframes rcpFillUp {
    from { clip-path: inset(100% 0 0 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  @keyframes rcpFillUpHover {
    from { clip-path: inset(100% 0 0 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  /* O dia "enche" de baixo pra cima: 00h primeiro, 23h por último. */
  .rcp-animate .rcp-fill {
    animation: rcpFillUp 2200ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
  }
  .rcp-frame:hover .rcp-fill {
    animation: rcpFillUpHover 1400ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .rcp-daycolumn {
    position: relative;
  }
  @media (prefers-reduced-motion: reduce) {
    .rcp-frame, .rcp-animate .rcp-fill, .rcp-frame:hover .rcp-fill {
      animation: none;
    }
  }
`;

function formatBRL(value: number, maximumFractionDigits = 0) {
  return formatCurrency(value, maximumFractionDigits === 2 ? 2 : 0);
}

const formatSeconds = formatDurationSeconds;

function formatFullDate(day: string) {
  const [dd, mm] = day.split("/").map(Number);
  // O rótulo "DD/MM" não carrega o ano; usamos o ano corrente pra achar o
  // dia da semana certo (mesma base que os dados de exemplo usam).
  const date = new Date(new Date().getUTCFullYear(), mm - 1, dd);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const month = cap(date.toLocaleDateString("pt-BR", { month: "long" }));
  const weekday = cap(date.toLocaleDateString("pt-BR", { weekday: "long" }));
  return `${dd} ${month} • ${weekday}`;
}

/** Anima um número entre o valor anterior e o novo, em quadros suaves. */
function useAnimatedNumber(value: number, duration = 500) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    let raf = 0;
    let start: number | null = null;

    function tick(ts: number) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

function bruto(p: RevenueDay) {
  return p.aprovada + p.pendente + p.recusada;
}

function withDerivedFields(data: RevenueDay[]) {
  return data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 2), i + 1);
    const mediaMovel =
      window.reduce((sum, p) => sum + bruto(p), 0) / window.length;
    const brutoAnterior = i > 0 ? bruto(data[i - 1]) : undefined;
    return { ...d, bruto: bruto(d), mediaMovel, brutoAnterior };
  });
}

type DerivedDay = RevenueDay & {
  bruto: number;
  mediaMovel: number;
  brutoAnterior?: number;
};

function statusTier(eficiencia: number) {
  if (eficiencia >= 90)
    return { emoji: "🟢", label: "Excelente", color: PALETTE.green };
  if (eficiencia >= 70)
    return { emoji: "🟢", label: "Bom", color: PALETTE.green };
  if (eficiencia >= 50)
    return { emoji: "🟡", label: "Atenção", color: PALETTE.yellow };
  return { emoji: "🔴", label: "Crítico", color: PALETTE.red };
}

function generateInsight(args: {
  recebidaPct: number;
  pendentePct: number;
  recusadaPct: number;
  pendente: number;
  bruto: number;
  mediaMovel: number;
  eficienciaSePendenteConverter: number;
}) {
  const {
    recebidaPct,
    pendentePct,
    recusadaPct,
    pendente,
    bruto,
    mediaMovel,
    eficienciaSePendenteConverter,
  } = args;

  if (recusadaPct >= 15) {
    return `Dia com baixa conversão: ${recusadaPct.toFixed(0)}% da receita foi recusada, acima do normal.`;
  }
  if (pendente > 0 && pendentePct >= 8) {
    return `${recebidaPct.toFixed(0)}% da receita já foi convertida. Existem ${formatBRL(pendente)} ainda pendentes que podem elevar a eficiência para ${eficienciaSePendenteConverter.toFixed(0)}%.`;
  }
  if (mediaMovel > 0 && bruto > mediaMovel * 1.05) {
    return `Receita ${((bruto / mediaMovel - 1) * 100).toFixed(0)}% acima da média dos últimos dias.`;
  }
  if (mediaMovel > 0 && bruto < mediaMovel * 0.95) {
    return `Receita ${((1 - bruto / mediaMovel) * 100).toFixed(0)}% abaixo da média dos últimos dias.`;
  }
  return "Dia dentro da média, com bom equilíbrio entre recebido e pendente.";
}

function PremiumTooltip({
  point,
  goal,
  hourly,
}: {
  point: DerivedDay;
  goal: number;
  hourly?: HourlyPoint[];
}) {
  const bruto = useAnimatedNumber(point.bruto);
  const recebida = useAnimatedNumber(point.aprovada);
  const pendenteVal = useAnimatedNumber(point.pendente);
  const recusadaVal = useAnimatedNumber(point.recusada);

  const brutoReal = point.bruto;
  const recebidaPct = brutoReal > 0 ? (point.aprovada / brutoReal) * 100 : 0;
  const pendentePct = brutoReal > 0 ? (point.pendente / brutoReal) * 100 : 0;
  const recusadaPct = brutoReal > 0 ? (point.recusada / brutoReal) * 100 : 0;

  const resolvidas = point.aprovada + point.recusada;
  const eficiencia = resolvidas > 0 ? (point.aprovada / resolvidas) * 100 : 0;
  const eficienciaSePendenteConverter =
    brutoReal > 0 ? ((point.aprovada + point.pendente) / brutoReal) * 100 : 0;
  const ticketMedio = point.pedidos > 0 ? point.aprovada / point.pedidos : 0;
  const conversao = recebidaPct;

  const tier = statusTier(eficiencia);
  const deltaPct =
    point.brutoAnterior && point.brutoAnterior > 0
      ? ((brutoReal - point.brutoAnterior) / point.brutoAnterior) * 100
      : undefined;

  const insight = generateInsight({
    recebidaPct,
    pendentePct,
    recusadaPct,
    pendente: point.pendente,
    bruto: brutoReal,
    mediaMovel: point.mediaMovel,
    eficienciaSePendenteConverter,
  });

  const goalDiff = brutoReal - goal;
  const peakHour =
    hourly && hourly.length > 0
      ? hourly.reduce((a, b) => (b.valor > a.valor ? b : a))
      : undefined;
  const hourlyMax = hourly ? Math.max(...hourly.map((h) => h.valor)) : 0;

  return (
    <div
      className={cn("tooltip-enter w-[280px] rounded-2xl p-4 sm:w-[320px]")}
      style={{
        background: "rgba(24,25,26,0.97)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 20px 45px -18px rgba(0,0,0,0.7)",
        color: PALETTE.text,
      }}
    >
      <style>{`
        @keyframes tooltipIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .tooltip-enter { animation: tooltipIn 180ms cubic-bezier(0.16,1,0.3,1); transform-origin: bottom center; }
      `}</style>

      {/* 1º + 2º — data e status */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className="text-xs font-medium"
          style={{ color: PALETTE.textFaint }}
        >
          {formatFullDate(point.day)}
        </span>
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ background: `${tier.color}1F`, color: tier.color }}
        >
          {tier.emoji} {tier.label}
        </span>
      </div>

      {/* 3º — faturamento bruto dominante */}
      <p
        className="text-xs font-semibold tracking-wide uppercase"
        style={{ color: PALETTE.textFaint }}
      >
        Receita Bruta
      </p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p
          className="text-3xl font-bold tabular-nums"
          style={{ letterSpacing: "-0.02em" }}
        >
          {formatBRL(bruto)}
        </p>
        {deltaPct !== undefined && (
          <span
            className="flex items-center gap-0.5 text-xs font-semibold"
            style={{ color: deltaPct >= 0 ? PALETTE.green : PALETTE.red }}
          >
            {deltaPct >= 0 ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(deltaPct).toLocaleString("pt-BR", {
              maximumFractionDigits: 0,
            })}
            %
          </span>
        )}
      </div>

      {/* 4º — barra de distribuição */}
      <div
        className="mt-3 flex h-1.5 overflow-hidden rounded-full"
        style={{ background: PALETTE.glass }}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${recebidaPct}%`, background: PALETTE.green }}
        />
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pendentePct}%`, background: PALETTE.yellow }}
        />
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${recusadaPct}%`, background: PALETTE.red }}
        />
      </div>

      {/* 5º — receitas */}
      <div className="mt-3 space-y-1.5">
        <RevenueRow
          color={PALETTE.green}
          label="Recebido"
          value={formatBRL(recebida)}
          pct={recebidaPct}
        />
        <RevenueRow
          color={PALETTE.yellow}
          label="Pendente"
          value={formatBRL(pendenteVal)}
          pct={pendentePct}
        />
        <RevenueRow
          color={PALETTE.red}
          label="Recusado"
          value={formatBRL(recusadaVal)}
          pct={recusadaPct}
        />
      </div>

      {/* 6º — KPIs */}
      <div
        className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2.5 pt-3"
        style={{ borderTop: `1px solid ${PALETTE.border}` }}
      >
        <Kpi
          icon={Gauge}
          label="Eficiência"
          value={`${eficiencia.toFixed(0)}%`}
        />
        <Kpi
          icon={ShoppingBag}
          label="Pedidos"
          value={point.pedidos.toLocaleString("pt-BR")}
        />
        <Kpi
          icon={Receipt}
          label="Ticket médio"
          value={formatBRL(ticketMedio, 2)}
        />
        <Kpi
          icon={Clock}
          label="Aprovação"
          value={formatSeconds(point.tempoAprovacaoSeg)}
        />
        <Kpi
          icon={Percent}
          label="Conversão"
          value={`${conversao.toFixed(0)}%`}
        />
        <Kpi
          icon={Target}
          label="Vs. meta"
          value={`${goalDiff >= 0 ? "+" : "−"}${formatBRL(Math.abs(goalDiff))}`}
        />
      </div>

      {/* Escala de horas do dia — mostra o horário de pico daquele dia específico */}
      {hourly && peakHour && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: `1px solid ${PALETTE.border}` }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <p
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: PALETTE.textFaint }}
            >
              Escala de horas
            </p>
            <span
              className="text-xs font-semibold"
              style={{ color: "#f59e0b" }}
            >
              Pico {peakHour.hour}
            </span>
          </div>
          <div className="flex h-6 items-end gap-px">
            {hourly.map((h) => (
              <div
                key={h.hour}
                className="min-h-[2px] flex-1 rounded-[1px]"
                style={{
                  height: `${Math.max((h.valor / hourlyMax) * 100, 8)}%`,
                  background:
                    h.hour === peakHour.hour
                      ? PALETTE.yellow
                      : `${PALETTE.yellow}55`,
                }}
              />
            ))}
          </div>
          <div className="mt-0.5 flex gap-px">
            {hourly.map((h) => (
              <div key={h.hour} className="flex-1 text-center">
                {Number(h.hour.replace("h", "")) % 4 === 0 && (
                  <span
                    className="text-xs"
                    style={{ color: PALETTE.textFaint }}
                  >
                    {h.hour}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7º — insight automático */}
      <div
        className="mt-3 flex gap-2 rounded-lg p-2.5 text-xs leading-snug"
        style={{
          background: `${PALETTE.blue}14`,
          border: `1px solid ${PALETTE.blue}33`,
          color: PALETTE.textMuted,
        }}
      >
        <Sparkles
          className="mt-0.5 size-3.5 shrink-0"
          style={{ color: PALETTE.blue }}
        />
        <span>{insight}</span>
      </div>
    </div>
  );
}

function RevenueRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span
        className="flex items-center gap-1.5"
        style={{ color: PALETTE.text }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <span style={{ color: PALETTE.text }}>{value}</span>
        <span style={{ color: PALETTE.textFaint, opacity: 0.7 }}>
          {pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
        </span>
      </span>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon
        className="mt-0.5 size-3 shrink-0"
        style={{ color: PALETTE.textFaint }}
      />
      <div>
        <p
          className="text-xs tracking-wide uppercase"
          style={{ color: PALETTE.textFaint }}
        >
          {label}
        </p>
        <p
          className="text-xs font-semibold tabular-nums"
          style={{ color: PALETTE.text }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** Régua vertical: horas do dia de 2 em 2 (00h na base, 22h no topo).
    Menos ticks = rótulos de 12px legíveis sem se encavalarem — reduzir a
    quantidade de marcas vem antes de reduzir a fonte. */
const HOUR_TICKS = Array.from({ length: 12 }, (_, i) => i * 2);

/** Linhas de grade — só de 6 em 6 horas, senão viram 24 riscos e poluem. */
const GRID_HOURS = [0, 6, 12, 18, 24];

/** Intensidade do amarelo de uma faixa de hora. O expoente < 1 levanta um
    pouco os horários fracos, e o piso mais alto (0.12) garante que eles não
    sumam no fundo escuro. */
function bandColor(valor: number, max: number) {
  if (max <= 0) return "rgba(255,230,0,0.12)";
  const ratio = Math.min(Math.max(valor / max, 0), 1);
  const alpha = 0.12 + 0.88 * Math.pow(ratio, 0.7);
  return `rgba(255,230,0,${alpha.toFixed(3)})`;
}

/** Monta o pilar inteiro como um único degradê de faixas chapadas (00h na
    base, 23h no topo). Um elemento só = sem emenda entre as horas. */
function pillarGradient(hours: HourlyPoint[], max: number) {
  if (hours.length === 0) return "transparent";
  const stops = hours.map((h, i) => {
    const color = bandColor(h.valor, max);
    return `${color} ${((i / hours.length) * 100).toFixed(4)}%, ${color} ${(((i + 1) / hours.length) * 100).toFixed(4)}%`;
  });
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

export function RevenueChart({
  data,
  goal = 3800,
  hourlyByDay,
  allDays,
  operationMinMonth,
  operationMaxMonth,
  selectedDates,
  onSelectedDatesChange,
  showCalendar = true,
}: RevenueChartProps) {
  const [hoverDay, setHoverDay] = React.useState<DerivedDay | null>(null);
  /** null = período padrão; array = datas "AAAA-MM-DD" escolhidas no
      calendário (data completa, porque o rótulo "DD/MM" se repete entre
      anos — 29/12 de 2025 e de 2026, por exemplo). */
  const [internalPickedDays, setInternalPickedDays] = React.useState<
    string[] | null
  >(null);
  const controlled = selectedDates !== undefined;
  const pickedDays = controlled ? selectedDates : internalPickedDays;
  const setPickedDays = React.useCallback(
    (dates: string[] | null) => {
      if (controlled) onSelectedDatesChange?.(dates);
      else setInternalPickedDays(dates);
    },
    [controlled, onSelectedDatesChange],
  );

  const shownData = React.useMemo(() => {
    if (!pickedDays || !allDays) return data;
    const wanted = new Set(pickedDays);
    const found = allDays.filter((d) => d.date && wanted.has(d.date));
    return found.length > 0 ? found : data;
  }, [pickedDays, allDays, data]);

  const chartData = React.useMemo(
    () => withDerivedFields(shownData),
    [shownData],
  );

  const calendarDays = React.useMemo<CalendarDay[]>(() => {
    if (!allDays) return [];
    return allDays
      .filter((d): d is RevenueDay & { date: string } => Boolean(d.date))
      .map((d) => ({
        day: d.day,
        date: d.date,
        total: d.aprovada + d.pendente + d.recusada,
      }));
  }, [allDays]);

  // Sem limites explícitos (meses com operação de verdade), cai pros
  // extremos dos próprios dados — que podem incluir dias emprestados do mês
  // vizinho só pra fechar a semana visual.
  const calendarMinMonth: CalendarMonth =
    operationMinMonth ??
    (calendarDays[0]
      ? {
          year: Number(calendarDays[0].date.slice(0, 4)),
          month: Number(calendarDays[0].date.slice(5, 7)) - 1,
        }
      : { year: new Date().getUTCFullYear(), month: 0 });
  const calendarMaxMonth: CalendarMonth =
    operationMaxMonth ??
    (calendarDays[calendarDays.length - 1]
      ? {
          year: Number(calendarDays[calendarDays.length - 1].date.slice(0, 4)),
          month:
            Number(calendarDays[calendarDays.length - 1].date.slice(5, 7)) - 1,
        }
      : calendarMinMonth);

  // Dispara o preenchimento dos pilares só quando o gráfico entra na tela,
  // pra animação completa ser visível (e não rodar escondida no carregamento).
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = React.useState(
    () => typeof IntersectionObserver === "undefined",
  );

  React.useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stats = React.useMemo(() => {
    const totalAprovada = shownData.reduce((s, d) => s + d.aprovada, 0);
    const totalRecusada = shownData.reduce((s, d) => s + d.recusada, 0);
    const taxaMedia =
      totalAprovada + totalRecusada > 0
        ? (totalAprovada / (totalAprovada + totalRecusada)) * 100
        : 0;
    const best = shownData.reduce((a, b) => (b.aprovada > a.aprovada ? b : a));
    const pior = shownData.reduce((a, b) => (b.aprovada < a.aprovada ? b : a));
    const last = shownData[shownData.length - 1];
    const prev =
      shownData.length > 1 ? shownData[shownData.length - 2] : undefined;
    const deltaHoje =
      prev && prev.aprovada > 0
        ? ((last.aprovada - prev.aprovada) / prev.aprovada) * 100
        : 0;
    return { totalAprovada, taxaMedia, best, pior, last, deltaHoje };
  }, [shownData]);

  const count = chartData.length;

  // A intensidade das faixas é relativa ao melhor horário do período que está
  // na tela (e não ao pico de cada dia): assim os dias continuam comparáveis
  // entre si e a escala de cor sempre usa toda a sua amplitude.
  const globalHourMax = React.useMemo(() => {
    if (!hourlyByDay) return 0;
    const valores = chartData.flatMap((d) =>
      (hourlyByDay[d.date ?? d.day] ?? []).map((h) => h.valor),
    );
    return valores.length > 0 ? Math.max(...valores) : 0;
  }, [hourlyByDay, chartData]);

  return (
    <div
      className="relative rounded-2xl"
      style={{
        background:
          "linear-gradient(145deg, #1b1c1d 0%, #18191a 60%, #151617 100%)",
        boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
        border: `1px solid ${PALETTE.border}`,
      }}
    >
      <style>{PILLAR_STYLES}</style>

      {/* Ruído sutil, quase imperceptível — dá profundidade sem chapar o fundo */}
      <svg
        className="pointer-events-none absolute inset-0 size-full opacity-[0.02]"
        aria-hidden
      >
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      {/* Cabeçalho editorial + calendário do ano no espaço à direita */}
      <div className="flex flex-col gap-6 px-5 pt-6 pb-2 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p
            className="text-xs font-bold tracking-[0.15em] uppercase"
            style={{ color: PALETTE.textFaint }}
          >
            Receita diária
          </p>
          <h3
            className="mt-1 text-3xl leading-[1.05] font-bold sm:text-4xl"
            style={{ color: PALETTE.text, letterSpacing: "-0.02em" }}
          >
            Receita
            <br />
            em tempo real.
          </h3>
          <p
            className="mt-2 max-w-md text-sm"
            style={{ color: PALETTE.textMuted }}
          >
            Cada coluna é um dia, dividido nas 24 horas — quanto mais aceso,
            mais vendas naquele horário.
          </p>
          <p
            className="mt-2 text-xs font-semibold"
            style={{ color: PALETTE.text }}
          >
            {chartData.length === 1
              ? `Mostrando ${chartData[0].day}`
              : `Mostrando ${chartData[0]?.day} até ${chartData[chartData.length - 1]?.day} · ${chartData.length} dias`}
          </p>
        </div>

        {showCalendar && calendarDays.length > 0 && (
          <div className="lg:max-w-[58%]">
            <YearCalendar
              days={calendarDays}
              // Só marca no calendário o que a usuária escolheu à mão — o
              // período padrão aparece no gráfico, mas não pré-seleciona dias.
              selected={pickedDays ?? []}
              fresh={pickedDays === null}
              onSelect={setPickedDays}
              onReset={() => setPickedDays(null)}
              minMonth={calendarMinMonth}
              maxMonth={calendarMaxMonth}
            />
          </div>
        )}
      </div>

      {/* Legenda: agora a cor mede a intensidade de venda de cada hora */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4 sm:px-6">
        <span className="text-xs" style={{ color: PALETTE.textMuted }}>
          Menos vendas
        </span>
        <span
          className="h-2.5 w-28 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${bandColor(0, 1)} 0%, ${bandColor(0.45, 1)} 50%, ${bandColor(1, 1)} 100%)`,
            border: `1px solid ${PALETTE.border}`,
          }}
        />
        <span className="text-xs" style={{ color: PALETTE.textMuted }}>
          Mais vendas
        </span>
      </div>

      <div className="flex gap-1 px-4 pb-2 sm:px-6">
        {/* Régua de horas: 00h na base, 24h no topo. Fica fora da área com
            rolagem horizontal, pra continuar visível em telas estreitas. */}
        <div className="shrink-0" style={{ width: 42 }}>
          <div style={{ height: 18 }} />
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {HOUR_TICKS.map((h) => (
              <div
                key={h}
                className="absolute right-0 left-0 flex items-center justify-end gap-1"
                style={{
                  bottom: `${(h + 0.5) * HOUR_BAND}px`,
                  transform: "translateY(50%)",
                }}
              >
                <span
                  className="text-xs tabular-nums"
                  style={{ color: PALETTE.textMuted }}
                >
                  {String(h).padStart(2, "0")}h
                </span>
                <span
                  className="h-px w-1.5"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                />
              </div>
            ))}
            <span
              className="absolute top-0 right-0 bottom-0 w-px"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-visible">
          {/* Ocupa toda a largura do cartão; o minWidth é só o piso, pra
              virar rolagem lateral em telas estreitas em vez de espremer. */}
          <div style={{ width: "100%", minWidth: count * 96 }}>
            {/* Total do dia, alinhado com cada coluna */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${count}, 1fr)`,
                height: 18,
              }}
            >
              {chartData.map((d) => (
                <p
                  key={d.date ?? d.day}
                  className="text-center text-xs font-semibold tabular-nums"
                  style={{ color: PALETTE.text }}
                >
                  {formatBRL(d.bruto)}
                </p>
              ))}
            </div>

            <div
              ref={plotRef}
              className={cn("relative", inView && "rcp-animate")}
              style={{ height: PLOT_HEIGHT }}
            >
              {/* Grade horizontal de 6 em 6 horas */}
              {GRID_HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute inset-x-0 h-px"
                  style={{
                    bottom: `${h * HOUR_BAND}px`,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
              ))}

              {/* Pilares: cada coluna é um dia, dividido nas 24 horas */}
              <div
                className="absolute inset-0 grid"
                style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}
              >
                {chartData.map((d) => {
                  const hours = hourlyByDay?.[d.date ?? d.day] ?? [];
                  const peakIndex = hours.reduce(
                    (best, h, i) => (h.valor > hours[best].valor ? i : best),
                    0,
                  );

                  return (
                    <div
                      key={d.date ?? d.day}
                      className="rcp-daycolumn flex h-full justify-center"
                      onMouseEnter={() => setHoverDay(d)}
                      onMouseLeave={() => setHoverDay(null)}
                    >
                      <div className="rcp-frame">
                        <div className="rcp-pillar">
                          <div
                            className="rcp-fill"
                            style={
                              {
                                "--pillar-fill": pillarGradient(
                                  hours,
                                  globalHourMax,
                                ),
                              } as React.CSSProperties
                            }
                          />
                          <div className="rcp-hourgrid" />
                          {hours.length > 0 && (
                            <div
                              className="rcp-peak"
                              style={{
                                bottom: `${(peakIndex / hours.length) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Datas */}
            <div
              className="grid pt-2"
              style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}
            >
              {chartData.map((d) => (
                <p
                  key={d.date ?? d.day}
                  className="text-center text-xs"
                  style={{ color: PALETTE.textFaint }}
                >
                  {d.day}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Caixinha de detalhes do dia: flutua por cima do cartão inteiro,
          FORA da área com rolagem horizontal — overflow-x:auto força o
          navegador a cortar também o que vaza na vertical, então qualquer
          tooltip renderizada lá dentro ficava invisível. */}
      {hoverDay && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-50 -translate-x-1/2">
          <PremiumTooltip
            point={hoverDay}
            goal={goal}
            hourly={hourlyByDay?.[hoverDay.date ?? hoverDay.day]}
          />
        </div>
      )}

      {/* Cartões de estatística */}
      <div
        className="mt-2 grid grid-cols-2 gap-px sm:grid-cols-4"
        style={{ background: PALETTE.border }}
      >
        <StatCard
          icon={Wallet}
          label="Hoje"
          value={formatBRL(stats.last.aprovada)}
          sublabel={`${stats.deltaHoje >= 0 ? "+" : "−"}${Math.abs(stats.deltaHoje).toFixed(0)}% vs. ontem`}
          positive={stats.deltaHoje >= 0}
        />
        <StatCard
          icon={BarChart3}
          label="Total no período"
          value={formatBRL(stats.totalAprovada)}
          sublabel={`${chartData.length} ${chartData.length === 1 ? "dia" : "dias"}`}
        />
        <StatCard
          icon={Gauge}
          label="Taxa de aprovação média"
          value={`${stats.taxaMedia.toFixed(1)}%`}
          sublabel="do período"
        />
        <StatCard
          icon={Award}
          label="Melhor dia"
          value={formatBRL(stats.best.aprovada)}
          sublabel={stats.best.day}
        />
      </div>

      {/* Insight editorial */}
      <div
        className="flex items-center gap-2 px-5 py-3.5 sm:px-6"
        style={{ borderTop: `1px solid ${PALETTE.border}` }}
      >
        <Sparkles
          className="size-3.5 shrink-0"
          style={{ color: PALETTE.textFaint }}
        />
        <p className="text-xs italic" style={{ color: PALETTE.textMuted }}>
          A diferença entre o melhor e o pior dia foi de{" "}
          {formatBRL(stats.best.aprovada - stats.pior.aprovada)} — vale entender
          o que mudou entre eles.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  positive,
}: {
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  value: string;
  sublabel: string;
  positive?: boolean;
}) {
  return (
    <div className="p-4 sm:p-5" style={{ background: PALETTE.bg }}>
      <Icon className="mb-3 size-4" style={{ color: PALETTE.textFaint }} />
      <p className="text-xs" style={{ color: PALETTE.textMuted }}>
        {label}
      </p>
      <p
        className="mt-1 text-xl font-bold tabular-nums"
        style={{ color: PALETTE.text }}
      >
        {value}
      </p>
      <p
        className="mt-0.5 text-xs"
        style={{
          color:
            positive === undefined
              ? PALETTE.textFaint
              : positive
                ? PALETTE.green
                : PALETTE.red,
        }}
      >
        {sublabel}
      </p>
    </div>
  );
}
