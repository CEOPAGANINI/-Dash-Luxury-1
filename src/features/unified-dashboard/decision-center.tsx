"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import weekMotion from "./week-motion.module.css";

import { cn } from "@/lib/utils";
import {
  buildDailyRevenue,
  calendarCells,
  type DailyRevenuePoint,
} from "@/features/unified-dashboard/analytics";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { useUnifiedDashboard } from "@/features/unified-dashboard/operation-provider";
import type { NetworkId } from "@/features/unified-dashboard/types";

/**
 * Centro diário de decisão.
 *
 * Um calendário de verdade: sete colunas presas aos dias da semana, com os
 * dias vizinhos do mês anterior e do seguinte em cinza para a primeira e a
 * última semana não ficarem quebradas. Cada dia é um cartão com o total, a
 * fatia de cada rede e se aquele dia já fechou.
 *
 * A pergunta que ele responde é "em que dias a operação ganhou dinheiro e em
 * quais não ganhou" — sem precisar abrir dia por dia.
 *
 * O dia clicado vira o dia da página toda, então o funil, os criativos e o
 * público passam a falar daquele dia.
 */

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

/**
 * Faixas de eficiência, medidas contra o ponto de equilíbrio do dia.
 * A ordem vai do pior para o melhor e cada faixa leva o próprio nome —
 * a cor sozinha nunca diz o que está acontecendo.
 */
const TIERS = [
  {
    id: "abaixo",
    label: "Abaixo do equilíbrio",
    max: 1,
    dot: "bg-destructive",
    text: "text-destructive",
    ring: "border-destructive/45",
  },
  {
    id: "perto",
    label: "Perto do equilíbrio",
    max: 1.15,
    dot: "bg-warning",
    text: "text-warning",
    ring: "border-warning/45",
  },
  {
    id: "saudavel",
    label: "Saudável",
    max: 1.4,
    /* Saudável, bom e excelente são todas "acima do equilíbrio", então
       todas são verdes; o que as separa é a presença da cor e, sobretudo,
       o nome escrito ao lado. Antes eram azul e roxo, cores que em nenhum
       outro canto da tela querem dizer "bom". */
    dot: "bg-success/55",
    text: "text-success",
    ring: "border-success/30",
  },
  {
    id: "bom",
    label: "Bom",
    max: 1.8,
    dot: "bg-success",
    text: "text-success",
    ring: "border-success/45",
  },
  {
    id: "excelente",
    label: "Excelente",
    max: Number.POSITIVE_INFINITY,
    dot: "bg-success",
    text: "text-success",
    ring: "border-success/70",
  },
] as const;

type TierId = (typeof TIERS)[number]["id"];

function tierOf(ratio: number) {
  return TIERS.find((tier) => ratio < tier.max) ?? TIERS[TIERS.length - 1];
}

/** "até 1,40x" nas faixas com teto; "1,80x+" na última, que não tem. */
function tierRange(index: number) {
  const tier = TIERS[index];
  if (tier.max === Number.POSITIVE_INFINITY) {
    return `${formatRatio(TIERS[index - 1]?.max ?? 0)}+`;
  }
  return `até ${formatRatio(tier.max)}`;
}

/** Nome do dia da semana por getDay(), que começa no domingo. */
const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** O dia inteiro, do jeito que o cartão da grade não tem espaço para contar. */
interface DayDetail {
  day: number;
  date: Date;
  outside: boolean;
  total: number;
  pending: number;
  refused: number;
  processed: number;
  breakEven: number;
  orders: number;
  ticket: number;
  peakHour: number;
  ratio: number;
  tier: (typeof TIERS)[number];
  byNetwork: { id: string; name: string; color: string; value: number }[];
  status: string;
  /** Quanto o dia representa da receita do mês inteiro. */
  share: number;
  /** Variação sobre o dia anterior; null quando ele não trouxe nada. */
  vsPrevious: number | null;
  /** Posição do dia no mês, do maior para o menor; null se for de outro mês. */
  rank: number | null;
  /** Quantos dias o mês tem, para ler a posição. */
  monthDays: number;
}
/*
  A cor de cada faixa de saúde do dia.

  Esta escala é sobre meta — o dia se pagou ou não —, então ela fica entre
  as três cores que o painel reserva para isso. As cinco faixas continuam
  distinguíveis: abaixo é vermelho, perto é amarelo, e o lado bom são três
  degraus de verde que clareiam conforme melhora. Antes o azul marcava
  "saudável" e o roxo, "excelente" — duas faixas boas com duas cores que em
  nenhum outro canto da tela querem dizer "bom".
*/
const TIER_NEON: Record<TierId, string> = {
  abaixo: "#ef4444",
  perto: "#f59e0b",
  saudavel: "#bdbdbd",
  bom: "#e5e5e5",
  excelente: "#f5f5f5",
};

