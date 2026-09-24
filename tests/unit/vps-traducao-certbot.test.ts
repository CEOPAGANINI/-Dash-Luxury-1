// @vitest-environment node
import { describe, expect, it } from "vitest";

import { traduzirErroCertbot } from "@/features/vps/traducao-certbot";

describe("traduzirErroCertbot", () => {
  it.each([
    [
      "certbot_falhou: Certbot failed to authenticate some domains\n  Domain: loja.com.br\n  Type:   dns\n  Detail: DNS problem: NXDOMAIN looking up A for loja.com.br",
      /DNS do domínio ainda não aponta/,
    ],
    [
      "certbot_falhou: Domain: loja.com.br\n  Type:   connection\n  Detail: 203.0.113.10: Timeout during connect (likely firewall problem)",
      /porta 80/,
    ],
    [
      "certbot_falhou: Domain: loja.com.br\n  Type:   connection\n  Detail: 2001:db8::1: Timeout during connect (likely firewall problem)",
      /AAAA/,
    ],
    [
      "certbot_falhou: Detail: CAA record for loja.com.br prevents issuance",
      /CAA/,
    ],
    [
      "certbot_falhou: Error creating new order :: too many failed authorizations recently: see https://letsencrypt.org/docs/failed-validation-limit/",
      /limitou as tentativas/,
    ],
    [
      "certbot_falhou: urn:ietf:params:acme:error:rateLimited",
      /limitou as tentativas/,
    ],
    [
      "certbot_falhou: Invalid response from http://loja.com.br/.well-known/acme-challenge/x: 404",
      /outro servidor/,
    ],
    ["vhost_nao_responde: sonda falhou", /Reaplicar no servidor/],
    ["vhost_ausente: ", /ainda não está configurado/],
    [
      "trava_local: O dono travou este servidor na própria VPS.",
      /travou este servidor/,
    ],
  ])("%s", (entrada, esperado) => {
    expect(traduzirErroCertbot(entrada)).toMatch(esperado);
  });

  it("sem padrão conhecido: mostra a saída limpa e cortada", () => {
    const r = traduzirErroCertbot(
      `certbot_falhou: algo novo\u0007 ${"y".repeat(2000)}`,
    );
    expect(r.startsWith("O HTTPS falhou: …")).toBe(true);
    expect(r).not.toMatch(/\u0007/);
    expect(r.length).toBeLessThan(700);
  });

  it("vazio ou nulo", () => {
    expect(traduzirErroCertbot(null)).toMatch(/não disse o motivo/);
    expect(traduzirErroCertbot("  ")).toMatch(/não disse o motivo/);
  });
});
