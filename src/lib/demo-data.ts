/**
 * DADOS DE DEMONSTRAÇÃO — usados exclusivamente quando o banco não está
 * conectado (modo demo). Nunca são misturados com dados reais: quando o
 * Supabase estiver configurado, as páginas passam a consultar o banco
 * (Fase 5) e este módulo deixa de ser usado.
 */

export interface DemoKpi {
  label: string;
  value: string;
  change: number;
  tone?: "success" | "warning" | "destructive" | "info";
}

export const demoKpis: DemoKpi[] = [
  {
    label: "Receita aprovada",
    value: "R$ 24.830,50",
    change: 12.4,
    tone: "success",
  },
  {
    label: "Receita pendente",
    value: "R$ 3.215,00",
    change: -4.1,
    tone: "warning",
  },
  { label: "Total de pedidos", value: "412", change: 8.2 },
  { label: "Ticket médio", value: "R$ 87,90", change: 2.7 },
  { label: "Taxa de conversão", value: "3,4%", change: 0.6, tone: "info" },
  {
    label: "Carrinhos abandonados",
    value: "89",
    change: -11.3,
    tone: "destructive",
  },
];

export const demoRevenueByDay = [
  {
    day: "22/07",
    aprovada: 2840,
    pendente: 420,
    recusada: 210,
    pedidos: 34,
    tempoAprovacaoSeg: 154,
  },
  {
    day: "23/07",
    aprovada: 3120,
    pendente: 310,
    recusada: 180,
    pedidos: 37,
    tempoAprovacaoSeg: 142,
  },
  {
    day: "24/07",
    aprovada: 2650,
    pendente: 540,
    recusada: 260,
    pedidos: 31,
    tempoAprovacaoSeg: 178,
  },
  {
    day: "25/07",
    aprovada: 4210,
    pendente: 380,
    recusada: 150,
    pedidos: 48,
    tempoAprovacaoSeg: 121,
  },
  {
    day: "26/07",
    aprovada: 3890,
    pendente: 620,
    recusada: 230,
    pedidos: 45,
    tempoAprovacaoSeg: 134,
  },
  {
    day: "27/07",
    aprovada: 4560,
    pendente: 450,
    recusada: 190,
    pedidos: 52,
    tempoAprovacaoSeg: 118,
  },
  {
    day: "28/07",
    aprovada: 3560,
    pendente: 495,
    recusada: 220,
    pedidos: 41,
    tempoAprovacaoSeg: 134,
  },
];

/** Sem base real conectada, a meta também permanece zerada. */
export const demoDailyRevenueGoal = 0;

/** Faturamento somado por hora do dia (últimos 7 dias), pra identificar o horário de pico de vendas. */
export const demoRevenueByHour = [
  { hour: "00h", valor: 180, pedidos: 2 },
  { hour: "01h", valor: 90, pedidos: 1 },
  { hour: "02h", valor: 60, pedidos: 1 },
  { hour: "03h", valor: 40, pedidos: 0 },
  { hour: "04h", valor: 30, pedidos: 0 },
  { hour: "05h", valor: 50, pedidos: 1 },
  { hour: "06h", valor: 120, pedidos: 1 },
  { hour: "07h", valor: 260, pedidos: 3 },
  { hour: "08h", valor: 480, pedidos: 5 },
  { hour: "09h", valor: 720, pedidos: 8 },
  { hour: "10h", valor: 940, pedidos: 11 },
  { hour: "11h", valor: 1080, pedidos: 12 },
  { hour: "12h", valor: 980, pedidos: 11 },
  { hour: "13h", valor: 860, pedidos: 9 },
  { hour: "14h", valor: 920, pedidos: 10 },
  { hour: "15h", valor: 1040, pedidos: 12 },
  { hour: "16h", valor: 1180, pedidos: 13 },
  { hour: "17h", valor: 1320, pedidos: 15 },
  { hour: "18h", valor: 1560, pedidos: 17 },
  { hour: "19h", valor: 1840, pedidos: 20 },
  { hour: "20h", valor: 2120, pedidos: 24 },
  { hour: "21h", valor: 1780, pedidos: 19 },
  { hour: "22h", valor: 980, pedidos: 10 },
  { hour: "23h", valor: 420, pedidos: 4 },
];

export interface DemoRevenueDay {
  /** Rótulo curto usado como chave e no eixo do gráfico: "DD/MM". */
  day: string;
  /** Data completa "AAAA-MM-DD", usada pelo calendário do ano. */
  date: string;
  aprovada: number;
  pendente: number;
  recusada: number;
  pedidos: number;
  tempoAprovacaoSeg: number;
}

const MS_PER_DAY = 86_400_000;
/**
 * "Hoje" segue o dia real do dispositivo (não uma data fixa) — é a âncora
 * da "Semana atual" do gráfico. O ano dos 7 dias fixos (`demoRevenueByDay`,
 * 22-28/07) acompanha o ano corrente, então eles aparecem quando "hoje"
 * cai nessa janela do calendário.
 */
