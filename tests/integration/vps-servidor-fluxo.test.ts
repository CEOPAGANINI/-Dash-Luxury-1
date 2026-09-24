// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { crc32 } from "node:zlib";

import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
  O lado Vercel do Servidor do Funil de ponta a ponta, contra um Postgres
  de verdade (PGlite com os parsers do postgres-js: int8 cru volta
  string). As rotas do agente e do painel são chamadas como o Next chama
  (NextRequest, params como Promise), e as server actions como o
  useActionState chama. O "agente" aqui é um cliente falso que assina
  cada pedido como o dash_agent.py.

  Mocks: o banco (getDb → PGlite), a sessão (dono confirmado, com login
  recente ou antigo), next/cache e o after() (roda na hora; o teste
  espera as promessas antes de conferir a auditoria).
*/

const estado = vi.hoisted(() => ({
  db: null as unknown,
  sessao: null as unknown,
  momento: null as Date | null,
  pendentes: [] as Array<Promise<unknown>>,
  /** true: qualquer getDb() é erro (o modo demo não pode tocar no banco). */
  proibirBanco: false,
}));

vi.mock("@/database/client", () => ({
  getDb: () => {
    if (estado.proibirBanco) throw new Error("getDb chamado no modo demo");
    return estado.db;
  },
  isDatabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  })),
}));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...real,
    getSession: vi.fn(async () => estado.sessao),
    momentoDaAutenticacao: vi.fn(async () => estado.momento),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino });
  }),
}));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (tarefa: () => unknown) => {
      estado.pendentes.push(Promise.resolve().then(tarefa));
    },
  };
});

import { GET as baixarArtefato } from "@/app/api/agente/v1/artefatos/[artefatoId]/route";
import { POST as pulsoPOST } from "@/app/api/agente/v1/pulso/route";
import { POST as registrarPOST } from "@/app/api/agente/v1/registrar/route";
import { POST as resultadoPOST } from "@/app/api/agente/v1/tarefas/[tarefaId]/resultado/route";
import { GET as estadoGET } from "@/app/api/painel/vps/estado/route";
import { POST as publicarPOST } from "@/app/api/painel/vps/publicar/route";
import {
  auditLogs,
  checkouts,
  products,
  vpsArtifacts,
  vpsJobs,
  vpsOperationAttempts,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import { DEMO_USER } from "@/lib/auth/session";
import * as acoes from "@/features/vps/actions";
import {
  canonicoPedido,
  hmacHex,
  mensagemTarefa,
  sha256hex,
} from "@/features/vps/chaves";
import { zerarLimiteIp } from "@/features/vps/limite-ip";
import {
  MENSAGEM_CERTIFICADO_AUSENTE,
  PAGINA_DE_ESPERA,
  type TipoTarefa,
} from "@/features/vps/modelo";
import { conferirSite, verificarDns } from "@/features/vps/servico";
import type { ResolvedorDns } from "@/features/vps/dns";

import { criarBancoDeTeste, type BancoDeTeste } from "../helpers/pglite";

const MESTRA = "m".repeat(48);
const DONO = "dono@e2e-teste.com.br";
const APP = "https://dash-board-psi-one.vercel.app";
const ORIGEM_EXTRA = "https://checkout-e2e.com.br";
/** Um IPv4 público qualquer (os de documentação não passam em isPublicIpv4). */
const IP_DA_VPS = "45.33.10.20";
const ZIPS = path.resolve(__dirname, "../fixtures/vps/zips");

let banco: BancoDeTeste;
let db: BancoDeTeste["db"];
let contador = 0;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  db = banco.db;
  estado.db = db;
}, 60_000);

beforeEach(async () => {
  vi.stubEnv("VPS_CHAVE_MESTRA", MESTRA);
  vi.stubEnv("VPS_DONOS", `${DONO}, outra-conta-id`);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
  vi.stubEnv("VPS_CHECKOUT_ORIGENS", ORIGEM_EXTRA);
  vi.stubEnv("VERCEL_ENV", "production");
  estado.sessao = sessaoDoDono();
  estado.momento = new Date();
  estado.proibirBanco = false;
  zerarLimiteIp();
  await limparTentativas();
});

afterEach(async () => {
  await drenar();
  vi.unstubAllEnvs();
});

function sessaoDoDono(mudancas: Record<string, unknown> = {}) {
  return {
    user: {
      id: "conta-do-dono",
      email: DONO,
      name: "Dono",
      emailConfirmado: true,
      ...mudancas,
    },
    demoMode: false,
  };
}

async function drenar(): Promise<void> {
  while (estado.pendentes.length) await Promise.all(estado.pendentes.splice(0));
}

async function limparTentativas(): Promise<void> {
  await db.delete(vpsOperationAttempts);
}

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [chave, valor] of Object.entries(campos)) f.append(chave, valor);
  return f;
}

type Envelope = {
  id: string;
  seq: number;
  tipo: TipoTarefa;
  params: string;
  expiraEm: number;
  assinatura: string;
};

/** O agente da VPS, do jeito que o dash_agent.py fala com o painel. */
class AgenteFalso {
  servidorId = "";
  token = randomBytes(32).toString("base64url");
  chavePedidos = Buffer.alloc(0);
  chaveTarefas = Buffer.alloc(0);
  ultimaSeqTarefa = -1;
  /** A última seq de pedido usada (como o estado.json do agente). */
  seqPedido = 0;

  proximaSeq(): number {
    this.seqPedido = Math.max(this.seqPedido + 1, Date.now());
    return this.seqPedido;
  }

  async registrar(codigo: string, ip = IP_DA_VPS) {
    const corpo = {
      codigo,
      tokenHash: sha256hex(this.token),
      agente: {
        versao: "1.0.0",
        hostname: "srv-teste",
        so: "Ubuntu 24.04.1 LTS",
        python: "3.12.3",
        nginx: "1.24.0",
        certbot: "2.9.0",
        ipv4: [ip, "10.0.0.5"],
        ipv6: [],
      },
    };
    const resposta = await registrarPOST(
      new NextRequest(`${APP}/api/agente/v1/registrar`, {
        method: "POST",
        body: JSON.stringify(corpo),
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
      }),
    );
    const json = await resposta.json();
    if (resposta.status === 200) {
      this.servidorId = json.servidorId;
      this.chavePedidos = Buffer.from(json.chavePedidos, "base64url");
      this.chaveTarefas = Buffer.from(json.chaveTarefas, "base64url");
      this.ultimaSeqTarefa = json.ultimaSeqTarefa;
    }
    return { status: resposta.status, json };
  }

  pedido(
    metodo: "POST" | "GET",
    caminho: string,
    corpo?: unknown,
    opcoes: { seq?: number; chave?: Buffer } = {},
  ): NextRequest {
    const bytes =
      corpo === undefined
        ? Buffer.alloc(0)
        : Buffer.from(JSON.stringify(corpo));
    const seq = String(opcoes.seq ?? this.proximaSeq());
    const assinatura = hmacHex(
      opcoes.chave ?? this.chavePedidos,
      canonicoPedido(metodo, caminho, this.servidorId, seq, bytes),
    );
    return new NextRequest(`${APP}${caminho}`, {
      method: metodo,
      body: metodo === "POST" ? bytes : undefined,
      headers: {
        authorization: `Bearer ${this.token}`,
        "x-dash-servidor": this.servidorId,
        "x-dash-seq": seq,
        "x-dash-assinatura": `v1=${assinatura}`,
        "content-type": "application/json",
        "x-forwarded-for": IP_DA_VPS,
      },
    });
  }

