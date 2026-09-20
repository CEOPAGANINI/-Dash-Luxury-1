import type { DemoRevenueDay } from "@/lib/demo-data";
import {
  calculateContribution,
  calculateMer,
  calculateNcCac,
  calculatePaybackPurchases,
} from "@/domain/finance/formulas";
import { safeDivide } from "@/domain/shared/math";

/**
 * Matemática financeira de Direct Response compartilhada entre o calendário
 * operacional e o bloco "Financeiro Direct Response". Tudo aqui é
 * determinístico (mesma data → mesmos números) para servidor e navegador
 * renderizarem igual, sem divergência de hidratação.
 */

/** Pseudoaleatório determinístico por data — mesma função usada no calendário. */
export function hashDate(date: string, salt: number) {
  let hash = salt * 2166136261;
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/**
 * Retorno-alvo do dia, determinístico pela data. As proporções garantem
 * dias em TODAS as faixas de ROAS ao longo do ano: ~12% negativos (< 1x),
 * ~16% até 1,2x, ~22% entre 1,2x e 1,5x, ~25% entre 1,5x e 2x e ~25%
 * acima de 2x.
 */
export function dailyRoasTarget(date: string) {
  const roll = hashDate(date, 71);
  const spread = hashDate(date, 73);
  if (roll < 0.12) return 0.75 + spread * 0.24;
  if (roll < 0.28) return 1.0 + spread * 0.19;
  if (roll < 0.5) return 1.2 + spread * 0.29;
  if (roll < 0.75) return 1.5 + spread * 0.49;
  return 2 + spread * 1.4;
}

export function dailyAdSpend(day: DemoRevenueDay) {
  if (day.aprovada <= 0) return 0;
  return Math.max(1, Math.round(day.aprovada / dailyRoasTarget(day.date)));
}

export interface FinanceSummary {
  /** Pagamentos aprovados usados como aproximação provisória de caixa no modo demo. */
  caixaRecebido: number;
  /** Total investido em mídia (Face + Google + YouTube). */
  gastoAnuncio: number;
  /** Taxas de gateway/checkout sobre as vendas aprovadas. */
  taxas: number;
  /** Custo de entrega do produto (plataforma, comissões, suporte). */
  custoProduto: number;
  /** Estimativa de reembolsos no período. */
  reembolso: number;
  /** Estimativa de chargebacks (contestação no cartão). */
  chargeback: number;
  /** O que sobra depois de TODOS os custos variáveis: a verdade financeira. */
  lucroContribuicao: number;
  /** Lucro de contribuição ÷ caixa recebido. */
  margemContribuicao: number;
  /** MER blended: caixa recebido ÷ gasto total em anúncio. */
  mer: number;
  /** Clientes comprando pela primeira vez no período. */
  novosClientes: number;
  /** Pedidos de clientes que já compraram antes. */
  clientesRecorrentes: number;
  /** NC-CAC: gasto em anúncio ÷ novos clientes. */
  ncCac: number;
  /** Quantas compras o cliente novo precisa fazer até pagar o próprio CAC. */
  paybackCompras: number;
  pedidos: number;
  ticket: number;
}

/** Resume a economia real de um conjunto de dias (semana, seleção ou mês). */
export function financeSummary(days: DemoRevenueDay[]): FinanceSummary {
  let caixaRecebido = 0;
  let gastoAnuncio = 0;
  let taxas = 0;
  let custoProduto = 0;
  let reembolso = 0;
  let chargeback = 0;
  let pedidos = 0;
  let novosClientes = 0;

  for (const day of days) {
    caixaRecebido += day.aprovada;
    gastoAnuncio += dailyAdSpend(day);
    // Gateway: percentual + tarifa fixa por pedido aprovado.
    taxas += day.aprovada * 0.0499 + day.pedidos * 0.99;
    // Produto digital: plataforma de curso, comissões e suporte.
    custoProduto += day.aprovada * 0.06;
    reembolso += day.aprovada * (0.015 + hashDate(day.date, 131) * 0.02);
    chargeback += day.aprovada * (0.004 + hashDate(day.date, 137) * 0.008);
    pedidos += day.pedidos;
    novosClientes += Math.round(
      day.pedidos * (0.62 + hashDate(day.date, 139) * 0.18),
    );
  }

  taxas = Math.round(taxas);
  custoProduto = Math.round(custoProduto);
  reembolso = Math.round(reembolso);
  chargeback = Math.round(chargeback);

  const contribution = calculateContribution({
    approvedRevenue: caixaRecebido,
    mediaSpend: gastoAnuncio,
    gatewayFees: taxas,
    productCost: custoProduto,
    refunds: reembolso,
    chargebacks: chargeback,
  });
  const ticket = safeDivide(caixaRecebido, pedidos);
  const ncCac = calculateNcCac(gastoAnuncio, novosClientes);
  // Lucro por pedido ANTES da mídia: é ele que amortiza o CAC a cada compra.
  const lucroPorPedidoAntesMidia = safeDivide(
    caixaRecebido - taxas - custoProduto - reembolso - chargeback,
    pedidos,
  );

  return {
    caixaRecebido,
    gastoAnuncio,
    taxas,
    custoProduto,
    reembolso,
    chargeback,
    lucroContribuicao: contribution.contributionProfit,
    margemContribuicao: contribution.contributionMargin,
    mer: calculateMer(caixaRecebido, gastoAnuncio),
    novosClientes,
    clientesRecorrentes: Math.max(0, pedidos - novosClientes),
    ncCac,
    paybackCompras: calculatePaybackPurchases(ncCac, lucroPorPedidoAntesMidia),
    pedidos,
    ticket,
  };
}

export interface FunnelStage {
  label: string;
  /** Quantas pessoas chegaram até aqui. */
  volume: number;
  /** % que avançou da etapa anterior para esta (100 na primeira). */
  conversao: number;
  /**
   * Quanto a operação ganharia A MAIS se esta etapa convertesse no benchmark
   * interno demonstrativo (0 quando a etapa já bate ou supera o padrão). É essa
   * comparação — e não o volume bruto que abandona — que aponta a etapa
   * com problema real: perder 98% das impressões é normal; perder metade
   * dos checkouts não é.
   */
  dinheiroNaMesa: number;
  /** % de conversão usado como referência interna demonstrativa nesta transição. */
  benchmarkInterno: number;
}

/** Referências internas demonstrativas por transição, na ordem das etapas do funil. */
const FUNNEL_BENCHMARKS = [
  0.018, // impressão → clique (CTR)
  0.85, // clique → página carregada
  0.35, // página → checkout iniciado
  0.58, // checkout → compra realizada
  0.95, // compra → pagamento aprovado
  0.97, // aprovado → liquidado
  0.26, // liquidado → cliente retido em 90 dias
];

/**
 * Funil completo do período: impressão → clique → página → checkout →
 * compra → aprovação → liquidação → retenção. Os volumes de topo são derivados dos pedidos reais
 * com taxas demonstrativas de conversão (com leve variação
 * determinística); o "dinheiro na mesa" de cada etapa compara a conversão
 * real com a referência interna demonstrativa e estima quanto as vendas extras valeriam.
 */
export function funnelStages(days: DemoRevenueDay[]): FunnelStage[] {
  if (days.length === 0) return [];

  let aprovadosCount = 0;
  let recusadaValor = 0;
  let caixa = 0;
  for (const day of days) {
    aprovadosCount += day.pedidos;
    recusadaValor += day.recusada;
    caixa += day.aprovada;
  }

  const ticket = aprovadosCount > 0 ? caixa / aprovadosCount : 0;
  const seed = hashDate(days[0]?.date ?? "2026-01-01", 149);

  const recusadosCount = ticket > 0 ? Math.round(recusadaValor / ticket) : 0;
  const compras = aprovadosCount + recusadosCount;
  const checkout = Math.round(compras / (0.52 + seed * 0.1));
  const pagina = Math.round(checkout / (0.3 + seed * 0.08));
  const cliques = Math.round(pagina / 0.84);
  const impressoes = Math.round(cliques / (0.015 + seed * 0.004));

  const liquidado = Math.round(aprovadosCount * (0.96 + seed * 0.02));
  const retido90 = Math.round(liquidado * (0.22 + seed * 0.1));
  const volumes = [
    impressoes,
    cliques,
    pagina,
    checkout,
    compras,
    aprovadosCount,
    liquidado,
    retido90,
  ] as const;
  const labels = [
    "Impressões do anúncio",
    "Cliques no anúncio",
    "Página de vendas",
    "Checkout iniciado",
    "Pagamento tentado",
    "Pagamento aprovado",
    "Pagamento liquidado",
    "Cliente retido em 90 dias",
  ] as const;

  return volumes.map((volume, i) => {
    if (i === 0)
      return {
        label: labels[0],
        volume,
        conversao: 100,
        dinheiroNaMesa: 0,
        benchmarkInterno: 100,
      };

    const anterior = volumes[i - 1] ?? 0;
    const taxaReal = anterior > 0 ? volume / anterior : 0;
    const padrao = FUNNEL_BENCHMARKS[i - 1] ?? 0;

    // Pessoas extras que chegariam aqui se a etapa batesse o padrão, valendo
    // cada uma o ticket × chance real de virar venda aprovada daqui em diante.
    const extras = Math.max(0, (padrao - taxaReal) * anterior);
    const chanceDeVenda = aprovadosCount / Math.max(volume, 1);
    const dinheiroNaMesa = Math.round(
      extras * Math.min(chanceDeVenda, 1) * ticket,
    );

    return {
      label: labels[i] ?? "Etapa desconhecida",
      volume,
      conversao: taxaReal * 100,
      dinheiroNaMesa,
      benchmarkInterno: padrao * 100,
    };
  });
}

export interface BudgetPacing {
  /** Orçamento de mídia planejado para o dia. */
  orcamento: number;
  /** Quanto já foi gasto até a hora atual. */
  gastoAteAgora: number;
  /** Quanto DEVERIA ter sido gasto até a hora atual, no ritmo planejado. */
  esperadoAteAgora: number;
  /** Projeção de gasto ao fim do dia mantendo o ritmo atual. */
  projecao: number;
  ritmo: "acelerado" | "no-ritmo" | "lento";
}

/**
 * Budget pacing do dia: compara o gasto real até a hora atual com o ritmo
 * planejado e projeta o fechamento. `fracaoDoDia` é a fração do dia já
 * decorrida (0 a 1) — vem do relógio do navegador, por isso é parâmetro.
 */
export function budgetPacing(
  day: DemoRevenueDay,
  fracaoDoDia: number,
): BudgetPacing {
  const gastoPlanejado = dailyAdSpend(day);
  // Orçamento aprovado do dia: um pouco acima do gasto planejado.
  const orcamento = Math.round(
    gastoPlanejado * (1.04 + hashDate(day.date, 151) * 0.1),
  );
  const fracao = Math.min(Math.max(fracaoDoDia, 0), 1);

  // Ritmo real varia ao longo do dia: alguns dias consomem mais cedo.
  const vies = 0.85 + hashDate(day.date, 157) * 0.4;
  const gastoAteAgora = Math.round(gastoPlanejado * fracao * vies);
  const esperadoAteAgora = Math.round(orcamento * fracao);
  const projecao =
    fracao > 0.02 ? Math.round(gastoAteAgora / fracao) : orcamento;

  const desvio = projecao / Math.max(orcamento, 1);
  const ritmo =
    desvio > 1.08 ? "acelerado" : desvio < 0.92 ? "lento" : "no-ritmo";

  return { orcamento, gastoAteAgora, esperadoAteAgora, projecao, ritmo };
}
