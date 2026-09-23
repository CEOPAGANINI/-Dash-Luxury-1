"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Coins,
  Filter,
  Gauge,
  HeartPulse,
  Info,
  LineChart,
  Minus,
  PieChart,
  PiggyBank,
  Repeat,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageSessionMenu } from "@/components/dashboard/page-session-menu";

import type {
  ExecutiveKpi,
  ExecutivePeriod,
} from "@/domain/analytics/executive-analytics";
import type { DemoRevenueDay } from "@/lib/demo-data";
import { buildExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";

interface VisualOverviewProps {
  days: DemoRevenueDay[];
  anchorDays?: DemoRevenueDay[];
  demoMode: boolean;
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/* Moeda curta montada à mão: o Node (servidor) e o navegador formatam o
   zero em notação compacta de jeitos diferentes ("R$ 0,0" contra "R$ 0"),
   o que quebrava a hidratação da Visão geral. Assim o texto é o mesmo
   nos dois lados. */
const compactCurrency = {
  format(value: number): string {
    if (!Number.isFinite(value)) value = 0;
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const num = (v: number) =>
      v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    if (abs >= 1_000_000_000) return `${sign}R$ ${num(abs / 1_000_000_000)} bi`;
    if (abs >= 1_000_000) return `${sign}R$ ${num(abs / 1_000_000)} mi`;
    if (abs >= 1_000) return `${sign}R$ ${num(abs / 1_000)} mil`;
    return `${sign}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  },
};

const integer = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const OVERVIEW_PAGES = [
  { label: "Leitura financeira", shortLabel: "Financeiro", icon: Wallet },
  { label: "Evolução da receita", shortLabel: "Receita", icon: LineChart },
  { label: "Aquisição e resultado", shortLabel: "Resultado", icon: Target },
  { label: "Metas e projeção", shortLabel: "Metas", icon: Scale },
  { label: "Clientes e retenção", shortLabel: "Clientes", icon: Users },
] as const;

const OVERVIEW_MENU_ITEMS = OVERVIEW_PAGES.map((page) => {
  const Icon = page.icon;
  return {
    label: page.label,
    short: page.shortLabel,
    icon: <Icon className="size-4" />,
  };
});

/*
  Filtro de período.

  A regra de composição de painel diz que os filtros ficam em uma única
  faixa acima do conteúdo, começando pelo intervalo de datas em atalhos —
  ninguém quer brigar com um calendário para pedir "os últimos 30 dias".
  Estes quatro valores são os que o modelo analítico sabe calcular, então
  o filtro é real: trocar aqui recalcula tudo o que está abaixo.
*/
const PERIODOS: { id: ExecutivePeriod; label: string; full: string }[] = [
  { id: "7d", label: "7 dias", full: "Últimos 7 dias" },
  { id: "15d", label: "15 dias", full: "Últimos 15 dias" },
  { id: "30d", label: "30 dias", full: "Últimos 30 dias" },
  { id: "month", label: "Mês", full: "Mês corrente" },
];

/*
  A faixa de indicadores no topo.

  É a camada de "manchete" do painel: os totais do período, na ordem em
  que a leitura acontece — quanto entrou, quanto virou caixa, quanto
  sobrou, e depois a eficiência disso. As sessões abaixo continuam sendo o
  detalhe; nenhum número foi trocado, eles só ganharam um lugar fixo no
  alto da tela.

  A cor de cada bloco é o estado da métrica, não o assunto dela: o assunto
  já está no rótulo, e quem abre o painel quer saber se o número está bem.
  O estado vem do modelo, que compara cada indicador com a própria meta.
*/
const KPI_TILES = [
  {
    key: "net",
    icon: Coins,
    short: "Receita líquida",
    hint: "Tudo que entrou já sem reembolsos e chargebacks.",
  },
  {
    key: "cash",
    icon: Wallet,
    short: "Caixa recebido",
    hint: "A parte da receita que já está disponível na conta.",
  },
  {
    key: "contribution",
    icon: PiggyBank,
    short: "Lucro final",
    hint: "O que sobra depois de mídia, taxas e custo de produto. É a estrela do norte: a receita pode crescer enquanto se perde dinheiro, este número não.",
  },
  {
    key: "mer",
    icon: Gauge,
    short: "Retorno da mídia",
    hint: "Quantas vezes a receita cobre o investimento em mídia.",
  },
] as const;

/*
  Estados, na estrutura do sistema de cores de referência.

  O modelo já classifica cada indicador contra a própria meta em
  `kpi.tone`, com exatamente estas famílias — e a tela vinha ignorando isso,
  colorindo só pela direção da variação. Agora o estado aparece, e sempre
  com ícone e palavra: cor sozinha não é informação para quem não distingue
  as cores, e "verde" não diz o mesmo que "Saudável" para quem chega no
  painel pela primeira vez.
*/
const ESTADOS = {
  success: { label: "Saudável", icon: CheckCircle2 },
  warning: { label: "Atenção", icon: AlertTriangle },
  destructive: { label: "Crítico", icon: XCircle },
  info: { label: "Informativo", icon: Info },
  accent: { label: "Projeção", icon: Sparkles },
  neutral: { label: "Sem meta", icon: Minus },
  /* O período não teve pedido nem gasto. Não é "saudável" nem "crítico":
     é não haver o que julgar. Um painel que emite veredito sobre nada
     apresenta julgamento como se fosse prova. */
  vazio: { label: "Sem dado", icon: Minus },
} as const;

type TomEstado = keyof typeof ESTADOS;

/*
  Os mesmos tons da folha de estilo, em hexadecimal.

  As roscas são pintadas por `conic-gradient` em atributo de estilo, e ali
  não dá para ler a variável de estado do CSS. Sem isto o cartão dizia
  "Crítico" na etiqueta e desenhava a rosca em âmbar — dois veredictos
  diferentes para o mesmo número, na mesma caixa.
*/
const COR_ESTADO: Record<TomEstado, string> = {
  success: "#e5e5e5",
  warning: "#f59e0b",
  destructive: "#ef4444",
  /* Informação e projeção não são meta: entram como cinza, para a cor
     continuar querendo dizer só uma coisa nesta tela. */
  info: "#c2c2c2",
  accent: "#9e9e9e",
  neutral: "rgba(255,255,255,.45)",
  vazio: "rgba(255,255,255,.45)",
};

function Estado({ tom }: { tom: TomEstado }) {
  const { label, icon: Icon } = ESTADOS[tom];
  return (
    <span className="visual-overview-state" data-tom={tom} title={label}>
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

/*
  Limite de chargeback.

  As bandeiras trabalham com um teto formal de 1,5%; o adquirente costuma
  acionar a loja a partir de 0,9%, e uma operação bem cuidada fica abaixo
  de 0,5%. São números de mercado, não chutes — por isso este é o único
  sinal do checkout que ganha cor de estado aqui.
*/
const CHARGEBACK_LIMITES = { bom: 0.005, alerta: 0.009, teto: 0.015 };

function toneChargeback(valor: number) {
  if (valor >= CHARGEBACK_LIMITES.alerta) return "is-negative";
  if (valor > CHARGEBACK_LIMITES.bom) return "is-warning";
  return "is-positive";
}

/** Uma meta batida é sucesso; perto dela, atenção; longe, crítico. */
function estadoMeta(
  meta: { razao: number; atingiu: boolean } | null,
): TomEstado {
  if (!meta) return "neutral";
  if (meta.atingiu) return "success";
  return meta.razao >= 0.8 ? "warning" : "destructive";
}

/*
  Estado das duas métricas derivadas.

  Aqui as faixas são convenção deste painel, não número de mercado — e a
  diferença importa. A do chargeback vem das bandeiras e do adquirente; já
  "quantas compras até o cliente se pagar" não tem tabela publicada. As
  faixas abaixo saem do único ponto que o próprio cálculo define: pagar-se
  dentro da primeira compra é o melhor caso possível, e o dobro disso é
  onde o caixa começa a demorar demais para voltar. Elas ficam escritas no
  texto de ajuda do bloco, para ninguém confundir uma escolha nossa com uma
  referência de mercado.
*/
function estadoLtvCac(razao: number | null): TomEstado {
  if (razao === null) return "neutral";
  if (razao >= 1) return "success";
  if (razao >= 0.8) return "warning";
  return "destructive";
}

function estadoPayback(compras: number): TomEstado {
  if (!Number.isFinite(compras)) return "neutral";
  if (compras <= 1) return "success";
  if (compras <= 2) return "warning";
  return "destructive";
}

/** "1 compra", "1,5 compras" — o plural segue o número já arredondado. */
function emCompras(valor: number) {
  const texto = valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${texto} ${texto === "1" ? "compra" : "compras"}`;
}

/** Variação relativa entre dois períodos, protegida contra divisão por zero. */
function variacao(atual: number, anterior: number) {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return 0;
  if (anterior === 0) return 0;
  return (atual - anterior) / Math.abs(anterior);
}

function findKpi(kpis: ExecutiveKpi[], key: string) {
  return kpis.find((kpi) => kpi.key === key);
}

/** Escreve o valor de um indicador no formato que ele declara. */
function formatKpiValue(kpi: ExecutiveKpi) {
  if (kpi.format === "percent") return percent.format(kpi.value);
  if (kpi.format === "ratio")
    return `${kpi.value.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    })}x`;
  if (kpi.format === "number") return integer.format(kpi.value);
  return compactCurrency.format(kpi.value);
}

/**
 * A variação de um indicador percentual já vem em pontos percentuais; a dos
 * demais vem como proporção. Chamar as duas de "%" diria coisas diferentes
 * com o mesmo símbolo.
 */
function kpiDeltaLabel(kpi: ExecutiveKpi) {
  if (kpi.format !== "percent") return deltaLabel(kpi.delta);
  const sign = kpi.delta > 0 ? "+" : kpi.delta < 0 ? "−" : "";
  return `${sign}${Math.abs(kpi.delta * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} p.p.`;
}

/**
 * Subir nem sempre é boa notícia: no custo por novo cliente, quem sobe
 * piora. O indicador diz para que lado ele quer ir, e a cor segue isso.
 */
function deltaTone(kpi: ExecutiveKpi) {
  if (kpi.delta === 0) return "is-neutral";
  const melhorou =
    kpi.goalDirection === "lower" ? kpi.delta < 0 : kpi.delta > 0;
  return melhorou ? "is-positive" : "is-negative";
}

function deltaLabel(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;
}

function MiniTrend({ values }: { values: number[] }) {
  const safeValues = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(max - min, 1);
  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * 160;
      const y = 40 - ((value - min) / range) * 34;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 160 44"
      className="visual-overview-mini-trend"
      aria-hidden="true"
    >
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Uma única composição editorial para a Visão geral. Os dados não são
 * repetidos em cartões de KPI: cada área usa a visualização mais adequada.
 */
export function VisualOverview({
  days,
  anchorDays,
  demoMode,
}: VisualOverviewProps) {
  const overviewRef = React.useRef<HTMLElement>(null);
  const activePageRef = React.useRef(0);
  const wheelLockRef = React.useRef<number | null>(null);
  const [activePage, setActivePage] = React.useState(0);
  const [periodo, setPeriodo] = React.useState<ExecutivePeriod>("30d");

  const selectPage = React.useCallback((nextPage: number) => {
    const page = Math.max(0, Math.min(OVERVIEW_PAGES.length - 1, nextPage));
    if (page === activePageRef.current) return false;
    activePageRef.current = page;
    setActivePage(page);
    return true;
  }, []);

  /*
    O modo "uma sessao por vez" so vale no desktop.

    Ele troca de sessao no evento `wheel`, que simplesmente nao existe no
    celular — quem abria pelo telefone ficava preso na sessao 01, sem
    nenhum gesto que levasse as outras, e ainda via cada cartao esticado
    para preencher a tela com vao no meio. No celular as sessoes ficam
    empilhadas e a pagina rola de verdade, que e o gesto que o aparelho ja
    tem.
  */
  const [pagerAtivo, setPagerAtivo] = React.useState(false);

  React.useEffect(() => {
    const consulta = window.matchMedia("(min-width: 64rem)");
    const aplicar = () => setPagerAtivo(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  React.useEffect(() => {
    const overviewElement = overviewRef.current;
    if (!overviewElement) return;
    const overview = overviewElement;
    let resizeFrame = 0;

    if (!pagerAtivo) {
      delete overview.dataset.pagerReady;
      overview.style.removeProperty("--visual-overview-height");
      /* A sessao ativa nao e zerada de proposito: empilhado todas aparecem,
         entao o valor nao muda nada — e quem voltar para o desktop encontra
         a sessao onde parou. */
      return;
    }

    function fitToViewport() {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const main = overview.closest("main");
        const bottomPadding = main
          ? Number.parseFloat(window.getComputedStyle(main).paddingBottom) || 0
          : 0;
        const availableHeight = Math.floor(
          window.innerHeight -
            overview.getBoundingClientRect().top -
            bottomPadding,
        );
        overview.style.setProperty(
          "--visual-overview-height",
          `${Math.max(availableHeight, 560)}px`,
        );
      });
    }

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 8) return;
      event.preventDefault();
      if (wheelLockRef.current !== null) return;

      const changed = selectPage(
        activePageRef.current + (event.deltaY > 0 ? 1 : -1),
      );
      if (!changed) return;

      wheelLockRef.current = window.setTimeout(() => {
        wheelLockRef.current = null;
      }, 320);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.target !== overview) return;
      let nextPage: number | null = null;

      if (
        event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        (event.key === " " && !event.shiftKey)
      ) {
        nextPage = activePageRef.current + 1;
      } else if (
        event.key === "ArrowUp" ||
        event.key === "PageUp" ||
        (event.key === " " && event.shiftKey)
      ) {
        nextPage = activePageRef.current - 1;
      } else if (event.key === "Home") {
        nextPage = 0;
      } else if (event.key === "End") {
        nextPage = OVERVIEW_PAGES.length - 1;
      }

      if (nextPage === null) return;
      event.preventDefault();
      selectPage(nextPage);
    }

    overview.dataset.pagerReady = "true";
    fitToViewport();
    overview.addEventListener("wheel", onWheel, { passive: false });
    overview.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", fitToViewport, { passive: true });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      if (wheelLockRef.current !== null) {
        window.clearTimeout(wheelLockRef.current);
        wheelLockRef.current = null;
      }
      delete overview.dataset.pagerReady;
      overview.removeEventListener("wheel", onWheel);
      overview.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", fitToViewport);
    };
  }, [selectPage, pagerAtivo]);

  const model = buildExecutiveDashboardModel({
    days,
    anchorDays,
    period: periodo,
  });
  const { snapshot } = model;
  const cashKpi = findKpi(snapshot.kpis, "cash");
  const netKpi = findKpi(snapshot.kpis, "net");
  const contributionKpi = findKpi(snapshot.kpis, "contribution");

  /*
    Metas e projeção.

    A meta de cada indicador ja vem do modelo (kpi.goal), entao aqui so
    comparamos onde o numero esta contra onde deveria estar, e projetamos o
    proximo periodo do mesmo tamanho mantendo o ritmo diario atual.

    Projetar "o mes" seria inventar: o periodo selecionado nem sempre e um
    mes fechado. O que da para dizer com honestidade e "se o ritmo destes N
    dias continuar por mais N dias, fecha em X".
  */
  const diasNoPeriodo = Math.max(snapshot.days.length, 1);

  function progressoMeta(kpi: ExecutiveKpi | undefined) {
    if (!kpi || kpi.goal <= 0) return null;
    const razao = kpi.value / kpi.goal;
    return {
      atual: kpi.value,
      meta: kpi.goal,
      razao: Math.max(0, razao),
      /* A rosca para em 100%: passar disso desenharia uma volta a mais. */
      preenchimento: Math.min(1, Math.max(0, razao)),
      falta: Math.max(0, kpi.goal - kpi.value),
      atingiu: kpi.value >= kpi.goal,
    };
  }

  const metaReceita = progressoMeta(netKpi);
  const metaLucro = progressoMeta(contributionKpi);

  /*
    Projecao do mes corrente.

    A primeira versao multiplicava o ritmo diario pelos dias do proprio
    periodo — o que devolve exatamente a receita que ja aconteceu, sem
    projetar nada. Aqui o calculo olha o mes do ultimo dia do periodo:
    quanto ja entrou nele, quantos dias dele ja correram, e onde fecha se o
    ritmo se mantiver ate o ultimo dia do mes.
  */
  const ultimoDia = snapshot.days.at(-1)?.date ?? null;
  const projecaoMes = (() => {
    if (!ultimoDia) return null;

    const [ano, mes, dia] = ultimoDia.split("-").map(Number);
    if (!ano || !mes || !dia) return null;

    /* Dia 0 do mes seguinte é o ultimo dia deste mes. */
    const diasDoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const prefixo = `${ano}-${String(mes).padStart(2, "0")}`;

    const diasDoMesNoPeriodo = snapshot.days.filter((d) =>
      d.date.startsWith(prefixo),
    );
    if (diasDoMesNoPeriodo.length === 0) return null;

    /*
      A receita liquida do periodo inteiro repartida pelos dias que caem
      neste mes. O modelo nao entrega receita liquida por dia, entao a
      proporcao vem do aprovado diario, que e a base dela.
    */
    const aprovadoPeriodo = snapshot.days.reduce((t, d) => t + d.aprovada, 0);
    const aprovadoNoMes = diasDoMesNoPeriodo.reduce(
      (t, d) => t + d.aprovada,
      0,
    );
    const fatia = aprovadoPeriodo > 0 ? aprovadoNoMes / aprovadoPeriodo : 0;
    const receitaNoMes = snapshot.receitaLiquida * fatia;

    const diasCorridos = diasDoMesNoPeriodo.length;
    const ritmo = diasCorridos > 0 ? receitaNoMes / diasCorridos : 0;
    const diasRestantes = Math.max(0, diasDoMes - dia);

    /*
      A meta que vem do modelo vale para o periodo escolhido. Para comparar
      com o mes inteiro ela e proporcional aos dias — e a tela diz isso, em
      vez de fingir que existe uma meta mensal cadastrada.
    */
    const metaDoPeriodo = netKpi?.goal ?? 0;
    const metaEquivalente =
      metaDoPeriodo > 0 ? (metaDoPeriodo / diasNoPeriodo) * diasDoMes : 0;

    const projecao = receitaNoMes + ritmo * diasRestantes;

    return {
      receitaNoMes,
      ritmo,
      diasCorridos,
      diasRestantes,
      diasDoMes,
      projecao,
      metaEquivalente,
      razao: metaEquivalente > 0 ? projecao / metaEquivalente : null,
      mesLabel: new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(ano, mes - 1, 1))),
    };
  })();

  const diasParaCobrirFalta =
    metaReceita && !metaReceita.atingiu && projecaoMes && projecaoMes.ritmo > 0
      ? Math.ceil(metaReceita.falta / projecaoMes.ritmo)
      : null;

  const composition = [
    {
      label: "Caixa recebido",
      value: snapshot.caixaRecebido,
      color: "#f5f5f5",
    },
    {
      label: "Receita líquida",
      value: snapshot.receitaLiquida,
      color: "#c2c2c2",
    },
    {
      label: "Lucro final",
      value: Math.max(snapshot.lucroContribuicao, 0),
      color: "#909090",
    },
    {
      label: "Investimento em mídia",
      value: snapshot.gastoMidia,
      color: "#6a6a6a",
    },
  ];
  const compositionMax = Math.max(...composition.map((item) => item.value), 1);
  const hasPaymentData = snapshot.volumeProcessado > 0 || snapshot.pedidos > 0;
  const healthSegments = [
    {
      label: "Aprovado",
      value: snapshot.taxaAprovacao,
      /* Este é o único gráfico da tela que fica colorido: aprovado,
         pendente e recusado não são três categorias quaisquer, são bom,
         atenção e ruim — a mesma escala das metas. */
      color: "#e5e5e5",
    },
    {
      label: "Pendente",
      value: snapshot.taxaPendente,
      color: "#f59e0b",
    },
    {
      label: "Recusado",
      value: hasPaymentData
        ? Math.max(0, 1 - snapshot.taxaAprovacao - snapshot.taxaPendente)
        : 0,
      color: "#ef4444",
    },
  ];
  const healthTotal = Math.max(
    healthSegments.reduce((total, segment) => total + segment.value, 0),
    1,
  );
  let conicStart = 0;
  const conicStops = hasPaymentData
    ? healthSegments
        .map((segment) => {
          const start = conicStart;
          conicStart += (segment.value / healthTotal) * 100;
          return `${segment.color} ${start}% ${conicStart}%`;
        })
        .join(", ")
    : "rgba(255,255,255,.08) 0 100%";
  const trend = model.trend.map((point) => ({
    ...point,
    shortLabel: point.label.slice(0, 5),
  }));
  const cashDelta = cashKpi?.delta ?? 0;
  const netDelta = netKpi?.delta ?? 0;
  const profitDelta = contributionKpi?.delta ?? 0;
  const channels = model.acquisition.slice(0, 3);
  const bubbleMax = Math.max(...channels.map((channel) => channel.revenue), 1);
  const marginProgress = Math.max(0, Math.min(snapshot.margemContribuicao, 1));
  const marginTarget = 0;
  const marginGapPoints = Math.abs(marginTarget - snapshot.margemContribuicao);
  const safeNetRevenue = Math.max(Math.abs(snapshot.receitaLiquida), 1);
  const mediaShare = snapshot.gastoMidia / safeNetRevenue;
  const cashConversion = snapshot.caixaRecebido / safeNetRevenue;
  const resultConversion = snapshot.lucroContribuicao / safeNetRevenue;

  /*
    "Dados até".

    Um painel executivo precisa dizer de quando é o número antes de dizer
    qual é o número — sem isso, quem abre não sabe se está olhando hoje ou
    a semana passada. A data vem do último dia que entrou no recorte, não
    do relógio da máquina, porque é ela que descreve o dado.
  */
  const dataAte = ultimoDia
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${ultimoDia}T00:00:00Z`),
      )
    : null;

  /*
    A manchete.

    Quatro blocos saem direto dos indicadores do modelo; os dois últimos
    são derivados da economia de cliente, que o modelo calcula mas nunca
    tinha mostrado nesta tela. Todos passam a ter a mesma forma aqui —
    valor, variação, direção do que é bom — para o desenho não precisar
    saber de onde cada um veio.
  */
  const tiles: {
    key: string;
    icon: typeof Coins;
    /** Como a métrica está contra a própria meta. */
    estado: TomEstado;
    short: string;
    hint: string;
    valor: string;
    delta: number;
    deltaTexto: string;
    /** Se a variação do período foi para o lado bom. */
    tomDelta: string;
    comparacao: string;
  }[] = KPI_TILES.flatMap((tile) => {
    const kpi = findKpi(snapshot.kpis, tile.key);
    if (!kpi) return [];
    return [
      {
        ...tile,
        estado: kpi.tone,
        valor: formatKpiValue(kpi),
        delta: kpi.delta,
        deltaTexto: kpiDeltaLabel(kpi),
        tomDelta: deltaTone(kpi),
        comparacao: kpi.comparison,
      },
    ];
  });

  const { atual: clientes, anterior: clientesAntes } = model.clientes;

  /* Razão LTV:CAC. Sobe é bom. */
  if (clientes.ltvCac !== null) {
    const delta = variacao(clientes.ltvCac, clientesAntes.ltvCac ?? 0);
    tiles.push({
      key: "ltv-cac",
      icon: Scale,
      estado: estadoLtvCac(clientes.ltvCac),
      short: "Retorno por cliente",
      hint: "Quanto o cliente devolve para cada real gasto para trazê-lo, em 90 dias. Neste prazo o que se espera é passar de 1:1, ou seja, o cliente ter se pagado — a meta de mercado de 3:1 é medida em 24 meses. Faixas deste painel: saudável a partir de 1:1, atenção a partir de 0,8:1.",
      valor: `${clientes.ltvCac.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })} : 1`,
      delta,
      deltaTexto: deltaLabel(delta),
      tomDelta:
        delta === 0 ? "is-neutral" : delta > 0 ? "is-positive" : "is-negative",
      comparacao: "vs. o período anterior",
    });
  }

  /* Payback. Cair é bom: o cliente se paga em menos compras. */
  if (Number.isFinite(clientes.paybackCompras)) {
    const delta = variacao(
      clientes.paybackCompras,
      clientesAntes.paybackCompras,
    );
    tiles.push({
      key: "payback",
      icon: Repeat,
      estado: estadoPayback(clientes.paybackCompras),
      short: "Payback",
      hint: "Quantas compras o cliente precisa fazer até pagar o próprio custo de aquisição. Em compras, e não em dias, porque o modelo não conhece o intervalo entre elas. Aqui, menos é melhor. Faixas deste painel, não de mercado: saudável até 1 compra, atenção até 2.",
      valor: emCompras(clientes.paybackCompras),
      delta,
      deltaTexto: deltaLabel(delta),
      tomDelta:
        delta === 0 ? "is-neutral" : delta < 0 ? "is-positive" : "is-negative",
      comparacao: "vs. o período anterior",
    });
  }

  /*
    Funil do site.

    As visitas não vêm de uma fonte de analytics: o modelo demonstrativo as
    deriva dos próprios pedidos, no mesmo funil que o resto do app já
    desenha. Foi de propósito não gerar uma segunda série fictícia de
    visitas — dois números inventados para a mesma coisa acabariam
    discordando entre telas, que é justamente o que um painel não pode
    fazer. Enquanto a fonte real não entra, o cartão diz na cara que a
    visita é estimada.
  */
  /*
    O período teve alguma coisa a acontecer?

    Sem pedido e sem gasto de mídia não há o que julgar, e todo o veredito
    desta tela passa a ser "Sem dado". Antes daqui, o painel dizia
    "Payback 0 compras — Saudável", porque zero compras caía na faixa de
    "até 1 compra"; e dizia "Receita R$ 0 — Crítico", que é um julgamento
    sobre a ausência de dado, não sobre o dado.
  */
  const periodoSemDado = snapshot.pedidos === 0 && snapshot.gastoMidia === 0;
  const veredito = (tom: TomEstado): TomEstado =>
    periodoSemDado ? "vazio" : tom;

  const estadoMargem: TomEstado =
    snapshot.caixaRecebido <= 0
      ? "neutral"
      : snapshot.margemContribuicao >= marginTarget
        ? "success"
        : snapshot.margemContribuicao >= marginTarget * 0.7
          ? "warning"
          : "destructive";

  const funilSite = (() => {
    const volumeDe = (rotulo: string) =>
      model.funnel.find((etapa) => etapa.label === rotulo)?.volume ?? 0;

    const visitas = volumeDe("Página de vendas");
    const checkout = volumeDe("Checkout iniciado");
    const pedidos = volumeDe("Pagamento aprovado");
    if (visitas <= 0) return null;

    return {
      etapas: [
        /* "Visitas à página" e não "sessões do site": no funil do modelo
           esta etapa é quem chegou na página de vendas depois de clicar no
           anúncio. Um dado de analytics de site inteiro contaria também
           quem entra pelo orgânico e nunca vê a oferta — e aí a conversão
           seria outra, bem menor. */
        { label: "Visitas à página", valor: visitas },
        { label: "Checkout iniciado", valor: checkout },
        { label: "Pedidos aprovados", valor: pedidos },
      ],
      conversao: pedidos / visitas,
      visitaCheckout: checkout / visitas,
      checkoutPedido: checkout > 0 ? pedidos / checkout : 0,
    };
  })();

  /*
    O estado do cartão de pagamentos é o pior sinal que ele contém: um
    cartão verde com um chargeback vermelho dentro esconderia justamente o
    que precisa ser visto. Como só o chargeback tem faixa publicada, hoje é
    ele quem decide — e quando os outros dois ganharem referência, entram
    nesta mesma conta.
  */
  const estadoCheckout: TomEstado = !hasPaymentData
    ? "neutral"
    : snapshot.taxaChargeback >= CHARGEBACK_LIMITES.alerta
      ? "destructive"
      : snapshot.taxaChargeback > CHARGEBACK_LIMITES.bom
        ? "warning"
        : "success";

  /* Sinais do checkout. Só o chargeback tem limite de mercado publicado,
     então é o único que ganha cor de estado — os outros dois informam. */
  const sinaisCheckout = [
    {
      label: "Conversão de pagamento",
      valor: percent.format(snapshot.conversaoPagamento),
      tom: "is-neutral",
      nota: "Quanto do que chega no checkout vira pagamento aprovado.",
    },
    {
      label: "Reembolso",
      valor: percent.format(snapshot.taxaReembolso),
      tom: "is-neutral",
      nota: "Parte do caixa recebido que voltou para o cliente.",
    },
    {
      label: "Chargeback",
      valor: percent.format(snapshot.taxaChargeback),
      tom: toneChargeback(snapshot.taxaChargeback),
      nota: "Limite das bandeiras: 1,5%. O adquirente costuma acionar a partir de 0,9%; abaixo de 0,5% é operação bem cuidada.",
    },
  ];

  return (
    <div
      className="board-pager visual-overview-shell"
      data-pager-ready={String(pagerAtivo)}
    >
      {pagerAtivo && (
        <PageSessionMenu
          items={OVERVIEW_MENU_ITEMS}
          activeIndex={activePage}
          onSelect={selectPage}
          ariaLabel="Sessões da Visão geral"
          title="Visão geral"
        />
      )}

      <div className="board-pager-content">
        <section
          ref={overviewRef}
          className="visual-overview"
          aria-label="Visão geral da operação"
          aria-describedby="visual-overview-instructions"
          tabIndex={pagerAtivo ? 0 : -1}
          data-active-page={activePage + 1}
        >
          <div className="visual-overview-watermark" aria-hidden="true">
            <span>RECEITA</span>
            <span>{compactCurrency.format(snapshot.receitaLiquida)}</span>
            <span>MARGEM</span>
            <span>{percent.format(snapshot.margemContribuicao)}</span>
            <span>RESULTADO</span>
            <span>{compactCurrency.format(snapshot.lucroContribuicao)}</span>
          </div>

          <p id="visual-overview-instructions" className="sr-only">
            {pagerAtivo
              ? `Dashboard em ${OVERVIEW_PAGES.length} sessões. Use a roda do mouse, as setas, Page Up ou Page Down para trocar de sessão.`
              : `Dashboard em ${OVERVIEW_PAGES.length} sessões, uma abaixo da outra. Role a página para percorrê-las.`}
          </p>
          {pagerAtivo && (
            <p className="sr-only" aria-live="polite">
              Sessão {activePage + 1} de {OVERVIEW_PAGES.length}:{" "}
              {OVERVIEW_PAGES[activePage]?.label}
            </p>
          )}

          <header className="visual-overview-toolbar">
            <div className="visual-overview-toolbar-title">
              <span aria-hidden="true">
                <Sparkles />
              </span>
              <div>
                <p>Visão geral da operação</p>
                <span>{snapshot.label}</span>
              </div>
            </div>

            <div
              className="visual-overview-filters"
              role="group"
              aria-label="Período dos dados"
            >
              <span className="visual-overview-filter-label">Período</span>
              {PERIODOS.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  className={periodo === opcao.id ? "is-active" : undefined}
                  aria-pressed={periodo === opcao.id}
                  title={opcao.full}
                  onClick={() => setPeriodo(opcao.id)}
                >
                  {opcao.label}
                </button>
              ))}
            </div>

            {dataAte && (
              <p className="visual-overview-freshness">
                <CalendarDays aria-hidden="true" />
                <span>Dados até</span>
                <strong>{dataAte}</strong>
              </p>
            )}
          </header>

          <div className="visual-overview-kpis">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <article
                  key={tile.key}
                  className="visual-overview-kpi"
                  data-tom={tile.estado}
                >
                  <div className="visual-overview-kpi-top">
                    <span
                      className="visual-overview-kpi-icon"
                      aria-hidden="true"
                    >
                      <Icon />
                    </span>
                    {/* O rótulo curto é o que cabe em seis blocos lado a lado; a
                    explicação inteira fica no title e na leitura de tela,
                    então nada se perde. */}
                    <p title={`${tile.short} — ${tile.hint}`}>
                      {tile.short}
                      <Info aria-hidden="true" />
                      <span className="sr-only">. {tile.hint}</span>
                    </p>
                    <Estado tom={veredito(tile.estado)} />
                  </div>
                  <strong title={`${tile.short} — ${tile.hint}`}>
                    {tile.valor}
                  </strong>
                  {periodoSemDado ? (
                    /* Sem pedido e sem gasto não há o que comparar. Mostrar
                       "0% vs. período anterior" cinco vezes seguidas é ruído
                       com aparência de medida. */
                    <p className="visual-overview-kpi-delta is-neutral">
                      <span>Sem movimento no período</span>
                    </p>
                  ) : (
                    <p className={`visual-overview-kpi-delta ${tile.tomDelta}`}>
                      {/* A seta mostra para onde o número foi; a cor diz se isso
                      é bom. No payback, cair é uma seta para baixo em verde —
                      misturar as duas coisas inverteria a leitura. */}
                      {tile.delta === 0 ? null : tile.delta > 0 ? (
                        <ArrowUpRight aria-hidden="true" />
                      ) : (
                        <ArrowDownRight aria-hidden="true" />
                      )}
                      <span>{tile.deltaTexto}</span>
                      <em title={tile.comparacao}>vs. período anterior</em>
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="visual-overview-pages">
            <section
              className="visual-overview-page"
              data-active={String(!pagerAtivo || activePage === 0)}
              aria-hidden={pagerAtivo && activePage !== 0}
              aria-label="Leitura financeira"
              data-rotulo="01 · Leitura financeira"
            >
              <div className="visual-overview-grid visual-overview-grid-financial">
                <article className="visual-overview-zone visual-overview-margin">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Margem</p>
                      <span>Quanto fica de cada venda</span>
                    </div>
                    <Activity aria-hidden="true" />
                    <Estado tom={veredito(estadoMargem)} />
                  </div>
                  <div
                    className="visual-overview-donut"
                    style={{
                      background: `conic-gradient(${COR_ESTADO[veredito(estadoMargem)]} 0 ${marginProgress * 100}%, rgba(255,255,255,.08) ${marginProgress * 100}% 100%)`,
                    }}
                    role="img"
                    aria-label={`Margem de contribuição ${percent.format(snapshot.margemContribuicao)}`}
                  >
                    <div>
                      <strong>
                        {percent.format(snapshot.margemContribuicao)}
                      </strong>
                      <span>líquida</span>
                    </div>
                  </div>
                  <p className="visual-overview-caption">Sem meta definida</p>
                  <dl className="visual-overview-supporting-metrics">
                    <div>
                      <dt>Retenção por R$ 100</dt>
                      <dd>
                        {currency.format(snapshot.margemContribuicao * 100)}
                      </dd>
                    </div>
                    <div>
                      <dt>Distância da meta</dt>
                      <dd>
                        {(marginGapPoints * 100).toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        p.p.
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className="visual-overview-zone visual-overview-composition">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Composição financeira</p>
                      <span>Comparação na mesma escala</span>
                    </div>
                    <BarChart3 aria-hidden="true" />
                  </div>
                  <div className="visual-overview-bars">
                    {composition.map((item) => (
                      <div key={item.label} className="visual-overview-bar-row">
                        <div>
                          <span>{item.label}</span>
                          <strong>{compactCurrency.format(item.value)}</strong>
                        </div>
                        <div
                          className="visual-overview-bar-track"
                          aria-hidden="true"
                        >
                          <span
                            style={{
                              width: `${Math.max((item.value / compositionMax) * 100, 3)}%`,
                              background: item.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <dl className="visual-overview-supporting-metrics visual-overview-supporting-metrics-wide">
                    <div>
                      <dt>Receita em caixa</dt>
                      <dd>{percent.format(cashConversion)}</dd>
                    </div>
                    <div>
                      <dt>Mídia sobre receita</dt>
                      <dd>{percent.format(mediaShare)}</dd>
                    </div>
                    <div>
                      <dt>Conversão em resultado</dt>
                      <dd>{percent.format(resultConversion)}</dd>
                    </div>
                  </dl>
                </article>

                <article className="visual-overview-zone visual-overview-health">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Saúde dos pagamentos</p>
                      <span>Distribuição do volume</span>
                    </div>
                    <HeartPulse aria-hidden="true" />
                    <Estado tom={veredito(estadoCheckout)} />
                  </div>
                  <div className="visual-overview-health-body">
                    <div
                      className="visual-overview-pie"
                      style={{ background: `conic-gradient(${conicStops})` }}
                      role="img"
                      aria-label={healthSegments
                        .map(
                          (segment) =>
                            `${segment.label}: ${percent.format(segment.value)}`,
                        )
                        .join(", ")}
                    >
                      <span />
                    </div>
                    {/* A legenda carrega a fatia e a contagem na mesma linha. Eram
                    dois blocos dizendo a mesma coisa — um em porcentagem,
                    outro em pedidos — e o de baixo custava uma faixa inteira
                    do cartão sem trazer segmento novo. Nenhum número saiu. */}
                    <ul>
                      {healthSegments.map((segment) => (
                        <li key={segment.label}>
                          <i
                            style={{ background: segment.color }}
                            aria-hidden="true"
                          />
                          <span>{segment.label}</span>
                          <strong>{percent.format(segment.value)}</strong>
                          <em>
                            {integer.format(snapshot.pedidos * segment.value)}
                            <span className="sr-only"> pedidos</span>
                          </em>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Os sinais que avisam antes de a receita cair. O painel de
                  referência põe o aviso ao lado do resultado que ele prevê,
                  e é isso: a rosca acima é o resultado, esta linha é o
                  aviso. */}
                  <ul className="visual-overview-signals">
                    {sinaisCheckout.map((sinal) => (
                      <li key={sinal.label} className={sinal.tom}>
                        <span title={sinal.nota}>{sinal.label}</span>
                        <strong title={sinal.nota}>{sinal.valor}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>

            <section
              className="visual-overview-page"
              data-active={String(!pagerAtivo || activePage === 1)}
              aria-hidden={pagerAtivo && activePage !== 1}
              aria-label="Evolução da receita"
              data-rotulo="02 · Evolução da receita"
            >
              <div className="visual-overview-grid visual-overview-grid-revenue">
                <article className="visual-overview-zone visual-overview-revenue">
                  <div className="visual-overview-revenue-copy">
                    <div className="visual-overview-zone-heading">
                      <div>
                        <p>Receita líquida</p>
                        <span>Fluxo diário no período</span>
                      </div>
                      <LineChart aria-hidden="true" />
                    </div>
                    <strong className="visual-overview-hero-value">
                      {compactCurrency.format(snapshot.receitaLiquida)}
                    </strong>
                    <p
                      className={
                        netDelta >= 0
                          ? "visual-overview-delta is-positive"
                          : "visual-overview-delta is-negative"
                      }
                    >
                      {netDelta >= 0 ? (
                        <ArrowUpRight aria-hidden="true" />
                      ) : (
                        <ArrowDownRight aria-hidden="true" />
                      )}
                      {deltaLabel(netDelta)} no período
                    </p>
                  </div>
                  <div
                    className="visual-overview-chart"
                    aria-label="Evolução da receita líquida"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={trend}
                        margin={{ top: 12, right: 4, left: 4, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="overviewRevenueFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#f5f5f5"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="100%"
                              stopColor="#f5f5f5"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="rgba(255,255,255,.07)"
                        />
                        <XAxis
                          dataKey="shortLabel"
                          axisLine={false}
                          tickLine={false}
                          minTickGap={26}
                          tick={{ fill: "rgba(255,255,255,.42)", fontSize: 10 }}
                        />
                        <YAxis
                          hide
                          domain={["dataMin - 400", "dataMax + 400"]}
                        />
                        <Tooltip
                          cursor={{ stroke: "rgba(255,255,255,.18)" }}
                          contentStyle={{
                            background: "#171717",
                            border: "1px solid rgba(255,255,255,.12)",
                            borderRadius: 12,
                            color: "#fff",
                            fontSize: 12,
                          }}
                          formatter={(value) => [
                            currency.format(Number(value)),
                            "Receita",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="netRevenue"
                          stroke="#f5f5f5"
                          strokeWidth={3}
                          fill="url(#overviewRevenueFill)"
                          dot={false}
                          activeDot={{
                            r: 4,
                            fill: "#f5f5f5",
                            stroke: "#0a0a0a",
                          }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="visual-overview-zone visual-overview-cash">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Caixa recebido</p>
                      <span>Valor já disponível</span>
                    </div>
                    <Wallet aria-hidden="true" />
                  </div>
                  <strong className="visual-overview-secondary-value">
                    {compactCurrency.format(snapshot.caixaRecebido)}
                  </strong>
                  <MiniTrend values={cashKpi?.sparkline ?? []} />
                  <p
                    className={
                      cashDelta >= 0
                        ? "visual-overview-delta is-positive"
                        : "visual-overview-delta is-negative"
                    }
                  >
                    {periodoSemDado ? null : cashDelta >= 0 ? (
                      <ArrowUpRight aria-hidden="true" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" />
                    )}
                    {periodoSemDado
                      ? "Sem movimento no período"
                      : `${deltaLabel(cashDelta)} vs. período anterior`}
                  </p>
                </article>
              </div>
            </section>

            <section
              className="visual-overview-page"
              data-active={String(!pagerAtivo || activePage === 2)}
              aria-hidden={pagerAtivo && activePage !== 2}
              aria-label="Aquisição e resultado"
              data-rotulo="03 · Aquisição e resultado"
            >
              <div className="visual-overview-grid visual-overview-grid-result">
                <article className="visual-overview-zone visual-overview-channels">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Receita por canal</p>
                      <span>Participação da aquisição</span>
                    </div>
                    <PieChart aria-hidden="true" />
                  </div>
                  <div className="visual-overview-bubbles" aria-hidden="true">
                    {channels.map((channel, index) => {
                      const size = 58 + (channel.revenue / bubbleMax) * 54;
                      return (
                        <span
                          key={channel.name}
                          style={{
                            width: size,
                            height: size,
                            background: ["#f5f5f5", "#a8a8a8", "#6a6a6a"][
                              index
                            ],
                          }}
                        >
                          {Math.round((channel.revenue / bubbleMax) * 100)}
                        </span>
                      );
                    })}
                  </div>
                  <ul className="visual-overview-channel-list">
                    {channels.map((channel, index) => (
                      <li key={channel.name}>
                        <i
                          style={{
                            background: ["#f5f5f5", "#a8a8a8", "#6a6a6a"][
                              index
                            ],
                          }}
                          aria-hidden="true"
                        />
                        <span>{channel.name}</span>
                        <strong>
                          {compactCurrency.format(channel.revenue)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="visual-overview-zone visual-overview-profit">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Resultado final</p>
                      <span>Depois de mídia, taxas e produto</span>
                    </div>
                    <Coins aria-hidden="true" />
                  </div>
                  <div className="visual-overview-profit-body">
                    <strong>
                      {compactCurrency.format(snapshot.lucroContribuicao)}
                    </strong>
                    <div
                      className={
                        profitDelta >= 0
                          ? "visual-overview-profit-orb is-positive"
                          : "visual-overview-profit-orb is-negative"
                      }
                      aria-hidden="true"
                    >
                      <span />
                    </div>
                  </div>
                  <p
                    className={
                      profitDelta >= 0
                        ? "visual-overview-delta is-positive"
                        : "visual-overview-delta is-negative"
                    }
                  >
                    {profitDelta >= 0 ? (
                      <ArrowUpRight aria-hidden="true" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" />
                    )}
                    {deltaLabel(profitDelta)} no comparativo
                  </p>
                </article>
                {funilSite && (
                  <article className="visual-overview-zone visual-overview-funnel">
                    <div className="visual-overview-zone-heading">
                      <div>
                        <p>Funil do site</p>
                        <span>Da visita ao pedido</span>
                      </div>
                      <Filter aria-hidden="true" />
                      {/* Destaque marca o número que é estimativa, não medição. */}
                      <Estado tom="accent" />
                    </div>

                    <strong className="visual-overview-hero-value">
                      {percent.format(funilSite.conversao)}
                    </strong>
                    <p className="visual-overview-caption">
                      das visitas viram pedido
                    </p>

                    {/* Uma só cor nas três barras: é a mesma medida em três
                    momentos, e o comprimento já carrega a diferença. Pintar
                    cada etapa de um tom diria que são coisas distintas. */}
                    <div className="visual-overview-funnel-steps">
                      {funilSite.etapas.map((etapa) => (
                        <div key={etapa.label}>
                          <div>
                            <span>{etapa.label}</span>
                            <strong>{integer.format(etapa.valor)}</strong>
                          </div>
                          <div
                            className="visual-overview-bar-track"
                            aria-hidden="true"
                          >
                            <span
                              style={{
                                width: `${Math.max(
                                  (etapa.valor / funilSite.etapas[0].valor) *
                                    100,
                                  3,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <dl className="visual-overview-supporting-metrics">
                      <div>
                        <dt>Visita → checkout</dt>
                        <dd>{percent.format(funilSite.visitaCheckout)}</dd>
                      </div>
                      <div>
                        <dt>Checkout → pedido</dt>
                        <dd>{percent.format(funilSite.checkoutPedido)}</dd>
                      </div>
                    </dl>

                    {/* O rótulo da etapa já diz "à página", então a ressalva só
                    precisa cuidar da origem do número. Cada linha a mais
                    aqui sai da altura das barras. */}
                    <p
                      className="visual-overview-note"
                      title="No funil do modelo esta etapa é quem chegou na página de vendas depois de clicar no anúncio, e não o total de sessões do site."
                    >
                      Visitas estimadas a partir dos pedidos, sem fonte de
                      analytics ligada.
                    </p>
                  </article>
                )}

                <footer className="visual-overview-footer">
                  <div>
                    <span>Pedidos</span>
                    <strong>{integer.format(snapshot.pedidos)}</strong>
                  </div>
                  <div>
                    <span>Ticket médio</span>
                    <strong>{currency.format(snapshot.ticket)}</strong>
                  </div>
                  <div>
                    <span>Novos clientes</span>
                    <strong>{integer.format(snapshot.novosClientes)}</strong>
                  </div>
                  <div>
                    <span>Qualidade dos dados</span>
                    <strong>{percent.format(snapshot.dataQuality)}</strong>
                  </div>
                  <p>
                    {demoMode ? "Dados demonstrativos" : "Dados da operação"}
                  </p>
                </footer>
              </div>
            </section>

            <section
              className="visual-overview-page"
              data-active={String(!pagerAtivo || activePage === 3)}
              aria-hidden={pagerAtivo && activePage !== 3}
              aria-label="Metas e projeção"
              data-rotulo="04 · Metas e projeção"
            >
              <div className="visual-overview-grid visual-overview-grid-goals">
                <article className="visual-overview-zone visual-overview-goal">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Meta de receita</p>
                      <span>Quanto do alvo já foi feito</span>
                    </div>
                    <Target aria-hidden="true" />
                    <Estado tom={veredito(estadoMeta(metaReceita))} />
                  </div>

                  {metaReceita ? (
                    <>
                      <div
                        className="visual-overview-donut"
                        style={{
                          background: `conic-gradient(${
                            COR_ESTADO[veredito(estadoMeta(metaReceita))]
                          } 0 ${metaReceita.preenchimento * 100}%, rgba(255,255,255,.08) ${
                            metaReceita.preenchimento * 100
                          }% 100%)`,
                        }}
                        role="img"
                        aria-label={`Receita em ${percent.format(metaReceita.razao)} da meta`}
                      >
                        <div className="visual-overview-donut-hole">
                          <strong>{percent.format(metaReceita.razao)}</strong>
                          <span>da meta</span>
                        </div>
                      </div>
                      <p className="visual-overview-caption">
                        {compactCurrency.format(metaReceita.atual)} de{" "}
                        {compactCurrency.format(metaReceita.meta)}
                      </p>
                      <div className="visual-overview-goal-gap">
                        {metaReceita.atingiu ? (
                          <strong className="is-positive">Meta batida</strong>
                        ) : (
                          <>
                            <span>Falta</span>
                            <strong>
                              {compactCurrency.format(metaReceita.falta)}
                            </strong>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="visual-overview-caption">
                      Sem meta definida para a receita neste período.
                    </p>
                  )}
                </article>

                <article className="visual-overview-zone visual-overview-goal">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Meta de lucro</p>
                      <span>O que sobra depois de tudo</span>
                    </div>
                    <Target aria-hidden="true" />
                    <Estado tom={veredito(estadoMeta(metaLucro))} />
                  </div>

                  {metaLucro ? (
                    <>
                      <div
                        className="visual-overview-donut"
                        style={{
                          background: `conic-gradient(${
                            COR_ESTADO[veredito(estadoMeta(metaLucro))]
                          } 0 ${metaLucro.preenchimento * 100}%, rgba(255,255,255,.08) ${
                            metaLucro.preenchimento * 100
                          }% 100%)`,
                        }}
                        role="img"
                        aria-label={`Lucro em ${percent.format(metaLucro.razao)} da meta`}
                      >
                        <div className="visual-overview-donut-hole">
                          <strong>{percent.format(metaLucro.razao)}</strong>
                          <span>da meta</span>
                        </div>
                      </div>
                      <p className="visual-overview-caption">
                        {compactCurrency.format(metaLucro.atual)} de{" "}
                        {compactCurrency.format(metaLucro.meta)}
                      </p>
                      <div className="visual-overview-goal-gap">
                        {metaLucro.atingiu ? (
                          <strong className="is-positive">Meta batida</strong>
                        ) : (
                          <>
                            <span>Falta</span>
                            <strong>
                              {compactCurrency.format(metaLucro.falta)}
                            </strong>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="visual-overview-caption">
                      Sem meta definida para o lucro neste período.
                    </p>
                  )}
                </article>

                <article className="visual-overview-zone visual-overview-projection">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Onde o mês fecha</p>
                      <span>
                        {projecaoMes
                          ? `Se o ritmo de ${projecaoMes.mesLabel} continuar`
                          : "Projeção do mês corrente"}
                      </span>
                    </div>
                    <TrendingUp aria-hidden="true" />
                    {/* Destaque, e não sucesso ou erro: isto não aconteceu
                    ainda. Dar a um número projetado a mesma cor de um
                    medido faria a tela afirmar como fato o que é só a
                    continuação do ritmo atual. */}
                    <Estado tom="accent" />
                  </div>

                  {projecaoMes ? (
                    <>
                      <strong className="visual-overview-hero-value">
                        {compactCurrency.format(projecaoMes.projecao)}
                      </strong>
                      <p className="visual-overview-caption">
                        {projecaoMes.diasRestantes > 0
                          ? `Faltam ${integer.format(projecaoMes.diasRestantes)} dias para fechar o mês.`
                          : "O mês já fechou — este é o valor realizado."}
                      </p>

                      <ul className="visual-overview-projection-list">
                        <li>
                          <span>Feito até agora</span>
                          <strong>
                            {compactCurrency.format(projecaoMes.receitaNoMes)}
                          </strong>
                        </li>
                        <li>
                          <span>Ritmo por dia</span>
                          <strong>{currency.format(projecaoMes.ritmo)}</strong>
                        </li>
                        <li>
                          <span>Dias corridos do mês</span>
                          <strong>
                            {integer.format(projecaoMes.diasCorridos)} de{" "}
                            {integer.format(projecaoMes.diasDoMes)}
                          </strong>
                        </li>
                        {diasParaCobrirFalta !== null && (
                          <li>
                            <span>Dias para cobrir o que falta</span>
                            <strong>
                              {integer.format(diasParaCobrirFalta)}
                            </strong>
                          </li>
                        )}
                      </ul>

                      {projecaoMes.razao !== null && (
                        <p
                          className={
                            projecaoMes.razao >= 1
                              ? "visual-overview-verdict is-positive"
                              : "visual-overview-verdict is-warning"
                          }
                        >
                          {projecaoMes.razao >= 1
                            ? `Neste ritmo o mês fecha acima da meta equivalente (${compactCurrency.format(
                                projecaoMes.metaEquivalente,
                              )}).`
                            : `Neste ritmo faltariam ${compactCurrency.format(
                                Math.max(
                                  0,
                                  projecaoMes.metaEquivalente -
                                    projecaoMes.projecao,
                                ),
                              )} para a meta equivalente do mês (${compactCurrency.format(
                                projecaoMes.metaEquivalente,
                              )}).`}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="visual-overview-caption">
                      Sem dias suficientes no período para projetar o mês.
                    </p>
                  )}
                </article>
              </div>
            </section>

            {/* 05 · Clientes e retenção.

            As três leituras que os painéis de referência tratam como o
            teste de que o negócio fecha a conta. Todas já eram calculadas
            pelo modelo e nunca tinham chegado à tela. */}
            <section
              className="visual-overview-page"
              data-active={String(!pagerAtivo || activePage === 4)}
              aria-hidden={pagerAtivo && activePage !== 4}
              aria-label="Clientes e retenção"
              data-rotulo="05 · Clientes e retenção"
            >
              <div className="visual-overview-grid visual-overview-grid-clients">
                <article className="visual-overview-zone visual-overview-ltv">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Retorno por cliente</p>
                      <span>O que ele devolve contra o que custou</span>
                    </div>
                    <Scale aria-hidden="true" />
                    <Estado tom={veredito(estadoLtvCac(clientes.ltvCac))} />
                  </div>

                  {clientes.ltvCac !== null ? (
                    <>
                      <strong className="visual-overview-hero-value">
                        {clientes.ltvCac.toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        : 1
                      </strong>
                      <p className="visual-overview-caption">
                        {clientes.ltvCac >= 1
                          ? "O cliente já se pagou dentro dos 90 dias."
                          : "O cliente ainda não se pagou dentro dos 90 dias."}
                      </p>

                      {/* A régua marca o 1:1, que é a meta honesta para um LTV de
                      90 dias. A meta de mercado de 3:1 vale para 24 meses e
                      compará-las daria um diagnóstico errado. */}
                      <div
                        className="visual-overview-meter"
                        role="img"
                        aria-label={`Retorno de ${clientes.ltvCac.toLocaleString(
                          "pt-BR",
                          { maximumFractionDigits: 1 },
                        )} para cada 1 real de aquisição, contra a marca de 1 para 1`}
                      >
                        <span
                          className={
                            clientes.ltvCac >= 1 ? "is-positive" : "is-negative"
                          }
                          style={{
                            width: `${Math.min(100, (clientes.ltvCac / 2) * 100)}%`,
                          }}
                        />
                        <i style={{ left: "50%" }} aria-hidden="true" />
                      </div>
                      <p className="visual-overview-meter-legend">
                        <span>0</span>
                        <span>meta 1:1</span>
                        <span>2:1</span>
                      </p>

                      <dl className="visual-overview-supporting-metrics">
                        <div>
                          <dt>LTV em 90 dias</dt>
                          <dd>{currency.format(clientes.ltv90)}</dd>
                        </div>
                        <div>
                          <dt>Custo por novo cliente</dt>
                          <dd>{currency.format(clientes.cac)}</dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="visual-overview-caption">
                      Sem custo de aquisição no período para comparar com o LTV.
                    </p>
                  )}
                </article>

                <article className="visual-overview-zone visual-overview-payback">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Payback</p>
                      <span>Compras até o cliente se pagar</span>
                    </div>
                    <Repeat aria-hidden="true" />
                    <Estado tom={veredito(estadoPayback(clientes.paybackCompras))} />
                  </div>

                  {Number.isFinite(clientes.paybackCompras) ? (
                    <>
                      <strong className="visual-overview-hero-value">
                        {clientes.paybackCompras.toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}
                      </strong>
                      <p className="visual-overview-caption">
                        compras para cobrir o custo de aquisição
                      </p>

                      <ul className="visual-overview-projection-list">
                        <li>
                          <span>Ticket médio</span>
                          <strong>{currency.format(snapshot.ticket)}</strong>
                        </li>
                        <li>
                          <span>Custo por novo cliente</span>
                          <strong>{currency.format(clientes.cac)}</strong>
                        </li>
                        <li>
                          <span>No período anterior</span>
                          <strong>
                            {Number.isFinite(clientesAntes.paybackCompras)
                              ? emCompras(clientesAntes.paybackCompras)
                              : "—"}
                          </strong>
                        </li>
                      </ul>

                      <p className="visual-overview-caption">
                        Em compras, não em dias: o modelo ainda não sabe o
                        intervalo entre uma compra e a seguinte.
                      </p>
                    </>
                  ) : (
                    <p className="visual-overview-caption">
                      Sem margem por pedido no período para calcular o payback.
                    </p>
                  )}
                </article>

                <article className="visual-overview-zone visual-overview-repeat">
                  <div className="visual-overview-zone-heading">
                    <div>
                      <p>Recompra</p>
                      <span>O aviso que chega antes do LTV</span>
                    </div>
                    <Users aria-hidden="true" />
                    {/* Informativo: não existe meta de recompra cadastrada no
                    modelo, e inventar uma faria a etiqueta mentir. */}
                    <Estado tom="info" />
                  </div>

                  <div
                    className="visual-overview-donut"
                    style={{
                      background: `conic-gradient(${COR_ESTADO.info} 0 ${
                        Math.min(1, clientes.taxaRecompra) * 100
                      }%, rgba(255,255,255,.08) ${
                        Math.min(1, clientes.taxaRecompra) * 100
                      }% 100%)`,
                    }}
                    role="img"
                    aria-label={`Taxa de recompra de ${percent.format(
                      clientes.taxaRecompra,
                    )}`}
                  >
                    <div className="visual-overview-donut-hole">
                      <strong>{percent.format(clientes.taxaRecompra)}</strong>
                      <span>recompram</span>
                    </div>
                  </div>

                  <dl className="visual-overview-supporting-metrics">
                    <div>
                      <dt>Novos clientes</dt>
                      <dd>{integer.format(clientes.novosClientes)}</dd>
                    </div>
                    <div>
                      <dt>Recorrentes</dt>
                      <dd>{integer.format(clientes.recorrentes)}</dd>
                    </div>
                  </dl>
                </article>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
