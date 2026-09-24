/**
 * Segurança baseada em lucro.
 *
 * O freio de mão do painel: um conjunto de regras que decide, a partir dos
 * números do dia, se a verba de anúncio pode subir, deve ficar como está,
 * cair ou parar. Qualquer agente que venha a mexer em orçamento passa por
 * `avaliarGuardrails` antes — e é a decisão daqui, não a do agente, que vale.
 *
 * Tudo aqui é função pura: entram números e regras, sai uma decisão com o
 * motivo escrito. Sem banco, sem rede, sem relógio. É de propósito — é o
 * que permite testar cada regra isolada e mostrar na tela, hoje, o que ela
 * decidiria com os números de hoje.
 */

export interface ProfitGuardrails {
  /** Margem de contribuição mínima para permitir escalar (0 a 1). */
  margemMinima: number;
  /** ROAS abaixo do qual a verba deve cair. */
  roasMinimo: number;
  /** ROAS abaixo do qual a verba para. */
  roasPausa: number;
  /** Teto de gasto por dia, em reais. Zero desliga o teto. */
  gastoMaximoDia: number;
  /** Quanto a verba pode subir numa única decisão (0 a 1; 0,2 = 20%). */
  escalaMaxima: number;
  /** Pausar sozinho quando o dia fecha no prejuízo. */
  pausarDiaNegativo: boolean;
  /** Quantos dias seguidos de prejuízo antes de pausar. */
  diasToleranciaNegativo: number;
  /** Acima deste aumento em reais, a escala exige aprovação humana. */
  aprovacaoAcimaDe: number;
}

/*
  Os padrões são conservadores de propósito. Um freio de mão que nasce
  frouxo não protege ninguém; é mais fácil afrouxar depois de ver que a
  operação aguenta do que recuperar verba queimada.

  Margem de 15% e ROAS de 1,3 são o piso comum de operação de resposta
  direta; 1,0 de ROAS é o ponto em que cada real de mídia devolve
  exatamente um real — abaixo disso não há discussão, é prejuízo.
*/
export const GUARDRAILS_PADRAO: ProfitGuardrails = {
  margemMinima: 0.15,
  roasMinimo: 1.3,
  roasPausa: 1.0,
  gastoMaximoDia: 0,
  escalaMaxima: 0.2,
  pausarDiaNegativo: true,
  diasToleranciaNegativo: 2,
  aprovacaoAcimaDe: 500,
};

export type Veredito = "escalar" | "manter" | "reduzir" | "pausar";

export interface LeituraDoDia {
  /** Gasto em mídia no período lido, em reais. */
  gasto: number;
  /** Receita atribuída ao mesmo período. */
  receita: number;
  /** Lucro de contribuição do período. */
  lucro: number;
  /** Margem de contribuição (0 a 1). */
  margem: number;
  /** Dias seguidos em que o resultado fechou negativo. */
  diasSeguidosNegativos: number;
}

export interface Decisao {
  veredito: Veredito;
  /** A regra que decidiu, ou "nenhuma" quando tudo passou. */
  regra: keyof ProfitGuardrails | "nenhuma";
  /** O motivo, em palavras, para a tela e para o registro. */
  motivo: string;
  /** Quanto a verba pode subir nesta decisão (0 a 1). Zero fora de "escalar". */
  escalaPermitida: number;
  /** Aumento em reais que a escala permitida representa. */
  aumentoEmReais: number;
  /** Verdadeiro quando o aumento passa do que o freio deixa passar sozinho. */
  exigeAprovacao: boolean;
  /** O ROAS que entrou na conta, para a tela não recalcular. */
  roas: number;
}

const percentual = (valor: number) =>
  `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const ratio = (valor: number) =>
  `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;

const reais = (valor: number) =>
  valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

/**
 * A decisão. As regras são checadas da mais restritiva para a menos: se o
 * dia pede pausa, não importa que a margem esteja boa. A primeira que
 * dispara decide, e é ela que aparece como motivo.
 */