  /** Tira o freio de 1 s (os pulsos do teste saem em milissegundos). */
  async esfriar(): Promise<void> {
    await db
      .update(vpsServers)
      .set({ lastPulseAt: sql`now() - interval '5 seconds'` })
      .where(eq(vpsServers.id, this.servidorId));
  }

  async pulsar(
    extra: Record<string, unknown> = {},
    opcoes: { esfriar?: boolean; seq?: number } = {},
  ) {
    if (opcoes.esfriar !== false) await this.esfriar();
    const corpo = {
      versao: "1.0.0",
      travas: { pausado: false, somenteLeitura: false },
      executando: null,
      desvioMs: 0,
      ipv4: [IP_DA_VPS],
      ipv6: [],
      visaoGeral: null,
      nginx: null,
      certificados: null,
      sites: null,
      ...extra,
    };
    const resposta = await pulsoPOST(
      this.pedido("POST", "/api/agente/v1/pulso", corpo, { seq: opcoes.seq }),
    );
    return {
      status: resposta.status,
      cabecalhos: resposta.headers,
      json: await resposta.json(),
    };
  }

  async resultado(
    tarefa: { id: string; seq: number },
    estadoFinal: "concluida" | "falhou",
    resultado: unknown,
    erro: string | null = null,
  ) {
    const caminho = `/api/agente/v1/tarefas/${tarefa.id}/resultado`;
    const resposta = await resultadoPOST(
      this.pedido("POST", caminho, {
        seq: tarefa.seq,
        estado: estadoFinal,
        resultado,
        erro,
        duracaoMs: 120,
      }),
      { params: Promise.resolve({ tarefaId: tarefa.id }) },
    );
    await drenar();
    return { status: resposta.status, json: await resposta.json() };
  }

  async baixar(artefatoId: string) {
    return baixarArtefato(
      this.pedido("GET", `/api/agente/v1/artefatos/${artefatoId}`),
      { params: Promise.resolve({ artefatoId }) },
    );
  }

  /** A assinatura da tarefa confere com a mensagem RECALCULADA do envelope. */
  assinaturaConfere(t: Envelope): boolean {
    return (
      hmacHex(
        this.chaveTarefas,
        mensagemTarefa({
          servidorId: this.servidorId,
          id: t.id,
          seq: t.seq,
          tipo: t.tipo,
          expiraEm: t.expiraEm,
          params: t.params,
        }),
      ) === t.assinatura
    );
  }
}

// ---------------------------------------------------------------------------
// Montagem pelo painel
// ---------------------------------------------------------------------------

async function criarServidorPeloPainel() {
  await limparTentativas();
  const nome = `VPS ${++contador}`;
  const r = await acoes.criarServidorAction(null, form({ nome }));
  expect(r.ok, r.mensagem).toBe(true);
  const comando = r.dados!.instalacao.comando;
  const codigo = /printf '%s\\n' '([A-Za-z0-9_-]{43})'/.exec(comando)![1];
  return { servidorId: r.dados!.servidorId, codigo, nome, comando };
}

async function servidorRegistrado() {
  const s = await criarServidorPeloPainel();
  const agente = new AgenteFalso();
  const r = await agente.registrar(s.codigo);
  expect(r.status).toBe(200);
  return { ...s, agente };
}

async function servidorAtivo() {
  const s = await servidorRegistrado();
  await limparTentativas();
  const r = await acoes.confirmarServidorAction(
    null,
    form({ servidorId: s.servidorId, resposta: "sim" }),
  );
  expect(r.ok, r.mensagem).toBe(true);
  return s;
}

async function criarSite(
  servidorId: string,
  campos: Partial<Record<string, string>> = {},
) {
  await limparTentativas();
  const n = ++contador;
  const r = await acoes.criarSiteAction(
    null,
    form({
      servidorId,
      nome: `Loja ${n}`,
      dominio: `loja-${n}.com.br`,
      incluirWww: "nao",
      checkoutId: "nenhum",
      ...campos,
    } as Record<string, string>),
  );
  return r;
}

async function siteConfigurado(s: Awaited<ReturnType<typeof servidorAtivo>>) {
  const r = await criarSite(s.servidorId);
  expect(r.ok, r.mensagem).toBe(true);
  const p = await s.agente.pulsar();
  expect(p.json.tarefa.tipo).toBe("site.configurar");
  const feito = await s.agente.resultado(p.json.tarefa, "concluida", {
    modo: "http",
    aplicadoEm: new Date().toISOString(),
  });
  expect(feito.status).toBe(200);
  const [site] = await db
    .select()
    .from(vpsSites)
    .where(eq(vpsSites.id, r.dados!.siteId));
  return site;
}

async function enviarZip(
  siteId: string,
  zip: Buffer,
  opcoes: { origem?: string; nome?: string; tamanhoDeclarado?: number } = {},
) {
  await limparTentativas();
  const fd = new FormData();
  fd.append("siteId", siteId);
  fd.append(
    "arquivo",
    new File([new Uint8Array(zip)], opcoes.nome ?? "site.zip", {
      type: "application/zip",
    }),
  );
  const serializado = new Response(fd);
  const corpo = Buffer.from(await serializado.arrayBuffer());
  const resposta = await publicarPOST(
    new NextRequest(`${APP}/api/painel/vps/publicar`, {
      method: "POST",
      body: corpo,
      headers: {
        origin: opcoes.origem ?? APP,
        "sec-fetch-site": "same-origin",
        "content-type": serializado.headers.get("content-type")!,
        "content-length": String(opcoes.tamanhoDeclarado ?? corpo.length),
      },
    }),
  );
  await drenar();
  return { status: resposta.status, json: await resposta.json() };
}

/** Publica o ZIP e conclui a tarefa como o agente concluiria. */
async function publicarEConcluir(
  s: Awaited<ReturnType<typeof servidorAtivo>>,
  siteId: string,
  zip: Buffer,
  removidas: string[] = [],
) {
  const enviado = await enviarZip(siteId, zip);
  expect(enviado.status, JSON.stringify(enviado.json)).toBe(201);
  const p = await s.agente.pulsar();
  expect(p.json.tarefa.tipo).toBe("site.publicar");
  const params = JSON.parse(p.json.tarefa.params);
  const r = await s.agente.resultado(p.json.tarefa, "concluida", {
    versaoId: params.versaoId,
    anterior: "vazio",
    ativadaEm: new Date().toISOString(),
    repetida: false,
    arquivos: 3,
    bytesDescompactados: 900,
    removidas,
  });
  expect(r.status).toBe(200);
  return { versaoId: params.versaoId as string, tarefa: p.json.tarefa };
}

