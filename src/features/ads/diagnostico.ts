import {
  avaliarGuardrails,
  type Decisao,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";
import {
  derivadas,
  somarMetricas,
  type AdMetrics,
  type AdNetwork,
  type CampaignRow,
} from "./types";

/*
  A calculadora de campanhas.

  Entra um conjunto de campanhas (uma, várias, ou todas de uma rede) e
  sai um diagnóstico em palavras: o que está falhando, o que está fraco,
  o que está forte, e o que fazer. Sem IA — são regras de quem opera
  tráfego, aplicadas aos números dos últimos 7 dias.

  Cada regra olha um elo da corrente: impressão → clique (criativo e
  público) → compra (página e oferta) → dinheiro (preço da venda contra o
  custo dela). Quando um elo quebra, o achado diz qual, e por quê.

  Tudo é função pura, como o freio de mão: a tela chama, mostra, e nada
  aqui toca banco ou rede.
*/

export type Gravidade = "falha" | "fraco" | "forte" | "info";

export interface Achado {
  id: string;
  gravidade: Gravidade;
  titulo: string;
  /** O que os números dizem, em uma ou duas frases. */
  explicacao: string;
  /** O que fazer com isso. */
  acao: string;
  /** A campanha do achado; ausente quando é do conjunto todo. */
  campanhaId?: string;
  campanhaNome?: string;
}

export interface LeituraCampanha {
  id: string;
  nome: string;
  network: AdNetwork;
  status: CampaignRow["status"];
  metrics: AdMetrics;
  derivadas: ReturnType<typeof derivadas>;
  /** Compras por clique. */
  conversao: number | null;
  /** Receita por compra, em centavos. */
  ticketCents: number | null;
  /** Fatia do gasto do conjunto (0 a 1). */
  fatiaGasto: number;
  nota: number;
  decisao: Decisao | null;
  achados: Achado[];
}

export interface Diagnostico {
  campanhas: LeituraCampanha[];
  totais: AdMetrics;
  derivadas: ReturnType<typeof derivadas>;
  conversao: number | null;
  ticketCents: number | null;
  lucroMidiaCents: number;
  /** 0 a 100. */
  nota: number;
  rotulo: "Saudável" | "Atenção" | "Crítico" | "Sem dados";
  decisao: Decisao | null;
  achados: Achado[];
  /** Quantas campanhas entraram com gasto. */
  comDados: number;
}

/*
  Referências de mercado para e-commerce/infoproduto no Brasil. São
  pisos e tetos largos de propósito: a comparação principal é entre as
  campanhas selecionadas; estas faixas só evitam chamar de "forte" algo
  que é fraco em qualquer conta.
*/
const REFERENCIA: Record<
  AdNetwork,
  { ctrFraco: number; ctrBom: number; cpmAltoCents: number }
> = {
  meta: { ctrFraco: 0.008, ctrBom: 0.015, cpmAltoCents: 4_500 },
  google: { ctrFraco: 0.02, ctrBom: 0.045, cpmAltoCents: 8_000 },
  youtube: { ctrFraco: 0.003, ctrBom: 0.008, cpmAltoCents: 3_000 },
};
const CONVERSAO_FRACA = 0.008;
const CONVERSAO_BOA = 0.02;
const CLIQUES_MINIMOS = 50;

const pct = (v: number, d = 1) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d })}%`;
const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents < 10_000 ? 2 : 0,
  });
const vezes = (v: number) =>
  `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;

function decisaoDe(m: AdMetrics, regras: ProfitGuardrails): Decisao {
  const gasto = m.spendCents / 100;
  const receita = m.revenueCents / 100;
  return avaliarGuardrails(
    {
      gasto,
      receita,
      lucro: receita - gasto,
      margem: derivadas(m).margem ?? 0,
      diasSeguidosNegativos: receita - gasto < 0 ? 1 : 0,
    },
    regras,
  );
}

