export type Movimento = {
  id: string;
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
};

export type Campanha = {
  id: string;
  nome: string;
  plataforma: string;
  status: "ativa" | "pausada" | "encerrada";
  investimento: number;
  receita: number;
  leads_gerados: number;
  vendas: number;
  inicio: string;
  fim: string | null;
};

/** Data de hoje no fuso de Sao Paulo, no formato AAAA-MM-DD. */
export function hojeISO(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}

export function somarDias(iso: string, dias: number) {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export type Resumo = {
  rotulo: string;
  dias: number;
  entradas: number;
  saidas: number;
  lucro: number;
  variacao: number | null;
};

function totais(movimentos: Movimento[], de: string, ate: string) {
  let entradas = 0;
  let saidas = 0;
  for (const m of movimentos) {
    const dia = m.data.slice(0, 10);
    if (dia < de || dia > ate) continue;
    if (m.tipo === "entrada") entradas += m.valor;
    else saidas += m.valor;
  }
  return { entradas, saidas, lucro: entradas - saidas };
}

/**
 * Variacao percentual entre dois periodos. Retorna null quando o periodo
 * anterior foi zero — nao existe "subiu X%" a partir do nada.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function resumoPorPeriodo(
  movimentos: Movimento[],
  hoje = hojeISO(),
): Resumo[] {
  const janelas: { rotulo: string; dias: number }[] = [
    { rotulo: "Hoje", dias: 1 },
    { rotulo: "7 dias", dias: 7 },
    { rotulo: "Quinzena", dias: 15 },
    { rotulo: "30 dias", dias: 30 },
  ];

  return janelas.map(({ rotulo, dias }) => {
    const inicio = somarDias(hoje, -(dias - 1));
    const atual = totais(movimentos, inicio, hoje);

    const fimAnterior = somarDias(inicio, -1);
    const inicioAnterior = somarDias(fimAnterior, -(dias - 1));
    const anterior = totais(movimentos, inicioAnterior, fimAnterior);

    return {
      rotulo,
      dias,
      ...atual,
      variacao: variacao(atual.lucro, anterior.lucro),
    };
  });
}

export type PontoDia = { data: string; entradas: number; saidas: number };

export function serieDiaria(
  movimentos: Movimento[],
  dias = 30,
  hoje = hojeISO(),
): PontoDia[] {
  const mapa = new Map<string, PontoDia>();
  for (let i = dias - 1; i >= 0; i--) {
    const data = somarDias(hoje, -i);
    mapa.set(data, { data, entradas: 0, saidas: 0 });
  }
  for (const m of movimentos) {
    const ponto = mapa.get(m.data.slice(0, 10));
    if (!ponto) continue;
    if (m.tipo === "entrada") ponto.entradas += m.valor;
    else ponto.saidas += m.valor;
  }
  return [...mapa.values()];
}

export type MetricasCampanha = {
  investimento: number;
  receita: number;
  lucro: number;
  leads: number;
  vendas: number;
  /** Receita dividida pelo investimento. */
  roas: number | null;
  /** Lucro sobre o investimento, em %. */
  roi: number | null;
  /** Custo por aquisicao: investimento dividido pelas vendas. */
  cpa: number | null;
  /** Lucro medio por venda, ja descontado o CPA. */
  lucroPorCpa: number | null;
};

export function metricasCampanhas(campanhas: Campanha[]): MetricasCampanha {
  const investimento = campanhas.reduce((t, c) => t + c.investimento, 0);
  const receita = campanhas.reduce((t, c) => t + c.receita, 0);
  const leads = campanhas.reduce((t, c) => t + c.leads_gerados, 0);
  const vendas = campanhas.reduce((t, c) => t + c.vendas, 0);
  const lucro = receita - investimento;
  const cpa = vendas > 0 ? investimento / vendas : null;

  return {
    investimento,
    receita,
    lucro,
    leads,
    vendas,
    roas: investimento > 0 ? receita / investimento : null,
    roi: investimento > 0 ? (lucro / investimento) * 100 : null,
    cpa,
    lucroPorCpa: vendas > 0 ? lucro / vendas : null,
  };
}

/** Postgres devolve `numeric` como numero, mas nunca confie: normalize. */
export function numerico(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function normalizarMovimentos(linhas: unknown[]): Movimento[] {
  return (linhas as Movimento[]).map((m) => ({
    ...m,
    valor: numerico(m.valor),
    data: String(m.data).slice(0, 10),
  }));
}

export function normalizarCampanhas(linhas: unknown[]): Campanha[] {
  return (linhas as Campanha[]).map((c) => ({
    ...c,
    investimento: numerico(c.investimento),
    receita: numerico(c.receita),
    leads_gerados: numerico(c.leads_gerados),
    vendas: numerico(c.vendas),
  }));
}