/** ZIP mínimo (sem compressão) para os casos de recusa. */
function zipGuardado(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const [nomeTexto, texto] of Object.entries(arquivos)) {
    const nome = Buffer.from(nomeTexto);
    const dados = Buffer.from(texto);
    const crc = crc32(dados) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(deslocamento, 42);
    locais.push(local, nome, dados);
    centrais.push(central, nome);
    deslocamento += 30 + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const ZIP_A = () => readFileSync(path.join(ZIPS, "site-a.zip"));
const ZIP_B = () => readFileSync(path.join(ZIPS, "site-b.zip"));

async function lerEstado(consulta = "") {
  const resposta = await estadoGET(
    new NextRequest(`${APP}/api/painel/vps/estado${consulta}`),
  );
  return { status: resposta.status, json: await resposta.json() };
}

/** Todas as chaves de um JSON, em qualquer profundidade. */
function chavesDe(valor: unknown, saida = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) for (const v of valor) chavesDe(v, saida);
  else if (valor && typeof valor === "object")
    for (const [chave, v] of Object.entries(valor)) {
      saida.add(chave);
      chavesDe(v, saida);
    }
  return saida;
}

// ---------------------------------------------------------------------------

describe("guarda do painel (exigirDonoDaVps)", () => {
  it("modo demo: nenhuma linha, nenhum getDb, 401 no estado", async () => {
    estado.sessao = { user: DEMO_USER, demoMode: true };
    estado.proibirBanco = true;
    const r = await acoes.criarServidorAction(null, form({ nome: "x" }));
    expect(r).toMatchObject({ ok: false, codigo: "modo_demo" });
    expect(r.mensagem).toBe("Comandar servidor exige login real.");
    const e = await lerEstado();
    expect(e.status).toBe(401);
    expect(e.json.codigo).toBe("modo_demo");
    estado.proibirBanco = false;
  });

  it("e-mail não confirmado ou fora de VPS_DONOS: sem_permissao", async () => {
    estado.sessao = sessaoDoDono({ emailConfirmado: false });
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "sem_permissao" });
    estado.sessao = sessaoDoDono({ email: "outro@e2e-teste.com.br" });
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "sem_permissao" });
    // Pelo id da conta vale mesmo sem e-mail confirmado.
    estado.sessao = sessaoDoDono({
      id: "outra-conta-id",
      email: "x@e2e-teste.com.br",
      emailConfirmado: false,
    });
    expect(
      (await acoes.criarServidorAction(null, form({ nome: "pelo id" }))).ok,
    ).toBe(true);
  });

  it("login antigo (ou sem amr) é recusado nas ações sensíveis", async () => {
    estado.momento = new Date(Date.now() - 13 * 3_600_000);
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "login_antigo" });
    estado.momento = null;
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "login_antigo" });
  });

  it("sem VPS_CHAVE_MESTRA: sem_chave; painel fora do https: sem_https", async () => {
    vi.stubEnv("VPS_CHAVE_MESTRA", "curta");
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "sem_chave" });
    vi.stubEnv("VPS_CHAVE_MESTRA", MESTRA);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "sem_https" });
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(
      await acoes.criarServidorAction(null, form({ nome: "x" })),
    ).toMatchObject({ ok: false, codigo: "sem_https" });
  });

  it("a 11ª ação no mesmo minuto dá 429 limite", async () => {
    const s = await servidorAtivo();
    await limparTentativas();
    for (let i = 0; i < 10; i++) {
      const r = await acoes.lerAgoraAction(
        null,
        form({ servidorId: s.servidorId }),
      );
      expect(r.ok, r.mensagem).toBe(true);
    }
    const r = await acoes.lerAgoraAction(
      null,
      form({ servidorId: s.servidorId }),
    );
    expect(r).toMatchObject({ ok: false, codigo: "limite" });
  });

  it("campos inválidos voltam com erros por campo", async () => {
    const r = await acoes.criarServidorAction(null, form({ nome: "  " }));
    expect(r).toMatchObject({ ok: false, codigo: "dados_invalidos" });
    expect(r.erros?.nome).toBeTruthy();
  });
});

describe("criar e registrar", () => {
  it("o código só aparece no comando; nenhuma coluna guarda o código", async () => {
    const s = await criarServidorPeloPainel();
    expect(s.comando).toContain(`${APP}/agente/v1/instalar.sh`);
    expect(s.comando).toContain("sha256sum -c");
    expect(s.comando).toContain(`--painel ${APP}`);
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(JSON.stringify(linha)).not.toContain(s.codigo);
    expect(linha.enrollCodeHash).toBe(sha256hex(s.codigo));
    expect(linha.status).toBe("aguardando_agente");
  });

  it("registrar dá 200 com números de verdade; segundo uso e código vencido dão 401", async () => {
    const s = await criarServidorPeloPainel();
    const agente = new AgenteFalso();
    const r = await agente.registrar(s.codigo);
    expect(r.status).toBe(200);
    expect(typeof r.json.geracao).toBe("number");
    expect(typeof r.json.ultimaSeqTarefa).toBe("number");
    expect(r.json).toMatchObject({
      ok: true,
      servidorId: s.servidorId,
      geracao: 1,
      ultimaSeqTarefa: 0,
      proximoPulsoEm: 5,
    });
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha).toMatchObject({
      status: "aguardando_confirmacao",
      agentTokenHash: sha256hex(agente.token),
      enrollCodeHash: null,
      hostname: "srv-teste",
      publicIpv4: [IP_DA_VPS], // o IP privado ficou de fora
    });

    const deNovo = await new AgenteFalso().registrar(s.codigo);
    expect(deNovo.status).toBe(401);
    expect(deNovo.json).toEqual({ ok: false, error: "invalid_code" });

    const outro = await criarServidorPeloPainel();
    await db
      .update(vpsServers)
      .set({ enrollExpiresAt: sql`now() - interval '1 minute'` })
      .where(eq(vpsServers.id, outro.servidorId));
    expect((await new AgenteFalso().registrar(outro.codigo)).status).toBe(401);
    await drenar();
    const [auditoria] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, s.servidorId),
          eq(auditLogs.action, "vps.servidor.registrado"),
        ),
      );
    expect(auditoria.actorId).toBeNull();
    expect(JSON.stringify(auditoria.changes)).not.toContain(s.codigo);
  });

  it("corpo fora do formato dá 400; rajada de um IP dá 429 antes do banco", async () => {
    const r = await registrarPOST(
      new NextRequest(`${APP}/api/agente/v1/registrar`, {
        method: "POST",
        body: JSON.stringify({ codigo: "curto" }),
        headers: { "x-forwarded-for": "45.1.1.1" },
      }),
    );
    expect(r.status).toBe(400);
    let ultima = 0;
    for (let i = 0; i < 31; i++) {
      const resposta = await registrarPOST(
        new NextRequest(`${APP}/api/agente/v1/registrar`, {
          method: "POST",
          body: "{}",
          headers: { "x-forwarded-for": "45.2.2.2" },
        }),
      );
      ultima = resposta.status;
    }
    expect(ultima).toBe(429);
  });
});

