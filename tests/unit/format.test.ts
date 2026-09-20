import { describe, expect, it } from "vitest";

import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

describe("formatMoney", () => {
  it("formata centavos em BRL", () => {
    // Intl usa espaço não separável entre R$ e o valor
    expect(formatMoney(29700).replace(/ /g, " ")).toBe("R$ 297,00");
  });

  it("formata bigint", () => {
    expect(formatMoney(BigInt(1990)).replace(/ /g, " ")).toBe("R$ 19,90");
  });

  it("suporta outras moedas", () => {
    const result = formatMoney(10050, "EUR", "pt-PT");
    expect(result).toContain("100,50");
    expect(result).toContain("€");
  });
});

describe("formatNumber", () => {
  it("usa separador de milhar pt-BR", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
});

describe("formatPercent", () => {
  it("formata proporção como percentual", () => {
    expect(formatPercent(0.034).replace(/ /g, " ")).toMatch(/3,4\s?%/);
  });
});
