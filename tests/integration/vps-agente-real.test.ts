// @vitest-environment node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
  Ponta a ponta rápida (§14.D): as rotas REAIS de /api/agente/v1 sobre um
  Postgres em memória (PGlite, com os parsers do postgres-js) e o agente
  REAL em Python, com o ajudante root real em modo teste (socket Unix com
  SO_PEERCRED, nginx/certbot/systemctl falsos de tests/agente/falsos).

  O que só este teste prova: o que o TypeScript assina o Python aceita, o
  que o Python assina o TypeScript aceita, e os formatos de pulso,
  resultado e artefato batem nos dois sentidos. Não prova concorrência (o
  PGlite serializa tudo) nem nginx/certbot de verdade.

  O painel é um http.createServer em 127.0.0.1 que adapta cada pedido para
  NextRequest e chama o handler da rota; nada de next/server é trocado.
*/

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => estado.db,
  isDatabaseConfigured: () => true,
}));
// A conferência pública ("No ar") iria à internet pelo IP do servidor.
// Ela tem teste próprio (vps-conferencia); aqui só não pode sair da máquina.
vi.mock("@/features/vps/conferencia", async (original) => ({
  ...(await original<typeof import("@/features/vps/conferencia")>()),
  conferirPublico: async (alvo: { dominio: string; versaoId?: string }) => ({
    estado: "ok",
    url: `http://${alvo.dominio}/`,
    em: new Date().toISOString(),
    status: 200,
    detalhe: null,
    versaoId: alvo.versaoId ?? null,
  }),
}));

import { POST as registrarPOST } from "@/app/api/agente/v1/registrar/route";
import { POST as pulsoPOST } from "@/app/api/agente/v1/pulso/route";
import { POST as resultadoPOST } from "@/app/api/agente/v1/tarefas/[tarefaId]/resultado/route";
import { GET as artefatoGET } from "@/app/api/agente/v1/artefatos/[artefatoId]/route";
import {
  vpsArtifacts,
  vpsJobs,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import { PAGINA_DE_ESPERA } from "@/features/vps/modelo";
import { inspecionarZip } from "@/features/vps/pacote-zip";
import {
  ativarVersao,
  confirmarServidor,
  criarServidor,
  criarSite,
  informarIp,
  lerAgora,
  publicarZip,
  reaplicarSite,
  removerServidor,
  removerSite,
  verificarDns,
} from "@/features/vps/servico";

import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  type BancoDeTeste,
} from "../helpers/pglite";

const REPO = path.resolve(__dirname, "../..");
const PUBLICO = path.join(REPO, "public/agente/v1");
const FIXTURES = path.join(REPO, "tests/fixtures/vps");
const POR = "dono@e2e-teste.com.br";
const ORIGEM = "https://checkout-e2e.com.br";
const IP_DO_SERVIDOR = "45.10.20.30";

/** O primeiro Python ≥ 3.10 da máquina (o agente não roda em versão menor). */
function acharPython(): string | null {
  for (const nome of [
    "python3.13",
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
  ]) {
    // Caminho absoluto: os processos do teste rodam com um PATH mínimo.
    const r = spawnSync(
      nome,
      [
        "-c",
        "import sys; print(sys.executable if sys.version_info >= (3, 10) else '')",
      ],
      { encoding: "utf8" },
    );
    const executavel = r.status === 0 ? r.stdout.trim() : "";
    if (executavel) return executavel;
  }
  return null;
}
const PYTHON = acharPython();

/** Ambiente mínimo dos processos Python: nada do ambiente do teste vaza. */
const AMBIENTE_PYTHON: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PATH: "/usr/bin:/bin",
  PYTHONDONTWRITEBYTECODE: "1",
};

type Saida = { codigo: number | null; stdout: string; stderr: string };

// ---------------------------------------------------------------------------
// O painel: http.createServer → handlers reais
// ---------------------------------------------------------------------------

const adaptador = {
  /** Derruba a conexão do próximo pulso que levaria tarefa (a resposta some). */
  perderPulsoComTarefa: false,
  /**
   * Responde 503 aos resultados desta tarefa (sem chamar a rota) até o
   * painel entregá-la de novo: força o caminho da reentrega com diário.
   */
  segurarResultadoDe: null as string | null,
  resultadosRecusados: 0,
  pulsosComTarefa: [] as string[],
};