describe("pulso", () => {
  it("antes de confirmar: 200 sem tarefa; replay 409 com ultimaSeq number; assinatura ruim 401 com a marca", async () => {
    const s = await servidorRegistrado();
    const p = await s.agente.pulsar();
    expect(p.status).toBe(200);
    expect(p.json.tarefa).toBeNull();
    expect(typeof p.json.agoraMs).toBe("number");
    expect(p.cabecalhos.get("cache-control")).toBe("no-store");

    // O mesmo pedido de novo (mesma seq): replay.
    const mesmaSeq = s.agente.seqPedido;
    const repetido = await s.agente.pulsar({}, { seq: mesmaSeq });
    expect(repetido.status).toBe(409);
    expect(repetido.json.error).toBe("replayed");
    expect(repetido.json.ultimaSeq).toBe(mesmaSeq);
    expect(typeof repetido.json.ultimaSeq).toBe("number");
    // Uma seq mais velha também.
    const antes = await s.agente.pulsar({}, { seq: mesmaSeq - 1000 });
    expect(antes.status).toBe(409);
    expect(antes.json.error).toBe("replayed");

    const falsa = await pulsoPOST(
      s.agente.pedido(
        "POST",
        "/api/agente/v1/pulso",
        { versao: "1" },
        {
          chave: Buffer.alloc(32, 7),
        },
      ),
    );
    expect(falsa.status).toBe(401);
    expect(falsa.headers.get("www-authenticate")).toBe("Dash-HMAC");
    expect(await falsa.json()).toEqual({ ok: false, error: "unauthorized" });

    const semCabecalho = await pulsoPOST(
      new NextRequest(`${APP}/api/agente/v1/pulso`, {
        method: "POST",
        body: "{}",
      }),
    );
    expect(semCabecalho.status).toBe(400);
  });

  it("freio: pulso a menos de 1 s do anterior dá 429 com tenteEm", async () => {
    const s = await servidorRegistrado();
    expect((await s.agente.pulsar()).status).toBe(200);
    const rapido = await s.agente.pulsar({}, { esfriar: false });
    expect(rapido.status).toBe(429);
    expect(rapido.json).toMatchObject({
      error: "too_many_requests",
      tenteEm: 5,
    });
  });

  it("grava sinal, travas, versão do nginx e a leitura sem usuários", async () => {
    const s = await servidorRegistrado();
    const visaoGeral = readFileSync(
      path.resolve(__dirname, "../fixtures/vps/visao-geral-container.txt"),
      "utf8",
    );
    const p = await s.agente.pulsar({
      travas: { pausado: true, somenteLeitura: false },
      desvioMs: 90_000,
      visaoGeral,
      nginx: { versao: "1.24.0", configOk: true, ativo: true },
    });
    expect(p.status).toBe(200);
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha.locks).toEqual({ pausado: true, somenteLeitura: false });
    expect(linha.capabilities).toMatchObject({
      python: "3.12.3",
      desvioRelogioMs: 90_000,
      nginx: { versao: "1.24.0", configOk: true, ativo: true },
    });
    expect(linha.lastOverviewAt).toBeInstanceOf(Date);
    expect(linha.lastOverview).not.toHaveProperty("users");
    expect(linha.lastOverview).not.toHaveProperty("sampledAt");

    const e = await lerEstado(`?servidor=${s.servidorId}`);
    expect(e.json.servidor.relogio).toEqual({ desvioSegundos: 90 });
    expect(e.json.servidor.travas.pausado).toBe(true);
    expect(e.json.servidor.leitura.em).toBe(
      linha.lastOverviewAt!.toISOString(),
    );
    expect(e.json.servidor.leitura.memoria).not.toBeNull();

    // Um pulso sem `nginx` não apaga o que já se sabia; o desvio é o atual.
    await s.agente.pulsar();
    const [depois] = await db
      .select({ capabilities: vpsServers.capabilities })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(depois.capabilities.nginx).toMatchObject({ versao: "1.24.0" });
    expect(depois.capabilities.desvioRelogioMs).toBe(0);
  });

  it("entrega a tarefa com seq e expiraEm number e assinatura que confere; reentrega a mesma", async () => {
    const s = await servidorAtivo();
    const criado = await criarSite(s.servidorId);
    expect(criado.ok, criado.mensagem).toBe(true);

    const p = await s.agente.pulsar();
    expect(p.status).toBe(200);
    expect(p.json.proximoPulsoEm).toBe(5);
    const t = p.json.tarefa as Envelope;
    expect(t.tipo).toBe("site.configurar");
    expect(typeof t.seq).toBe("number");
    expect(typeof t.expiraEm).toBe("number");
    expect(t.seq).toBeGreaterThan(s.agente.ultimaSeqTarefa);
    expect(s.agente.assinaturaConfere(t)).toBe(true);
    expect(JSON.parse(t.params)).toMatchObject({
      siteId: criado.dados!.siteId,
      tls: false,
      checkout: null,
    });

    const [srv] = await db
      .select({ rapido: vpsServers.fastPulseUntil })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(srv.rapido!.getTime()).toBeGreaterThan(Date.now());

    // Resposta do pulso perdida: o próximo pulso sem `executando` recebe a MESMA.
    const de_novo = await s.agente.pulsar();
    expect(de_novo.json.tarefa).toEqual(t);
    // Executando algo: nada novo.
    const ocupado = await s.agente.pulsar({ executando: t.id });
    expect(ocupado.json.tarefa).toBeNull();
    // Pausado na VPS: nada.
    const pausado = await s.agente.pulsar({
      travas: { pausado: true, somenteLeitura: false },
    });
    expect(pausado.json.tarefa).toBeNull();
  });

  it("servidor fora de `ativo` não recebe tarefa", async () => {
    const s = await servidorAtivo();
    await criarSite(s.servidorId);
    await db
      .update(vpsServers)
      .set({ status: "aguardando_confirmacao" })
      .where(eq(vpsServers.id, s.servidorId));
    const p = await s.agente.pulsar();
    expect(p.status).toBe(200);
    expect(p.json.tarefa).toBeNull();
  });

  it("reconciliação: versão sumida vira removida, `atual` define a ativa, slug ausente vira ausente", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const a = await publicarEConcluir(s, site.id, ZIP_A());
    const b = await publicarEConcluir(s, site.id, ZIP_B());
    const ativa = async () =>
      (
        await db
          .select({ id: vpsReleases.id })
          .from(vpsReleases)
          .where(
            and(
              eq(vpsReleases.siteId, site.id),
              eq(vpsReleases.isActive, true),
            ),
          )
      ).map((r) => r.id);
    expect(await ativa()).toEqual([b.versaoId]);

    // O agente diz que A está em current (voltou por fora) e só tem A e B.
    await s.agente.pulsar({
      sites: [
        {
          slug: site.slug,
          atual: a.versaoId,
          versoes: [a.versaoId, b.versaoId],
        },
      ],
    });
    expect(await ativa()).toEqual([a.versaoId]);

    // B sumiu do disco (e o certificado do site foi lido no mesmo pulso).
    await s.agente.pulsar({
      sites: [{ slug: site.slug, atual: a.versaoId, versoes: [a.versaoId] }],
      certificados: [{ slug: site.slug, validoAte: "2026-12-20T10:00:00Z" }],
    });
    const [rb] = await db
      .select({ status: vpsReleases.status, ativa: vpsReleases.isActive })
      .from(vpsReleases)
      .where(eq(vpsReleases.id, b.versaoId));
    expect(rb).toEqual({ status: "removida", ativa: false });
    let [linha] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(linha.reportedPresent).toBe(true);
    expect(linha.reportedRelease).toBe(a.versaoId);
    expect(linha.tlsExpiresAt).toEqual(new Date("2026-12-20T10:00:00Z"));
    expect(linha.tlsCheckedAt).toBeInstanceOf(Date);

    // VPS trocada: o site nem existe lá.
    await s.agente.pulsar({ sites: [] });
    [linha] = await db.select().from(vpsSites).where(eq(vpsSites.id, site.id));
    expect(linha.reportedPresent).toBe(false);
    expect(await ativa()).toEqual([]);
    const e = await lerEstado(`?site=${site.id}`);
    expect(e.json.site.naVps).toBe("ausente");
  });
});

