// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { vpsServers } from "@/database/schema";
import {
  canonicoPedido,
  derivarChaves,
  hmacHex,
  mensagemTarefa,
  sha256hex,
} from "@/features/vps/chaves";
import {
  consumirLimiteIp,
  LIMITE_AGENTE_POR_MINUTO,
  zerarLimiteIp,
} from "@/features/vps/limite-ip";
import { VpsError } from "@/features/vps/modelo";
import {
  envelopeDaTarefa,
  interpretarCorpo,
  JANELA_SEQ_MS,
  lerCorpo,
  montarParams,
  PedidoPulso,
  PedidoRegistro,
  PedidoResultado,
  RESULTADO_POR_TIPO,
  RespostaPulso,
  RespostaRegistro,
  respostaValidada,
  TarefaParaAgente,
  verificarPedido,
} from "@/features/vps/protocolo";

import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

const MESTRA = "m".repeat(48);
const URL_BASE = "https://dash-board-psi-one.vercel.app";

let banco: BancoDeTeste;
let workspaceId: string;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  ({ workspaceId } = await criarWorkspaceDeTeste(banco.db));
}, 60_000);

beforeEach(() => {
  vi.stubEnv("VPS_CHAVE_MESTRA", MESTRA);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** O token é único por servidor (índice vps_servers_token_idx). */
const tokens = new Map<string, string>();

async function novoServidor(
  mudancas: Partial<typeof vpsServers.$inferInsert> = {},
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const [s] = await banco.db
    .insert(vpsServers)
    .values({
      workspaceId,
      name: "srv",
      status: "ativo",
      agentTokenHash: sha256hex(token),
      keyGeneration: 1,
      createdBy: "dono@e2e-teste.com.br",
      ...mudancas,
    })
    .returning({ id: vpsServers.id });
  tokens.set(s.id, token);
  return s.id;
}

function assinado(opcoes: {
  servidorId: string;
  seq: number | string;
  metodo?: string;
  caminho?: string;
  corpo?: string;
  geracao?: number;
  token?: string;
  mestra?: string;
  assinarCaminho?: string;
  assinarCorpo?: string;
}): { request: Request; corpo: Buffer } {
  const metodo = opcoes.metodo ?? "POST";
  const caminho = opcoes.caminho ?? "/api/agente/v1/pulso";
  const corpo = Buffer.from(opcoes.corpo ?? "{}", "utf8");
  const { pedidos } = derivarChaves(
    Buffer.from(opcoes.mestra ?? MESTRA),
    opcoes.servidorId,
    opcoes.geracao ?? 1,
  );
  const assinatura = hmacHex(
    pedidos,
    canonicoPedido(
      metodo,
      opcoes.assinarCaminho ?? caminho,
      opcoes.servidorId,
      String(opcoes.seq),
      Buffer.from(opcoes.assinarCorpo ?? corpo.toString("utf8")),
    ),
  );
  const request = new Request(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${opcoes.token ?? tokens.get(opcoes.servidorId) ?? "T".repeat(43)}`,
      "x-dash-servidor": opcoes.servidorId,
      "x-dash-seq": String(opcoes.seq),
      "x-dash-assinatura": `v1=${assinatura}`,
    },
    body: metodo === "GET" ? undefined : corpo,
  });
  return { request, corpo: metodo === "GET" ? Buffer.alloc(0) : corpo };
}

async function ultimaSeq(servidorId: string): Promise<number> {
  const [s] = await banco.db
    .select({ seq: vpsServers.agentLastSeq })
    .from(vpsServers)
    .where(eq(vpsServers.id, servidorId));
  return s.seq;
}

describe("verificarPedido", () => {
  it("aceita o pedido assinado e grava a seq (number)", async () => {
    const id = await novoServidor();
    const seq = Date.now();
    const { request, corpo } = assinado({ servidorId: id, seq });
    const r = await verificarPedido(banco.db, request, corpo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seq).toBe(seq);
    expect(r.servidor).toMatchObject({
      id,
      workspaceId,
      status: "ativo",
      geracao: 1,
    });
    const gravada = await ultimaSeq(id);
    expect(typeof gravada).toBe("number");
    expect(gravada).toBe(seq);
  });

  it("confere o vetor do protocolo (o mesmo que o agente Python usa)", async () => {
    const v = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../fixtures/vps/vetores-protocolo.json"),
        "utf8",
      ),
    );
    vi.stubEnv("VPS_CHAVE_MESTRA", v.mestra);
    await novoServidor({
      id: v.servidorId,
      agentTokenHash: v.token.sha256,
      keyGeneration: v.geracao,
    });
    // Todos os pedidos do arquivo, na ordem (a seq só sobe), pelo caminho
    // real da rota: é o que o agente em Python assina, byte a byte.
    const pedidos = v.pedidos as {
      nome: string;
      metodo: string;
      caminho: string;
      seq: string;
      corpoBase64: string;
      assinatura: string;
    }[];
    expect(pedidos.length).toBeGreaterThanOrEqual(4);
    for (const p of pedidos) {
      const corpo = Buffer.from(p.corpoBase64, "base64");
      const request = new Request(`${URL_BASE}${p.caminho}`, {
        method: p.metodo,
        headers: {
          authorization: `Bearer ${v.token.valor}`,
          "x-dash-servidor": v.servidorId,
          "x-dash-seq": p.seq,
          "x-dash-assinatura": `v1=${p.assinatura}`,
        },
        body: p.metodo === "GET" ? undefined : corpo,
      });
      const r = await verificarPedido(banco.db, request, corpo, {
        agoraMs: Number(p.seq),
      });
      expect([p.nome, r.ok]).toEqual([p.nome, true]);
    }
  });

  it("seq acima de 2^53 - 1: 400 (o agente usa o mesmo teto)", async () => {
    const id = await novoServidor();
    const b = assinado({ servidorId: id, seq: "9007199254740992" });
    const r = await verificarPedido(banco.db, b.request, b.corpo, {
      agoraMs: 9007199254740991,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.resposta.status).toBe(400);
    expect(await r.resposta.json()).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("GET assina o corpo vazio", async () => {
    const id = await novoServidor();
    const { request, corpo } = assinado({
      servidorId: id,
      seq: Date.now(),
      metodo: "GET",
      caminho: "/api/agente/v1/artefatos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      corpo: "",
    });
    expect((await verificarPedido(banco.db, request, corpo)).ok).toBe(true);
  });

  it("mesma seq ou menor: 409 replayed com ultimaSeq number", async () => {
    const id = await novoServidor();
    const seq = Date.now();
    const a = assinado({ servidorId: id, seq });
    expect((await verificarPedido(banco.db, a.request, a.corpo)).ok).toBe(true);
    for (const repetida of [seq, seq - 5]) {
      const b = assinado({ servidorId: id, seq: repetida });
      const r = await verificarPedido(banco.db, b.request, b.corpo);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.resposta.status).toBe(409);
      const corpo = await r.resposta.json();
      expect(corpo).toEqual({ ok: false, error: "replayed", ultimaSeq: seq });
      expect(typeof corpo.ultimaSeq).toBe("number");
    }
  });

  it("fora da janela de 5 min: 409 clock_skew com agora e ultimaSeq, sem gastar a seq", async () => {
    const id = await novoServidor({ agentLastSeq: 1234 });
    const agora = Date.now();
    const b = assinado({ servidorId: id, seq: agora + JANELA_SEQ_MS + 1 });
    const r = await verificarPedido(banco.db, b.request, b.corpo, {
      agoraMs: agora,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.resposta.status).toBe(409);
    expect(await r.resposta.json()).toEqual({
      ok: false,
      error: "clock_skew",
      agora,
      ultimaSeq: 1234,
    });
    expect(await ultimaSeq(id)).toBe(1234);
    // Na borda da janela ainda vale.
    const c = assinado({ servidorId: id, seq: agora - JANELA_SEQ_MS });
    expect(
      (await verificarPedido(banco.db, c.request, c.corpo, { agoraMs: agora }))
        .ok,
    ).toBe(true);
  });

  it("401 uniforme, com a marca, para servidor, token e assinatura", async () => {
    const id = await novoServidor();
    const revogado = await novoServidor({ status: "revogado" });
    const apagado = await novoServidor({ deletedAt: new Date() });
    const semToken = await novoServidor({ agentTokenHash: null });
    const seq = Date.now();
    const casos = [
      assinado({ servidorId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", seq }),
      assinado({ servidorId: revogado, seq }),
      assinado({ servidorId: apagado, seq }),
      assinado({ servidorId: semToken, seq }),
      assinado({ servidorId: id, seq, token: "U".repeat(43) }),
      assinado({ servidorId: id, seq, mestra: "x".repeat(48) }),
      assinado({ servidorId: id, seq, geracao: 2 }),
      assinado({ servidorId: id, seq, assinarCaminho: "/api/agente/v1/outro" }),
      assinado({ servidorId: id, seq, assinarCorpo: '{"x":1}' }),
    ];
    for (const { request, corpo } of casos) {
      const r = await verificarPedido(banco.db, request, corpo);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.resposta.status).toBe(401);
      expect(r.resposta.headers.get("www-authenticate")).toBe("Dash-HMAC");
      expect(r.resposta.headers.get("cache-control")).toBe("no-store");
      expect(await r.resposta.json()).toEqual({
        ok: false,
        error: "unauthorized",
      });
    }
    // Nenhuma tentativa ruim gastou a seq do servidor certo.
    expect(await ultimaSeq(id)).toBe(0);
  });

  it("aguardando confirmação também autentica (o pulso chega antes do sim)", async () => {
    const id = await novoServidor({ status: "aguardando_confirmacao" });
    const b = assinado({ servidorId: id, seq: Date.now() });
    const r = await verificarPedido(banco.db, b.request, b.corpo);
    expect(r.ok && r.servidor.status).toBe("aguardando_confirmacao");
  });

  it("ordem: formato (400) antes da chave (503), chave antes do banco", async () => {
    const id = await novoServidor();
    const espiao = vi.spyOn(banco.db, "select");
    vi.stubEnv("VPS_CHAVE_MESTRA", "");
    const bom = assinado({ servidorId: id, seq: Date.now() });
    const r503 = await verificarPedido(banco.db, bom.request, bom.corpo);
    expect(!r503.ok && r503.resposta.status).toBe(503);
    expect(!r503.ok && (await r503.resposta.json()).error).toBe(
      "not_configured",
    );
    expect(espiao).not.toHaveBeenCalled();

    const semCabecalho = new Request(`${URL_BASE}/api/agente/v1/pulso`, {
      method: "POST",
      body: "{}",
    });
    const r400 = await verificarPedido(
      banco.db,
      semCabecalho,
      Buffer.from("{}"),
    );
    expect(!r400.ok && r400.resposta.status).toBe(400);
    expect(!r400.ok && (await r400.resposta.json()).error).toBe(
      "invalid_request",
    );
  });

  it.each([
    ["seq com zero à esquerda", { "x-dash-seq": "0123" }],
    ["seq acima de 2^53", { "x-dash-seq": "9007199254740993" }],
    ["assinatura sem v1=", { "x-dash-assinatura": "a".repeat(64) }],
    ["assinatura maiúscula", { "x-dash-assinatura": `v1=${"A".repeat(64)}` }],
    ["token curto", { authorization: "Bearer abc" }],
    ["servidor não uuid", { "x-dash-servidor": "1" }],
  ])("400 invalid_request: %s", async (_nome, cabecalho) => {
    const id = await novoServidor();
    const { request, corpo } = assinado({ servidorId: id, seq: Date.now() });
    const headers = new Headers(request.headers);
    for (const [k, v] of Object.entries(cabecalho)) headers.set(k, v);
    const r = await verificarPedido(
      banco.db,
      new Request(request.url, {
        method: "POST",
        headers,
        body: new Uint8Array(corpo),
      }),
      corpo,
    );
    expect(!r.ok && r.resposta.status).toBe(400);
  });

  it("413 com corpo acima do teto", async () => {
    const id = await novoServidor();
    const { request, corpo } = assinado({
      servidorId: id,
      seq: Date.now(),
      corpo: "x".repeat(100),
    });
    const r = await verificarPedido(banco.db, request, corpo, { limite: 99 });
    expect(!r.ok && r.resposta.status).toBe(413);
  });

  it("freio por IP antes do banco: passou de 120 por minuto, 429 sem SELECT", async () => {
    zerarLimiteIp();
    const espiao = vi.spyOn(banco.db, "select");
    // Formato certo, servidor e assinatura inventados: sem o freio, cada um
    // destes custaria uma ida ao banco (o freio de 1 s do pulso só vale
    // depois de uma assinatura válida).
    const falso = () =>
      new Request(`${URL_BASE}/api/agente/v1/pulso`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${"T".repeat(43)}`,
          "x-dash-servidor": randomUUID(),
          "x-dash-seq": String(Date.now()),
          "x-dash-assinatura": `v1=${"a".repeat(64)}`,
          "x-forwarded-for": "203.0.113.7",
        },
        body: "{}",
      });
    for (let i = 0; i < LIMITE_AGENTE_POR_MINUTO; i++) {
      const r = await verificarPedido(banco.db, falso(), Buffer.from("{}"));
      expect(!r.ok && r.resposta.status).toBe(401);
    }
    expect(espiao).toHaveBeenCalledTimes(LIMITE_AGENTE_POR_MINUTO);
    const r = await verificarPedido(banco.db, falso(), Buffer.from("{}"));
    expect(!r.ok && r.resposta.status).toBe(429);
    expect(!r.ok && r.resposta.headers.get("retry-after")).toBe("60");
    expect(!r.ok && (await r.resposta.json())).toEqual({
      ok: false,
      error: "too_many_requests",
      tenteEm: 60,
    });
    expect(espiao).toHaveBeenCalledTimes(LIMITE_AGENTE_POR_MINUTO);

    // Outro IP (aqui, sem x-forwarded-for) segue normal, e a cota do
    // registro do mesmo IP é outro balde: continua inteira.
    const id = await novoServidor();
    const bom = assinado({ servidorId: id, seq: Date.now() });
    expect((await verificarPedido(banco.db, bom.request, bom.corpo)).ok).toBe(
      true,
    );
    expect(consumirLimiteIp("203.0.113.7")).toBe(true);
    zerarLimiteIp();
  });
});