// UTC, não hora local: o resto do arquivo monta todas as datas com
// Date.UTC/getUTC*, então "hoje" precisa estar na mesma base pra não
// desalinhar um dia pra mais ou pra menos.
const HOJE = new Date();
const CALENDAR_YEAR = HOJE.getUTCFullYear();
const DEMO_TODAY_MONTH = HOJE.getUTCMonth(); // 0 = janeiro
const DEMO_TODAY_DATE = HOJE.getUTCDate();
/** O calendário cobre do 1º de janeiro do ano corrente até 31/12/2028. */
const CALENDAR_END_YEAR = Math.max(2028, CALENDAR_YEAR);

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Gerador pseudoaleatório com semente fixa. Precisa ser determinístico:
 * servidor e navegador têm que produzir exatamente os mesmos números, senão
 * o React acusa divergência de hidratação ao montar a página.
 */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Faturamento diário do 1º de janeiro do ano corrente até 31/12/2028, com as
 * pontas esticadas até fechar semanas completas: começa na segunda-feira da
 * semana do 1º de janeiro (pegando os últimos dias de dezembro anterior) e
 * termina no domingo da semana de 31/12/2028 — assim toda semana
 * selecionável tem os 7 pilares, mesmo cruzando a virada de mês ou de ano.
 * Os sete dias já existentes em `demoRevenueByDay` (só no ano corrente) são
 * preservados tal e qual; o resto é gerado com variação de fim de semana e
 * crescimento leve e contínuo ao longo dos anos.
 */