describe("resultado", () => {
  it("coletar grava a leitura (sem usuários) com a hora da gravação", async () => {
    const s = await servidorAtivo();
    await limparTentativas();
    const pedido = await acoes.lerAgoraAction(
      null,
      form({ servidorId: s.servidorId }),
    );
    expect(pedido.ok, pedido.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(p.json.tarefa.tipo).toBe("servidor.coletar");
    expect(p.json.tarefa.params).toBe("{}");
    const visaoGeral = readFileSync(
      path.resolve(__dirname, "../fixtures/vps/visao-geral-container.txt"),
      "utf8",
    );
    expect(
      (await s.agente.resultado(p.json.tarefa, "concluida", { visaoGeral }))
        .status,
    ).toBe(200);
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha.lastOverview).not.toBeNull();
    expect(linha.lastOverview).not.toHaveProperty("users");
    expect(linha.lastOverviewAt).toBeInstanceOf(Date);
    const [job] = await db
      .select({ result: vpsJobs.result })
      .from(vpsJobs)
      .where(eq(vpsJobs.id, p.json.tarefa.id));
    // A saída crua não fica guardada na tarefa.
    expect(JSON.stringify(job.result)).not.toContain("ORBIT_VPS_V1");
  });

  it("ssl concluída liga o HTTPS com a validade", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    await db
      .update(vpsSiteDomains)
      .set({ dnsStatus: "ok", dnsCheckedAt: new Date() })
      .where(eq(vpsSiteDomains.siteId, site.id));
    await limparTentativas();
    const pedido = await acoes.emitirSslAction(null, form({ siteId: site.id }));
    expect(pedido.ok, pedido.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(p.json.tarefa.tipo).toBe("site.ssl_emitir");
    await s.agente.resultado(p.json.tarefa, "concluida", {
      validoAte: "2026-12-22T00:00:00Z",
      dominios: [JSON.parse(p.json.tarefa.params).dominios[0]],
    });
    const [linha] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(linha).toMatchObject({
      tlsStatus: "ativo",
      tlsError: null,
      tlsExpiresAt: new Date("2026-12-22T00:00:00Z"),
    });
  });

  it("configurar: concluída liga o site; repetido 200; outro estado 409; outro servidor 404", async () => {
    const s = await servidorAtivo();
    const criado = await criarSite(s.servidorId);
    const p = await s.agente.pulsar();
    const t = p.json.tarefa as Envelope;
    const ok = await s.agente.resultado(t, "concluida", { modo: "http" });
    expect(ok).toEqual({ status: 200, json: { ok: true, repetido: false } });
    const [site] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, criado.dados!.siteId));
    expect(site.status).toBe("ativo");
    expect(site.nginxAppliedAt).toBeInstanceOf(Date);

    expect(await s.agente.resultado(t, "concluida", { modo: "http" })).toEqual({
      status: 200,
      json: { ok: true, repetido: true },
    });
    const outroEstado = await s.agente.resultado(t, "falhou", null, "x");
    expect(outroEstado.status).toBe(409);
    expect(outroEstado.json.error).toBe("job_not_delivered");

    const intruso = await servidorAtivo();
    const deOutro = await intruso.agente.resultado(t, "concluida", {
      modo: "http",
    });
    expect(deOutro.status).toBe(404);
    expect(deOutro.json.error).toBe("job_not_found");
    const seqErrada = await s.agente.resultado(
      { ...t, seq: t.seq + 1 },
      "concluida",
      {
        modo: "http",
      },
    );
    expect(seqErrada.status).toBe(404);
  });

  it("configurar em HTTP com o site em HTTPS volta para sem_ssl com a mensagem", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    await db
      .update(vpsSites)
      .set({ tlsStatus: "ativo" })
      .where(eq(vpsSites.id, site.id));
    await limparTentativas();
    const r = await acoes.reaplicarSiteAction(null, form({ siteId: site.id }));
    expect(r.ok, r.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(JSON.parse(p.json.tarefa.params).tls).toBe(true);
    await s.agente.resultado(p.json.tarefa, "concluida", {
      modo: "http",
      aviso: "certificado_ausente",
    });
    const [depois] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(depois.tlsStatus).toBe("sem_ssl");
    expect(depois.tlsError).toBe(MENSAGEM_CERTIFICADO_AUSENTE);
  });

  it("resultado fora do formato: a tarefa vira falhou (fila livre) e a resposta é 400", async () => {
    const s = await servidorAtivo();
    const criado = await criarSite(s.servidorId);
    const p = await s.agente.pulsar();
    const r = await s.agente.resultado(p.json.tarefa, "concluida", {
      modo: "ftp",
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("invalid_request");
    const [job] = await db
      .select()
      .from(vpsJobs)
      .where(eq(vpsJobs.id, p.json.tarefa.id));
    expect(job.status).toBe("falhou");
    expect(job.error).toContain("resultado_invalido");
    const [site] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, criado.dados!.siteId));
    expect(site.status).toBe("erro");
    // O reenvio do agente leva 409 e é descartado.
    expect(
      (await s.agente.resultado(p.json.tarefa, "concluida", { modo: "ftp" }))
        .status,
    ).toBe(409);
  });

  it("ssl falhou traduz o erro; pedido de novo em seguida dá ssl_aguarde", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const resolvedor: ResolvedorDns = {
      resolve4: async () => [IP_DA_VPS],
      resolve6: async () => {
        throw Object.assign(new Error("sem AAAA"), { code: "ENODATA" });
      },
    };
    const [srv] = await db
      .select({ workspaceId: vpsServers.workspaceId })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    const dns = await verificarDns(db, {
      workspaceId: srv.workspaceId,
      siteId: site.id,
      email: DONO,
      por: DONO,
      resolvedor,
    });
    expect(dns.httpsPedido).toBe(true);
    expect(dns.dominios.every((d) => d.status === "ok")).toBe(true);
    let [linha] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(linha.tlsStatus).toBe("emitindo");

    const p = await s.agente.pulsar();
    expect(p.json.tarefa.tipo).toBe("site.ssl_emitir");
    expect(JSON.parse(p.json.tarefa.params)).toMatchObject({ email: DONO });
    await s.agente.resultado(
      p.json.tarefa,
      "falhou",
      null,
      "certbot_falhou: Timeout during connect (likely firewall problem)",
    );
    [linha] = await db.select().from(vpsSites).where(eq(vpsSites.id, site.id));
    expect(linha.tlsStatus).toBe("erro");
    expect(linha.tlsError).not.toContain("certbot_falhou:");

    await limparTentativas();
    const denovo = await acoes.emitirSslAction(null, form({ siteId: site.id }));
    expect(denovo).toMatchObject({ ok: false, codigo: "ssl_aguarde" });
    expect(denovo.dados).toHaveProperty("podeTentarEm");
    const e = await lerEstado(`?site=${site.id}`);
    expect(e.json.site.https.podeTentarEm).toBe(
      (denovo.dados as unknown as { podeTentarEm: string }).podeTentarEm,
    );
  });
});

