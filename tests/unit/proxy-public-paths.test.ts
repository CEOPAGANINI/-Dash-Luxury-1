import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/proxy";

/**
 * Rotas de webhook precisam ficar fora da proteção de sessão: quem chama
 * é um servidor externo (Broski), que não tem cookie de login. A garantia
 * de autenticidade é a assinatura HMAC verificada dentro da rota.
 */
describe("isPublicPath", () => {
  it("libera o webhook do Broski", () => {
    expect(isPublicPath("/api/webhooks/broski")).toBe(true);
  });

  it("libera páginas públicas da loja", () => {
    expect(isPublicPath("/p/cadeira-gaming-alpha-gamer-nebula")).toBe(true);
    expect(isPublicPath("/checkout/cadeira-gaming-alpha-gamer-nebula")).toBe(
      true,
    );
    expect(isPublicPath("/login")).toBe(true);
  });

  it("mantém o painel protegido", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/pedidos")).toBe(false);
    expect(isPublicPath("/financeiro/repasses")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });

  it("não libera rotas de API que não são webhooks", () => {
    expect(isPublicPath("/api/diagnostico")).toBe(false);
  });
});