function buildYearRevenue(): DemoRevenueDay[] {
  const rows: DemoRevenueDay[] = [];
  const rand = seededRandom(20260731);

  const inicioAno = Date.UTC(CALENDAR_YEAR, 0, 1);
  const fimDados = Date.UTC(CALENDAR_END_YEAR, 11, 31);
  // Recua até a segunda-feira (segunda = índice 0) e avança até o domingo.
  const start =
    inicioAno - ((new Date(inicioAno).getUTCDay() + 6) % 7) * MS_PER_DAY;
  const end =
    fimDados + (6 - ((new Date(fimDados).getUTCDay() + 6) % 7)) * MS_PER_DAY;

  for (let t = start; t <= end; t += MS_PER_DAY) {
    const d = new Date(t);
    const day = `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
    const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

    // Os 7 dias fixos valem só no ano corrente — sem o teste de ano,
    // "22/07" bateria também nos anos seguintes e repetiria os números.
    const fixo =
      d.getUTCFullYear() === CALENDAR_YEAR
        ? demoRevenueByDay.find((r) => r.day === day)
        : undefined;
    if (fixo) {
      rows.push({ ...fixo, date });
      continue;
    }

    const weekday = d.getUTCDay();
    const fimDeSemana = weekday === 0 || weekday === 6 ? 0.62 : 1;
    const crescimento = 0.7 + (0.5 * (t - start)) / (end - start);
    const ruido = 0.75 + rand() * 0.5;

    const aprovada = Math.round(3200 * fimDeSemana * crescimento * ruido);
    const pendente = Math.round(aprovada * (0.08 + rand() * 0.08));
    const recusada = Math.round(aprovada * (0.04 + rand() * 0.05));
    const pedidos = Math.max(1, Math.round(aprovada / (78 + rand() * 25)));
    const tempoAprovacaoSeg = Math.round(110 + rand() * 80);

    rows.push({
      day,
      date,
      aprovada,
      pendente,
      recusada,
      pedidos,
      tempoAprovacaoSeg,
    });
  }

  return rows;
}

/** Ano inteiro, usado pelo calendário de seleção do gráfico de receita. */
export const demoRevenueByYear = buildYearRevenue();

/**
 * Limites de navegação do calendário: de janeiro do ano corrente até
 * dezembro de 2028 (em vez dos extremos de `demoRevenueByYear`, que
 * incluem alguns dias emprestados só pra fechar a primeira/última semana).
 */
export const demoOperationMinMonth = { year: CALENDAR_YEAR, month: 0 };
export const demoOperationMaxMonth = { year: CALENDAR_END_YEAR, month: 11 };

/**
 * Semana atual: os 7 dias (segunda a domingo) da semana do "hoje" fictício.
 * É o período padrão do gráfico de receita ao abrir ou resetar.
 */
export const demoRevenueCurrentWeek: DemoRevenueDay[] = (() => {
  const hojeMs = Date.UTC(CALENDAR_YEAR, DEMO_TODAY_MONTH, DEMO_TODAY_DATE);
  // Dias passados desde a segunda-feira (segunda = 0).
  const desdeSegunda = (new Date(hojeMs).getUTCDay() + 6) % 7;
  const segundaMs = hojeMs - desdeSegunda * MS_PER_DAY;
  const domingoMs = segundaMs + 6 * MS_PER_DAY;
  return demoRevenueByYear.filter((r) => {
    const [ry = CALENDAR_YEAR, rm = 1, rd = 1] = r.date.split("-").map(Number);
    const t = Date.UTC(ry, rm - 1, rd);
    return t >= segundaMs && t <= domingoMs;
  });
})();

/**
 * Escala de horas por dia: cada dia reaproveita o perfil de
 * `demoRevenueByHour` escalado para o seu total, deslocado algumas horas
 * para que os dias tenham horários de pico distintos — é justamente essa
 * variação que o gráfico diário evidencia.
 *
 * Chaveado pela data completa ("AAAA-MM-DD"): com o ano inteiro, o rótulo
 * curto "DD/MM" se repete (29/12 de 2025 e de 2026) e colidiria.
 */
const HOUR_SHIFT_BY_DAY = [0, -1, 2, -4, 1, 0, -2, 3, -3, 1];

export const demoRevenueByDayHour: Record<
  string,
  { hour: string; valor: number }[]
> = Object.fromEntries(
  demoRevenueByYear.map((d, i) => {
    const dayTotal = d.aprovada + d.pendente + d.recusada;
    const shift = HOUR_SHIFT_BY_DAY[i % HOUR_SHIFT_BY_DAY.length] ?? 0;
    const valores = demoRevenueByHour.map(
      (_, h) => demoRevenueByHour[(h - shift + 24) % 24]?.valor ?? 0,
    );
    const soma = valores.reduce((s, v) => s + v, 0);
    return [
      d.date,
      valores.map((v, h) => ({
        hour: `${String(h).padStart(2, "0")}h`,
        valor: Math.round((v / soma) * dayTotal),
      })),
    ];
  }),
);

export const demoTopProducts = [
  {
    position: 1,
    name: "Curso Tráfego Pago Pro",
    sold: 142,
    revenue: "R$ 9.940,00",
    conversion: "4,8%",
  },
  {
    position: 2,
    name: "Mentoria Individual",
    sold: 38,
    revenue: "R$ 7.600,00",
    conversion: "2,1%",
  },
  {
    position: 3,
    name: "E-book Escala Criativa",
    sold: 210,
    revenue: "R$ 4.190,00",
    conversion: "6,3%",
  },
  {
    position: 4,
    name: "Template Pack Anúncios",
    sold: 96,
    revenue: "R$ 2.870,00",
    conversion: "3,9%",
  },
];

export const demoRecentOrders = [
  {
    ref: "#IN-1042",
    customer: "Mariana S.",
    product: "Curso Tráfego Pago Pro",
    total: "R$ 297,00",
    status: "Pago",
    gateway: "Stripe",
    date: "28/07 14:32",
  },
  {
    ref: "#IN-1041",
    customer: "João P.",
    product: "E-book Escala Criativa",
    total: "R$ 19,90",
    status: "Pago",
    gateway: "Mercado Pago",
    date: "28/07 14:10",
  },
  {
    ref: "#IN-1040",
    customer: "Carla M.",
    product: "Mentoria Individual",
    total: "R$ 497,00",
    status: "Pendente",
    gateway: "Pagar.me",
    date: "28/07 13:55",
  },
  {
    ref: "#IN-1039",
    customer: "Rafael T.",
    product: "Template Pack Anúncios",
    total: "R$ 47,00",
    status: "Recusado",
    gateway: "Stripe",
    date: "28/07 13:21",
  },
  {
    ref: "#IN-1038",
    customer: "Beatriz L.",
    product: "Curso Tráfego Pago Pro",
    total: "R$ 297,00",
    status: "Pago",
    gateway: "Stripe",
    date: "28/07 12:47",
  },
];

/**
 * Visão "Operação" — números do dia a dia (Fase 5/6, dados de exemplo).
 */
export const demoOperationKpis: DemoKpi[] = [
  {
    label: "Faturamento hoje",
    value: "R$ 3.560,00",
    change: 8.2,
    tone: "success",
  },
  {
    label: "Lucro hoje (líquido)",
    value: "R$ 2.180,50",
    change: 5.4,
    tone: "success",
  },
  { label: "Total de leads", value: "1.284", change: 3.1 },
  { label: "Novos leads hoje", value: "42", change: 14.9 },
  { label: "Novos leads na semana", value: "312", change: 6.7 },
  { label: "Novos leads no mês", value: "1.180", change: 11.2 },
  {
    label: "Vendas recuperadas hoje",
    value: "R$ 480,00",
    change: 2.3,
    tone: "info",
  },
  {
    label: "Vendas recuperadas na semana",
    value: "R$ 2.340,00",
    change: 9.8,
    tone: "info",
  },
  {
    label: "Vendas recuperadas no mês",
    value: "R$ 8.960,00",
    change: 4.5,
    tone: "info",
  },
];

/**
 * Visão "Empresa" — totais acumulados (Fase 5/6, dados de exemplo).
 */
export const demoCompanyKpis: DemoKpi[] = [
  {
    label: "Receita aprovada acumulada",
    value: "R$ 412.860,00",
    change: 12.6,
    tone: "success",
  },
  {
    label: "Resultado líquido demonstrativo",
    value: "R$ 246.520,00",
    change: 9.4,
    tone: "success",
  },
  { label: "Total de leads", value: "18.940", change: 7.8 },
];

/** Resumo de lucro por período, para o CEO acompanhar rápido. */
export const demoProfitSummary = [
  { label: "Hoje", value: "R$ 2.180,50", change: 5.4 },
  { label: "Esta semana", value: "R$ 14.320,00", change: 9.1 },
  { label: "Últimos 15 dias", value: "R$ 28.640,00", change: 3.7 },
  { label: "Este mês", value: "R$ 52.980,00", change: 12.6 },
];

export interface GrowthPoint {
  label: string;
  faturamento: number;
  lucroLiquido: number;
  leads: number;
}

/** Série de crescimento da empresa, por período de visualização. */
export const demoGrowthSeries: Record<
  "dia" | "semana" | "mes" | "ano",
  GrowthPoint[]
> = {
  dia: [
    { label: "22/07", faturamento: 2840, lucroLiquido: 1690, leads: 38 },
    { label: "23/07", faturamento: 3120, lucroLiquido: 1850, leads: 44 },
    { label: "24/07", faturamento: 2650, lucroLiquido: 1520, leads: 31 },
    { label: "25/07", faturamento: 4210, lucroLiquido: 2480, leads: 52 },
    { label: "26/07", faturamento: 3890, lucroLiquido: 2260, leads: 47 },
    { label: "27/07", faturamento: 4560, lucroLiquido: 2710, leads: 58 },
    { label: "28/07", faturamento: 3560, lucroLiquido: 2180, leads: 42 },
  ],
  semana: [
    { label: "Sem. 1", faturamento: 18200, lucroLiquido: 10600, leads: 260 },
    { label: "Sem. 2", faturamento: 19850, lucroLiquido: 11400, leads: 284 },
    { label: "Sem. 3", faturamento: 21230, lucroLiquido: 12500, leads: 298 },
    { label: "Sem. 4", faturamento: 20480, lucroLiquido: 11980, leads: 275 },
    { label: "Sem. 5", faturamento: 23670, lucroLiquido: 13920, leads: 312 },
    { label: "Sem. 6", faturamento: 24950, lucroLiquido: 14680, leads: 330 },
    { label: "Sem. 7", faturamento: 26310, lucroLiquido: 15540, leads: 349 },
    { label: "Sem. 8", faturamento: 25680, lucroLiquido: 15120, leads: 341 },
  ],
  mes: [
    { label: "Dez", faturamento: 68400, lucroLiquido: 39800, leads: 1120 },
    { label: "Jan", faturamento: 71200, lucroLiquido: 41500, leads: 1180 },
    { label: "Fev", faturamento: 75800, lucroLiquido: 44300, leads: 1245 },
    { label: "Mar", faturamento: 82100, lucroLiquido: 48600, leads: 1310 },
    { label: "Abr", faturamento: 79400, lucroLiquido: 46200, leads: 1275 },
    { label: "Mai", faturamento: 88600, lucroLiquido: 52400, leads: 1398 },
    { label: "Jun", faturamento: 94200, lucroLiquido: 55900, leads: 1462 },
    { label: "Jul", faturamento: 98500, lucroLiquido: 58700, leads: 1520 },
  ],
  ano: [
    { label: "2022", faturamento: 612000, lucroLiquido: 348000, leads: 9800 },
    { label: "2023", faturamento: 845000, lucroLiquido: 492000, leads: 13400 },
    { label: "2024", faturamento: 1120000, lucroLiquido: 658000, leads: 16900 },
    { label: "2025", faturamento: 1384000, lucroLiquido: 812000, leads: 20100 },
    { label: "2026", faturamento: 412860, lucroLiquido: 246520, leads: 18940 },
  ],
};

export interface DemoLedgerEntry {
  date: string;
  description: string;
  category: string;
  type: "entrada" | "saida";
  value: number;
}

/** Livro-caixa de exemplo para Financeiro → Entradas/Saídas. */
export const demoLedger: DemoLedgerEntry[] = [
  {
    date: "28/07",
    description: "Venda #IN-1042 — Curso Tráfego Pago Pro",
    category: "Vendas",
    type: "entrada",
    value: 297.0,
  },
  {
    date: "28/07",
    description: "Taxa Stripe",
    category: "Taxas",
    type: "saida",
    value: 11.88,
  },
  {
    date: "27/07",
    description: "Repasse Mercado Pago",
    category: "Repasses",
    type: "entrada",
    value: 1840.0,
  },
  {
    date: "27/07",
    description: "Reembolso — Carla M.",
    category: "Reembolsos",
    type: "saida",
    value: 497.0,
  },
  {
    date: "26/07",
    description: "Venda #IN-1038 — Curso Tráfego Pago Pro",
    category: "Vendas",
    type: "entrada",
    value: 297.0,
  },
  {
    date: "26/07",
    description: "Assinatura ferramenta de anúncios",
    category: "Despesas operacionais",
    type: "saida",
    value: 350.0,
  },
  {
    date: "25/07",
    description: "Venda #IN-1035 — Mentoria Individual",
    category: "Vendas",
    type: "entrada",
    value: 497.0,
  },
  {
    date: "24/07",
    description: "Taxa Pagar.me",
    category: "Taxas",
    type: "saida",
    value: 8.6,
  },
];

// ---------------------------------------------------------------------------
// Centro de comando operacional (redesign do Dashboard → aba Operação)
// ---------------------------------------------------------------------------

export type PeriodKey = "hoje" | "ontem" | "7d" | "30d" | "mes";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
};

export interface ExecutiveMetric {
  key: string;
  label: string;
  format: "currency" | "percent";
  value: number;
  deltaPct: number;
  deltaAbs: number;
  comparisonLabel: string;
  goal: number;
  sparkline: number[];
  /** Crescer nem sempre é bom (ex: recusas) — cada métrica já vem classificada. */
  status: "normal" | "atencao" | "critico";
  formula: string;
}

/** 4 KPIs executivos (Nível 1), por período rápido. */
export const demoExecutiveByPeriod: Record<PeriodKey, ExecutiveMetric[]> = {
  hoje: [
    {
      key: "receita",
      label: "Receita aprovada",
      format: "currency",
      value: 3560,
      deltaPct: 8.2,
      deltaAbs: 270,
      comparisonLabel: "vs. ontem",
      goal: 4000,
      sparkline: [2840, 3120, 2650, 4210, 3890, 4560, 3560],
      status: "normal",
      formula: "Soma de todos os pedidos com pagamento aprovado no período.",
    },
    {
      key: "lucro",
      label: "Lucro líquido",
      format: "currency",
      value: 2180.5,
      deltaPct: 5.4,
      deltaAbs: 112,
      comparisonLabel: "vs. ontem",
      goal: 2400,
      sparkline: [1690, 1850, 1520, 2480, 2260, 2710, 2180],
      status: "normal",
      formula:
        "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    },
    {
      key: "margem",
      label: "Margem líquida",
      format: "percent",
      value: 61.3,
      deltaPct: 1.8,
      deltaAbs: 1.8,
      comparisonLabel: "vs. ontem",
      goal: 65,
      sparkline: [59.5, 59.3, 57.4, 58.9, 58.1, 59.4, 61.3],
      status: "normal",
      formula: "Lucro líquido dividido pela receita aprovada, em percentual.",
    },
    {
      key: "aprovacao",
      label: "Taxa de aprovação",
      format: "percent",
      value: 94.2,
      deltaPct: -0.6,
      deltaAbs: -0.6,
      comparisonLabel: "vs. ontem",
      goal: 95,
      sparkline: [93.1, 94.5, 91.1, 96.6, 94.4, 96, 94.2],
      status: "atencao",
      formula:
        "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    },
    {
      key: "conversao",
      label: "Conversão",
      format: "percent",
      value: 3.6,
      deltaPct: 9.1,
      deltaAbs: 0.3,
      comparisonLabel: "vs. ontem",
      goal: 4.0,
      sparkline: [3.0, 3.2, 2.8, 3.5, 3.3, 3.7, 3.6],
      status: "normal",
      formula: "Pedidos aprovados divididos pelo total de leads do período.",
    },
  ],
  ontem: [
    {
      key: "receita",
      label: "Receita aprovada",
      format: "currency",
      value: 3290,
      deltaPct: -3.4,
      deltaAbs: -116,
      comparisonLabel: "vs. anteontem",
      goal: 4000,
      sparkline: [3010, 2960, 3340, 3510, 3180, 3400, 3290],
      status: "atencao",
      formula: "Soma de todos os pedidos com pagamento aprovado no período.",
    },
    {
      key: "lucro",
      label: "Lucro líquido",
      format: "currency",
      value: 1980,
      deltaPct: -2.1,
      deltaAbs: -42,
      comparisonLabel: "vs. anteontem",
      goal: 2400,
      sparkline: [1820, 1790, 1990, 2080, 1930, 2040, 1980],
      status: "atencao",
      formula:
        "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    },
    {
      key: "margem",
      label: "Margem líquida",
      format: "percent",
      value: 60.2,
      deltaPct: 0.4,
      deltaAbs: 0.4,
      comparisonLabel: "vs. anteontem",
      goal: 65,
      sparkline: [59.9, 60.5, 59.6, 59.3, 60.7, 60.0, 60.2],
      status: "normal",
      formula: "Lucro líquido dividido pela receita aprovada, em percentual.",
    },
    {
      key: "aprovacao",
      label: "Taxa de aprovação",
      format: "percent",
      value: 94.8,
      deltaPct: 0.3,
      deltaAbs: 0.3,
      comparisonLabel: "vs. anteontem",
      goal: 95,
      sparkline: [94.1, 94.6, 94.9, 95.1, 94.7, 94.5, 94.8],
      status: "normal",
      formula:
        "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    },
    {
      key: "conversao",
      label: "Conversão",
      format: "percent",
      value: 3.3,
      deltaPct: -5.7,
      deltaAbs: -0.2,
      comparisonLabel: "vs. anteontem",
      goal: 4.0,
      sparkline: [3.4, 3.5, 3.2, 3.1, 3.4, 3.5, 3.3],
      status: "atencao",
      formula: "Pedidos aprovados divididos pelo total de leads do período.",
    },
  ],
  "7d": [
    {
      key: "receita",
      label: "Receita aprovada",
      format: "currency",
      value: 24830,
      deltaPct: 12.4,
      deltaAbs: 2740,
      comparisonLabel: "vs. 7 dias anteriores",
      goal: 28000,
      sparkline: [18200, 19850, 21230, 20480, 23670, 24950, 24830],
      status: "normal",
      formula: "Soma de todos os pedidos com pagamento aprovado no período.",
    },
    {
      key: "lucro",
      label: "Lucro líquido",
      format: "currency",
      value: 14320,
      deltaPct: 9.1,
      deltaAbs: 1195,
      comparisonLabel: "vs. 7 dias anteriores",
      goal: 16000,
      sparkline: [10600, 11400, 12500, 11980, 13920, 14680, 14320],
      status: "normal",
      formula:
        "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    },
    {
      key: "margem",
      label: "Margem líquida",
      format: "percent",
      value: 57.7,
      deltaPct: -0.9,
      deltaAbs: -0.9,
      comparisonLabel: "vs. 7 dias anteriores",
      goal: 65,
      sparkline: [58.2, 57.4, 58.9, 58.5, 58.8, 58.8, 57.7],
      status: "atencao",
      formula: "Lucro líquido dividido pela receita aprovada, em percentual.",
    },
    {
      key: "aprovacao",
      label: "Taxa de aprovação",
      format: "percent",
      value: 93.6,
      deltaPct: -1.2,
      deltaAbs: -1.2,
      comparisonLabel: "vs. 7 dias anteriores",
      goal: 95,
      sparkline: [94.8, 94.5, 93.9, 94.2, 93.8, 93.5, 93.6],
      status: "atencao",
      formula:
        "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    },
    {
      key: "conversao",
      label: "Conversão",
      format: "percent",
      value: 3.4,
      deltaPct: 2.9,
      deltaAbs: 0.1,
      comparisonLabel: "vs. 7 dias anteriores",
      goal: 4.0,
      sparkline: [3.2, 3.3, 3.5, 3.3, 3.4, 3.3, 3.4],
      status: "normal",
      formula: "Pedidos aprovados divididos pelo total de leads do período.",
    },
  ],
  "30d": [
    {
      key: "receita",
      label: "Receita aprovada",
      format: "currency",
      value: 98500,
      deltaPct: 6.0,
      deltaAbs: 5600,
      comparisonLabel: "vs. 30 dias anteriores",
      goal: 110000,
      sparkline: [71200, 75800, 82100, 79400, 88600, 94200, 98500],
      status: "normal",
      formula: "Soma de todos os pedidos com pagamento aprovado no período.",
    },
    {
      key: "lucro",
      label: "Lucro líquido",
      format: "currency",
      value: 58700,
      deltaPct: 5.1,
      deltaAbs: 2850,
      comparisonLabel: "vs. 30 dias anteriores",
      goal: 65000,
      sparkline: [41500, 44300, 48600, 46200, 52400, 55900, 58700],
      status: "normal",
      formula:
        "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    },
    {
      key: "margem",
      label: "Margem líquida",
      format: "percent",
      value: 59.6,
      deltaPct: 0.6,
      deltaAbs: 0.6,
      comparisonLabel: "vs. 30 dias anteriores",
      goal: 65,
      sparkline: [58.3, 58.4, 59.2, 58.2, 59.1, 59.3, 59.6],
      status: "normal",
      formula: "Lucro líquido dividido pela receita aprovada, em percentual.",
    },
    {
      key: "aprovacao",
      label: "Taxa de aprovação",
      format: "percent",
      value: 94.5,
      deltaPct: 0.2,
      deltaAbs: 0.2,
      comparisonLabel: "vs. 30 dias anteriores",
      goal: 95,
      sparkline: [94.0, 94.2, 94.6, 94.1, 94.4, 94.3, 94.5],
      status: "normal",
      formula:
        "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    },
    {
      key: "conversao",
      label: "Conversão",
      format: "percent",
      value: 3.3,
      deltaPct: 6.5,
      deltaAbs: 0.2,
      comparisonLabel: "vs. 30 dias anteriores",
      goal: 4.0,
      sparkline: [3.1, 3.2, 3.4, 3.2, 3.3, 3.2, 3.3],
      status: "normal",
      formula: "Pedidos aprovados divididos pelo total de leads do período.",
    },
  ],
  mes: [
    {
      key: "receita",
      label: "Receita aprovada",
      format: "currency",
      value: 52980,
      deltaPct: 12.6,
      deltaAbs: 5930,
      comparisonLabel: "vs. mês anterior",
      goal: 58000,
      sparkline: [41200, 44900, 47100, 49300, 50600, 51900, 52980],
      status: "normal",
      formula: "Soma de todos os pedidos com pagamento aprovado no período.",
    },
    {
      key: "lucro",
      label: "Lucro líquido",
      format: "currency",
      value: 30800,
      deltaPct: 10.3,
      deltaAbs: 2870,
      comparisonLabel: "vs. mês anterior",
      goal: 34000,
      sparkline: [24500, 26100, 27400, 28600, 29500, 30200, 30800],
      status: "normal",
      formula:
        "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    },
    {
      key: "margem",
      label: "Margem líquida",
      format: "percent",
      value: 58.1,
      deltaPct: -1.1,
      deltaAbs: -1.1,
      comparisonLabel: "vs. mês anterior",
      goal: 65,
      sparkline: [59.4, 59.1, 58.7, 58.6, 58.3, 58.5, 58.1],
      status: "atencao",
      formula: "Lucro líquido dividido pela receita aprovada, em percentual.",
    },
    {
      key: "aprovacao",
      label: "Taxa de aprovação",
      format: "percent",
      value: 94.0,
      deltaPct: -0.4,
      deltaAbs: -0.4,
      comparisonLabel: "vs. mês anterior",
      goal: 95,
      sparkline: [94.6, 94.5, 94.3, 94.2, 94.1, 94.0, 94.0],
      status: "atencao",
      formula:
        "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    },
    {
      key: "conversao",
      label: "Conversão",
      format: "percent",
      value: 3.5,
      deltaPct: 12.9,
      deltaAbs: 0.4,
      comparisonLabel: "vs. mês anterior",
      goal: 4.0,
      sparkline: [3.0, 3.1, 3.3, 3.2, 3.4, 3.3, 3.5],
      status: "normal",
      formula: "Pedidos aprovados divididos pelo total de leads do período.",
    },
  ],
};

export interface OperationalMetric {
  key: string;
  label: string;
  headline: string;
  format: "currency" | "number";
  breakdown: { label: string; value: string }[];
  deltaPct: number;
  footnote: string;
}

/** 4 cards operacionais (Nível 2) — cada um já reúne os períodos internamente. */
export const demoOperationalMetrics: OperationalMetric[] = [
  {
    key: "leads",
    label: "Leads",
    headline: "1.284 no período",
    format: "number",
    breakdown: [
      { label: "Hoje", value: "42" },
      { label: "7 dias", value: "312" },
      { label: "30 dias", value: "1.180" },
    ],
    deltaPct: 3.1,
    footnote: "Conversão em pedido: 3,27%",
  },
  {
    key: "pedidos",
    label: "Pedidos",
    headline: "1.050 no período",
    format: "number",
    breakdown: [
      { label: "Hoje", value: "41" },
      { label: "7 dias", value: "288" },
      { label: "30 dias", value: "1.050" },
    ],
    deltaPct: 6.4,
    footnote: "Taxa de aprovação média: 94,2%",
  },
  {
    key: "ticket",
    label: "Ticket médio",
    headline: "R$ 84,50 no período",
    format: "currency",
    breakdown: [
      { label: "Hoje", value: "R$ 86,83" },
      { label: "7 dias", value: "R$ 85,20" },
      { label: "30 dias", value: "R$ 84,10" },
    ],
    deltaPct: 2.1,
    footnote: "Maior ticket: Mentoria Individual (R$ 497,00)",
  },
  {
    key: "recuperadas",
    label: "Vendas recuperadas",
    headline: "R$ 480 hoje",
    format: "currency",
    breakdown: [
      { label: "Pedidos recuperados", value: "12" },
      { label: "% da receita aprovada", value: "13,5%" },
      { label: "7 dias", value: "R$ 2.340,00" },
    ],
    deltaPct: 2.3,
    footnote: "13,5% da receita aprovada de hoje",
  },
];

export type InsightPriority =
  "critico" | "alta" | "atencao" | "oportunidade" | "positivo";

export interface PriorityInsightData {
  priority: InsightPriority;
  title: string;
  variation: string;
  impact: string;
  impactPositive: boolean;
  cause: string;
  action: string;
  actionLabel: string;
}

/** Painel "Prioridades do dia" (Nível 3 — diagnóstico e causa). */
export const demoPriorityInsights: PriorityInsightData[] = [
  {
    priority: "alta",
    title: "Recusas aumentaram 18%",
    variation: "+18% vs. média semanal",
    impact: "-R$ 1.420 impacto estimado",
    impactPositive: false,
    cause: "Maior concentração: Cartão de crédito · Gateway X",
    action: "Verificar erros do gateway e oferecer PIX como alternativa.",
    actionLabel: "Analisar recusas",
  },
  {
    priority: "atencao",
    title: "Ticket médio caiu 6% na semana",
    variation: "-6% vs. semana anterior",
    impact: "-R$ 210 impacto estimado",
    impactPositive: false,
    cause: "Causa ainda não confirmada",
    action: "Acompanhar os próximos dias antes de agir.",
    actionLabel: "Acompanhar ticket médio",
  },
  {
    priority: "positivo",
    title: "Vendas recuperadas cresceram 23% no mês",
    variation: "+23% vs. mês anterior",
    impact: "+R$ 1.860 impacto estimado",
    impactPositive: true,
    cause: "Aumento de campanhas de recuperação via WhatsApp",
    action: "Manter e escalar a campanha atual de recuperação.",
    actionLabel: "Ver campanha",
  },
];

/** Origem da receita, por canal (Nível 4 — detalhe). */
export const demoRevenueBySource = [
  { source: "Instagram Ads", value: 12400, share: 42, deltaPct: 8 },
  { source: "Google Ads", value: 8100, share: 27, deltaPct: 3 },
  { source: "Orgânico", value: 5200, share: 18, deltaPct: -2 },
  { source: "WhatsApp", value: 2100, share: 7, deltaPct: 15 },
  { source: "Outros", value: 1650, share: 6, deltaPct: 1 },
];

export interface FunnelStep {
  label: string;
  volume: number;
}

/** Funil de conversão (Nível 4 — detalhe). */
export const demoConversionFunnel: FunnelStep[] = [
  { label: "Impressões", volume: 68420 },
  { label: "Cliques", volume: 1284 },
  { label: "Página carregada", volume: 940 },
  { label: "Checkout iniciado", volume: 512 },
  { label: "Pagamento tentado", volume: 410 },
  { label: "Pagamento aprovado", volume: 328 },
  { label: "Pagamento liquidado", volume: 318 },
  { label: "Cliente retido em 90 dias", volume: 86 },
];

/** Motivos de perda, ordenados por impacto financeiro (não por quantidade). */
export const demoLossReasons = [
  { reason: "Abandono de checkout", impact: 3200, count: 86 },
  { reason: "Pagamento recusado", impact: 1420, count: 34 },
  { reason: "Saldo insuficiente", impact: 680, count: 22 },
  { reason: "Erro de gateway", impact: 540, count: 11 },
  { reason: "Reembolso solicitado", impact: 450, count: 6 },
  { reason: "Cartão inválido", impact: 310, count: 14 },
  { reason: "Expiração do link de pagamento", impact: 260, count: 9 },
  { reason: "Chargeback", impact: 180, count: 2 },
];

export interface MetricInfluencer {
  label: string;
  deltaPct: number;
}

export interface MetricDetail {
  description: string;
  influencers: MetricInfluencer[];
  impact: string;
  insight: string;
  action: string;
  /** Variação percentual vs. 7 dias e vs. 30 dias atrás. */
  compare7d: number;
  compare30d: number;
}

/** Painel de detalhe (drill-down) do Radar Financeiro, por métrica. */
export const demoMetricDetails: Record<string, MetricDetail> = {
  receita: {
    description: "Soma de todos os pedidos com pagamento aprovado no período.",
    influencers: [
      { label: "Leads", deltaPct: 12 },
      { label: "Conversão", deltaPct: 4 },
      { label: "Ticket médio", deltaPct: -2 },
    ],
    impact: "+R$ 270",
    insight:
      "Receita cresceu puxada pelo aumento de leads e pela conversão via PIX.",
    action:
      "Verificar quais campanhas geraram os novos leads e reforçar o canal.",
    compare7d: 12.4,
    compare30d: 6.0,
  },
  lucro: {
    description:
      "Receita aprovada menos taxas de gateway, reembolsos e custo de anúncios.",
    influencers: [
      { label: "Receita aprovada", deltaPct: 8.2 },
      { label: "Taxas de gateway", deltaPct: -1.5 },
    ],
    impact: "+R$ 112",
    insight: "Lucro acompanhou o crescimento da receita, com taxas estáveis.",
    action: "Nenhuma ação necessária — manter monitoramento.",
    compare7d: 9.1,
    compare30d: 5.1,
  },
  margem: {
    description: "Lucro líquido dividido pela receita aprovada, em percentual.",
    influencers: [
      { label: "Lucro líquido", deltaPct: 5.4 },
      { label: "Receita aprovada", deltaPct: 8.2 },
    ],
    impact: "+1,8 p.p.",
    insight:
      "Margem melhorou levemente — o lucro cresceu um pouco mais rápido que a receita.",
    action: "Acompanhar o custo de anúncios nos próximos dias.",
    compare7d: -0.9,
    compare30d: 0.6,
  },
  aprovacao: {
    description:
      "Receita aprovada dividida por (aprovada + recusada) — exclui pendentes.",
    influencers: [{ label: "Recusas", deltaPct: 18 }],
    impact: "-0,6 p.p.",
    insight: "Leve queda puxada por recusas concentradas em um gateway.",
    action: "Verificar erros do gateway de cartão de crédito.",
    compare7d: -1.2,
    compare30d: 0.2,
  },
  conversao: {
    description: "Pedidos aprovados divididos pelo total de leads do período.",
    influencers: [
      { label: "Leads", deltaPct: 3.1 },
      { label: "Pedidos", deltaPct: 6.4 },
    ],
    impact: "+0,3 p.p.",
    insight: "Conversão subiu com a chegada de leads mais qualificados.",
    action: "Escalar o canal que trouxe os leads mais recentes.",
    compare7d: 2.9,
    compare30d: 6.5,
  },
  leads: {
    description: "Novos contatos captados no período, de todos os canais.",
    influencers: [
      { label: "Instagram Ads", deltaPct: 8 },
      { label: "WhatsApp", deltaPct: 15 },
    ],
    impact: "+42 hoje",
    insight: "Crescimento puxado pelo canal de WhatsApp.",
    action:
      "Aumentar o investimento no WhatsApp enquanto o custo estiver baixo.",
    compare7d: 6.7,
    compare30d: 11.2,
  },
  pedidos: {
    description: "Total de pedidos criados no período, aprovados ou não.",
    influencers: [
      { label: "Conversão", deltaPct: 9.1 },
      { label: "Ticket médio", deltaPct: 2.1 },
    ],
    impact: "+41 hoje",
    insight: "Pedidos cresceram junto com a conversão.",
    action: "Nenhuma ação necessária.",
    compare7d: 6.4,
    compare30d: 9.8,
  },
  ticket: {
    description:
      "Valor médio por pedido aprovado (receita aprovada dividida por pedidos).",
    influencers: [
      { label: "Mentoria Individual", deltaPct: 0 },
      { label: "Receita aprovada", deltaPct: 8.2 },
    ],
    impact: "+R$ 1,80",
    insight:
      "Ticket estável, levemente puxado por vendas de produtos de ticket mais alto.",
    action: "Testar oferecer upsell no checkout.",
    compare7d: 1.4,
    compare30d: 2.7,
  },
  recuperadas: {
    description:
      "Vendas concluídas após um pagamento pendente ou recusado ser retentado.",
    influencers: [{ label: "Campanha WhatsApp", deltaPct: 23 }],
    impact: "+R$ 480 hoje",
    insight: "Recuperação subiu com a nova campanha de retomada via WhatsApp.",
    action: "Manter e escalar a campanha atual.",
    compare7d: 9.8,
    compare30d: 4.5,
  },
};

export interface SalesStatusData {
  paid: { count: number; pct: number };
  pending: { count: number; pct: number };
  declined: { count: number; pct: number };
}

/** Vendas por status — usado na aba Operação (hoje) e Empresa (total). */
export const demoSalesStatusOperacao: SalesStatusData = {
  paid: { count: 34, pct: 82.9 },
  pending: { count: 5, pct: 12.2 },
  declined: { count: 2, pct: 4.9 },
};

export const demoSalesStatusEmpresa: SalesStatusData = {
  paid: { count: 5540, pct: 89.4 },
  pending: { count: 380, pct: 6.1 },
  declined: { count: 280, pct: 4.5 },
};

/**
 * O modo sem integrações preserva a estrutura visual e as datas do calendário,
 * mas nunca preenche o painel com valores inventados. Mantemos esta limpeza no
 * limite do módulo para que qualquer tela que ainda consuma a base de fallback
 * receba somente zeros.
 */
function zeroFormattedValue(value: string, key: string) {
  const trimmed = value.trim();
  if (/^[+-]?R\$\s*[+-]?\d/u.test(trimmed)) return "R$ 0,00";
  if (/^[+-]?\d[\d.,]*%$/u.test(trimmed)) return "0%";
  if (/^[+-]?\d[\d.,]*x$/iu.test(trimmed)) return "0x";
  if (key === "value" && /^[+-]?\d[\d.,]*$/u.test(trimmed)) return "0";
  return value;
}

function zeroDemoValues(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => {
      if (typeof nested === "number") {
        value[index] = 0;
      } else if (typeof nested === "string") {
        value[index] = zeroFormattedValue(nested, String(index));
      } else {
        zeroDemoValues(nested);
      }
    });
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === "number") {
      record[key] = 0;
    } else if (typeof nested === "string") {
      record[key] = zeroFormattedValue(nested, key);
    } else {
      zeroDemoValues(nested);
    }
  }
}

zeroDemoValues(demoKpis);
zeroDemoValues(demoRevenueByDay);
zeroDemoValues(demoRevenueByHour);
zeroDemoValues(demoRevenueByYear);
zeroDemoValues(demoRevenueCurrentWeek);
zeroDemoValues(demoRevenueByDayHour);
zeroDemoValues(demoOperationKpis);
zeroDemoValues(demoCompanyKpis);
zeroDemoValues(demoProfitSummary);
zeroDemoValues(demoGrowthSeries);
zeroDemoValues(demoExecutiveByPeriod);
zeroDemoValues(demoOperationalMetrics);
zeroDemoValues(demoPriorityInsights);
zeroDemoValues(demoRevenueBySource);
zeroDemoValues(demoConversionFunnel);
zeroDemoValues(demoLossReasons);
zeroDemoValues(demoMetricDetails);
zeroDemoValues(demoSalesStatusOperacao);
zeroDemoValues(demoSalesStatusEmpresa);

// Registros fictícios não viram linhas zeradas: eles deixam de existir.
demoTopProducts.length = 0;
demoRecentOrders.length = 0;
demoLedger.length = 0;