async function atender(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  base: string,
): Promise<void> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  const corpo = Buffer.concat(partes);
  const url = new URL(req.url ?? "/", base);
  const cabecalhos = new Headers();
  for (const [nome, valor] of Object.entries(req.headers))
    if (typeof valor === "string") cabecalhos.set(nome, valor);
  const pedido = new NextRequest(url, {
    method: req.method,
    headers: cabecalhos,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : corpo,
  });

  let resposta: Response;
  const caminho = url.pathname;
  const resultado = /^\/api\/agente\/v1\/tarefas\/([^/]+)\/resultado$/.exec(
    caminho,
  );
  const artefato = /^\/api\/agente\/v1\/artefatos\/([^/]+)$/.exec(caminho);
  if (caminho === "/api/agente/v1/registrar" && req.method === "POST") {
    resposta = await registrarPOST(pedido);
  } else if (caminho === "/api/agente/v1/pulso" && req.method === "POST") {
    resposta = await pulsoPOST(pedido);
    const dados = (await resposta.clone().json()) as {
      tarefa?: { id: string } | null;
    };
    if (dados.tarefa) {
      adaptador.pulsosComTarefa.push(dados.tarefa.id);
      if (adaptador.perderPulsoComTarefa) {
        // O painel já marcou a tarefa como entregue; o agente não fica sabendo.
        adaptador.perderPulsoComTarefa = false;
        req.socket.destroy();
        return;
      }
    }
  } else if (resultado && req.method === "POST") {
    const segurado = adaptador.segurarResultadoDe;
    if (
      segurado === resultado[1] &&
      adaptador.pulsosComTarefa.filter((id) => id === segurado).length < 2
    ) {
      adaptador.resultadosRecusados += 1;
      resposta = Response.json(
        { ok: false, error: "erro_interno" },
        { status: 503 },
      );
    } else {
      resposta = await resultadoPOST(pedido, {
        params: Promise.resolve({ tarefaId: resultado[1] }),
      });
    }
  } else if (artefato && req.method === "GET") {
    resposta = await artefatoGET(pedido, {
      params: Promise.resolve({ artefatoId: artefato[1] }),
    });
  } else {
    resposta = Response.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const bytes = Buffer.from(await resposta.arrayBuffer());
  const saida: Record<string, string> = {};
  resposta.headers.forEach((valor, nome) => {
    if (nome !== "content-length") saida[nome] = valor;
  });
  saida["content-length"] = String(bytes.length);
  res.writeHead(resposta.status, saida);
  res.end(bytes);
}

// ---------------------------------------------------------------------------
// Estado compartilhado pelos passos (rodam em ordem)
// ---------------------------------------------------------------------------

let banco: BancoDeTeste;
let db: BancoDeTeste["db"];
let workspaceId: string;
let painel: http.Server;
let URL_PAINEL: string;
let RAIZ: string;
let ajudante: ChildProcess | null = null;
let servidorId: string;
let siteId: string;
let versaoA: string;
let versaoB: string;

const caminhoNaRaiz = (...partes: string[]) => path.join(RAIZ, ...partes);
const pastaDoSite = () => caminhoNaRaiz("var/www/dash-funil/loja-e2e");
const vhost = () =>
  caminhoNaRaiz("etc/nginx/sites-available/dash-loja-e2e.conf");
const golden = (nome: string) =>
  readFileSync(path.join(FIXTURES, "golden", nome), "utf8");

/** Quantas vezes o nginx falso recarregou (uma por nginx.aplicar/remover). */
function recargasDoNginx(): number {
  const log = caminhoNaRaiz("executados.jsonl");
  if (!existsSync(log)) return 0;
  return readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { programa: string; argv: string[] })
    .filter((l) => l.programa === "systemctl" && l.argv[0] === "reload").length;
}

