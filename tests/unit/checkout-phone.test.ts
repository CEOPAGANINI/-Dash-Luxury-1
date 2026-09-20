import { describe, expect, it } from "vitest";

import { checkoutSchema, normalizePtPhone } from "@/validations/checkout";

const base = {
  firstName: "Ana",
  lastName: "Cliente",
  email: "ana@exemplo.pt",
  addressLine1: "Rua das Flores 123",
  postalCode: "1000-100",
  city: "Lisboa",
  quantity: 1,
  productSlug: "cadeira-gaming-alpha-gamer-nebula",
};

function parse(extra: Record<string, unknown>) {
  return checkoutSchema.safeParse({ ...base, ...extra });
}

describe("normalizePtPhone", () => {
  it("assume +351 quando só há 9 dígitos", () => {
    expect(normalizePtPhone("912345678")).toBe("+351912345678");
  });

  it("remove espaços e hífens", () => {
    expect(normalizePtPhone("+351 912 345-678")).toBe("+351912345678");
  });

  it("converte 00351 e 351 para +351", () => {
    expect(normalizePtPhone("00351912345678")).toBe("+351912345678");
    expect(normalizePtPhone("351912345678")).toBe("+351912345678");
  });
});

describe("checkout — telefone por método de pagamento", () => {
  it("Multibanco aceita telefone fixo (bug relatado: +351222001079)", () => {
    const r = parse({ paymentMethod: "multibanco", phone: "+351222001079" });
    expect(r.success).toBe(true);
  });

  it("Multibanco funciona sem telefone nenhum", () => {
    const r = parse({ paymentMethod: "multibanco", phone: "" });
    expect(r.success).toBe(true);
  });

  it("Multibanco recusa telefone claramente inválido", () => {
    const r = parse({ paymentMethod: "multibanco", phone: "12345" });
    expect(r.success).toBe(false);
  });

  it("MB WAY exige telemóvel", () => {
    const r = parse({ paymentMethod: "mbway", phone: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("telemóvel");
    }
  });

  it("MB WAY recusa telefone fixo", () => {
    const r = parse({ paymentMethod: "mbway", phone: "+351222001079" });
    expect(r.success).toBe(false);
  });

  it("MB WAY aceita telemóvel válido", () => {
    const r = parse({ paymentMethod: "mbway", phone: "+351912345678" });
    expect(r.success).toBe(true);
  });

  it("MB WAY aceita telemóvel digitado sem indicativo", () => {
    const r = parse({ paymentMethod: "mbway", phone: "912 345 678" });
    expect(r.success).toBe(true);
  });
});
