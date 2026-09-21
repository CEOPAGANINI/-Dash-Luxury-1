/*
  A taxa do gateway, calculada em vez de digitada.

  Onde há banco, a conta é direta e honesta: some o que entrou (bruto) e
  o que o gateway cobrou (taxa) nos pagamentos aprovados, e a taxa
  efetiva é taxa ÷ bruto. Serve por forma de pagamento (Pix, cartão,
  boleto) e no total — a mistura das vendas já está lá dentro, então não
  há "qual é a sua proporção de Pix" para responder.

  Sem banco ligado, o painel usa a tabela pública do gateway escolhido:
  continua sem digitar porcentagem, só que o número é de referência e não
  do extrato. Este módulo não fala com o banco nem com o navegador de
  propósito: é lido pelo servidor e pela tela.
*/

export type MetodoDePagamento = "card" | "pix" | "boleto" | "outro";

export const METODOS: MetodoDePagamento[] = ["card", "pix", "boleto", "outro"];

export const ROTULO_DO_METODO: Record<MetodoDePagamento, string> = {
  card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
  outro: "Outros",
};

/** O que o gateway cobrou numa forma de pagamento, no período. */
export interface LinhaDeTaxa {
  metodo: MetodoDePagamento;
  pagamentos: number;
  brutoCents: number;
  taxaCents: number;
}

export interface TaxaMedida {
  /** A taxa efetiva em porcentagem, com duas casas. */
  percentual: number;
  brutoCents: number;
  taxaCents: number;
  pagamentos: number;
  porMetodo: (LinhaDeTaxa & { percentual: number })[];
}

/** Normaliza o que vem do gateway para as quatro formas que a tela mostra. */
export function metodoDoPagamento(bruto: string | null | undefined): MetodoDePagamento {
  const v = (bruto ?? "").toLowerCase();
  if (v.includes("pix")) return "pix";
  if (v.includes("boleto") || v.includes("multibanco")) return "boleto";
  if (v.includes("card") || v.includes("cart") || v.includes("credit") || v.includes("debit")) return "card";
  return "outro";
}

/** A porcentagem que a taxa representa do bruto, com duas casas. */
export function percentualDaTaxa(brutoCents: number, taxaCents: number): number {
  if (brutoCents <= 0) return 0;
  return Math.round((taxaCents / brutoCents) * 100 * 100) / 100;
}

/* A taxa efetiva do período: por forma de pagamento e no total. As
   formas entram sempre na mesma ordem, e as que não venderam ficam de
   fora — a tela não mostra linha vazia. */
export function taxaEfetiva(linhas: readonly LinhaDeTaxa[]): TaxaMedida {
  const porMetodo = METODOS.map((metodo) => {
    const dele = linhas.filter((l) => l.metodo === metodo);
    const brutoCents = dele.reduce((s, l) => s + l.brutoCents, 0);
    const taxaCents = dele.reduce((s, l) => s + l.taxaCents, 0);
    const pagamentos = dele.reduce((s, l) => s + l.pagamentos, 0);
    return { metodo, pagamentos, brutoCents, taxaCents, percentual: percentualDaTaxa(brutoCents, taxaCents) };
  }).filter((l) => l.pagamentos > 0 || l.brutoCents > 0);
  const brutoCents = porMetodo.reduce((s, l) => s + l.brutoCents, 0);
  const taxaCents = porMetodo.reduce((s, l) => s + l.taxaCents, 0);
  const pagamentos = porMetodo.reduce((s, l) => s + l.pagamentos, 0);
  return { percentual: percentualDaTaxa(brutoCents, taxaCents), brutoCents, taxaCents, pagamentos, porMetodo };
}

/*
  A tabela pública de cada gateway, para quando ainda não há extrato.

  São os preços de balcão que cada empresa publica — servem de ponto de
  partida, não de contrato: quem negociou tem taxa menor, e o número do
  extrato manda sempre. Por isso a tela diz de onde veio cada valor.
*/
export interface TaxaDeTabela {
  metodo: MetodoDePagamento;
  /** Porcentagem sobre o valor. */
  percentual: number;
  /** Parte fixa por transação, em centavos. */
  fixoCents: number;
}

export interface GatewayDeTabela {
  id: string;
  nome: string;
  categoria: string;
  /** A chave do adapter no banco (payment_providers.key), quando existe. */
  chave?: string;
  tabela: TaxaDeTabela[];
}