describe("publicação", () => {
  it("upload ok, artefato só com tarefa entregue, some depois de concluída", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const enviado = await enviarZip(site.id, ZIP_A(), { nome: "loja.zip" });
    expect(enviado.status).toBe(201);
    expect(enviado.json.versao).toMatchObject({
      estado: "enviando",
      arquivo: "loja.zip",
      ativa: false,
      temRastreio: true,
    });
    expect(enviado.json.tarefa).toMatchObject({
      tipo: "site.publicar",
      estado: "pendente",
    });

    const [release] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, enviado.json.versao.id));
    // Antes da entrega: 404.
    expect((await s.agente.baixar(release.artifactId!)).status).toBe(404);

    const p = await s.agente.pulsar();
    const params = JSON.parse(p.json.tarefa.params);
    expect(params).toMatchObject({
      siteId: site.id,
      versaoId: release.id,
      artefatoId: release.artifactId,
      bytes: ZIP_A().length,
      sha256: sha256hex(ZIP_A()),
    });

    const baixado = await s.agente.baixar(release.artifactId!);
    expect(baixado.status).toBe(200);
    expect(baixado.headers.get("content-type")).toBe("application/zip");
    expect(baixado.headers.get("x-dash-sha256")).toBe(sha256hex(ZIP_A()));
    expect(Buffer.from(await baixado.arrayBuffer()).equals(ZIP_A())).toBe(true);

    // Outro servidor não baixa.
    const intruso = await servidorAtivo();
    expect((await intruso.agente.baixar(release.artifactId!)).status).toBe(404);

    await s.agente.resultado(p.json.tarefa, "concluida", {
      versaoId: release.id,
      anterior: "vazio",
      ativadaEm: new Date().toISOString(),
      repetida: false,
      arquivos: 5,
      bytesDescompactados: 1234,
      removidas: [],
    });
    const [depois] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, release.id));
    expect(depois).toMatchObject({
      status: "no_servidor",
      isActive: true,
      fileCount: 5,
      uncompressedBytes: 1234,
      artifactId: null,
    });
    expect(
      await db
        .select()
        .from(vpsArtifacts)
        .where(eq(vpsArtifacts.id, release.artifactId!)),
    ).toHaveLength(0);
    expect((await s.agente.baixar(release.artifactId!)).status).toBe(404);
    await drenar();
    const auditorias = await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, site.id));
    expect(auditorias.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "vps.site.publicacao_enviada",
        "vps.site.versao_ativada",
      ]),
    );
  });

  it("422 com arquivo e motivo; 413 pelo tamanho declarado; Origin de fora 403; site ocupado 409", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const ruim = await enviarZip(
      site.id,
      zipGuardado({ "index.html": "<p>oi</p>", "script.php": "<?php ?>" }),
    );
    expect(ruim.status).toBe(422);
    expect(ruim.json.error).toBe("O ZIP tem problemas");
    expect(ruim.json.problemas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ arquivo: "script.php" }),
      ]),
    );

    const grande = await enviarZip(site.id, ZIP_A(), {
      tamanhoDeclarado: 3_300_001,
    });
    expect(grande.status).toBe(413);

    const deFora = await enviarZip(site.id, ZIP_A(), {
      origem: "https://atacante.com",
    });
    expect(deFora.status).toBe(403);
    expect(deFora.json.codigo).toBe("origem_invalida");

    expect((await enviarZip(site.id, ZIP_A())).status).toBe(201);
    const ocupado = await enviarZip(site.id, ZIP_B());
    expect(ocupado.status).toBe(409);
    expect(ocupado.json.codigo).toBe("site_ocupado");
    // A tentativa ocupada não deixou versão nem artefato para trás.
    const versoes = await db
      .select({ id: vpsReleases.id })
      .from(vpsReleases)
      .where(eq(vpsReleases.siteId, site.id));
    expect(versoes).toHaveLength(1);
  });

  it("login antigo não publica", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    estado.momento = new Date(Date.now() - 24 * 3_600_000);
    const r = await enviarZip(site.id, ZIP_A());
    expect(r.status).toBe(403);
    expect(r.json.codigo).toBe("login_antigo");
  });

  it("trava de ordem: publicar A concluído depois de B não reativa A", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const enviadoA = await enviarZip(site.id, ZIP_A());
    const pa = await s.agente.pulsar();
    const tarefaA = pa.json.tarefa as Envelope;
    // A ficou sem resposta (entregue há 16 min): libera a fila do site.
    await db
      .update(vpsJobs)
      .set({ deliveredAt: sql`now() - interval '16 minutes'` })
      .where(eq(vpsJobs.id, tarefaA.id));
    const b = await publicarEConcluir(s, site.id, ZIP_B());
    const [jobA] = await db
      .select()
      .from(vpsJobs)
      .where(eq(vpsJobs.id, tarefaA.id));
    expect(jobA.status).toBe("sem_resposta");

    const atrasado = await s.agente.resultado(tarefaA, "concluida", {
      versaoId: enviadoA.json.versao.id,
      anterior: "vazio",
      removidas: [],
    });
    expect(atrasado.json).toEqual({ ok: true, repetido: false });
    const versoes = await db
      .select({
        id: vpsReleases.id,
        status: vpsReleases.status,
        ativa: vpsReleases.isActive,
      })
      .from(vpsReleases)
      .where(eq(vpsReleases.siteId, site.id));
    expect(versoes).toEqual(
      expect.arrayContaining([
        { id: enviadoA.json.versao.id, status: "no_servidor", ativa: false },
        { id: b.versaoId, status: "no_servidor", ativa: true },
      ]),
    );
  });

  it("voltar de versão: só `no_servidor`; o resultado ativa a escolhida", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const a = await publicarEConcluir(s, site.id, ZIP_A());
    await publicarEConcluir(s, site.id, ZIP_B());
    await limparTentativas();
    const r = await acoes.ativarVersaoAction(
      null,
      form({ versaoId: a.versaoId }),
    );
    expect(r.ok, r.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(p.json.tarefa.tipo).toBe("site.ativar_versao");
    await s.agente.resultado(p.json.tarefa, "concluida", {
      versaoId: a.versaoId,
      anterior: "releases/x",
      ativadaEm: new Date().toISOString(),
      repetida: false,
    });
    const e = await lerEstado(`?site=${site.id}`);
    expect(e.json.site.versaoAtiva.id).toBe(a.versaoId);
    expect(e.json.site.versoes).toHaveLength(2);
  });

  it("limpeza preguiçosa: publicação vencida vira falhou e o artefato some", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const enviado = await enviarZip(site.id, ZIP_A());
    const [release] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, enviado.json.versao.id));
    await db
      .update(vpsJobs)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(vpsJobs.id, enviado.json.tarefa.id));
    const p = await s.agente.pulsar();
    expect(p.json.tarefa).toBeNull();
    const [depois] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, release.id));
    expect(depois.status).toBe("falhou");
    expect(
      await db
        .select()
        .from(vpsArtifacts)
        .where(eq(vpsArtifacts.id, release.artifactId!)),
    ).toHaveLength(0);
  });
});

