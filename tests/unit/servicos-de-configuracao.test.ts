// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  COFRES_LOCAIS,
  catalogoDeServicos,
} from "@/features/settings/servicos";

/*
  O catálogo de credenciais da página de Configurações: os nomes das
  variáveis têm de ser exatamente os que o código lê, e o "configurado"
  tem de seguir a presença delas — sem inventar estado.
*/

describe("catálogo de serviços das Configurações", () => {
  it("com o env vazio, nada está configurado", () => {
    const servicos = catalogoDeServicos({});
    expect(servicos.length).toBeGreaterThanOrEqual(15);
    expect(servicos.every((s) => !s.configurado)).toBe(true);
  });

  it("cobre as variáveis que o código realmente lê, sem duplicar", () => {
    const nomes = catalogoDeServicos({}).flatMap((s) =>
      s.variaveis.map((v) => v.nome),
    );
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const essencial of [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "ENCRYPTION_KEY",
      "NEXT_PUBLIC_APP_URL",
      "META_APP_ID",
      "META_APP_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "BROSKI_API_KEY",
      "STRIPE_SECRET_KEY",
      "MERCADO_PAGO_ACCESS_TOKEN",
      "PAGARME_API_KEY",
      "ASAAS_API_KEY",
      "UTMIFY_API_TOKEN",
      "UPSTASH_REDIS_REST_URL",
      "VPS_CHAVE_MESTRA",
    ]) {
      expect(nomes, essencial).toContain(essencial);
    }
  });

  it("marca configurado quando as obrigatórias estão presentes", () => {
    const servicos = catalogoDeServicos({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      RESEND_API_KEY: "re_123",
    });
    const de = (id: string) => servicos.find((s) => s.id === id)!;
    expect(de("supabase").configurado).toBe(true);
    // RESEND_FROM_EMAIL é opcional: não bloqueia o "configurado".
    expect(de("resend").configurado).toBe(true);
    expect(de("banco").configurado).toBe(false);
  });

  it("a criptografia aceita a chave própria OU a service role", () => {
    const so = (env: Record<string, string>) =>
      catalogoDeServicos(env).find((s) => s.id === "cripto")!.configurado;
    expect(so({})).toBe(false);
    expect(so({ ENCRYPTION_KEY: "k" })).toBe(true);
    expect(so({ SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe(true);
  });

  it("os cofres locais têm chaves únicas e com o prefixo do painel", () => {
    const chaves = COFRES_LOCAIS.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const c of chaves) expect(c).toMatch(/^dash/);
  });
});