/**
 * Notificação compacta do dia, aberta por mouse ou teclado. O portal recebe
 * o acabamento preto e branco pelas classes globais .day-neon / .dnn-*.
 */
function DiaDetalhe({ item }: { item: DayDetail }) {
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = React.useState<{
    side: "top" | "bottom" | "left" | "right";
    width: number;
  }>({ side: "bottom", width: 600 });
  const [hasOverflow, setHasOverflow] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!content) return;
    const trigger = Array.from(
      document.querySelectorAll<HTMLElement>("[data-slot='tooltip-trigger']"),
    ).find((element) =>
      element.getAttribute("aria-describedby")?.split(" ").includes(content.id),
    );
    if (!trigger) return;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const left = rect.left - 20;
      const right = width - rect.right - 20;
      const lateralSpace = Math.max(left, right);
      // Ao lado do dia, o popup usa a altura da tela, não só o espaço acima dele.
      const lateral = width >= 800 && lateralSpace >= 400;
      const side = lateral
        ? left > right
          ? "left"
          : "right"
        : rect.top > window.innerHeight - rect.bottom
          ? "top"
          : "bottom";
      const nextWidth = Math.min(600, lateral ? lateralSpace : width - 24);
      setPlacement((current) =>
        current.side === side && current.width === nextWidth
          ? current
          : { side, width: nextWidth },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(trigger);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [content]);

  React.useEffect(() => {
    if (!content) return;
    const measure = () =>
      setHasOverflow(content.scrollHeight > content.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    const inner = content.querySelector(".dnn-inner");
    if (inner) observer.observe(inner);
    measure();
    const scrollFromTrigger = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (content.scrollHeight <= content.clientHeight + 1) return;
      if (
        !document.activeElement
          ?.getAttribute("aria-describedby")
          ?.split(" ")
          .includes(content.id)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      content.scrollBy({ top: event.key === "ArrowDown" ? 48 : -48 });
    };
    window.addEventListener("keydown", scrollFromTrigger, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", scrollFromTrigger, true);
    };
  }, [content]);

  const hasData = item.processed > 0 || item.breakEven > 0 || item.orders > 0;
  const parte = (valor: number) =>
    item.processed > 0 ? valor / item.processed : 0;
  /* O que o dia deixou depois de pagar a mídia: a receita recebida menos o
     gasto diário. O gasto diário é o próprio ponto de equilíbrio — é ele
     dividido pelos dias do mês que define quanto o dia precisa trazer. */
  const resultado = item.total - item.breakEven;
  const neon = TIER_NEON[item.tier.id];

  const linhas = [
    { rotulo: "Recebido", valor: item.total, cor: "#e5e5e5" },
    { rotulo: "Pendente", valor: item.pending, cor: "#f59e0b" },
    { rotulo: "Recusado", valor: item.refused, cor: "#ef4444" },
  ];

  /* As nove métricas, cada uma com a cor do próprio veredito: verde/vermelho
     onde há um bom e um ruim, âmbar no que é atenção. O que é só posição —
     fatia do mês, ranking, hora de pico — perdeu a cor: numa tela em que
     cor quer dizer meta, pintar uma posição seria dar um veredito que ela
     não tem. */
  const aprovacao = parte(item.total);
  const metricas: { rotulo: string; valor: string; cor: string }[] = [
    {
      rotulo: "Gasto médio",
      valor: formatCompactCurrency(item.breakEven),
      cor: "#f5f5f5",
    },
    {
      rotulo: "Resultado",
      valor: `${resultado === 0 ? "" : resultado > 0 ? "+" : "−"}${formatCompactCurrency(Math.abs(resultado))}`,
      cor: resultado >= 0 ? "#e5e5e5" : "#ef4444",
    },
    {
      rotulo: "Fatia do mês",
      valor: formatPercent(item.share),
      cor: "#c2c2c2",
    },
    {
      rotulo: "Pedidos",
      valor: formatInteger(item.orders),
      cor: "#f5f5f5",
    },
    {
      rotulo: "Ticket médio",
      valor: formatCurrency(item.ticket),
      cor: "#f5f5f5",
    },
    {
      rotulo: "Aprovação",
      valor: formatPercent(aprovacao),
      cor: aprovacao >= 0.8 ? "#e5e5e5" : "#f59e0b",
    },
    {
      rotulo: "Pico",
      valor: hasData ? `${String(item.peakHour).padStart(2, "0")}h` : "—",
      /* A hora de maior movimento não é boa nem ruim: é informação. */
      cor: "#f5f5f5",
    },
    {
      rotulo: "Vs. véspera",
      valor:
        item.vsPrevious === null
          ? "Sem comparação"
          : `${item.vsPrevious >= 0 ? "+" : "−"}${formatPercent(Math.abs(item.vsPrevious))}`,
      cor:
        item.vsPrevious === null
          ? "#9e9e9e"
          : item.vsPrevious >= 0
            ? "#e5e5e5"
            : "#ef4444",
    },
    {
      rotulo: "No mês",
      valor: item.rank === null ? "—" : `${item.rank}º de ${item.monthDays}`,
      cor: item.rank !== null && item.rank <= 3 ? "#f5f5f5" : "#a8a8a8",
    },
  ];

  /* O veredito: vermelho quando o dia não se pagou, dourado quando raspou o
     equilíbrio, verde quando sobrou de verdade. */
  const insightCor =
    resultado < 0
      ? "#ef4444"
      : item.tier.id === "perto"
        ? "#f59e0b"
        : "#e5e5e5";
  const insightTexto = !hasData
    ? "Sem movimentações neste dia. As métricas ficam zeradas até a chegada de dados."
    : resultado >= 0
      ? `Passou ${formatCurrency(resultado)} do que o dia precisava para se pagar. Avalie escalar a rede de melhor retorno.`
      : `Faltaram ${formatCurrency(Math.abs(resultado))} para o dia se pagar. Compare as redes e priorize a de maior eficiência.`;

  return (
    <TooltipContent
      ref={setContent}
      side={placement.side}
      sideOffset={8}
      collisionPadding={12}
      sticky="always"
      onWheel={(event) => event.stopPropagation()}
      style={{ width: placement.width }}
      className="day-neon max-w-[calc(100vw-24px)] rounded-none p-0"
    >
      <div className="dnn-inner">
        <div className="dnn-head">
          <div className="dnn-date">
            <strong>
              {item.day} de {MONTHS[item.date.getMonth()]}
            </strong>
            <span>
              {WEEKDAY_NAMES[item.date.getDay()]} • {item.status}
              {item.outside && " • de outro mês"}
            </span>
          </div>
          <span
            className="dnn-health"
            style={{ "--health-color": neon } as React.CSSProperties}
          >
            <i /> {hasData ? item.tier.label : "Sem dados"}
          </span>
        </div>

        <div className="dnn-hero">
          <div>
            <small>Volume processado</small>
            <b>{formatCurrency(item.processed)}</b>
          </div>
          <div
            className="dnn-roas"
            style={
              {
                "--roas-color": item.ratio >= 1 ? "#e5e5e5" : "#ef4444",
              } as React.CSSProperties
            }
          >
            <small>ROAS do dia</small>
            <b>{formatRatio(item.ratio)}</b>
            <em>Equilíbrio 1,00x</em>
          </div>
        </div>

        {/* As três partes somam o processado: a barra é a divisão real. */}
        <div className="dnn-distribution" aria-hidden>
          {linhas.map((linha) => (
            <i
              key={linha.rotulo}
              style={{
                width: `${parte(linha.valor) * 100}%`,
                background: linha.cor,
              }}
            />
          ))}
        </div>

        <div className="dnn-money">
          {linhas.map((linha) => (
            <div
              key={linha.rotulo}
              className="dnn-money-row"
              style={{ "--row-color": linha.cor } as React.CSSProperties}
            >
              <span>
                <i /> {linha.rotulo}
              </span>
              <b>{formatCurrency(linha.valor)}</b>
              <em>{formatPercent(parte(linha.valor))}</em>
            </div>
          ))}
        </div>

        <div className="dnn-details">
          <div className="dnn-metrics">
            {metricas.map((metrica) => (
              <div key={metrica.rotulo} className="dnn-metric">
                <span>{metrica.rotulo}</span>
                <b
                  style={
                    { "--metric-color": metrica.cor } as React.CSSProperties
                  }
                >
                  {metrica.valor}
                </b>
              </div>
            ))}
          </div>

          <div className="dnn-networks">
            <small>Receita atribuída por rede</small>
            {item.byNetwork.map((net) => {
              const fatia = item.total > 0 ? net.value / item.total : 0;
              return (
                <div
                  key={net.id}
                  className="dnn-network"
                  style={
                    { "--network-color": net.color } as React.CSSProperties
                  }
                >
                  <div className="dnn-network-head">
                    <span>
                      <i /> {net.name}
                    </span>
                    <b>{formatCurrency(net.value)}</b>
                    <em>{formatPercent(fatia)}</em>
                  </div>
                  <div className="dnn-network-track" aria-hidden>
                    <i style={{ width: `${fatia * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="dnn-insight"
          style={{ "--insight-color": insightCor } as React.CSSProperties}
        >
          <i>
            <Sparkles className="size-3" aria-hidden />
          </i>
          <p>{insightTexto}</p>
        </div>

        <div className="dnn-hint">
          Clique no dia para ele valer no resto da página.
        </div>
      </div>
      {hasOverflow && (
        <div className="dnn-scroll-hint">
          Role para ver todos os detalhes.
          <span className="sr-only">
            Com o foco no dia, use as teclas para cima e para baixo.
          </span>
        </div>
      )}
    </TooltipContent>
  );
}

/** Só a data, sem hora — para comparar dias sem o relógio atrapalhar. */
function dayStamp(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function DecisionCenter({
  children,
}: {
  children: (panels: {
    calendar: React.ReactNode;
    summary: React.ReactNode;
  }) => React.ReactNode;
}) {
  const { operation, networkId, setNetworkId, year, month, day, setDay } =
    useUnifiedDashboard();

  /** Faixas de eficiência ligadas. Vazio = mostra o mês inteiro. */
  const [tiers, setTiers] = React.useState<TierId[]>([]);

  /** Uma única semana por vez; navegar não altera o dia selecionado. */
  const [weekNavigation, setWeekNavigation] = React.useState<{
    period: string;
    page: number;
    direction: -1 | 0 | 1;
  }>({ period: `${year}-${month}`, page: 0, direction: 0 });
  const weekViewportRef = React.useRef<HTMLDivElement>(null);

  // O dia de hoje separa o que já fechou do que ainda está correndo.
  const today = React.useMemo(() => new Date(), []);

  const network =
    networkId === "all"
      ? null
      : (operation.networks.find((item) => item.id === networkId) ?? null);
  const share = network
    ? operation.kpis.netRevenue > 0
      ? network.checkoutRevenue / operation.kpis.netRevenue
      : 0
    : 1;

  const cells = React.useMemo(() => calendarCells(year, month), [year, month]);

  /*
    A grade mostra as sobras do mês anterior e do seguinte, então a receita
    dos três meses entra num mapa por data. Sem isso a primeira e a última
    semana apareceriam com buracos.
  */
  const revenueByDate = React.useMemo(() => {
    const map = new Map<string, DailyRevenuePoint>();
    for (const offset of [-1, 0, 1]) {
      const anchor = new Date(year, month + offset, 1);
      const anchorYear = anchor.getFullYear();
      const anchorMonth = anchor.getMonth();
      for (const point of buildDailyRevenue(
        operation,
        anchorYear,
        anchorMonth,
      )) {
        const iso = [
          anchorYear,
          String(anchorMonth + 1).padStart(2, "0"),
          String(point.day).padStart(2, "0"),
        ].join("-");
        map.set(iso, point);
      }
    }
    return map;
  }, [operation, year, month]);

  /*
    Ponto de equilíbrio do dia: o que a operação gasta em mídia dividido
    pelos dias do mês. Abaixo disso o dia não se pagou. Segue a rede
    escolhida, para a comparação continuar justa quando se filtra.
  */
  const monthlySpend = network
    ? network.spend
    : operation.networks.reduce((sum, item) => sum + item.spend, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const breakEven = monthlySpend / Math.max(daysInMonth, 1);

  const todayStamp = dayStamp(today);

  const days = cells.map((cell) => {
    const point = revenueByDate.get(cell.isoDate);
    const total = Math.round((point?.received ?? 0) * share);
    /* O que passou pelo checkout no dia: o que entrou mais o que ficou
       pendente e o que foi recusado. A rede escolhida corta os três na mesma
       proporção, então as partes continuam somando o processado. */
    const pending = Math.round((point?.pending ?? 0) * share);
    const refused = Math.round((point?.refused ?? 0) * share);
    const processed = total + pending + refused;
    // Cada mês tem o seu equilíbrio: 30 ou 31 dias mudam o alvo diário.
    const cellMonthDays = new Date(
      cell.date.getFullYear(),
      cell.date.getMonth() + 1,
      0,
    ).getDate();
    const cellBreakEven = monthlySpend / Math.max(cellMonthDays, 1);
    const ratio = total / Math.max(cellBreakEven, 1);
    const stamp = dayStamp(cell.date);
    const byNetwork = operation.networks
      .map((item) => ({
        id: item.id,
        name: item.name,
        color: item.color,
        value: Math.round(
          network
            ? total
            : operation.kpis.netRevenue > 0
              ? total * (item.checkoutRevenue / operation.kpis.netRevenue)
              : 0,
        ),
      }))
      .filter((item) => !network || item.id === network.id);

    return {
      key: cell.isoDate,
      day: cell.day,
      date: cell.date,
      outside: cell.outside,
      total,
      pending,
      refused,
      processed,
      breakEven: cellBreakEven,
      orders: Math.round((point?.orders ?? 0) * share),
      ticket: point?.ticket ?? 0,
      peakHour: point?.peakHour ?? 0,
      ratio,
      tier: tierOf(ratio),
      byNetwork,
      // Dia encerrado, dia de hoje ainda contando, ou dia que nem chegou.
      status:
        stamp < todayStamp
          ? "Fechado"
          : stamp === todayStamp
            ? "Provisório"
            : "Em aberto",
    };
  });

  const inMonth = days.filter((item) => !item.outside);

  /*
    Três leituras que só existem olhando o mês inteiro, e por isso ficam aqui
    fora do map: o peso do dia na receita do mês, a variação sobre o dia
    anterior — que pode ser do mês passado, e é por isso que a grade guarda os
    vizinhos — e a posição do dia no ranking do mês.
  */
  const monthTotal = inMonth.reduce((acc, item) => acc + item.total, 0);
  const rankByKey = new Map(
    [...inMonth]
      .sort((a, b) => b.total - a.total)
      .map((item, index) => [item.key, index + 1]),
  );
  const detailByKey = new Map(
    days.map((item, index) => {
      const previous = days[index - 1];
      return [
        item.key,
        {
          share: monthTotal > 0 ? item.total / monthTotal : 0,
          vsPrevious:
            previous && previous.total > 0
              ? (item.total - previous.total) / previous.total
              : null,
          rank:
            item.outside || monthTotal <= 0
              ? null
              : (rankByKey.get(item.key) ?? null),
          monthDays: inMonth.length,
        },
      ];
    }),
  );

  const hasMonthData = inMonth.some((item) => item.processed > 0);
  const counts = hasMonthData
    ? TIERS.map(
        (tier) => inMonth.filter((item) => item.tier.id === tier.id).length,
      )
    : TIERS.map(() => 0);
  const visible =
    tiers.length === 0
      ? inMonth
      : inMonth.filter((item) => tiers.includes(item.tier.id));
  const visibleKeys = new Set(visible.map((item) => item.key));

  const sum = visible.reduce((acc, item) => acc + item.total, 0);
  const efficiency =
    visible.length > 0
      ? visible.reduce((acc, item) => acc + item.ratio, 0) / visible.length
      : 0;
  const best = visible.reduce(
    (acc, item) => (item.total > acc.total ? item : acc),
    visible[0] ?? { day: 0, total: 0 },
  );

  // A janela mantém sete dias na mesma linha, incluindo o contexto dos meses vizinhos.
  const weeks: (typeof days)[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    // Semana inteiramente do mês vizinho não é semana deste mês.
    if (week.some((item) => !item.outside)) weeks.push(week);
  }
  const pages = Math.max(weeks.length, 1);
  const period = `${year}-${month}`;
  const samePeriod = weekNavigation.period === period;
  if (!samePeriod) {
    // Reinicia também se o usuário voltar depois a um mês já visitado.
    setWeekNavigation({ period, page: 0, direction: 0 });
  }
  const page = samePeriod ? Math.min(weekNavigation.page, pages - 1) : 0;
  const shownDays = weeks[page] ?? [];

  const stepWeek = React.useCallback(
    (direction: -1 | 1) => {
      const viewport = weekViewportRef.current;
      // Se o dia focado sair da semana, o foco permanece no calendário.
      if (
        viewport &&
        document.activeElement !== viewport &&
        viewport.contains(document.activeElement)
      ) {
        viewport.focus({ preventScroll: true });
      }
      setWeekNavigation((current) => {
        const currentPage = current.period === period ? current.page : 0;
        const next = Math.max(0, Math.min(pages - 1, currentPage + direction));
        return next === currentPage
          ? current
          : { period, page: next, direction };
      });
    },
    [pages, period],
  );

  React.useEffect(() => {
    const viewport = weekViewportRef.current;
    if (!viewport) return;

    let total = 0;
    let locked = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation();
      // Preserva zoom e a rolagem horizontal da semana em telas estreitas.
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      if (event.deltaY === 0) return;
      event.preventDefault();

      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        locked = false;
        total = 0;
      }, 180);
      if (locked) return;

      total +=
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1);
      if (Math.abs(total) < 24) return;
      const direction = total > 0 ? 1 : -1;
      stepWeek(direction);
      locked = true;
    };

    // Listener local não passivo: o gesto não chega ao paginador do dashboard.
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      clearTimeout(idleTimer);
    };
  }, [stepWeek, month, year]);

  function toggleTier(id: TierId) {
    setTiers((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  const focusRing =
    "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2";

  const calendar = (
    <section className="acquisition-decision @container min-w-0">
      <div
        className="acquisition-calendar"
        role="group"
        aria-label="Calendário de aquisição"
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Semana {page + 1} de {weeks.length} — dias {shownDays[0]?.day} de{" "}
          {MONTHS[shownDays[0]?.date.getMonth() ?? month]} a{" "}
          {shownDays[shownDays.length - 1]?.day} de{" "}
          {MONTHS[shownDays[shownDays.length - 1]?.date.getMonth() ?? month]} de{" "}
          {year}
        </p>

        <p id="calendar-week-help" className="acquisition-caption text-center">
          Role sobre os dias para trocar de semana. No teclado, use Page Up e
          Page Down.
        </p>
        <div
          ref={weekViewportRef}
          className={cn("acquisition-week-viewport", focusRing)}
          role="group"
          aria-label="Semana do calendário"
          aria-describedby="calendar-week-help"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== "PageDown" && event.key !== "PageUp") return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            stepWeek(event.key === "PageDown" ? 1 : -1);
          }}
        >
          <div className="acquisition-week">
            <div
              className="decision-weekday-row acquisition-weekdays"
              aria-hidden
            >
              {WEEKDAYS.map((label) => (
                <span
                  key={label}
                  className="acquisition-block acquisition-weekday"
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Sete dias sem quebra; telas estreitas podem deslizar a linha na horizontal. */}
            <div className={weekMotion.frame}>
              <div
                key={`${year}-${month}-${page}`}
                className={cn(
                  "decision-day-grid acquisition-days",
                  weekMotion.days,
                )}
                data-direction={samePeriod ? weekNavigation.direction : 0}
              >
                {shownDays.map((item) => {
                  const isCurrent = !item.outside && item.day === day;
                  const isDimmed = !item.outside && !visibleKeys.has(item.key);
                  const label = `Dia ${item.day} de ${MONTHS[item.date.getMonth()]}${
                    item.outside ? ", fora do mês" : ""
                  }, ${formatCurrency(item.total)}, ${item.tier.label}, ${item.status}`;

                  const content = (
                    <>
                      {/* Cabeçalho numa linha só: o dia e o medidor à esquerda, o
                  total à direita. Empilhados, os dois custavam 60px de altura
                  em cada um dos 42 cartões — o calendário inteiro passava de
                  1800px e engolia a página. */}
                      {/* Num cartão de 78px o dia e o total lado a lado não cabem — o
                  valor saía como "R$ 2 mi…". Abaixo de 5,5rem eles empilham,
                  cada um com a largura inteira do cartão; acima, voltam para a
                  mesma linha. */}
                      {/* Primeira linha: o número do dia à esquerda, a situação à
                  direita. Sem a bolinha desenhada em volta do número e sem o
                  medidor vertical — a cor da faixa passou para o próprio
                  número e para o ponto antes da situação, que é o quanto de
                  cor um cartão de 100px aguenta sem virar semáforo. */}
                      <div className="acquisition-day-heading">
                        <span
                          className={cn(
                            "text-[0.6875rem] leading-4 font-bold tabular-nums @min-[5.5rem]:text-xs",
                            item.tier.text,
                          )}
                        >
                          {item.day}
                        </span>
                        <span
                          className={cn(
                            "text-muted-foreground flex min-w-0 items-center gap-1 truncate text-[0.5rem] leading-4 @min-[5.5rem]:text-[0.5625rem]",
                            item.status === "Provisório" &&
                              "text-warning font-bold",
                          )}
                        >
                          {/* A bolinha da faixa só aparece quando sobra largura: num
                      cartão de 78px ela e o seu espaço comiam os 8px que
                      faltavam para "Em aberto" caber inteiro. */}
                          <i
                            aria-hidden
                            className={cn(
                              "hidden size-1 shrink-0 rounded-full @min-[5.5rem]:block",
                              item.tier.dot,
                            )}
                          />
                          {item.status}
                        </span>
                      </div>

                      {/* O total do dia, que é a razão de o cartão existir. */}
                      <b className="acquisition-day-total">
                        {formatCompactCurrency(item.total)}
                      </b>

                      {/* A divisão do dia entre as redes, num traço de 2px. */}
                      <span
                        aria-hidden
                        className="bg-muted/60 mt-1 flex h-0.5 overflow-hidden"
                      >
                        {item.byNetwork.map((net) => (
                          <span
                            key={net.id}
                            style={{
                              backgroundColor: net.color,
                              width: `${(net.value / Math.max(item.total, 1)) * 100}%`,
                            }}
                          />
                        ))}
                      </span>

                      {/* Altura reservada para todas as redes, mesmo quando o filtro
                  deixa uma só: sem isso o cartão perdia duas linhas e o
                  calendário inteiro encolhia 360px a cada clique numa rede,
                  levando junto a linha de baixo do dashboard. */}
                      <ul
                        className="acquisition-day-networks"
                        style={{
                          // 0,875rem por linha (o texto) mais 2px de espaço entre
                          // elas — a conta tem de bater com a linha real até o pixel,
                          // senão o cartão muda de tamanho quando o filtro deixa uma
                          // rede só.
                          minHeight: `${operation.networks.length * 1.125 + Math.max(operation.networks.length - 1, 0) * 0.1875}rem`,
                        }}
                      >
                        {item.byNetwork.map((net) => (
                          <li
                            key={net.id}
                            title={`${net.name}: ${formatCurrency(net.value)}`}
                            className="acquisition-day-network"
                          >
                            <i
                              aria-hidden
                              className="size-1 shrink-0 rounded-full"
                              style={{ backgroundColor: net.color }}
                            />
                            {/* Só a bolinha da cor e o valor: num cartão de 100px o
                        nome da rede comeria a metade da linha. Ele continua no
                        title, no leitor de tela e nas caixas de rede acima,
                        que usam exatamente as mesmas cores. */}
                            <span className="acquisition-day-network-name">
                              {net.name}
                            </span>
                            <span className="tabular-nums">
                              {formatCompactCurrency(net.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  );

                  /* O cartão do dia cabe em 78px — nele só entram o número, o total e
             uma linha por rede. O resto do dia (o que ficou pendente, o que
             foi recusado, quantos pedidos, o ticket, o quanto passou do
             equilíbrio) abre aqui, ao passar o mouse ou ao chegar de teclado.
             O painel sai num portal, senão a moldura do calendário o cortaria. */
                  const detalhe = (
                    <DiaDetalhe
                      item={{
                        ...item,
                        ...(detailByKey.get(item.key) ?? {
                          share: 0,
                          vsPrevious: null,
                          rank: null,
                          monthDays: inMonth.length,
                        }),
                      }}
                    />
                  );

                  /* Os dias dos meses vizinhos são contexto, não alvo: eles existem
             para a semana não começar quebrada, e clicar neles pularia o mês
             sem o usuário pedir. Por isso não são botões. */
                  if (item.outside) {
                    return (
                      <Tooltip key={item.key}>
                        <TooltipTrigger asChild>
                          <div
                            aria-label={label}
                            /* O mesmo 38rem da regra .decision-day-grid: os dias
                       vizinhos aparecem exatamente quando a grade tem as sete
                       colunas. Com os dois limiares diferentes, a primeira
                       semana ficava com buracos no lugar dos dias do mês
                       passado. */
                            className="acquisition-block acquisition-day @container flex min-w-0 flex-col opacity-40"
                          >
                            {content}
                          </div>
                        </TooltipTrigger>
                        {detalhe}
                      </Tooltip>
                    );
                  }

                  return (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setDay(item.day)}
                          aria-pressed={isCurrent}
                          aria-label={label}
                          className={cn(
                            /* @container: sem isto, as regras de largura escritas
                       dentro do cartão mediam o painel inteiro — davam sempre
                       certo, e o dia com o total lado a lado cortava o valor
                       num cartão de 78px. Agora cada cartão se mede a si
                       mesmo. */
                            "acquisition-block acquisition-day @container flex min-w-0 flex-col",
                            focusRing,
                            // Filtro ligado: os dias de fora da faixa continuam no
                            // lugar, para a semana não se desmontar, mas saem de cena.
                            isDimmed && "opacity-30",
                          )}
                        >
                          {content}
                        </button>
                      </TooltipTrigger>
                      {detalhe}
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  const summary = (
    <section className="acquisition-decision acquisition-panel-summary @container min-w-0">
      {/* Redes: quanto cada uma trouxe no mês, com que retorno sobre o gasto
          e quantas vezes ela devolveu o que custou. Cada caixa leva a cor da
          própria rede, a mesma que aparece dentro de cada dia. */}
      <section
        className="acquisition-panel-area"
        aria-label="Canais de aquisição"
      >
        <h3 className="acquisition-panel-area-heading">Canais de aquisição</h3>
        <div
          className="acquisition-network-grid"
          role="group"
          aria-label="Filtrar o mês por rede"
        >
          {(
            [{ id: "all" as NetworkId, name: "Todas" }] as {
              id: NetworkId;
              name: string;
              color?: string;
            }[]
          )
            .concat(
              operation.networks.map((item) => ({
                id: item.id,
                name: item.name,
                color: item.color,
              })),
            )
            .map((item) => {
              const target =
                item.id === "all"
                  ? null
                  : operation.networks.find((n) => n.id === item.id);
              const revenue = target
                ? target.checkoutRevenue
                : operation.kpis.netRevenue;
              const spent = target
                ? target.spend
                : operation.networks.reduce((acc, n) => acc + n.spend, 0);
              const profit = target
                ? target.profit
                : operation.networks.reduce((acc, n) => acc + n.profit, 0);
              const isOn = networkId === item.id;
              const color = item.color ?? "var(--color-muted-foreground)";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNetworkId(item.id)}
                  aria-pressed={isOn}
                  className={cn(
                    "acquisition-block acquisition-network",
                    focusRing,
                  )}
                >
                  <span className="acquisition-network-name">
                    <i
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span>{item.name}</span>
                  </span>
                  <b className="acquisition-value">
                    {formatCompactCurrency(revenue)}
                  </b>
                  <span className="acquisition-network-ratios">
                    <span>
                      ROI <b>{formatPercent(profit / Math.max(spent, 1))}</b>
                    </span>
                    <span>
                      ROAS <b>{formatRatio(revenue / Math.max(spent, 1))}</b>
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      <section
        className="acquisition-panel-area"
        aria-label="Eficiência dos dias"
      >
        <h3 className="acquisition-panel-area-heading">Eficiência dos dias</h3>
        <div
          className="acquisition-efficiency-grid"
          role="group"
          aria-label="Faixas de eficiência"
        >
          <div className="acquisition-block acquisition-efficiency acquisition-break-even">
            <span className="acquisition-label">Equilíbrio do dia</span>
            <b className="acquisition-value">
              {formatCompactCurrency(breakEven)}
            </b>
            <span className="acquisition-caption">Valor de referência</span>
          </div>
          {TIERS.map((tier, index) => {
            const isOn = tiers.includes(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => toggleTier(tier.id)}
                aria-pressed={isOn}
                title={
                  isOn
                    ? `Mostrando só os dias na faixa ${tier.label}. Clique para tirar o filtro.`
                    : `Mostrar só os dias na faixa ${tier.label}.`
                }
                className={cn(
                  "acquisition-block acquisition-efficiency",
                  focusRing,
                )}
              >
                <span className="acquisition-efficiency-title">
                  <i
                    aria-hidden
                    className={cn("size-1.5 rounded-full", tier.dot)}
                  />
                  <span>{tier.label}</span>
                </span>
                <b className="acquisition-value">
                  {counts[index]}{" "}
                  <span className="acquisition-caption">dias</span>
                </b>
                <span className="acquisition-caption">{tierRange(index)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="acquisition-panel-area"
        aria-label="Resumo do período"
      >
        <h3 className="acquisition-panel-area-heading">Resumo do período</h3>
        <div className="acquisition-summary-grid">
          {[
            {
              label: "Período",
              value: `${MONTHS[month]} de ${year}`,
              hint: `${visible.length} de ${inMonth.length} dias.`,
            },
            {
              label: "Receita somada",
              value: formatCompactCurrency(sum),
              hint: "Dos dias contados.",
            },
            {
              label: "Eficiência média",
              value: formatPercent(efficiency),
              hint: "Sobre o equilíbrio.",
            },
            {
              label: "Melhor dia",
              // Sem dias na tela não existe "melhor dia": mostrar "Dia 0" seria
              // inventar um dia que não está sendo olhado.
              value:
                visible.length && hasMonthData
                  ? formatCompactCurrency(best.total)
                  : "—",
              hint:
                visible.length && hasMonthData
                  ? `Dia ${best.day}.`
                  : "Sem dados no período.",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="acquisition-block acquisition-summary"
            >
              <span className="acquisition-label">{card.label}</span>
              {/* 14px e não 16: "Agosto de 2026" precisa de 118px e a coluna
                tem 120 — no tamanho maior o mês saía cortado. */}
              <b className="acquisition-summary-value">{card.value}</b>
              <span className="acquisition-caption">{card.hint}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );

  return children({ calendar, summary });
}