describe("sites e servidor pelo painel", () => {
  it("criar site com servidor aguardando confirmação dá 409; domínio duplicado dá 409", async () => {
    const s = await servidorRegistrado();
    expect(await criarSite(s.servidorId)).toMatchObject({
      ok: false,
      codigo: "servidor_nao_pronto",
    });
    await limparTentativas();
    await acoes.confirmarServidorAction(
      null,
      form({ servidorId: s.servidorId, resposta: "sim" }),
    );
    const primeiro = await criarSite(s.servidorId, {
      dominio: "Promoção.com.BR",
    });
    expect(primeiro.ok, primeiro.mensagem).toBe(true);
    const dominios = await db
      .select({ hostname: vpsSiteDomains.hostname })
      .from(vpsSiteDomains)
      .where(eq(vpsSiteDomains.siteId, primeiro.dados!.siteId));
    expect(dominios).toEqual([{ hostname: "xn--promoo-7ta5a.com.br" }]);
    const duplicado = await criarSite(s.servidorId, {
      dominio: "xn--promoo-7ta5a.com.br",
    });
    expect(duplicado).toMatchObject({ ok: false, codigo: "dominio_em_uso" });
    const doPainel = await criarSite(s.servidorId, {
      dominio: "dash-board-psi-one.vercel.app",
    });
    expect(doPainel).toMatchObject({ ok: false, codigo: "dados_invalidos" });
    expect(doPainel.erros?.dominio).toBeTruthy();
  });

  it("slug que já existe no disco da VPS (ou reservado) não vai para um site novo", async () => {
    const s = await servidorAtivo();
    // A mesma VPS ainda tem a pasta "loja-antiga", de um servidor removido do
    // painel: o slug só é único dentro de um servidor, mas o disco é um só.
    const p = await s.agente.pulsar({
      sites: [{ slug: "loja-antiga", atual: "vazio", versoes: [] }],
    });
    expect(p.status).toBe(200);
    const slugDe = async (siteId: string) =>
      (
        await db
          .select({ slug: vpsSites.slug })
          .from(vpsSites)
          .where(eq(vpsSites.id, siteId))
      )[0].slug;
    const antiga = await criarSite(s.servidorId, { nome: "Loja Antiga" });
    expect(antiga.ok, antiga.mensagem).toBe(true);
    expect(await slugDe(antiga.dados!.siteId)).toBe("loja-antiga-2");

    // Um pulso sem `sites` (null) não apaga o que o disco relatou.
    await s.agente.pulsar();
    const [srv] = await db
      .select({ slugs: vpsServers.reportedSlugs })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(srv.slugs).toEqual(["loja-antiga"]);

    // "000-padrao" era o arquivo do servidor padrão do instalador antigo.
    const padrao = await criarSite(s.servidorId, { nome: "000 Padrão" });
    expect(padrao.ok, padrao.mensagem).toBe(true);
    expect(await slugDe(padrao.dados!.siteId)).toBe("000-padrao-2");
  });

  it("checkout publicado vira /checkout do site, rastreio do produto e aviso quando some", async () => {
    const s = await servidorAtivo();
    const [srv] = await db
      .select({ workspaceId: vpsServers.workspaceId })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    const [produto] = await db
      .insert(products)
      .values({
        workspaceId: srv.workspaceId,
        name: "Cadeira X",
        slug: "cadeira-x",
        priceCents: 19900,
      })
      .returning({ id: products.id });
    const [checkout] = await db
      .insert(checkouts)
      .values({
        workspaceId: srv.workspaceId,
        name: "Checkout cadeira",
        slug: "cadeira-x",
        status: "published",
        mainProductId: produto.id,
      })
      .returning({ id: checkouts.id });
    const r = await criarSite(s.servidorId, {
      checkoutId: checkout.id,
      origemCheckout: ORIGEM_EXTRA,
      incluirWww: "sim",
    });
    expect(r.ok, r.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(JSON.parse(p.json.tarefa.params)).toMatchObject({
      origemCheckout: ORIGEM_EXTRA,
      checkout: `${ORIGEM_EXTRA}/checkout/cadeira-x`,
    });
    expect(JSON.parse(p.json.tarefa.params).dominios).toHaveLength(2);
    let e = await lerEstado(`?site=${r.dados!.siteId}`);
    expect(e.json.site.rastreioProduto).toBe("cadeira-x");
    expect(e.json.site.checkout.aviso).toBeNull();

    await db
      .update(checkouts)
      .set({ status: "unpublished" })
      .where(eq(checkouts.id, checkout.id));
    e = await lerEstado(`?site=${r.dados!.siteId}`);
    expect(e.json.site.checkout.aviso).toContain("despublicado");
    expect(e.json.site.rastreioProduto).toBeNull();
  });

  it("confirmar (sim) depois de reinstalar reaplica os 2 sites", async () => {
    const s = await servidorAtivo();
    await siteConfigurado(s);
    await siteConfigurado(s);
    await limparTentativas();
    // Uma tarefa aberta, assinada com a geração atual.
    const coleta = await acoes.lerAgoraAction(
      null,
      form({ servidorId: s.servidorId }),
    );
    expect(coleta.ok, coleta.mensagem).toBe(true);
    await limparTentativas();
    const nova = await acoes.novaInstalacaoAction(
      null,
      form({ servidorId: s.servidorId }),
    );
    expect(nova.ok, nova.mensagem).toBe(true);
    const codigo = /printf '%s\\n' '([A-Za-z0-9_-]{43})'/.exec(
      nova.dados!.instalacao.comando,
    )![1];
    const reinstalado = new AgenteFalso();
    expect((await reinstalado.registrar(codigo)).json.geracao).toBe(2);
    // As chaves antigas não valem mais, e a tarefa assinada com elas expirou.
    expect((await s.agente.pulsar()).status).toBe(401);
    const [antiga] = await db
      .select({ status: vpsJobs.status })
      .from(vpsJobs)
      .where(eq(vpsJobs.id, coleta.dados!.tarefaId));
    expect(antiga.status).toBe("expirada");

    await limparTentativas();
    const r = await acoes.confirmarServidorAction(
      null,
      form({ servidorId: s.servidorId, resposta: "sim" }),
    );
    expect(r).toMatchObject({ ok: true, dados: { sitesReaplicados: 2 } });
    const pendentes = await db
      .select({ tipo: vpsJobs.type })
      .from(vpsJobs)
      .where(
        and(eq(vpsJobs.serverId, s.servidorId), eq(vpsJobs.status, "pendente")),
      );
    expect(pendentes).toEqual([
      { tipo: "site.configurar" },
      { tipo: "site.configurar" },
    ]);
  });

  it("recusar (não é o meu) corta o token e volta a aguardar o agente", async () => {
    const s = await servidorRegistrado();
    const r = await acoes.confirmarServidorAction(
      null,
      form({ servidorId: s.servidorId, resposta: "nao" }),
    );
    expect(r.ok).toBe(true);
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha).toMatchObject({
      status: "aguardando_agente",
      agentTokenHash: null,
      keyGeneration: 2,
    });
    expect((await s.agente.pulsar()).status).toBe(401);
    await limparTentativas();
    expect(
      await acoes.confirmarServidorAction(
        null,
        form({ servidorId: s.servidorId, resposta: "sim" }),
      ),
    ).toMatchObject({ ok: false, codigo: "estado_invalido" });
  });

  it("remover site: pede ao agente; concluída tira do painel e libera o domínio", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const [dominio] = await db
      .select({ hostname: vpsSiteDomains.hostname })
      .from(vpsSiteDomains)
      .where(eq(vpsSiteDomains.siteId, site.id));
    await limparTentativas();
    expect(
      await acoes.removerSiteAction(
        null,
        form({ siteId: site.id, confirmacao: "errado.com" }),
      ),
    ).toMatchObject({ ok: false, codigo: "dados_invalidos" });
    await limparTentativas();
    const r = await acoes.removerSiteAction(
      null,
      form({ siteId: site.id, confirmacao: dominio.hostname }),
    );
    expect(r.ok, r.mensagem).toBe(true);
    const p = await s.agente.pulsar();
    expect(p.json.tarefa.tipo).toBe("site.remover");
    await s.agente.resultado(p.json.tarefa, "concluida", {
      movidoPara: `/var/www/dash-funil/.lixeira/${site.slug}-1`,
    });
    const [depois] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(depois.deletedAt).toBeInstanceOf(Date);
    expect(
      await db
        .select()
        .from(vpsSiteDomains)
        .where(eq(vpsSiteDomains.siteId, site.id)),
    ).toHaveLength(0);
    // O domínio ficou livre para outro site.
    expect(
      (await criarSite(s.servidorId, { dominio: dominio.hostname })).ok,
    ).toBe(true);
  });

  it("remoção sem resposta: dá para forçar a saída do painel", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    const [dominio] = await db
      .select({ hostname: vpsSiteDomains.hostname })
      .from(vpsSiteDomains)
      .where(eq(vpsSiteDomains.siteId, site.id));
    await limparTentativas();
    await acoes.removerSiteAction(
      null,
      form({ siteId: site.id, confirmacao: dominio.hostname }),
    );
    await limparTentativas();
    expect(
      await acoes.forcarRemocaoSiteAction(
        null,
        form({ siteId: site.id, confirmacao: dominio.hostname }),
      ),
    ).toMatchObject({ ok: false, codigo: "estado_invalido" });
    await db
      .update(vpsJobs)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(
        and(eq(vpsJobs.siteId, site.id), eq(vpsJobs.type, "site.remover")),
      );
    const e = await lerEstado(`?site=${site.id}`);
    expect(e.json.site.podeForcarRemocao).toBe(true);
    await limparTentativas();
    const r = await acoes.forcarRemocaoSiteAction(
      null,
      form({ siteId: site.id, confirmacao: dominio.hostname }),
    );
    expect(r.ok, r.mensagem).toBe(true);
    const [depois] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(depois.deletedAt).toBeInstanceOf(Date);
  });

  it("remover servidor revoga o agente (401 com a marca) e tira os sites do painel", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    await limparTentativas();
    expect(
      await acoes.removerServidorAction(
        null,
        form({ servidorId: s.servidorId, confirmacao: "outro nome" }),
      ),
    ).toMatchObject({ ok: false, codigo: "dados_invalidos" });
    await limparTentativas();
    const r = await acoes.removerServidorAction(
      null,
      form({ servidorId: s.servidorId, confirmacao: s.nome }),
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { desinstalar: "sudo dash-agent desinstalar", sitesRemovidos: 1 },
    });
    const p = await s.agente.pulsar();
    expect(p.status).toBe(401);
    expect(p.cabecalhos.get("www-authenticate")).toBe("Dash-HMAC");
    const [linha] = await db
      .select()
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha).toMatchObject({ status: "revogado", agentTokenHash: null });
    const [sitio] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(sitio.deletedAt).toBeInstanceOf(Date);
    const e = await lerEstado();
    expect(e.json.servidores.map((x: { id: string }) => x.id)).not.toContain(
      s.servidorId,
    );
  });

  it("conferência do lado de fora com o DNS ok: página de espera", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    await db
      .update(vpsSiteDomains)
      .set({ dnsStatus: "ok", dnsCheckedAt: new Date() })
      .where(eq(vpsSiteDomains.siteId, site.id));
    const servidorHttp = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(PAGINA_DE_ESPERA);
    });
    await new Promise<void>((ok) => servidorHttp.listen(0, "127.0.0.1", ok));
    const porta = (servidorHttp.address() as AddressInfo).port;
    try {
      const noAr = await conferirSite(
        db,
        { workspaceId: site.workspaceId, siteId: site.id },
        {
          porta,
          lookup: (_h, opcoes, cb) =>
            opcoes?.all
              ? cb(null, [{ address: "127.0.0.1", family: 4 }])
              : cb(null, "127.0.0.1", 4),
        },
      );
      expect(noAr.estado).toBe("pagina_de_espera");
      const e = await lerEstado(`?site=${site.id}`);
      expect(e.json.site.noAr.estado).toBe("pagina_de_espera");
    } finally {
      servidorHttp.close();
    }
  });
});