function mediana(valores: number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function lerCampanha(
  c: CampaignRow,
  gastoTotal: number,
  regras: ProfitGuardrails,
  medianas: { cpc: number | null; cpm: number | null; roas: number | null },
): LeituraCampanha {
  const m = c.metrics;
  const d = derivadas(m);
  const conversao = m.clicks > 0 ? m.purchases / m.clicks : null;
  const ticketCents = m.purchases > 0 ? m.revenueCents / m.purchases : null;
  const fatiaGasto = gastoTotal > 0 ? m.spendCents / gastoTotal : 0;
  const ref = REFERENCIA[c.network];
  const achados: Achado[] = [];
  let nota = 100;
  const base = { campanhaId: c.id, campanhaNome: c.name };

  if (m.spendCents === 0) {
    achados.push({
      ...base,
      id: `${c.id}-sem-gasto`,
      gravidade: "info",
      titulo: c.status === "active" ? "Ativa, mas sem gasto nos últimos 7 dias" : "Sem gasto nos últimos 7 dias",
      explicacao:
        c.status === "active"
          ? "Está ligada e não gastou nada: pode ser orçamento zerado, reprovação de anúncio ou conta sem saldo."
          : "Pausada ou arquivada — não há o que avaliar por enquanto.",
      acao:
        c.status === "active"
          ? "Abra a campanha na plataforma e confira entrega, aprovação dos anúncios e saldo."
          : "Reative só quando o freio de mão liberar.",
    });
    return {
      id: c.id, nome: c.name, network: c.network, status: c.status, metrics: m,
      derivadas: d, conversao, ticketCents, fatiaGasto, nota: 0, decisao: null, achados,
    };
  }

  const decisao = decisaoDe(m, regras);

  /* Elo 4 — dinheiro: o retorno paga a mídia? */
  if (d.roas !== null && d.roas < regras.roasPausa) {
    nota -= 40;
    achados.push({
      ...base,
      id: `${c.id}-roas-pausa`,
      gravidade: "falha",
      titulo: `ROAS de ${vezes(d.roas)}: cada real de mídia devolve menos de um real`,
      explicacao: `Gastou ${reais(m.spendCents)} e trouxe ${reais(m.revenueCents)} no checkout. Antes de qualquer custo de produto, já é prejuízo.`,
      acao: "Pause e olhe os dois elos anteriores (clique e compra) antes de voltar: o problema está em um deles.",
    });
  } else if (d.roas !== null && d.roas < regras.roasMinimo) {
    nota -= 20;
    achados.push({
      ...base,
      id: `${c.id}-roas-minimo`,
      gravidade: "fraco",
      titulo: `ROAS de ${vezes(d.roas)}, abaixo do mínimo de ${vezes(regras.roasMinimo)}`,
      explicacao: "Devolve mais que gasta, mas não sobra para produto, taxas e operação.",
      acao: "Reduza a verba até o ROAS voltar à faixa, ou corte os conjuntos/anúncios que puxam a média para baixo.",
    });
  } else if (d.roas !== null && medianas.roas !== null && d.roas >= medianas.roas * 1.3 && d.roas >= regras.roasMinimo) {
    achados.push({
      ...base,
      id: `${c.id}-roas-forte`,
      gravidade: "forte",
      titulo: `ROAS de ${vezes(d.roas)} — a melhor do grupo`,
      explicacao: `Fica ${pct(d.roas / medianas.roas - 1, 0)} acima da mediana das campanhas selecionadas.`,
      acao: decisao.veredito === "escalar"
        ? `O freio de mão libera até ${pct(decisao.escalaPermitida, 0)} de aumento. Escale aos poucos e vigie o CPM.`
        : `O freio de mão diz "${decisao.veredito}" (${decisao.motivo}). Escale só quando ele liberar.`,
    });
  }

  /* Elo 1 — impressão → clique: criativo e público. */
  if (d.ctr !== null && m.impressions >= 1_000) {
    if (d.ctr < ref.ctrFraco) {
      nota -= 10;
      achados.push({
        ...base,
        id: `${c.id}-ctr-fraco`,
        gravidade: "fraco",
        titulo: `CTR de ${pct(d.ctr, 2)}: poucas pessoas clicam`,
        explicacao: `Abaixo de ${pct(ref.ctrFraco, 1)} para esta rede. Ou o criativo não para o dedo, ou está sendo mostrado para quem não quer.`,
        acao: "Teste 2–3 criativos novos (primeiros 3 segundos e promessa) e revise o público antes de mexer em verba.",
      });
    } else if (d.ctr >= ref.ctrBom) {
      achados.push({
        ...base,
        id: `${c.id}-ctr-forte`,
        gravidade: "forte",
        titulo: `CTR de ${pct(d.ctr, 2)}: o criativo chama atenção`,
        explicacao: `Acima de ${pct(ref.ctrBom, 1)} para esta rede — o anúncio está falando com a pessoa certa.`,
        acao: "Proteja esse criativo: não troque; duplique para públicos parecidos.",
      });
    }
  }

  /* Elo 2 — clique → compra: página, oferta, checkout. */
  if (conversao !== null && m.clicks >= CLIQUES_MINIMOS) {
    if (conversao < CONVERSAO_FRACA) {
      nota -= 15;
      const ctrOk = d.ctr !== null && d.ctr >= ref.ctrFraco;
      achados.push({
        ...base,
        id: `${c.id}-conversao-fraca`,
        gravidade: m.purchases === 0 ? "falha" : "fraco",
        titulo: m.purchases === 0
          ? `${m.clicks} cliques e nenhuma compra`
          : `Conversão de ${pct(conversao, 2)}: chega gente, compra pouca`,
        explicacao: ctrOk
          ? "O anúncio traz cliques, mas a página não fecha. O problema está depois do clique: velocidade, oferta, preço, checkout."
          : "Cliques poucos e vendas menores ainda — criativo e página pedem revisão juntos.",
        acao: ctrOk
          ? "Abra a página no celular com internet ruim; confira preço, prova social e o número de passos até pagar."
          : "Comece pelo criativo (CTR); depois meça a conversão de novo.",
      });
    } else if (conversao >= CONVERSAO_BOA) {
      achados.push({
        ...base,
        id: `${c.id}-conversao-forte`,
        gravidade: "forte",
        titulo: `Conversão de ${pct(conversao, 2)}: a página fecha bem`,
        explicacao: "Acima de 2% dos cliques viram compra — a oferta e o checkout estão fazendo o trabalho.",
        acao: "Gargalo não está aqui: se quiser crescer, o caminho é mais cliques qualificados.",
      });
    }
  }

  /* Elo 3 — preço do clique e da impressão contra o grupo. */
  if (d.cpcCents !== null && medianas.cpc !== null && m.clicks >= CLIQUES_MINIMOS && d.cpcCents > medianas.cpc * 1.5) {
    nota -= 5;
    achados.push({
      ...base,
      id: `${c.id}-cpc-alto`,
      gravidade: "fraco",
      titulo: `CPC de ${reais(d.cpcCents)}, ${pct(d.cpcCents / medianas.cpc - 1, 0)} acima do grupo`,
      explicacao: "Cada clique custa bem mais do que nas outras campanhas selecionadas.",
      acao: "Compare público e posicionamentos com a campanha mais barata; um leilão mais disputado explica quase sempre.",
    });
  }
  if (d.cpmCents !== null && m.impressions >= 1_000 && (d.cpmCents > ref.cpmAltoCents || (medianas.cpm !== null && d.cpmCents > medianas.cpm * 1.6))) {
    nota -= 5;
    achados.push({
      ...base,
      id: `${c.id}-cpm-alto`,
      gravidade: "fraco",
      titulo: `CPM de ${reais(d.cpmCents)}: impressão cara`,
      explicacao: "Público pequeno ou saturado, ou concorrência forte no leilão. Quando o CPM sobe sem o CTR subir, é saturação.",
      acao: "Amplie o público ou troque o criativo; se for sazonal (datas), aceite e reduza a verba temporariamente.",
    });
  }

  /* Elo 4b — o custo de cada venda contra o que a venda paga. */
  if (d.cpaCents !== null && ticketCents !== null && d.cpaCents > ticketCents) {
    nota -= 20;
    achados.push({
      ...base,
      id: `${c.id}-cpa-maior-ticket`,
      gravidade: "falha",
      titulo: `CPA de ${reais(d.cpaCents)} maior que o ticket de ${reais(ticketCents)}`,
      explicacao: "Cada venda custa mais em mídia do que ela fatura. Não há margem que salve isso.",
      acao: "Pause ou reduza forte; volte só com CPA abaixo de metade do ticket.",
    });
  } else if (d.cpaCents !== null && ticketCents !== null && d.cpaCents > ticketCents * 0.6) {
    nota -= 8;
    achados.push({
      ...base,
      id: `${c.id}-cpa-apertado`,
      gravidade: "fraco",
      titulo: `CPA de ${reais(d.cpaCents)} consome ${pct(d.cpaCents / ticketCents, 0)} do ticket`,
      explicacao: "Sobra pouco para produto, taxas e lucro depois de pagar a venda.",
      acao: "Ou sobe o ticket (order bump, kit) ou cai o CPA (criativo/página). Escalar assim só aumenta o aperto.",
    });
  }

  return {
    id: c.id, nome: c.name, network: c.network, status: c.status, metrics: m,
    derivadas: d, conversao, ticketCents, fatiaGasto,
    nota: Math.max(0, Math.min(100, nota)), decisao, achados,
  };
}

export function diagnosticar(
  selecionadas: CampaignRow[],
  regras: ProfitGuardrails,
): Diagnostico {
  const totais = somarMetricas(selecionadas.map((c) => c.metrics));
  const d = derivadas(totais);
  const comGasto = selecionadas.filter((c) => c.metrics.spendCents > 0);
  const medianas = {
    cpc: mediana(comGasto.map((c) => derivadas(c.metrics).cpcCents ?? NaN)),
    cpm: mediana(comGasto.map((c) => derivadas(c.metrics).cpmCents ?? NaN)),
    roas: mediana(comGasto.map((c) => derivadas(c.metrics).roas ?? NaN)),
  };

  const campanhas = selecionadas.map((c) =>
    lerCampanha(c, totais.spendCents, regras, medianas),
  );

  const achados: Achado[] = [];
  const conversao = totais.clicks > 0 ? totais.purchases / totais.clicks : null;
  const ticketCents = totais.purchases > 0 ? totais.revenueCents / totais.purchases : null;
  const lucroMidiaCents = totais.revenueCents - totais.spendCents;

  if (comGasto.length === 0) {
    return {
      campanhas, totais, derivadas: d, conversao, ticketCents, lucroMidiaCents,
      nota: 0, rotulo: "Sem dados", decisao: null,
      achados: campanhas.flatMap((c) => c.achados), comDados: 0,
    };
  }

  const decisao = decisaoDe(totais, regras);

  /* Achados do conjunto: concentração e desequilíbrio entre campanhas. */
  const maior = [...campanhas].sort((a, b) => b.fatiaGasto - a.fatiaGasto)[0];
  if (comGasto.length >= 2 && maior.fatiaGasto >= 0.6) {
    const roasMaior = maior.derivadas.roas ?? 0;
    const roasResto = derivadas(
      somarMetricas(comGasto.filter((c) => c.id !== maior.id).map((c) => c.metrics)),
    ).roas;
    const pior = roasResto !== null && roasMaior < roasResto;
    achados.push({
      id: "concentracao",
      gravidade: pior ? "falha" : "info",
      titulo: `${pct(maior.fatiaGasto, 0)} do gasto está em "${maior.nome}"`,
      explicacao: pior
        ? `E ela rende ${vezes(roasMaior)} enquanto as outras rendem ${vezes(roasResto!)}. A verba está no lugar errado.`
        : "Concentração alta: se essa campanha cair, o resultado do grupo cai junto.",
      acao: pior
        ? "Mova parte da verba para as campanhas de maior ROAS, aos poucos (20% por vez)."
        : "Tenha uma segunda campanha pronta para absorver verba se esta saturar.",
    });
  }

  const melhor = [...campanhas].filter((c) => c.derivadas.roas !== null && c.metrics.spendCents > 0).sort((a, b) => (b.derivadas.roas ?? 0) - (a.derivadas.roas ?? 0))[0];
  const piorC = [...campanhas].filter((c) => c.derivadas.roas !== null && c.metrics.spendCents > 0).sort((a, b) => (a.derivadas.roas ?? 0) - (b.derivadas.roas ?? 0))[0];
  if (melhor && piorC && melhor.id !== piorC.id && (melhor.derivadas.roas ?? 0) >= (piorC.derivadas.roas ?? 0) * 2) {
    achados.push({
      id: "espalhamento",
      gravidade: "info",
      titulo: `Diferença de ${vezes((melhor.derivadas.roas ?? 0) / Math.max(0.01, piorC.derivadas.roas ?? 0))} entre a melhor e a pior campanha`,
      explicacao: `"${melhor.nome}" rende ${vezes(melhor.derivadas.roas ?? 0)}; "${piorC.nome}", ${vezes(piorC.derivadas.roas ?? 0)}. O grupo esconde uma campanha que perde dinheiro.`,
      acao: `Trate as duas separadamente: escale "${melhor.nome}" e conserte ou pause "${piorC.nome}".`,
    });
  }

  const pausadasBoas = campanhas.filter((c) => c.status !== "active" && (c.derivadas.roas ?? 0) >= regras.roasMinimo && c.metrics.spendCents > 0);
  for (const c of pausadasBoas) {
    achados.push({
      id: `${c.id}-pausada-boa`,
      gravidade: "info",
      titulo: `"${c.nome}" está pausada com ROAS de ${vezes(c.derivadas.roas ?? 0)}`,
      explicacao: "Rendia acima do mínimo quando parou. Pode ser dinheiro deixado na mesa.",
      acao: "Reative com verba pequena e observe 3 dias.",
      campanhaId: c.id,
      campanhaNome: c.nome,
    });
  }

  /* A nota do conjunto pesa cada campanha pela fatia de gasto. */
  const nota = Math.round(
    comGasto.length
      ? campanhas.filter((c) => c.metrics.spendCents > 0).reduce((s, c) => s + c.nota * c.fatiaGasto, 0)
      : 0,
  );
  const rotulo = nota >= 75 ? "Saudável" : nota >= 50 ? "Atenção" : "Crítico";

  const peso: Record<Gravidade, number> = { falha: 0, fraco: 1, info: 2, forte: 3 };
  const todos = [...achados, ...campanhas.flatMap((c) => c.achados)].sort(
    (a, b) => peso[a.gravidade] - peso[b.gravidade],
  );

  return {
    campanhas, totais, derivadas: d, conversao, ticketCents, lucroMidiaCents,
    nota, rotulo, decisao, achados: todos, comDados: comGasto.length,
  };
}

/**
 * O simulador: e se a verba mudar X%? Assume que o ROAS cai um pouco
 * conforme a verba sobe (leilão mais caro) e sobe um pouco quando cai —
 * é o comportamento comum, não uma promessa.
 */
export function simular(
  totais: AdMetrics,
  variacao: number,
  margemProduto: number,
) {
  const roas = derivadas(totais).roas ?? 0;
  /* A cada +10% de verba, o ROAS perde ~2%; a cada −10%, ganha ~1%. */
  const ajuste = variacao > 0 ? 1 - variacao * 0.2 : 1 - variacao * 0.1;
  const roasNovo = Math.max(0, roas * ajuste);
  const gastoNovo = totais.spendCents * (1 + variacao);
  const receitaNova = gastoNovo * roasNovo;
  const lucroAtual = totais.revenueCents * margemProduto - totais.spendCents;
  const lucroNovo = receitaNova * margemProduto - gastoNovo;
  return {
    gastoNovoCents: gastoNovo,
    receitaNovaCents: receitaNova,
    roasNovo,
    lucroAtualCents: lucroAtual,
    lucroNovoCents: lucroNovo,
    /** O ROAS em que a mídia empata com a margem do produto. */
    roasEquilibrio: margemProduto > 0 ? 1 / margemProduto : null,
  };
}
