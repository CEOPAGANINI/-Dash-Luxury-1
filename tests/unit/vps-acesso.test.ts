// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  A guarda do Servidor do Funil (src/features/vps/acesso.ts) e a sessão
  com `emailConfirmado` e `momentoDaAutenticacao` (src/lib/auth/session.ts).

  Aqui a sessão é a REAL: só o cliente Supabase é falso. Assim o teste
  prova que o "login recente" vem do `amr` do JWT desta sessão (getClaims)
  e NÃO de `last_sign_in_at` do usuário — que pode ter sido renovado por
  um login em outro aparelho.
*/

const falso = vi.hoisted(() => ({
  usuario: null as Record<string, unknown> | null,
  claims: null as Record<string, unknown> | null,
  erroClaims: null as unknown,
  configurado: true,
  ensure: vi.fn(async () => {}),
  workspace: vi.fn(async () => "ws-1"),
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => falso.configurado,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: falso.usuario } }),
      getClaims: async () =>
        falso.erroClaims
          ? { data: null, error: falso.erroClaims }
          : { data: { claims: falso.claims }, error: null },
    },
  }),
}));
vi.mock("@/database/client", () => ({
  getDb: () => ({ banco: "falso" }),
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/workspace", () => ({
  getOrCreateDefaultWorkspace: falso.workspace,
}));
vi.mock("@/features/vps/schema-sql", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/vps/schema-sql")>()),
  ensureVpsSchema: falso.ensure,
}));

import {
  configuracaoDoPainel,
  ehDonoDaVps,
  emailDoCertbot,
  exigirDonoDaVps,
  horasDeLoginRecente,
  preRequisitosVps,
  requireVpsRequest,
} from "@/features/vps/acesso";
import { VpsError } from "@/features/vps/modelo";
import {
  DEMO_USER,
  getSession,
  momentoDaAutenticacao,
  momentoDoAmr,
} from "@/lib/auth/session";

const agoraS = () => Math.floor(Date.now() / 1000);

function usuarioDono(mudancas: Record<string, unknown> = {}) {
  return {
    id: "uuid-do-dono",
    email: "Dono@E2E-teste.com.br",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    last_sign_in_at: new Date().toISOString(),
    user_metadata: { name: "Dono" },
    ...mudancas,
  };
}

