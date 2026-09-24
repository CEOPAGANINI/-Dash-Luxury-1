// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Rastreio entre domínios (§8.6): as páginas do funil na VPS mandam
  eventos direto do navegador para /api/public/track. Só os domínios de
  site com DNS conferido (e site não removido) ganham CORS; qualquer outra
  origem de fora leva 403 sem gravar nada; o próprio app segue como era.
  A gravação em si (recordTrackEvent) é trocada por um espião: aqui o que
  importa é quem passa e com que página.
*/

const estado = vi.hoisted(() => ({
  db: null as unknown,
  gravados: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/database/client", () => ({
  getDb: () => estado.db,
  isDatabaseConfigured: () => true,
}));
vi.mock("@/features/analytics/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/analytics/track")>()),
  recordTrackEvent: vi.fn(async (entrada: Record<string, unknown>) => {
    estado.gravados.push(entrada);
  }),
}));

import { OPTIONS, POST } from "@/app/api/public/track/route";
import { vpsServers, vpsSiteDomains, vpsSites } from "@/database/schema";
import { zerarCacheDoRastreio } from "@/features/vps/cors-rastreio";

import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

const APP = "https://dash-board-psi-one.vercel.app";
let db: BancoDeTeste["db"];

beforeAll(async () => {
  const banco = await criarBancoDeTeste();
  db = banco.db;
  estado.db = db;
  const { workspaceId } = await criarWorkspaceDeTeste(db);
  const [srv] = await db
    .insert(vpsServers)
    .values({ workspaceId, name: "vps", status: "ativo", createdBy: "t" })
    .returning({ id: vpsServers.id });
  const site = async (slug: string, removido = false) => {
    const [s] = await db
      .insert(vpsSites)
      .values({
        workspaceId,
        serverId: srv.id,
        name: slug,
        slug,
        checkoutOrigin: APP,
        createdBy: "t",
        deletedAt: removido ? new Date() : null,
      })
      .returning({ id: vpsSites.id });
    return s.id;
  };
  const ativo = await site("loja");
  const removido = await site("velho", true);
  await db.insert(vpsSiteDomains).values([
    {
      workspaceId,
      siteId: ativo,
      hostname: "loja-ok.com.br",
      isPrimary: true,
      dnsStatus: "ok",
    },
    {
      workspaceId,
      siteId: ativo,
      hostname: "www.loja-ok.com.br",
      dnsStatus: "outro_ip",
    },
    {
      workspaceId,
      siteId: removido,
      hostname: "velho.com.br",
      isPrimary: true,
      dnsStatus: "ok",
    },
  ]);
}, 60_000);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
  zerarCacheDoRastreio();
  estado.gravados = [];
});

function pedido(
  metodo: "OPTIONS" | "POST",
  origem: string | null,
  corpo?: unknown,
) {
  return new Request(`${APP}/api/public/track`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(origem ? { origin: origem } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

const evento = (page = "/obrigado") => ({
  anonymousId: "anon-1",
  event: "page_view",
  page,
  productSlug: "cadeira-x",
});

describe("OPTIONS (pré-verificação)", () => {
  it("204 com ACAO só para domínio de site com DNS ok", async () => {
    const r = await OPTIONS(pedido("OPTIONS", "https://loja-ok.com.br"));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(
      "https://loja-ok.com.br",
    );
    expect(r.headers.get("vary")).toBe("Origin");
    expect(r.headers.get("access-control-allow-methods")).toBe("POST");
    expect(r.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(r.headers.get("access-control-max-age")).toBe("600");
    // http também (antes do HTTPS sair).
    expect(
      (await OPTIONS(pedido("OPTIONS", "http://loja-ok.com.br"))).headers.get(
        "access-control-allow-origin",
      ),
    ).toBe("http://loja-ok.com.br");
  });

  it("origem estranha, DNS não conferido, site removido ou com porta: sem ACAO", async () => {
    for (const origem of [
      "https://atacante.com",
      "https://www.loja-ok.com.br",
      "https://velho.com.br",
      "https://loja-ok.com.br:8443",
      "null",
    ]) {
      const r = await OPTIONS(pedido("OPTIONS", origem));
      expect(r.status, origem).toBe(403);
      expect(r.headers.get("access-control-allow-origin"), origem).toBeNull();
    }
  });
});

describe("POST", () => {
  it("origem permitida: grava a página com o domínio e responde com ACAO + Vary", async () => {
    const r = await POST(pedido("POST", "https://loja-ok.com.br", evento()));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get("access-control-allow-origin")).toBe(
      "https://loja-ok.com.br",
    );
    expect(r.headers.get("vary")).toBe("Origin");
    expect(estado.gravados).toHaveLength(1);
    expect(estado.gravados[0]).toMatchObject({
      page: "https://loja-ok.com.br/obrigado",
      productSlug: "cadeira-x",
      event: "page_view",
    });
  });

  it("origem de fora: 403 sem gravar nada", async () => {
    const r = await POST(pedido("POST", "https://atacante.com", evento()));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(estado.gravados).toHaveLength(0);
  });

  it("sem Origin ou do próprio app: como sempre (página sem domínio)", async () => {
    await POST(pedido("POST", null, evento("/p/cadeira-x")));
    await POST(pedido("POST", APP, evento("/checkout/cadeira-x")));
    expect(estado.gravados.map((e) => e.page)).toEqual([
      "/p/cadeira-x",
      "/checkout/cadeira-x",
    ]);
  });

  it("evento inválido de origem permitida leva 400 com ACAO (o console não acusa CORS)", async () => {
    const r = await POST(
      pedido("POST", "https://loja-ok.com.br", {
        anonymousId: "a",
        event: "x",
      }),
    );
    expect(r.status).toBe(400);
    expect(r.headers.get("access-control-allow-origin")).toBe(
      "https://loja-ok.com.br",
    );
  });

  it("a lista fica 60 s em cache por instância", async () => {
    await OPTIONS(pedido("OPTIONS", "https://loja-ok.com.br"));
    await db
      .update(vpsSiteDomains)
      .set({ dnsStatus: "ok" })
      .where(eq(vpsSiteDomains.hostname, "www.loja-ok.com.br"));
    // Ainda na lista antiga (cache): sem ACAO.
    expect(
      (await OPTIONS(pedido("OPTIONS", "https://www.loja-ok.com.br"))).status,
    ).toBe(403);
    zerarCacheDoRastreio();
    expect(
      (await OPTIONS(pedido("OPTIONS", "https://www.loja-ok.com.br"))).status,
    ).toBe(204);
  });
});