export const GATEWAYS_DE_TABELA: GatewayDeTabela[] = [
  {
    id: "mercado-pago",
    nome: "Mercado Pago",
    categoria: "Cartão, Pix e boleto",
    chave: "mercado_pago",
    tabela: [
      { metodo: "card", percentual: 4.98, fixoCents: 0 },
      { metodo: "pix", percentual: 0.99, fixoCents: 0 },
      { metodo: "boleto", percentual: 3.49, fixoCents: 0 },
    ],
  },
  {
    id: "pagarme",
    nome: "Pagar.me",
    categoria: "Cartão, Pix e boleto",
    chave: "pagarme",
    tabela: [
      { metodo: "card", percentual: 3.79, fixoCents: 40 },
      { metodo: "pix", percentual: 1.19, fixoCents: 0 },
      { metodo: "boleto", percentual: 0, fixoCents: 349 },
    ],
  },
  {
    id: "stripe",
    nome: "Stripe",
    categoria: "Cartão e Pix",
    chave: "stripe",
    tabela: [
      { metodo: "card", percentual: 3.99, fixoCents: 39 },
      { metodo: "pix", percentual: 1.19, fixoCents: 0 },
    ],
  },
  {
    id: "pagbank",
    nome: "PagBank (PagSeguro)",
    categoria: "Cartão, Pix e boleto",
    chave: "pagbank",
    tabela: [
      { metodo: "card", percentual: 4.99, fixoCents: 0 },
      { metodo: "pix", percentual: 0.99, fixoCents: 0 },
      { metodo: "boleto", percentual: 0, fixoCents: 349 },
    ],
  },
  {
    id: "asaas",
    nome: "Asaas",
    categoria: "Cartão, Pix e boleto",
    chave: "asaas",
    tabela: [
      { metodo: "card", percentual: 2.99, fixoCents: 49 },
      { metodo: "pix", percentual: 0, fixoCents: 199 },
      { metodo: "boleto", percentual: 0, fixoCents: 199 },
    ],
  },
  {
    id: "appmax",
    nome: "Appmax",
    categoria: "Checkout de produto físico",
    chave: "appmax",
    tabela: [
      { metodo: "card", percentual: 6.99, fixoCents: 0 },
      { metodo: "pix", percentual: 4.99, fixoCents: 0 },
      { metodo: "boleto", percentual: 4.99, fixoCents: 0 },
    ],
  },
  {
    id: "kiwify",
    nome: "Kiwify",
    categoria: "Infoproduto",
    chave: "kiwify",
    tabela: [
      { metodo: "card", percentual: 8.99, fixoCents: 249 },
      { metodo: "pix", percentual: 8.99, fixoCents: 249 },
      { metodo: "boleto", percentual: 8.99, fixoCents: 249 },
    ],
  },
  {
    id: "hotmart",
    nome: "Hotmart",
    categoria: "Infoproduto",
    chave: "hotmart",
    tabela: [
      { metodo: "card", percentual: 9.9, fixoCents: 100 },
      { metodo: "pix", percentual: 9.9, fixoCents: 100 },
      { metodo: "boleto", percentual: 9.9, fixoCents: 100 },
    ],
  },
];

export function gatewayDeTabela(id: string): GatewayDeTabela | null {
  return GATEWAYS_DE_TABELA.find((g) => g.id === id) ?? null;
}

/* A taxa de tabela de um gateway como uma porcentagem só: a média das
   formas que ele cobra, com a parte fixa convertida sobre um ticket.
   Sem ticket conhecido, usa R$ 100 — e a tela diz isso. */
export const TICKET_DE_REFERENCIA_CENTS = 100_00;

export function percentualDeTabela(gateway: GatewayDeTabela, ticketCents: number = TICKET_DE_REFERENCIA_CENTS): number {
  const ticket = ticketCents > 0 ? ticketCents : TICKET_DE_REFERENCIA_CENTS;
  const linhas = gateway.tabela;
  if (!linhas.length) return 0;
  const soma = linhas.reduce((s, l) => s + l.percentual + (l.fixoCents / ticket) * 100, 0);
  return Math.round((soma / linhas.length) * 100) / 100;
}

/** A taxa de uma forma de pagamento da tabela, já com a parte fixa. */
export function percentualDaLinha(linha: TaxaDeTabela, ticketCents: number = TICKET_DE_REFERENCIA_CENTS): number {
  const ticket = ticketCents > 0 ? ticketCents : TICKET_DE_REFERENCIA_CENTS;
  return Math.round((linha.percentual + (linha.fixoCents / ticket) * 100) * 100) / 100;
}
