// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Correção vizinha do Servidor do Funil: o destino depois do login só pode
  ser um caminho DESTE site. Antes, `startsWith("/")` deixava `//outro.com`
  e `/\outro.com` passarem (open redirect), e o link de login viraria isca
  para uma cópia falsa do painel — que é quem comanda a VPS.
*/

const destinos = vi.hoisted(() => [] as string[]);

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    destinos.push(destino);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: async () => ({ error: null }) },
  }),
}));

import { loginAction } from "@/features/auth/actions";

async function destinoDepoisDoLogin(redirect: string): Promise<string> {
  const f = new FormData();
  f.append("email", "dono@e2e-teste.com.br");
  f.append("password", "senha-forte-123");
  f.append("redirect", redirect);
  await expect(loginAction(null, f)).rejects.toThrow("NEXT_REDIRECT");
  return destinos.at(-1)!;
}

beforeEach(() => {
  destinos.length = 0;
});

describe("loginAction: destino depois do login", () => {
  it("aceita caminhos internos", async () => {
    expect(await destinoDepoisDoLogin("/servidor")).toBe("/servidor");
    expect(await destinoDepoisDoLogin("/servidor/sites/abc?x=1")).toBe(
      "/servidor/sites/abc?x=1",
    );
  });

  it("recusa //, barra invertida e caractere de controle (vai para /dashboard)", async () => {
    for (const ruim of [
      "//x.com",
      "/\\x",
      "/\\/x",
      "/\t/x.com",
      "/\n/x.com",
      "https://x.com",
      "x.com",
      "",
    ])
      expect(await destinoDepoisDoLogin(ruim), JSON.stringify(ruim)).toBe(
        "/dashboard",
      );
  });

  /*
    O redirect() do Next resolve o destino com `new URL(destino, origem)`:
    "/.//x.com" vira o caminho "//x.com", que o navegador lê como OUTRO
    site na navegação dura. A string crua passava na regex; o que vale é
    a forma normalizada.
  */
  it("recusa segmento de ponto que normaliza para //outro-site", async () => {
    for (const ruim of [
      "/.//x.com",
      "/..//x.com",
      "/%2e//x.com",
      "/%2E%2E//x.com",
      "/./\\x.com",
      "/.\\/x.com",
      "/a/..//x.com",
      "/a/../..//x.com",
    ])
      expect(await destinoDepoisDoLogin(ruim), JSON.stringify(ruim)).toBe(
        "/dashboard",
      );
  });

  it("manda o caminho já normalizado, que continua neste site", async () => {
    expect(await destinoDepoisDoLogin("/servidor/./sites/../sites")).toBe(
      "/servidor/sites",
    );
    for (const destino of [
      "/servidor",
      "/servidor/sites/abc?x=1",
      "/servidor#topo",
    ]) {
      const final = await destinoDepoisDoLogin(destino);
      expect(new URL(final, "https://painel.exemplo").origin).toBe(
        "https://painel.exemplo",
      );
      expect(final.startsWith("//")).toBe(false);
    }
  });
});
