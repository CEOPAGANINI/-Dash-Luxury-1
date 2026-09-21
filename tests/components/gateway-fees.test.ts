import { describe, expect, it } from "vitest";

import {
  GATEWAYS_DE_TABELA,
  TICKET_DE_REFERENCIA_CENTS,
  gatewayDeTabela,
  metodoDoPagamento,
  percentualDaLinha,
  percentualDaTaxa,
  percentualDeTabela,
  taxaEfetiva,
} from "@/features/gateways/gateway-fees";
import {
  ESCOLHA_PADRAO,
  restoreGatewayChoice,
  taxaDaEscolha,
} from "@/features/gateways/gateway-choice-store";

describe("a taxa do gateway, medida em vez de digitada", () => {
  it("lê a forma de pagamento do que o gateway mandar", () => {
    expect(metodoDoPagamento("pix")).toBe("pix");
    expect(metodoDoPagamento("PIX_QR")).toBe("pix");
    expect(metodoDoPagamento("credit_card")).toBe("card");
    expect(metodoDoPagamento("cartao")).toBe("card");
    expect(metodoDoPagamento("boleto")).toBe("boleto");
    expect(metodoDoPagamento("cripto")).toBe("outro");
    expect(metodoDoPagamento(null)).toBe("outro");
  });

  it("a porcentagem é a taxa sobre o bruto, com duas casas, e nunca divide por zero", () => {
    expect(percentualDaTaxa(100_00, 4_99)).toBe(4.99);
    expect(percentualDaTaxa(0, 500)).toBe(0);
    expect(percentualDaTaxa(30_00, 0)).toBe(0);
  });

  it("soma por forma de pagamento e no total, e deixa de fora as que não venderam", () => {
    const medida = taxaEfetiva([
      { metodo: "pix", pagamentos: 10, brutoCents: 1_000_00, taxaCents: 9_90 },
      { metodo: "card", pagamentos: 5, brutoCents: 1_000_00, taxaCents: 49_80 },
      { metodo: "card", pagamentos: 5, brutoCents: 1_000_00, taxaCents: 49_80 },
      { metodo: "boleto", pagamentos: 0, brutoCents: 0, taxaCents: 0 },
    ]);
    // Cartão junta as duas linhas: 10 pagamentos, R$ 2.000, R$ 99,60 → 4,98%.
    const cartao = medida.porMetodo.find((l) => l.metodo === "card")!;
    expect(cartao.pagamentos).toBe(10);
    expect(cartao.brutoCents).toBe(2_000_00);
    expect(cartao.percentual).toBe(4.98);
    // Pix: 0,99%.
    expect(medida.porMetodo.find((l) => l.metodo === "pix")!.percentual).toBe(0.99);
    // Boleto não vendeu: não aparece.
    expect(medida.porMetodo.some((l) => l.metodo === "boleto")).toBe(false);
    // Total: R$ 109,50 de R$ 3.000 → 3,65%.
    expect(medida.brutoCents).toBe(3_000_00);
    expect(medida.taxaCents).toBe(109_50);
    expect(medida.pagamentos).toBe(20);
    expect(medida.percentual).toBe(3.65);
  });

  it("sem pagamento nenhum, a taxa medida é zero e não quebra", () => {
    const medida = taxaEfetiva([]);
    expect(medida).toEqual({ percentual: 0, brutoCents: 0, taxaCents: 0, pagamentos: 0, porMetodo: [] });
  });

  it("a tabela pública converte a parte fixa pelo ticket", () => {
    const stripe = gatewayDeTabela("stripe")!;
    const cartao = stripe.tabela.find((l) => l.metodo === "card")!;
    // 3,99% + R$ 0,39 num ticket de R$ 100 = 4,38%.
    expect(percentualDaLinha(cartao, 100_00)).toBe(4.38);
    // Num ticket de R$ 20 a parte fixa pesa mais: 3,99% + 1,95% = 5,94%.
    expect(percentualDaLinha(cartao, 20_00)).toBe(5.94);
    // Ticket inválido volta ao de referência.
    expect(percentualDaLinha(cartao, 0)).toBe(percentualDaLinha(cartao, TICKET_DE_REFERENCIA_CENTS));
    // A média do gateway fica entre a menor e a maior das formas.
    const media = percentualDeTabela(stripe, 100_00);
    const linhas = stripe.tabela.map((l) => percentualDaLinha(l, 100_00));
    expect(media).toBeGreaterThanOrEqual(Math.min(...linhas));
    expect(media).toBeLessThanOrEqual(Math.max(...linhas));
  });

  it("todo gateway da lista tem nome, formas de pagamento e taxa possível", () => {
    expect(GATEWAYS_DE_TABELA.length).toBeGreaterThan(4);
    for (const g of GATEWAYS_DE_TABELA) {
      expect(g.nome.length).toBeGreaterThan(1);
      expect(g.tabela.length).toBeGreaterThan(0);
      const media = percentualDeTabela(g);
      expect(media).toBeGreaterThan(0);
      expect(media).toBeLessThan(100);
    }
    expect(gatewayDeTabela("inventado")).toBeNull();
  });

  it("a escolha guardada é saneada: lixo volta ao padrão e gateway que sumiu perde a ligação", () => {
    expect(restoreGatewayChoice("{")).toBeNull();
    expect(restoreGatewayChoice(JSON.stringify({ version: 2, gateway: null, origem: "extrato" }))).toBeNull();
    expect(restoreGatewayChoice(JSON.stringify({ version: 1, gateway: "sumiu", origem: "tabela" }))).toEqual({
      version: 1,
      gateway: null,
      origem: "extrato",
    });
    expect(restoreGatewayChoice(JSON.stringify({ version: 1, gateway: "stripe", origem: "tabela" }))).toEqual({
      version: 1,
      gateway: "stripe",
      origem: "tabela",
    });
  });

  it("a taxa da escolha só sai da tabela quando é a tabela que manda", () => {
    const daTabela = { version: 1 as const, gateway: "stripe", origem: "tabela" as const };
    expect(taxaDaEscolha(daTabela, 100_00)).toBe(percentualDeTabela(gatewayDeTabela("stripe")!, 100_00));
    expect(taxaDaEscolha({ ...daTabela, origem: "extrato" }, 100_00)).toBeNull();
    expect(taxaDaEscolha({ ...daTabela, origem: "manual" }, 100_00)).toBeNull();
    expect(taxaDaEscolha(ESCOLHA_PADRAO, 100_00)).toBeNull();
  });
});