beforeEach(() => {
  vi.stubEnv("VPS_DONOS", "dono@e2e-teste.com.br");
  vi.stubEnv("VPS_CHAVE_MESTRA", "k".repeat(48));
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dash-board-psi-one.vercel.app");
  vi.stubEnv("VPS_CHECKOUT_ORIGENS", "");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VPS_LOGIN_RECENTE_HORAS", "");
  falso.usuario = usuarioDono();
  falso.claims = { amr: [{ method: "password", timestamp: agoraS() - 60 }] };
  falso.erroClaims = null;
  falso.configurado = true;
  falso.ensure.mockReset();
  falso.ensure.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("momentoDoAmr", () => {
  it("usa o maior timestamp e ignora anonymous", () => {
    expect(
      momentoDoAmr([
        { method: "password", timestamp: 1_700_000_000 },
        { method: "otp", timestamp: 1_700_000_500 },
        { method: "anonymous", timestamp: 1_800_000_000 },
      ]),
    ).toEqual(new Date(1_700_000_500 * 1000));
  });

  it("falha fechado: string[], vazio, ausente ou sem hora dão null", () => {
    expect(momentoDoAmr(["pwd", "mfa"])).toBeNull();
    expect(momentoDoAmr([])).toBeNull();
    expect(momentoDoAmr(undefined)).toBeNull();
    expect(momentoDoAmr("password")).toBeNull();
    expect(momentoDoAmr([{ method: "password" }])).toBeNull();
    expect(momentoDoAmr([{ method: "anonymous", timestamp: 1 }])).toBeNull();
  });
});

describe("sessão", () => {
  it("emailConfirmado vem de email_confirmed_at", async () => {
    expect((await getSession())?.user.emailConfirmado).toBe(true);
    falso.usuario = usuarioDono({ email_confirmed_at: null });
    expect((await getSession())?.user.emailConfirmado).toBe(false);
    expect(DEMO_USER.emailConfirmado).toBeUndefined();
  });

  it("momentoDaAutenticacao lê o amr pelo getClaims; erro ou sem Supabase dá null", async () => {
    const ts = agoraS() - 120;
    falso.claims = { amr: [{ method: "password", timestamp: ts }] };
    expect(await momentoDaAutenticacao()).toEqual(new Date(ts * 1000));
    falso.erroClaims = new Error("jwt inválido");
    expect(await momentoDaAutenticacao()).toBeNull();
    falso.erroClaims = null;
    falso.configurado = false;
    expect(await momentoDaAutenticacao()).toBeNull();
  });
});

describe("ehDonoDaVps", () => {
  const u = (m: Record<string, unknown> = {}) => ({
    id: "id-1",
    email: "dono@e2e-teste.com.br",
    name: "Dono",
    emailConfirmado: true,
    ...m,
  });

  it("e-mail só vale confirmado; id vale sozinho; lista vazia = ninguém", () => {
    expect(ehDonoDaVps(u())).toBe(true);
    expect(ehDonoDaVps(u({ email: "DONO@e2e-teste.com.br" }))).toBe(true);
    expect(ehDonoDaVps(u({ emailConfirmado: false }))).toBe(false);
    expect(ehDonoDaVps(u({ emailConfirmado: undefined }))).toBe(false);
    vi.stubEnv("VPS_DONOS", " id-1 , outro@x.com ");
    expect(ehDonoDaVps(u({ email: "x@x.com", emailConfirmado: false }))).toBe(
      true,
    );
    vi.stubEnv("VPS_DONOS", "");
    expect(ehDonoDaVps(u())).toBe(false);
    vi.stubEnv("VPS_DONOS", "demo-user, demo@infinity.app");
    expect(ehDonoDaVps({ ...DEMO_USER, emailConfirmado: true })).toBe(false);
  });
});

describe("exigirDonoDaVps", () => {
  it("login antigo pelo amr dá login_antigo MESMO com last_sign_in_at de agora", async () => {
    falso.usuario = usuarioDono({ last_sign_in_at: new Date().toISOString() });
    falso.claims = {
      amr: [{ method: "password", timestamp: agoraS() - 13 * 3600 }],
    };
    await expect(
      exigirDonoDaVps({ alterar: true, recente: true }),
    ).rejects.toMatchObject({ status: 403, codigo: "login_antigo" });
    // Sem `recente`, o mesmo login antigo passa (e o getClaims nem é chamado).
    await expect(exigirDonoDaVps({ alterar: true })).resolves.toMatchObject({
      workspaceId: "ws-1",
    });
  });

  it("login recente pelo amr passa; VPS_LOGIN_RECENTE_HORAS muda o limite", async () => {
    falso.claims = {
      amr: [{ method: "password", timestamp: agoraS() - 3600 }],
    };
    await expect(
      exigirDonoDaVps({ alterar: true, recente: true }),
    ).resolves.toMatchObject({ workspaceId: "ws-1" });
    vi.stubEnv("VPS_LOGIN_RECENTE_HORAS", "0.5");
    expect(horasDeLoginRecente()).toBe(0.5);
    await expect(
      exigirDonoDaVps({ alterar: true, recente: true }),
    ).rejects.toMatchObject({ codigo: "login_antigo" });
  });

  it("a ordem das recusas: sessão, demo, dono, tabelas, chave e https", async () => {
    falso.usuario = null;
    await expect(exigirDonoDaVps({ alterar: false })).rejects.toMatchObject({
      status: 401,
      codigo: "sem_sessao",
    });

    falso.configurado = false;
    await expect(exigirDonoDaVps({ alterar: false })).rejects.toMatchObject({
      status: 403,
      codigo: "modo_demo",
    });
    expect(falso.ensure).not.toHaveBeenCalled();
    falso.configurado = true;

    falso.usuario = usuarioDono({ email_confirmed_at: null });
    await expect(exigirDonoDaVps({ alterar: false })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });

    falso.usuario = usuarioDono();
    falso.ensure.mockRejectedValueOnce(
      new Error("Failed query", {
        cause: Object.assign(
          new Error('relation "vps_servers" does not exist'),
          {
            code: "42P01",
          },
        ),
      }),
    );
    const semTabelas = await exigirDonoDaVps({ alterar: false }).catch(
      (e: unknown) => e,
    );
    expect(semTabelas).toBeInstanceOf(VpsError);
    expect(semTabelas).toMatchObject({ status: 503, codigo: "sem_tabelas" });
    expect((semTabelas as Error).message).toContain("0006_vps.sql");

    vi.stubEnv("VPS_CHAVE_MESTRA", "curta");
    await expect(exigirDonoDaVps({ alterar: false })).resolves.toBeTruthy();
    await expect(exigirDonoDaVps({ alterar: true })).rejects.toMatchObject({
      status: 503,
      codigo: "sem_chave",
    });
    vi.stubEnv("VPS_CHAVE_MESTRA", "k".repeat(48));

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    await expect(
      exigirDonoDaVps({ alterar: true, criarServidor: true }),
    ).rejects.toMatchObject({ codigo: "sem_https" });
    await expect(exigirDonoDaVps({ alterar: true })).resolves.toBeTruthy();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://dash-board-psi-one.vercel.app");
    await expect(
      exigirDonoDaVps({ alterar: true, criarServidor: true }),
    ).resolves.toBeTruthy();
  });
});

describe("pré-requisitos e configuração", () => {
  it("lista TODAS as pendências de uma vez", async () => {
    vi.stubEnv("VPS_CHAVE_MESTRA", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    const sessao = await getSession();
    const lista = await preRequisitosVps(sessao!);
    expect(lista.map((p) => p.chave)).toEqual([
      "banco",
      "donos",
      "email_confirmado",
      "chave",
      "https",
      "origem_checkout",
      "tabelas",
    ]);
    expect(lista.filter((p) => !p.ok).map((p) => p.chave)).toEqual([
      "chave",
      "https",
      "origem_checkout",
    ]);
    expect(lista.every((p) => p.texto && p.ondePegar)).toBe(true);
  });

  it("origens: a do app (https) mais as extras válidas; preview bloqueia criar", () => {
    vi.stubEnv(
      "VPS_CHECKOUT_ORIGENS",
      "https://checkout.loja.com, http://inseguro.com, https://x.com/caminho",
    );
    const config = configuracaoDoPainel();
    expect(config.painel).toBe("https://dash-board-psi-one.vercel.app");
    expect(config.origens).toEqual([
      "https://dash-board-psi-one.vercel.app",
      "https://checkout.loja.com",
    ]);
    expect(config.hostsReservados).toEqual(
      expect.arrayContaining([
        "dash-board-psi-one.vercel.app",
        "checkout.loja.com",
      ]),
    );
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(configuracaoDoPainel().preview).toBe(true);
  });

  it("e-mail do certbot: só o confirmado e na regra estrita", () => {
    const base = { id: "i", name: "n" };
    expect(
      emailDoCertbot({
        user: { ...base, email: "dono@loja.com.br", emailConfirmado: true },
        demoMode: false,
      }),
    ).toBe("dono@loja.com.br");
    expect(
      emailDoCertbot({
        user: { ...base, email: "dono@loja.com.br", emailConfirmado: false },
        demoMode: false,
      }),
    ).toBeNull();
    expect(
      emailDoCertbot({
        user: { ...base, email: "-x@loja.com.br", emailConfirmado: true },
        demoMode: false,
      }),
    ).toBeNull();
  });
});

describe("requireVpsRequest (upload)", () => {
  const pedido = (cabecalhos: Record<string, string>) =>
    new Request("https://painel.test/api/painel/vps/publicar", {
      method: "POST",
      headers: cabecalhos,
    });

  it("aceita só a mesma origem e recusa cross-site", () => {
    expect(() =>
      requireVpsRequest(
        pedido({
          origin: "https://painel.test",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).not.toThrow();
    const recusados: Array<Record<string, string>> = [
      { origin: "https://atacante.com" },
      {},
      { origin: "https://painel.test", "sec-fetch-site": "cross-site" },
      { origin: "http://painel.test" },
    ];
    for (const cabecalhos of recusados) {
      const erro = (() => {
        try {
          requireVpsRequest(pedido(cabecalhos));
        } catch (e) {
          return e;
        }
      })();
      expect(erro).toMatchObject({ status: 403, codigo: "origem_invalida" });
    }
  });
});