describe("lerCorpo e interpretarCorpo", () => {
  it("recusa pelo Content-Length antes de ler e pelo tamanho real depois", async () => {
    const declarado = new Request(`${URL_BASE}/x`, {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    const r1 = await lerCorpo(declarado, 1024);
    expect(!r1.ok && r1.resposta.status).toBe(413);
    const real = new Request(`${URL_BASE}/x`, {
      method: "POST",
      body: "x".repeat(2000),
    });
    const r2 = await lerCorpo(real, 1024);
    expect(!r2.ok && r2.resposta.status).toBe(413);
    const ok = await lerCorpo(
      new Request(`${URL_BASE}/x`, { method: "POST", body: "{}" }),
      1024,
    );
    expect(ok.ok && ok.corpo.toString()).toBe("{}");
  });

  it("JSON inválido ou fora do schema: 400", async () => {
    const r = interpretarCorpo(Buffer.from("{nao"), PedidoPulso);
    expect(!r.ok && r.resposta.status).toBe(400);
  });

  it("pulso: IPv4 privados saem, campos opcionais viram null", () => {
    const r = interpretarCorpo(
      Buffer.from(
        JSON.stringify({
          versao: "1.0.0",
          travas: { pausado: false, somenteLeitura: true },
          ipv4: ["10.0.0.1", "8.8.8.8", "8.8.8.8"],
          ipv6: ["2001:DB8::1"],
          sites: [{ slug: "loja", atual: "vazio", versoes: [] }],
        }),
      ),
      PedidoPulso,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.ipv4).toEqual(["8.8.8.8"]);
    expect(r.dados.ipv6).toEqual(["2001:db8::1"]);
    expect(r.dados).toMatchObject({
      executando: null,
      desvioMs: 0,
      visaoGeral: null,
      nginx: null,
      certificados: null,
    });
    expect(
      PedidoPulso.safeParse({
        versao: "1\u0000",
        travas: { pausado: false, somenteLeitura: false },
      }).success,
    ).toBe(false);
  });

  it("registro: código, hash e inventário", () => {
    const base = {
      codigo: "c".repeat(43),
      tokenHash: "a".repeat(64),
      agente: {
        versao: "1.0.0",
        hostname: "srv1",
        so: "Ubuntu 24.04.1 LTS",
        python: "3.12.3",
        nginx: "1.24.0",
        certbot: "2.9.0",
        ipv4: ["203.0.113.10", "8.8.4.4"],
        ipv6: [],
      },
    };
    const r = PedidoRegistro.safeParse(base);
    expect(r.success && r.data.agente.ipv4).toEqual(["8.8.4.4"]);
    expect(
      PedidoRegistro.safeParse({ ...base, codigo: "c".repeat(42) }).success,
    ).toBe(false);
    expect(
      PedidoRegistro.safeParse({
        ...base,
        agente: { ...base.agente, hostname: "x".repeat(254) },
      }).success,
    ).toBe(false);
    expect(
      PedidoRegistro.safeParse({
        ...base,
        agente: { ...base.agente, ipv4: Array(9).fill("8.8.8.8") },
      }).success,
    ).toBe(false);
  });

  it("resultado: erro limpo e cortado, duração limitada", () => {
    const r = PedidoResultado.parse({
      seq: 42,
      estado: "falhou",
      resultado: null,
      erro: `nginx_recusou:\u0007 ${"x".repeat(3000)}`,
      duracaoMs: 10 ** 10,
    });
    expect(r.erro).toHaveLength(2000);
    expect(r.erro).not.toMatch(/\u0007/);
    expect(r.duracaoMs).toBe(86_400_000);
    expect(
      PedidoResultado.safeParse({
        seq: "42",
        estado: "concluida",
        duracaoMs: 1,
      }).success,
    ).toBe(false);
  });

  it("resultado por tipo", () => {
    expect(
      RESULTADO_POR_TIPO["site.configurar"].safeParse({ modo: "http" }).success,
    ).toBe(true);
    expect(
      RESULTADO_POR_TIPO["site.configurar"].safeParse({ modo: "ftp" }).success,
    ).toBe(false);
    const pub = RESULTADO_POR_TIPO["site.publicar"].parse({
      versaoId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      anterior: "vazio",
      repetida: false,
    });
    expect(pub.removidas).toEqual([]);
    expect(
      RESULTADO_POR_TIPO["site.ssl_emitir"].safeParse({ validoAte: "amanhã" })
        .success,
    ).toBe(false);
    // O que o dash_agent.py devolve quando não há pasta para mover, e a
    // publicação repetida sem os números no marcador.
    for (const r of [{}, { movidoPara: null }, { movidoPara: "/x/.lixeira/a" }])
      expect(RESULTADO_POR_TIPO["site.remover"].safeParse(r).success).toBe(
        true,
      );
    expect(
      RESULTADO_POR_TIPO["site.publicar"].safeParse({
        versaoId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        anterior: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        repetida: true,
        arquivos: null,
        bytesDescompactados: null,
        indexSha256: null,
        removidas: [],
      }).success,
    ).toBe(true);
  });
});

describe("o que sai para o agente (zod estrito)", () => {
  const tarefa = {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    seq: 42,
    tipo: "site.remover",
    params: "{}",
    expiraEm: 1_790_000_000,
    assinatura: "a".repeat(64),
  };

  it("TarefaParaAgente recusa seq como string, número inseguro e chave extra", () => {
    expect(TarefaParaAgente.safeParse(tarefa).success).toBe(true);
    expect(TarefaParaAgente.safeParse({ ...tarefa, seq: "42" }).success).toBe(
      false,
    );
    expect(
      TarefaParaAgente.safeParse({ ...tarefa, expiraEm: "1790000000" }).success,
    ).toBe(false);
    expect(
      TarefaParaAgente.safeParse({ ...tarefa, seq: 2 ** 53 }).success,
    ).toBe(false);
    expect(TarefaParaAgente.safeParse({ ...tarefa, extra: 1 }).success).toBe(
      false,
    );
    expect(
      TarefaParaAgente.safeParse({ ...tarefa, tipo: "shell" }).success,
    ).toBe(false);
  });

  it("envelopeDaTarefa devolve o expiraEm inteiro que foi assinado", () => {
    const expiraEm = Math.floor(Date.now() / 1000) + 600;
    const env = envelopeDaTarefa({
      id: tarefa.id,
      seq: 7,
      type: "servidor.coletar",
      params: "{}",
      signature: "b".repeat(64),
      expiresAt: new Date(expiraEm * 1000),
    });
    expect(env).toEqual({
      id: tarefa.id,
      seq: 7,
      tipo: "servidor.coletar",
      params: "{}",
      expiraEm,
      assinatura: "b".repeat(64),
    });
    expect(() =>
      envelopeDaTarefa({
        id: tarefa.id,
        seq: "7" as unknown as number,
        type: "servidor.coletar",
        params: "{}",
        signature: "b".repeat(64),
        expiresAt: new Date(),
      }),
    ).toThrow();
  });

  it("respostas do registro e do pulso", () => {
    expect(
      RespostaRegistro.safeParse({
        ok: true,
        servidorId: tarefa.id,
        geracao: "1",
        chavePedidos: "k".repeat(43),
        chaveTarefas: "k".repeat(43),
        ultimaSeqTarefa: 0,
        proximoPulsoEm: 5,
      }).success,
    ).toBe(false);
    const pulso = {
      ok: true,
      agora: new Date().toISOString(),
      agoraMs: Date.now(),
      proximoPulsoEm: 30,
      tarefa: null,
    };
    expect(RespostaPulso.safeParse(pulso).success).toBe(true);
    expect(
      RespostaPulso.safeParse({ ...pulso, proximoPulsoEm: 10 }).success,
    ).toBe(false);
    expect(
      RespostaPulso.safeParse({ ...pulso, tarefa: { ...tarefa, seq: "42" } })
        .success,
    ).toBe(false);
  });

  it("respostaValidada: saída inválida vira 500 erro_interno e log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = respostaValidada(TarefaParaAgente, { ...tarefa, seq: "42" });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "erro_interno" });
    expect(log).toHaveBeenCalledWith(
      "[vps] resposta inválida",
      expect.any(Array),
    );
    const bom = respostaValidada(TarefaParaAgente, tarefa);
    expect(bom.status).toBe(200);
    expect(bom.headers.get("cache-control")).toBe("no-store");
  });
});

describe("montarParams", () => {
  it("ordem do schema e VpsError 400 para parâmetro inválido", () => {
    const siteId = "11111111-2222-4333-8444-555555555555";
    expect(montarParams("site.remover", { slug: "loja", siteId })).toBe(
      `{"siteId":"${siteId}","slug":"loja"}`,
    );
    expect(() =>
      montarParams("site.remover", { siteId, slug: "Loja" }),
    ).toThrow(VpsError);
    try {
      montarParams("site.remover", { siteId, slug: "Loja" });
    } catch (e) {
      expect(e).toMatchObject({ status: 400, codigo: "dados_invalidos" });
    }
    // A assinatura cobre exatamente o texto montado.
    const params = montarParams("servidor.coletar", {});
    const msg = mensagemTarefa({
      servidorId: siteId,
      id: siteId,
      seq: 1,
      tipo: "servidor.coletar",
      expiraEm: 1,
      params,
    });
    expect(msg.endsWith("\n{}")).toBe(true);
  });
});
