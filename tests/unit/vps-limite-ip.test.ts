// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import {
  consumirLimiteIp,
  ipDoPedido,
  LIMITE_REGISTRO_POR_MINUTO,
  zerarLimiteIp,
} from "@/features/vps/limite-ip";

beforeEach(() => zerarLimiteIp());

describe("consumirLimiteIp", () => {
  it("30 por minuto por IP; o 31º é recusado; outro IP não é afetado", () => {
    const agora = 1_000_000;
    for (let i = 0; i < LIMITE_REGISTRO_POR_MINUTO; i++)
      expect(consumirLimiteIp("8.8.8.8", { agora })).toBe(true);
    expect(consumirLimiteIp("8.8.8.8", { agora })).toBe(false);
    expect(consumirLimiteIp("1.1.1.1", { agora })).toBe(true);
    // A janela vira depois de 1 minuto.
    expect(consumirLimiteIp("8.8.8.8", { agora: agora + 60_000 })).toBe(true);
  });
});

describe("ipDoPedido", () => {
  it("primeiro item do x-forwarded-for, depois x-real-ip; lixo vira null", () => {
    expect(
      ipDoPedido(new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" })),
    ).toBe("203.0.113.10");
    expect(ipDoPedido(new Headers({ "x-real-ip": "2001:DB8::1" }))).toBe(
      "2001:db8::1",
    );
    expect(
      ipDoPedido(new Headers({ "x-forwarded-for": "<script>" })),
    ).toBeNull();
    expect(ipDoPedido(new Headers())).toBeNull();
  });
});
