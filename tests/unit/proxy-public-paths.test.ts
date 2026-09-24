// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  createServerClient: vi.fn(() => {
    throw new Error("o proxy não devia criar o cliente Supabase aqui");
  }),
}));
vi.mock("@supabase/ssr", () => supabase);

import { isPublicPath, proxy } from "@/proxy";

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

  it("libera a API e os arquivos do agente da VPS e as páginas legais", () => {
    expect(isPublicPath("/api/agente/v1/pulso")).toBe(true);
    expect(isPublicPath("/agente/v1/instalar.sh")).toBe(true);
    expect(isPublicPath("/legal/termos")).toBe(true);
  });

  it("não libera as telas nem a API do painel do Servidor", () => {
    expect(isPublicPath("/servidor")).toBe(false);
    expect(isPublicPath("/servidor/sites/x")).toBe(false);
    expect(isPublicPath("/api/painel/vps/estado")).toBe(false);
    // Prefixo parecido não é o mesmo caminho.
    expect(isPublicPath("/api/agentes")).toBe(false);
    expect(isPublicPath("/agentes")).toBe(false);
  });
});

describe("proxy: atalho do agente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    supabase.createServerClient.mockClear();
  });

  it("pulso e arquivos do agente passam sem criar o cliente Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://e2e.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "e2e");
    for (const caminho of [
      "/api/agente/v1/pulso",
      "/agente/v1/rastreio.js",
      "/agente/v1/instalar.sh",
    ]) {
      const resposta = await proxy(
        new NextRequest(`https://painel.test${caminho}`, { method: "POST" }),
      );
      expect(resposta.headers.get("x-middleware-next")).toBe("1");
      expect(resposta.headers.get("location")).toBeNull();
    }
    expect(supabase.createServerClient).not.toHaveBeenCalled();
  });

  it("as telas do painel continuam passando pela sessão", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://e2e.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "e2e");
    await expect(
      proxy(new NextRequest("https://painel.test/servidor")),
    ).rejects.toThrow("o proxy não devia criar o cliente Supabase aqui");
    expect(supabase.createServerClient).toHaveBeenCalledTimes(1);
  });
});
