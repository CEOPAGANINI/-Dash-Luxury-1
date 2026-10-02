// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Banco fora de alcance (DNS, recusa, tempo esgotado) não é falta de
  permissão: tentarWorkspaceAccess devolve null para a tela seguir só com
  a cópia local, e uma recusa de verdade (401/403) continua sendo erro.
*/
const state = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
}));
vi.mock("@/database/client", () => ({ getDb: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.session,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import {
  bancoIndisponivel,
  tentarWorkspaceAccess,
  WorkspaceAccessError,
} from "@/lib/workspace";

const user = {
  id: "12345678-1234-4234-8234-123456789012",
  email: "member@sem-banco.test",
  name: "Member",
  emailConfirmado: true,
};

/** Um db cuja primeira consulta falha como o drizzle falha: erro com `cause` do driver. */
function dbQueFalha(cause: unknown) {
  const erro = Object.assign(new Error("Failed query: select ..."), { cause });
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    orderBy: async () => {
      throw erro;
    },
  };
  return { select: () => builder };
}

beforeEach(() => {
  state.session = { user, demoMode: false };
});

describe("bancoIndisponivel", () => {
  it("reconhece DNS, recusa e tempo esgotado, inclusive dentro de cause", () => {
    for (const code of [
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
    ]) {
      const driver = Object.assign(new Error("getaddrinfo " + code), { code });
      expect(bancoIndisponivel(driver)).toBe(true);
      expect(
        bancoIndisponivel(
          Object.assign(new Error("Failed query"), { cause: driver }),
        ),
      ).toBe(true);
    }
    expect(
      bancoIndisponivel(
        new Error("DATABASE_URL não configurada. Configure o Supabase."),
      ),
    ).toBe(true);
  });
  it("não confunde recusa de acesso nem erro de regra com banco fora do ar", () => {
    expect(
      bancoIndisponivel(new WorkspaceAccessError(403, "Sem permissão.")),
    ).toBe(false);
    expect(bancoIndisponivel(new Error("verification_failed"))).toBe(false);
    expect(bancoIndisponivel(null)).toBe(false);
  });
});

describe("tentarWorkspaceAccess", () => {
  it("devolve null quando o banco não responde", async () => {
    state.db = dbQueFalha(
      Object.assign(new Error("getaddrinfo ENOTFOUND db.x.supabase.co"), {
        code: "ENOTFOUND",
        hostname: "db.x.supabase.co",
      }),
    );
    expect(await tentarWorkspaceAccess()).toBeNull();
  });
  it("continua lançando quando a sessão é de demonstração (recusa 401)", async () => {
    state.session = { user: { ...user, id: "demo-user" }, demoMode: true };
    state.db = dbQueFalha(new Error("não deveria consultar"));
    await expect(tentarWorkspaceAccess()).rejects.toBeInstanceOf(
      WorkspaceAccessError,
    );
  });
  it("repassa erros que não são de conectividade", async () => {
    state.db = dbQueFalha(new Error("syntax error at or near"));
    await expect(tentarWorkspaceAccess()).rejects.toThrow("Failed query");
  });
});