export function avaliarGuardrails(
  leitura: LeituraDoDia,
  regras: ProfitGuardrails = GUARDRAILS_PADRAO,
): Decisao {
  const roas = leitura.gasto > 0 ? leitura.receita / leitura.gasto : 0;
  const base = { escalaPermitida: 0, aumentoEmReais: 0, exigeAprovacao: false, roas };

  if (leitura.gasto <= 0) {
    return {
      ...base,
      veredito: "manter",
      regra: "nenhuma",
      motivo: "Sem gasto no período: não há verba para avaliar.",
    };
  }

  if (
    regras.pausarDiaNegativo &&
    leitura.lucro < 0 &&
    leitura.diasSeguidosNegativos >= regras.diasToleranciaNegativo
  ) {
    return {
      ...base,
      veredito: "pausar",
      regra: "pausarDiaNegativo",
      motivo: `${leitura.diasSeguidosNegativos} ${leitura.diasSeguidosNegativos === 1 ? "dia" : "dias seguidos"} no prejuízo — a tolerância é ${regras.diasToleranciaNegativo}. Verba pausada até o resultado virar.`,
    };
  }

  if (roas < regras.roasPausa) {
    return {
      ...base,
      veredito: "pausar",
      regra: "roasPausa",
      motivo: `ROAS de ${ratio(roas)}, abaixo de ${ratio(regras.roasPausa)}: cada real de mídia devolve menos de um real. Verba pausada.`,
    };
  }

  if (roas < regras.roasMinimo) {
    return {
      ...base,
      veredito: "reduzir",
      regra: "roasMinimo",
      motivo: `ROAS de ${ratio(roas)}, abaixo do mínimo de ${ratio(regras.roasMinimo)}. A verba deve cair até o retorno voltar à faixa.`,
    };
  }

  if (regras.gastoMaximoDia > 0 && leitura.gasto >= regras.gastoMaximoDia) {
    return {
      ...base,
      veredito: "manter",
      regra: "gastoMaximoDia",
      motivo: `Gasto de ${reais(leitura.gasto)} já encostou no teto diário de ${reais(regras.gastoMaximoDia)}. Nada sobe hoje.`,
    };
  }

  if (leitura.margem < regras.margemMinima) {
    return {
      ...base,
      veredito: "manter",
      regra: "margemMinima",
      motivo: `Margem de ${percentual(leitura.margem)}, abaixo do mínimo de ${percentual(regras.margemMinima)} para escalar. A verba fica como está.`,
    };
  }

  /* Tudo passou: pode subir, dentro do limite — e se o aumento for grande
     em reais, alguém de carne e osso confirma antes. */
  let escala = regras.escalaMaxima;
  if (regras.gastoMaximoDia > 0) {
    const folga = (regras.gastoMaximoDia - leitura.gasto) / leitura.gasto;
    escala = Math.max(0, Math.min(escala, folga));
  }
  const aumento = leitura.gasto * escala;
  const exigeAprovacao =
    regras.aprovacaoAcimaDe > 0 && aumento > regras.aprovacaoAcimaDe;

  return {
    veredito: "escalar",
    regra: "nenhuma",
    motivo: exigeAprovacao
      ? `ROAS ${ratio(roas)} e margem ${percentual(leitura.margem)} liberam até ${percentual(escala)} de aumento (${reais(aumento)}) — acima de ${reais(regras.aprovacaoAcimaDe)}, então precisa de aprovação.`
      : `ROAS ${ratio(roas)} e margem ${percentual(leitura.margem)} liberam até ${percentual(escala)} de aumento (${reais(aumento)}).`,
    escalaPermitida: escala,
    aumentoEmReais: aumento,
    exigeAprovacao,
    roas,
  };
}

/** Os rótulos e a leitura de cada veredito, para a tela não repetir. */
export const VEREDITOS: Record<
  Veredito,
  { label: string; tom: "success" | "neutral" | "warning" | "destructive" }
> = {
  escalar: { label: "Pode escalar", tom: "success" },
  manter: { label: "Manter", tom: "neutral" },
  reduzir: { label: "Reduzir", tom: "warning" },
  pausar: { label: "Pausar", tom: "destructive" },
};

/**
 * Converte o que veio de um formulário em regras válidas. Cada campo tem
 * um piso e um teto para não aceitar um "ROAS mínimo de 900" por engano de
 * digitação — que na prática pausaria a operação inteira.
 */
export function normalizarGuardrails(
  entrada: Partial<Record<keyof ProfitGuardrails, unknown>>,
): ProfitGuardrails {
  const num = (valor: unknown, padrao: number, min: number, max: number) => {
    const n =
      typeof valor === "number"
        ? valor
        : Number(String(valor ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return padrao;
    return Math.min(max, Math.max(min, n));
  };
  const bool = (valor: unknown, padrao: boolean) =>
    valor === undefined || valor === null
      ? padrao
      : valor === true || valor === "true" || valor === "on" || valor === "1";

  const p = GUARDRAILS_PADRAO;
  return {
    margemMinima: num(entrada.margemMinima, p.margemMinima, 0, 0.9),
    roasMinimo: num(entrada.roasMinimo, p.roasMinimo, 0.5, 20),
    roasPausa: num(entrada.roasPausa, p.roasPausa, 0.1, 20),
    gastoMaximoDia: num(entrada.gastoMaximoDia, p.gastoMaximoDia, 0, 1_000_000),
    escalaMaxima: num(entrada.escalaMaxima, p.escalaMaxima, 0, 1),
    pausarDiaNegativo: bool(entrada.pausarDiaNegativo, p.pausarDiaNegativo),
    diasToleranciaNegativo: Math.round(
      num(entrada.diasToleranciaNegativo, p.diasToleranciaNegativo, 1, 30),
    ),
    aprovacaoAcimaDe: num(entrada.aprovacaoAcimaDe, p.aprovacaoAcimaDe, 0, 1_000_000),
  };
}