function rodarAgente(argumentos: string[], entrada = ""): Promise<Saida> {
  return new Promise((resolver, rejeitar) => {
    // Assíncrono de propósito: o painel roda neste mesmo processo.
    const p = spawn(
      PYTHON as string,
      [
        "-I",
        path.join(PUBLICO, "dash_agent.py"),
        ...argumentos,
        "--modo-teste",
        "--raiz",
        RAIZ,
      ],
      {
        env: AMBIENTE_PYTHON,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", rejeitar);
    p.on("close", (codigo) => resolver({ codigo, stdout, stderr }));
    p.stdin.end(entrada);
  });
}

async function umaVez(): Promise<Saida> {
  const r = await rodarAgente(["uma-vez"]);
  if (r.codigo !== 0)
    throw new Error(`uma-vez saiu com ${r.codigo}: ${r.stderr.slice(-2000)}`);
  return r;
}

async function tarefa(id: string) {
  const [t] = await db
    .select({
      status: vpsJobs.status,
      error: vpsJobs.error,
      type: vpsJobs.type,
      result: vpsJobs.result,
    })
    .from(vpsJobs)
    .where(eq(vpsJobs.id, id));
  return t;
}

async function release(id: string) {
  const [r] = await db
    .select({
      status: vpsReleases.status,
      isActive: vpsReleases.isActive,
      artifactId: vpsReleases.artifactId,
      indexSha256: vpsReleases.indexSha256,
      fileCount: vpsReleases.fileCount,
    })
    .from(vpsReleases)
    .where(eq(vpsReleases.id, id));
  return r;
}

async function publicar(arquivo: string): Promise<string> {
  const bytes = readFileSync(path.join(FIXTURES, "zips", arquivo));
  const inspecao = inspecionarZip(bytes);
  if (!inspecao.ok) throw new Error(JSON.stringify(inspecao.problemas));
  const { release: nova, tarefa: t } = await publicarZip(db, {
    workspaceId,
    siteId,
    por: POR,
    nomeDoArquivo: arquivo,
    bytes,
    inspecao,
  });
  expect(t.type).toBe("site.publicar");
  return nova.id;
}

const sha256 = (dados: Buffer | string) =>
  createHash("sha256").update(dados).digest("hex");

// ---------------------------------------------------------------------------

describe.skipIf(!PYTHON)("painel (rotas reais) + agente Python real", () => {
  beforeAll(async () => {
    vi.stubEnv(
      "VPS_CHAVE_MESTRA",
      "chave-mestra-do-teste-ponta-a-ponta-0123456789",
    );
    banco = await criarBancoDeTeste();
    db = banco.db;
    estado.db = db;
    ({ workspaceId } = await criarWorkspaceDeTeste(db));

    RAIZ = mkdtempSync(path.join(os.tmpdir(), "dash-agente-real-"));
    painel = http.createServer((req, res) => {
      atender(req, res, URL_PAINEL).catch((erro) => {
        console.error("[adaptador]", erro);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((ok) => painel.listen(0, "127.0.0.1", ok));
    URL_PAINEL = `http://127.0.0.1:${(painel.address() as AddressInfo).port}`;

    ajudante = spawn(
      PYTHON as string,
      [
        "-I",
        path.join(PUBLICO, "dash_agent_root.py"),
        "servir",
        "--modo-teste",
        "--raiz",
        RAIZ,
        "--uid-agente",
        String(process.getuid?.() ?? 0),
        "--executor",
        "simulado",
      ],
      {
        env: AMBIENTE_PYTHON,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    const socket = caminhoNaRaiz("run/dash-agent-root/root.sock");
    await vi.waitFor(
      () => {
        if (!existsSync(socket)) throw new Error("o ajudante root não subiu");
      },
      { timeout: 10_000, interval: 50 },
    );
  }, 60_000);

  afterAll(async () => {
    ajudante?.kill("SIGTERM");
    await new Promise<void>((ok) => (painel ? painel.close(() => ok()) : ok()));
    if (RAIZ) rmSync(RAIZ, { recursive: true, force: true });
    await banco?.pg.close();
    vi.unstubAllEnvs();
  });

  it("registrar: código pelo stdin, token nasce na VPS e só o sha256 vem ao painel", async () => {
    const criado = await criarServidor(db, {
      workspaceId,
      nome: "VPS E2E",
      por: POR,
      painel: URL_PAINEL,
    });
    servidorId = criado.servidorId;

    const r = await rodarAgente(
      ["registrar", "--painel", URL_PAINEL],
      `${criado.codigo}\n`,
    );
    expect(r.codigo, r.stderr).toBe(0);

    const cfg = JSON.parse(
      readFileSync(caminhoNaRaiz("var/lib/dash-agent/agente.json"), "utf8"),
    ) as { servidorId: string; token: string; geracao: number };
    expect(cfg.servidorId).toBe(servidorId);
    expect(cfg.geracao).toBe(1);
    const [srv] = await db
      .select({
        status: vpsServers.status,
        tokenHash: vpsServers.agentTokenHash,
        enrollCodeHash: vpsServers.enrollCodeHash,
      })
      .from(vpsServers)
      .where(eq(vpsServers.id, servidorId));
    expect(srv.status).toBe("aguardando_confirmacao");
    expect(srv.tokenHash).toBe(sha256(cfg.token));
    expect(srv.enrollCodeHash).toBeNull();

    // Uso único: o mesmo código de novo dá 401 invalid_code (sai com 2).
    const segunda = await rodarAgente(
      ["registrar", "--painel", URL_PAINEL],
      `${criado.codigo}\n`,
    );
    expect(segunda.codigo).toBe(2);
    expect(segunda.stderr).toContain("inválido, vencido ou já usado");
  }, 60_000);

  it("antes do 'é o meu' não há tarefa; depois, a coleta traz a visão geral real", async () => {
    await umaVez();
    expect(adaptador.pulsosComTarefa).toEqual([]);

    await confirmarServidor(db, {
      workspaceId,
      servidorId,
      resposta: "sim",
      por: POR,
    });
    const coleta = await lerAgora(db, { workspaceId, servidorId, por: POR });
    await umaVez();

    const t = await tarefa(coleta.id);
    expect(t.status).toBe("concluida");
    expect(t.result).toMatchObject({ bytes: expect.any(Number) });
    const [srv] = await db
      .select({
        visao: vpsServers.lastOverview,
        em: vpsServers.lastOverviewAt,
        erro: vpsServers.lastOverviewError,
        agentLastSeq: vpsServers.agentLastSeq,
      })
      .from(vpsServers)
      .where(eq(vpsServers.id, servidorId));
    expect(srv.erro).toBeNull();
    expect(srv.em).toBeInstanceOf(Date);
    // A saída real do OVERVIEW deste container, lida pelo parser do painel.
    expect(srv.visao).toMatchObject({
      hostname: expect.any(String),
      memory: { totalBytes: expect.any(Number) },
      disk: { totalBytes: expect.any(Number) },
    });
    expect(JSON.stringify(srv.visao)).not.toContain('"users"');
    expect(typeof srv.agentLastSeq).toBe("number");
  }, 60_000);

  it("site: pastas, página de espera e o vhost HTTP igual ao golden", async () => {
    const criado = await criarSite(db, {
      workspaceId,
      servidorId,
      nome: "Loja E2E",
      dominio: "loja-e2e.com.br",
      incluirWww: true,
      checkout: null,
      origemCheckout: ORIGEM,
      origens: [ORIGEM],
      hostsReservados: [],
      por: POR,
    });
    siteId = criado.siteId;
    expect(criado.slug).toBe("loja-e2e");
    await umaVez();

    expect(readlinkSync(path.join(pastaDoSite(), "current"))).toBe("vazio");
    expect(
      readFileSync(path.join(pastaDoSite(), "vazio/index.html"), "utf8"),
    ).toBe(PAGINA_DE_ESPERA);
    expect(readFileSync(vhost(), "utf8")).toBe(golden("http-www.conf"));
    const [site] = await db
      .select({
        status: vpsSites.status,
        aplicado: vpsSites.nginxAppliedAt,
        presente: vpsSites.reportedPresent,
        informa: vpsSites.reportedRelease,
      })
      .from(vpsSites)
      .where(eq(vpsSites.id, siteId));
    expect(site.status).toBe("ativo");
    expect(site.aplicado).toBeInstanceOf(Date);
    expect(site.presente).toBe(true);
    expect(site.informa).toBe("vazio");
  }, 60_000);

  it("publicar A, publicar B e voltar para A: current troca e o banco acompanha", async () => {
    versaoA = await publicar("site-a.zip");
    await umaVez();
    expect(readlinkSync(path.join(pastaDoSite(), "current"))).toBe(
      `releases/${versaoA}`,
    );
    const indexA = readFileSync(path.join(pastaDoSite(), "current/index.html"));
    expect(indexA.toString("utf8")).toContain("Versão A");
    const a = await release(versaoA);
    expect(a).toMatchObject({ status: "no_servidor", isActive: true });
    expect(a.indexSha256).toBe(sha256(indexA));
    // O ZIP sai do banco quando a publicação termina.
    expect(
      await db
        .select({ id: vpsArtifacts.id })
        .from(vpsArtifacts)
        .where(eq(vpsArtifacts.id, a.artifactId as string)),
    ).toEqual([]);

    versaoB = await publicar("site-b.zip");
    await umaVez();
    expect(readlinkSync(path.join(pastaDoSite(), "current"))).toBe(
      `releases/${versaoB}`,
    );
    expect(
      readFileSync(path.join(pastaDoSite(), "current/index.html"), "utf8"),
    ).toContain("Versão B");
    expect(await release(versaoA)).toMatchObject({
      status: "no_servidor",
      isActive: false,
    });
    expect(await release(versaoB)).toMatchObject({
      status: "no_servidor",
      isActive: true,
    });

    // "Voltar para esta": nada é reenviado, a pasta de A continua lá.
    const volta = await ativarVersao(db, {
      workspaceId,
      versaoId: versaoA,
      por: POR,
    });
    await umaVez();
    expect((await tarefa(volta.tarefaId)).status).toBe("concluida");
    expect(readlinkSync(path.join(pastaDoSite(), "current"))).toBe(
      `releases/${versaoA}`,
    );
    expect(await release(versaoA)).toMatchObject({ isActive: true });
    expect(await release(versaoB)).toMatchObject({ isActive: false });
    // Arquivos da versão com modos que o nginx (www-data) lê.
    const pasta = path.join(pastaDoSite(), "releases", versaoA);
    expect(readdirSync(pasta)).toEqual(
      expect.arrayContaining(["index.html", "css", ".dash-release.json"]),
    );
  }, 90_000);

  it("HTTPS: DNS certo pede o certificado sozinho; vhost https igual ao golden", async () => {
    await informarIp(db, { workspaceId, servidorId, ip: IP_DO_SERVIDOR });
    const dns = await verificarDns(db, {
      workspaceId,
      siteId,
      email: POR,
      por: POR,
      resolvedor: {
        resolve4: async () => [IP_DO_SERVIDOR],
        resolve6: async () => [],
      },
    });
    expect(dns.dominios.map((d) => d.status)).toEqual(["ok", "ok"]);
    expect(dns.httpsPedido).toBe(true);
    await umaVez();

    const [site] = await db
      .select({
        tls: vpsSites.tlsStatus,
        validade: vpsSites.tlsExpiresAt,
        erro: vpsSites.tlsError,
      })
      .from(vpsSites)
      .where(eq(vpsSites.id, siteId));
    expect(site.erro).toBeNull();
    expect(site.tls).toBe("ativo");
    // Validade lida pelo openssl de verdade no certificado que o certbot falso criou.
    expect(site.validade?.getTime()).toBeGreaterThan(Date.now());
    expect(
      existsSync(
        caminhoNaRaiz("etc/letsencrypt/live/dash-loja-e2e/fullchain.pem"),
      ),
    ).toBe(true);
    expect(readFileSync(vhost(), "utf8")).toBe(golden("https.conf"));
  }, 90_000);

  it("resposta de pulso perdida: a mesma tarefa volta e roda uma vez só", async () => {
    const antes = recargasDoNginx();
    const t = await reaplicarSite(db, { workspaceId, siteId, por: POR });
    adaptador.perderPulsoComTarefa = true;
    adaptador.pulsosComTarefa = [];
    await umaVez();
    // Entregue duas vezes (a primeira resposta se perdeu), executada uma.
    expect(adaptador.pulsosComTarefa).toEqual([t.tarefaId, t.tarefaId]);
    expect((await tarefa(t.tarefaId)).status).toBe("concluida");
    expect(recargasDoNginx()).toBe(antes + 1);
    expect(readFileSync(vhost(), "utf8")).toBe(golden("https.conf"));
  }, 60_000);

  it("resultado que não chega: o painel reentrega e o diário reenvia sem executar de novo", async () => {
    const antes = recargasDoNginx();
    const t = await reaplicarSite(db, { workspaceId, siteId, por: POR });
    adaptador.segurarResultadoDe = t.tarefaId;
    adaptador.resultadosRecusados = 0;
    adaptador.pulsosComTarefa = [];
    await umaVez();
    adaptador.segurarResultadoDe = null;
    // 3 tentativas logo depois de executar, mais o reenvio pelo diário no
    // começo de cada volta; a reentrega não executa, só reenvia.
    expect(adaptador.resultadosRecusados).toBeGreaterThanOrEqual(4);
    expect(adaptador.pulsosComTarefa).toEqual([t.tarefaId, t.tarefaId]);
    expect((await tarefa(t.tarefaId)).status).toBe("concluida");
    expect(recargasDoNginx()).toBe(antes + 1);
  }, 60_000);

  it("params trocados no banco: 'assinatura_invalida' e nada muda no disco", async () => {
    const antesVhost = readFileSync(vhost());
    const antes = recargasDoNginx();
    const t = await reaplicarSite(db, { workspaceId, siteId, por: POR });
    await db
      .update(vpsJobs)
      .set({
        params: sql`replace(${vpsJobs.params}, 'loja-e2e.com.br', 'loja-e2f.com.br')`,
      })
      .where(eq(vpsJobs.id, t.tarefaId));
    await umaVez();
    const final = await tarefa(t.tarefaId);
    expect(final.status).toBe("falhou");
    expect(final.error).toMatch(/^assinatura_invalida/);
    expect(readFileSync(vhost()).equals(antesVhost)).toBe(true);
    expect(recargasDoNginx()).toBe(antes);
  }, 60_000);

  it("remover o site: sai do nginx, vai para a lixeira e some do painel", async () => {
    const t = await removerSite(db, {
      workspaceId,
      siteId,
      confirmacao: "loja-e2e.com.br",
      por: POR,
    });
    await umaVez();
    expect((await tarefa(t.tarefaId)).status).toBe("concluida");
    expect(existsSync(vhost())).toBe(false);
    expect(existsSync(pastaDoSite())).toBe(false);
    expect(
      readdirSync(caminhoNaRaiz("var/www/dash-funil/.lixeira")).some((n) =>
        n.startsWith("loja-e2e-"),
      ),
    ).toBe(true);
    const [site] = await db
      .select({ removidoEm: vpsSites.deletedAt })
      .from(vpsSites)
      .where(eq(vpsSites.id, siteId));
    expect(site.removidoEm).toBeInstanceOf(Date);
    expect(
      await db
        .select({ id: vpsSiteDomains.id })
        .from(vpsSiteDomains)
        .where(eq(vpsSiteDomains.siteId, siteId)),
    ).toEqual([]);
    const ativas = await db
      .select({ id: vpsReleases.id })
      .from(vpsReleases)
      .where(
        and(eq(vpsReleases.siteId, siteId), eq(vpsReleases.isActive, true)),
      );
    expect(ativas).toEqual([]);
  }, 60_000);

  it("remover o servidor revoga: o agente leva o 401 com a marca e sai com 3", async () => {
    await removerServidor(db, {
      workspaceId,
      servidorId,
      confirmacao: "VPS E2E",
    });
    const r = await rodarAgente(["uma-vez"]);
    expect(r.codigo, r.stderr).toBe(3);
    expect(existsSync(caminhoNaRaiz("var/lib/dash-agent/revogado"))).toBe(true);
    // Revogado fica revogado: sem reconectar, nem tenta falar com o painel.
    const outra = await rodarAgente(["uma-vez"]);
    expect(outra.codigo).toBe(3);
  }, 60_000);
});