describe("estado (polling)", () => {
  it("devolve DTOs sem hash, assinatura, params ou conteúdo, e marca viewer_seen_at", async () => {
    const s = await servidorAtivo();
    const site = await siteConfigurado(s);
    await publicarEConcluir(s, site.id, ZIP_A());
    await db
      .update(vpsServers)
      .set({ viewerSeenAt: null })
      .where(eq(vpsServers.id, s.servidorId));
    const e = await lerEstado(`?servidor=${s.servidorId}&site=${site.id}`);
    expect(e.status).toBe(200);
    expect(e.json.ok).toBe(true);
    expect(e.json.podeAlterar).toBe(true);
    expect(e.json.servidor.id).toBe(s.servidorId);
    expect(e.json.servidor.tarefas.length).toBeGreaterThan(0);
    expect(e.json.site.versaoAtiva).not.toBeNull();
    expect(e.json.origens).toEqual([APP, ORIGEM_EXTRA]);
    expect(e.json.pendencias.every((p: { ok: boolean }) => p.ok)).toBe(true);
    const chaves = [...chavesDe(e.json)];
    expect(
      chaves.filter((c) => /hash|signature|assinatura|params|content/i.test(c)),
    ).toEqual([]);
    expect(JSON.stringify(e.json)).not.toContain(s.agente.token);

    const [linha] = await db
      .select({ visto: vpsServers.viewerSeenAt })
      .from(vpsServers)
      .where(eq(vpsServers.id, s.servidorId));
    expect(linha.visto).toBeInstanceOf(Date);
    // Com a tela aberta o agente pulsa rápido.
    await db
      .update(vpsServers)
      .set({ fastPulseUntil: null })
      .where(eq(vpsServers.id, s.servidorId));
    expect((await s.agente.pulsar()).json.proximoPulsoEm).toBe(5);
  });

  it("id inválido dá 400; servidor de fora vira null", async () => {
    expect((await lerEstado("?servidor=abc")).status).toBe(400);
    const e = await lerEstado(`?servidor=${crypto.randomUUID()}`);
    expect(e.status).toBe(200);
    expect(e.json.servidor).toBeNull();
  });
});
