// @vitest-environment node
import { and, eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  vpsArtifacts,
  vpsJobs,
  vpsOperationAttempts,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import {
  canonicoPedido,
  derivarChaves,
  hmacHex,
  mensagemTarefa,
  sha256hex,
} from "@/features/vps/chaves";
import { verificarPedido } from "@/features/vps/protocolo";
import {
  linhasDe,
  TABELAS_VPS,
  type BancoVps,
} from "@/features/vps/schema-sql";
import {
  enfileirarTarefa,
  entregarTarefa,
  expirarTarefasAbertas,
  FRASE_NAO_BUSCOU,
  FRASE_SSL_NAO_BUSCOU,
  temTarefaAberta,
  transicoesPreguicosas,
  trocaDeVersaoLiberada,
} from "@/features/vps/tarefas";

import {
  criarBancoDeTeste,
  criarWorkspaceDeTeste,
  lerMigracao,
  MIGRACAO_VPS,
  type BancoDeTeste,
} from "../helpers/pglite";

/*
  O núcleo da VPS contra um Postgres de verdade (PGlite), com os parsers
  do postgres-js de produção: int8 cru volta STRING. Aqui se prova que a
  seq e o expiraEm que vão ao agente são number e que a assinatura confere
  com a mensagem recalculada do envelope (o furo do arredondamento).

  Não prova concorrência: o PGlite serializa tudo (isso fica no E2E com o
  Postgres 16). Os casos de actions e rotas (§14.C) ficam nos testes de
  quem as escreve, com este mesmo helper.
*/

const MESTRA = "c".repeat(48);
const POR = "dono@e2e-teste.com.br";
const ORIGEM = "https://checkout-e2e.com.br";

let banco: BancoDeTeste;
let db: BancoVps;
let workspaceId: string;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  db = banco.db;
  ({ workspaceId } = await criarWorkspaceDeTeste(banco.db));
}, 60_000);

beforeEach(() => {
  vi.stubEnv("VPS_CHAVE_MESTRA", MESTRA);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function novoServidor(
  mudancas: Partial<typeof vpsServers.$inferInsert> = {},
) {
  const [s] = await db
    .insert(vpsServers)
    .values({
      workspaceId,
      name: "srv",
      status: "ativo",
      agentTokenHash: sha256hex(crypto.randomUUID()),
      keyGeneration: 1,
      createdBy: POR,
      ...mudancas,
    })
    .returning({ id: vpsServers.id });
  return s.id;
}

async function novoSite(
  servidorId: string,
  slug = `s-${crypto.randomUUID().slice(0, 8)}`,
) {
  const [s] = await db
    .insert(vpsSites)
    .values({
      workspaceId,
      serverId: servidorId,
      name: slug,
      slug,
      checkoutOrigin: ORIGEM,
      createdBy: POR,
    })
    .returning({ id: vpsSites.id, slug: vpsSites.slug });
  return s;
}

async function novaRelease(siteId: string) {
  const conteudo = Buffer.from("zip de teste");
  const [a] = await db
    .insert(vpsArtifacts)
    .values({
      workspaceId,
      sha256: sha256hex(conteudo),
      sizeBytes: conteudo.length,
      content: conteudo,
    })
    .returning({ id: vpsArtifacts.id });
  const [r] = await db
    .insert(vpsReleases)
    .values({
      workspaceId,
      siteId,
      artifactId: a.id,
      fileCount: 1,
      uncompressedBytes: 12,
      zipBytes: conteudo.length,
      sha256: sha256hex(conteudo),
      indexSha256: sha256hex("<p>oi</p>"),
      createdBy: POR,
    })
    .returning({ id: vpsReleases.id });
  return { releaseId: r.id, artefatoId: a.id, sha: sha256hex(conteudo) };
}

const configurar = (site: { id: string; slug: string }) => ({
  siteId: site.id,
  slug: site.slug,
  dominios: [`${site.slug}.com.br`],
  principal: `${site.slug}.com.br`,
  origemCheckout: ORIGEM,
  checkout: null,
  tls: false,
});

const publicar = (
  site: { id: string; slug: string },
  r: { releaseId: string; artefatoId: string; sha: string },
) => ({
  siteId: site.id,
  slug: site.slug,
  versaoId: r.releaseId,
  artefatoId: r.artefatoId,
  sha256: r.sha,
  bytes: 12,
});

async function tarefa(id: string) {
  const [t] = await db.select().from(vpsJobs).where(eq(vpsJobs.id, id));
  return t;
}

const pulsoOpcoes = (servidorId: string) => ({
  servidorId,
  ativo: true,
  pausado: false,
  executando: null,
});

describe("schema: 0006 e ensureVpsSchema", () => {
  it("a 0006 roda duas vezes sem erro e liga o RLS nas 7 tabelas", async () => {
    await banco.pg.exec(lerMigracao(MIGRACAO_VPS));
    const linhas = linhasDe<{ relname: string; relrowsecurity: boolean }>(
      await db.execute(sql`
        select c.relname, c.relrowsecurity from pg_class c
          join pg_namespace s on s.oid = c.relnamespace
         where s.nspname = 'public' and c.relkind = 'r'
           and c.relname in ('vps_servers', 'vps_sites', 'vps_site_domains',
             'vps_artifacts', 'vps_releases', 'vps_jobs', 'vps_operation_attempts')`),
    );
    expect(linhas.map((l) => l.relname).sort()).toEqual(
      [...TABELAS_VPS].sort(),
    );
    expect(linhas.every((l) => l.relrowsecurity === true)).toBe(true);
  });

  it("as colunas do banco são as do drizzle", async () => {
    for (const tabela of [
      vpsServers,
      vpsSites,
      vpsSiteDomains,
      vpsArtifacts,
      vpsReleases,
      vpsJobs,
      vpsOperationAttempts,
    ]) {
      const { name, columns } = getTableConfig(tabela);
      const noBanco = linhasDe<{ column_name: string }>(
        await db.execute(
          sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${name}`,
        ),
      ).map((l) => l.column_name);
      expect(noBanco.sort(), name).toEqual(columns.map((c) => c.name).sort());
    }
  });

  it("ensureVpsSchema cria o que falta; a instância seguinte só confere (sem DDL)", async () => {
    const vazio = await criarBancoDeTeste({ vps: false });
    vi.resetModules();
    const primeira = await import("@/features/vps/schema-sql");
    expect(await primeira.tabelasVpsProntas(vazio.db)).toBe(false);
    await primeira.ensureVpsSchema(vazio.db);
    expect(await primeira.tabelasVpsProntas(vazio.db)).toBe(true);

    vi.resetModules();
    const segunda = await import("@/features/vps/schema-sql");
    const execute = vi.spyOn(vazio.db, "execute");
    const transacao = vi.spyOn(vazio.db, "transaction");
    await segunda.ensureVpsSchema(vazio.db);
    await segunda.ensureVpsSchema(vazio.db); // mesma instância: promessa guardada
    expect(execute).toHaveBeenCalledTimes(1); // só a consulta de conferência
    expect(transacao).not.toHaveBeenCalled();
    await vazio.pg.close();
  }, 60_000);

  it("tenta de novo UMA vez com lock ocupado (55P03); outro erro sobe e não fica guardado", async () => {
    const vazio = await criarBancoDeTeste({ vps: false });
    vi.resetModules();
    const modulo = await import("@/features/vps/schema-sql");
    const original = vazio.db.transaction.bind(vazio.db);
    const lock = Object.assign(new Error("lock timeout"), { code: "55P03" });
    const transacao = vi
      .spyOn(vazio.db, "transaction")
      .mockRejectedValueOnce(new Error("Failed query", { cause: lock }))
      .mockImplementation(original as never);
    await modulo.ensureVpsSchema(vazio.db);
    expect(transacao).toHaveBeenCalledTimes(2);
    expect(await modulo.tabelasVpsProntas(vazio.db)).toBe(true);
    await vazio.pg.close();

    const quebrado = await criarBancoDeTeste({ vps: false });
    vi.resetModules();
    const outro = await import("@/features/vps/schema-sql");
    const falha = vi
      .spyOn(quebrado.db, "transaction")
      .mockRejectedValue(new Error("sem permissão"));
    await expect(outro.ensureVpsSchema(quebrado.db)).rejects.toThrow(
      "sem permissão",
    );
    expect(falha).toHaveBeenCalledTimes(1);
    falha.mockRestore();
    await outro.ensureVpsSchema(quebrado.db);
    expect(await outro.tabelasVpsProntas(quebrado.db)).toBe(true);
    await quebrado.pg.close();
  }, 60_000);

  /*
    O /servidor da antiga VPS por SSH mandava colar docs/sql/vps-panel.sql
    (arquivado no ramo chatgpt-trabalho). Ele cria uma
    vps_operation_attempts SEM workspace_id, que o CREATE TABLE IF NOT
    EXISTS da 0006 pularia: toda ação do Servidor cairia no limitador com
    "column workspace_id does not exist".
  */
  const SQL_DA_VPS_POR_SSH = `
    CREATE TABLE IF NOT EXISTS public.vps_operation_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id text NOT NULL,
      action text NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS vps_operation_attempts_owner_at_idx
      ON public.vps_operation_attempts(owner_user_id, at);
    ALTER TABLE public.vps_operation_attempts ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.vps_operation_attempts (owner_user_id, action)
      VALUES ('dono-antigo', 'ssh.conectar');`;

  async function colunasDoLimitador(alvo: BancoDeTeste) {
    return linhasDe<{ column_name: string; is_nullable: string }>(
      await alvo.db.execute(sql`
        select column_name, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'vps_operation_attempts'
         order by column_name`),
    );
  }

  async function indicesDoLimitador(alvo: BancoDeTeste) {
    return linhasDe<{ indexname: string }>(
      await alvo.db.execute(sql`
        select indexname from pg_indexes
         where schemaname = 'public' and tablename = 'vps_operation_attempts'
         order by indexname`),
    ).map((l) => l.indexname);
  }

  async function chavesEstrangeirasDoLimitador(alvo: BancoDeTeste) {
    const [linha] = linhasDe<{ total: number }>(
      await alvo.db.execute(sql`
        select count(*)::int as total from pg_constraint
         where conrelid = 'public.vps_operation_attempts'::regclass
           and contype = 'f'`),
    );
    return Number(linha?.total);
  }

  it("banco com o SQL da antiga VPS por SSH: a 0006 põe o workspace_id NOT NULL e o limitador volta a gravar", async () => {
    const antigo = await criarBancoDeTeste({ vps: false });
    await antigo.pg.exec(SQL_DA_VPS_POR_SSH);
    expect(
      (await colunasDoLimitador(antigo)).map((c) => c.column_name),
    ).not.toContain("workspace_id");

    await antigo.pg.exec(lerMigracao(MIGRACAO_VPS));
    await antigo.pg.exec(lerMigracao(MIGRACAO_VPS)); // idempotente
    expect(await colunasDoLimitador(antigo)).toEqual([
      { column_name: "action", is_nullable: "NO" },
      { column_name: "at", is_nullable: "NO" },
      { column_name: "id", is_nullable: "NO" },
      { column_name: "owner_user_id", is_nullable: "NO" },
      { column_name: "workspace_id", is_nullable: "NO" },
    ]);
    // A linha da VPS por SSH (sem workspace) saiu, o índice repetido
    // também, e rodar de novo não duplica a chave estrangeira.
    expect(await antigo.db.select().from(vpsOperationAttempts)).toHaveLength(0);
    expect(await indicesDoLimitador(antigo)).toEqual([
      "vps_operation_attempts_owner_idx",
      "vps_operation_attempts_pkey",
    ]);
    expect(await chavesEstrangeirasDoLimitador(antigo)).toBe(1);

    const { workspaceId: ws } = await criarWorkspaceDeTeste(antigo.db);
    const { consumeVpsAttempt } = await import("@/features/vps/acesso");
    await consumeVpsAttempt(antigo.db, ws, "dono-novo", "publicar");
    expect(
      await antigo.db
        .select({ workspaceId: vpsOperationAttempts.workspaceId })
        .from(vpsOperationAttempts),
    ).toEqual([{ workspaceId: ws }]);
    await antigo.pg.close();
  }, 60_000);

  it("ensureVpsSchema não aceita as 7 tabelas se o limitador ainda é o da VPS por SSH", async () => {
    // Pior caso: o SQL da VPS por SSH e depois uma 0006 anterior a esta
    // correção. As 7 tabelas existem com RLS e o reported_slugs também,
    // mas falta o workspace_id do limitador.
    const antigo = await criarBancoDeTeste();
    await antigo.pg.exec(`
      DELETE FROM "vps_operation_attempts";
      ALTER TABLE "vps_operation_attempts" DROP COLUMN "workspace_id";`);
    vi.resetModules();
    const modulo = await import("@/features/vps/schema-sql");
    expect(await modulo.tabelasVpsProntas(antigo.db)).toBe(false);
    await modulo.ensureVpsSchema(antigo.db);
    expect(await modulo.tabelasVpsProntas(antigo.db)).toBe(true);
    expect(
      (await colunasDoLimitador(antigo)).find(
        (c) => c.column_name === "workspace_id",
      ),
    ).toEqual({ column_name: "workspace_id", is_nullable: "NO" });
    await antigo.pg.close();
  }, 60_000);
});

describe("regra de drivers", () => {
  it("int8 cru volta string (como o postgres-js); o query builder devolve number", async () => {
    const servidorId = await novoServidor({
      jobSeq: 41,
      agentLastSeq: 1_727_000_000_123,
    });
    const [cru] = linhasDe<{ job_seq: unknown; agent_last_seq: unknown }>(
      await db.execute(
        sql`select job_seq, agent_last_seq from vps_servers where id = ${servidorId}`,
      ),
    );
    expect(typeof cru.job_seq).toBe("string");
    expect(typeof cru.agent_last_seq).toBe("string");
    const [qb] = await db
      .select({ jobSeq: vpsServers.jobSeq, ultima: vpsServers.agentLastSeq })
      .from(vpsServers)
      .where(eq(vpsServers.id, servidorId));
    expect(qb).toEqual({ jobSeq: 41, ultima: 1_727_000_000_123 });
  });
});

describe("enfileirarTarefa", () => {
  it("assina com seq number e expiraEm inteiro gravado no expires_at", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const antes = Math.floor(Date.now() / 1000);
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(site),
      siteId: site.id,
      por: POR,
    });
    expect(t).toMatchObject({ seq: 1, repetida: false });
    expect(typeof t.seq).toBe("number");
    const linha = await tarefa(t.id);
    const expiraEm = linha.expiresAt.getTime() / 1000;
    expect(Number.isInteger(expiraEm)).toBe(true);
    expect(expiraEm - antes).toBeGreaterThanOrEqual(600);
    expect(expiraEm - antes).toBeLessThanOrEqual(601);
    const { tarefas } = derivarChaves(Buffer.from(MESTRA), servidorId, 1);
    expect(linha.signature).toBe(
      hmacHex(
        tarefas,
        mensagemTarefa({
          servidorId,
          id: linha.id,
          seq: linha.seq,
          tipo: linha.type,
          expiraEm,
          params: linha.params,
        }),
      ),
    );
    expect(JSON.parse(linha.params)).toEqual(configurar(site));
    const [srv] = await db
      .select({ jobSeq: vpsServers.jobSeq, rapido: vpsServers.fastPulseUntil })
      .from(vpsServers)
      .where(eq(vpsServers.id, servidorId));
    expect(srv.jobSeq).toBe(1);
    expect(srv.rapido!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
  });

  it("servidor que não está ativo: 409 servidor_nao_pronto, sem gastar seq", async () => {
    for (const status of [
      "aguardando_agente",
      "aguardando_confirmacao",
      "revogado",
    ]) {
      const servidorId = await novoServidor({ status, agentTokenHash: null });
      await expect(
        enfileirarTarefa(db, {
          workspaceId,
          servidorId,
          tipo: "servidor.coletar",
          params: {},
          por: POR,
        }),
      ).rejects.toMatchObject({ status: 409, codigo: "servidor_nao_pronto" });
      const [srv] = await db
        .select({ jobSeq: vpsServers.jobSeq })
        .from(vpsServers)
        .where(eq(vpsServers.id, servidorId));
      expect(srv.jobSeq).toBe(0);
    }
  });

  it("outro workspace não enfileira no servidor", async () => {
    const servidorId = await novoServidor();
    const { workspaceId: outro } = await criarWorkspaceDeTeste(
      banco.db,
      "Outra",
    );
    await expect(
      enfileirarTarefa(db, {
        workspaceId: outro,
        servidorId,
        tipo: "servidor.coletar",
        params: {},
        por: POR,
      }),
    ).rejects.toMatchObject({ codigo: "servidor_nao_pronto" });
  });

  it("site ocupado: 409 pelo índice, e a seq não é consumida", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(site),
      siteId: site.id,
      por: POR,
    });
    await expect(
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "site.remover",
        params: { siteId: site.id, slug: site.slug },
        siteId: site.id,
        por: POR,
      }),
    ).rejects.toMatchObject({ status: 409, codigo: "site_ocupado" });
    const outro = await novoSite(servidorId);
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(outro),
      siteId: outro.id,
      por: POR,
    });
    expect(t.seq).toBe(2);
  });

  it("coleta repetida devolve a coleta aberta (dedupe)", async () => {
    const servidorId = await novoServidor();
    const nova = () =>
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "servidor.coletar",
        params: {},
        por: POR,
      });
    const a = await nova();
    const b = await nova();
    expect(b).toEqual({ id: a.id, seq: a.seq, repetida: true });
  });

  it("dentro de uma transação maior: o 409 não estraga a transação de fora", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(site),
      siteId: site.id,
      por: POR,
    });
    const resultado = await db.transaction(async (tx) => {
      await expect(
        enfileirarTarefa(tx, {
          workspaceId,
          servidorId,
          tipo: "site.remover",
          params: { siteId: site.id, slug: site.slug },
          siteId: site.id,
          por: POR,
        }),
      ).rejects.toMatchObject({ codigo: "site_ocupado" });
      return enfileirarTarefa(tx, {
        workspaceId,
        servidorId,
        tipo: "servidor.coletar",
        params: {},
        por: POR,
      });
    });
    expect(resultado.seq).toBe(2);
  });

  it("parâmetros inválidos, siteId/releaseId divergente e falta de chave", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await expect(
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "site.configurar",
        params: { ...configurar(site), principal: "x.com.br" },
        siteId: site.id,
        por: POR,
      }),
    ).rejects.toMatchObject({ status: 400, codigo: "dados_invalidos" });
    await expect(
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "site.remover",
        params: { siteId: site.id, slug: site.slug },
        por: POR,
      }),
    ).rejects.toMatchObject({ codigo: "dados_invalidos" });
    const release = await novaRelease(site.id);
    await expect(
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "site.publicar",
        params: publicar(site, release),
        siteId: site.id,
        releaseId: crypto.randomUUID(),
        por: POR,
      }),
    ).rejects.toMatchObject({ codigo: "dados_invalidos" });
    vi.stubEnv("VPS_CHAVE_MESTRA", "");
    await expect(
      enfileirarTarefa(db, {
        workspaceId,
        servidorId,
        tipo: "servidor.coletar",
        params: {},
        por: POR,
      }),
    ).rejects.toMatchObject({ status: 503, codigo: "sem_chave" });
  });
});

describe("entregarTarefa (pulso)", () => {
  it("entrega a menor seq, com números de verdade e assinatura que confere", async () => {
    const servidorId = await novoServidor();
    const s1 = await novoSite(servidorId);
    const s2 = await novoSite(servidorId);
    const a = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(s1),
      siteId: s1.id,
      por: POR,
    });
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(s2),
      siteId: s2.id,
      por: POR,
    });
    const env = await db.transaction(async (tx) => {
      await transicoesPreguicosas(tx, servidorId);
      return entregarTarefa(tx, pulsoOpcoes(servidorId));
    });
    expect(env).not.toBeNull();
    expect(env!.id).toBe(a.id);
    expect(typeof env!.seq).toBe("number");
    expect(typeof env!.expiraEm).toBe("number");
    const { tarefas } = derivarChaves(Buffer.from(MESTRA), servidorId, 1);
    expect(hmacHex(tarefas, mensagemTarefa({ servidorId, ...env! }))).toBe(
      env!.assinatura,
    );
    const linha = await tarefa(a.id);
    expect(linha.status).toBe("entregue");
    expect(linha.deliveredAt).not.toBeNull();
  });

  it("reentrega a MESMA tarefa enquanto ela está entregue; com executando, nada", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(site),
      siteId: site.id,
      por: POR,
    });
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    const primeira = await entregarTarefa(db, pulsoOpcoes(servidorId));
    const entregueEm = (await tarefa(primeira!.id)).deliveredAt;
    const segunda = await entregarTarefa(db, pulsoOpcoes(servidorId));
    expect(segunda).toEqual(primeira);
    expect((await tarefa(primeira!.id)).deliveredAt).toEqual(entregueEm);
    expect(
      await entregarTarefa(db, {
        ...pulsoOpcoes(servidorId),
        executando: primeira!.id,
      }),
    ).toBeNull();
    // A coleta (seq 2) continua pendente: uma tarefa de cada vez.
    const [coleta] = await db
      .select({ status: vpsJobs.status })
      .from(vpsJobs)
      .where(
        and(
          eq(vpsJobs.serverId, servidorId),
          eq(vpsJobs.type, "servidor.coletar"),
        ),
      );
    expect(coleta.status).toBe("pendente");
  });

  it("servidor não ativo ou agente pausado não recebe tarefa", async () => {
    const servidorId = await novoServidor();
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    expect(
      await entregarTarefa(db, { ...pulsoOpcoes(servidorId), ativo: false }),
    ).toBeNull();
    expect(
      await entregarTarefa(db, { ...pulsoOpcoes(servidorId), pausado: true }),
    ).toBeNull();
    expect(await temTarefaAberta(db, servidorId)).toBe(true);
  });

  it("tarefa vencida não é entregue: vira expirada nas transições", async () => {
    const servidorId = await novoServidor();
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    await db
      .update(vpsJobs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(vpsJobs.id, t.id));
    const env = await db.transaction(async (tx) => {
      await transicoesPreguicosas(tx, servidorId);
      return entregarTarefa(tx, pulsoOpcoes(servidorId));
    });
    expect(env).toBeNull();
    expect(await tarefa(t.id)).toMatchObject({
      status: "expirada",
      error: FRASE_NAO_BUSCOU,
    });
    expect(await temTarefaAberta(db, servidorId)).toBe(false);
  });

  it("pulso assinado → verificarPedido → entrega: o caminho da rota no núcleo", async () => {
    const token = "Z".repeat(43);
    const servidorId = await novoServidor({ agentTokenHash: sha256hex(token) });
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    const corpo = Buffer.from(
      JSON.stringify({
        versao: "1.0.0",
        travas: { pausado: false, somenteLeitura: false },
      }),
    );
    const seq = String(Date.now());
    const caminho = "/api/agente/v1/pulso";
    const { pedidos } = derivarChaves(Buffer.from(MESTRA), servidorId, 1);
    const request = new Request(
      `https://dash-board-psi-one.vercel.app${caminho}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-dash-servidor": servidorId,
          "x-dash-seq": seq,
          "x-dash-assinatura": `v1=${hmacHex(pedidos, canonicoPedido("POST", caminho, servidorId, seq, corpo))}`,
        },
        body: corpo,
      },
    );
    const v = await verificarPedido(db, request, corpo);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const env = await db.transaction(async (tx) => {
      await transicoesPreguicosas(tx, v.servidor.id);
      return entregarTarefa(tx, {
        servidorId: v.servidor.id,
        ativo: v.servidor.status === "ativo",
        pausado: false,
        executando: null,
      });
    });
    expect(env?.tipo).toBe("servidor.coletar");
  });
});

describe("transições preguiçosas e limpeza por tipo", () => {
  const vencer = (id: string) =>
    db
      .update(vpsJobs)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(vpsJobs.id, id));

  it("site.publicar vencido: release falhou e a LINHA do artefato some", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const release = await novaRelease(site.id);
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.publicar",
      params: publicar(site, release),
      siteId: site.id,
      releaseId: release.releaseId,
      por: POR,
    });
    await vencer(t.id);
    await transicoesPreguicosas(db, servidorId);
    const [r] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, release.releaseId));
    expect(r.status).toBe("falhou");
    expect(r.error).toMatch(/envie de novo/);
    expect(r.artifactId).toBeNull();
    expect(
      await db
        .select()
        .from(vpsArtifacts)
        .where(eq(vpsArtifacts.id, release.artefatoId)),
    ).toEqual([]);
    expect((await tarefa(t.id)).finishedAt).not.toBeNull();
  });

  it("site.configurar vencido: site configurando vira erro com a frase", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.configurar",
      params: configurar(site),
      siteId: site.id,
      por: POR,
    });
    await vencer(t.id);
    await transicoesPreguicosas(db);
    const [s] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(s.status).toBe("erro");
    expect(s.nginxError).toMatch(/Reaplicar no servidor/);
  });

  it("site.ssl_emitir vencido: HTTPS volta de emitindo para erro, sem virar 'falhou'", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await db
      .update(vpsSites)
      .set({ tlsStatus: "emitindo" })
      .where(eq(vpsSites.id, site.id));
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.ssl_emitir",
      params: {
        siteId: site.id,
        slug: site.slug,
        dominios: [`${site.slug}.com.br`],
        email: null,
      },
      siteId: site.id,
      por: POR,
    });
    await vencer(t.id);
    await transicoesPreguicosas(db, servidorId);
    const [s] = await db
      .select()
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(s).toMatchObject({
      tlsStatus: "erro",
      tlsError: FRASE_SSL_NAO_BUSCOU,
    });
    // Não conta para a espera de 15 min do Let's Encrypt, que olha só 'falhou'.
    expect((await tarefa(t.id)).status).toBe("expirada");
  });

  it("entregue há 15 min vira sem_resposta; sem_resposta há 1 h limpa a publicação", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const release = await novaRelease(site.id);
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.publicar",
      params: publicar(site, release),
      siteId: site.id,
      releaseId: release.releaseId,
      por: POR,
    });
    await entregarTarefa(db, pulsoOpcoes(servidorId));
    await db
      .update(vpsJobs)
      .set({ deliveredAt: new Date(Date.now() - 16 * 60_000) })
      .where(eq(vpsJobs.id, t.id));
    await transicoesPreguicosas(db, servidorId);
    expect((await tarefa(t.id)).status).toBe("sem_resposta");
    const ler = async () =>
      (
        await db
          .select()
          .from(vpsReleases)
          .where(eq(vpsReleases.id, release.releaseId))
      )[0];
    // Um resultado atrasado ainda pode chegar: nada é limpo antes de 1 h.
    expect((await ler()).status).toBe("enviando");
    await db
      .update(vpsJobs)
      .set({ updatedAt: new Date(Date.now() - 61 * 60_000) })
      .where(eq(vpsJobs.id, t.id));
    await transicoesPreguicosas(db, servidorId);
    const depois = await ler();
    expect(depois).toMatchObject({ status: "falhou", artifactId: null });
    expect(depois.error).toMatch(/não respondeu/);
  });

  it("rede de segurança: release enviando há 2 h sem tarefa aberta", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const release = await novaRelease(site.id);
    await db
      .update(vpsReleases)
      .set({ createdAt: new Date(Date.now() - 3 * 3600_000) })
      .where(eq(vpsReleases.id, release.releaseId));
    await transicoesPreguicosas(db, servidorId);
    const [r] = await db
      .select()
      .from(vpsReleases)
      .where(eq(vpsReleases.id, release.releaseId));
    expect(r.status).toBe("falhou");
    expect(
      await db
        .select()
        .from(vpsArtifacts)
        .where(eq(vpsArtifacts.id, release.artefatoId)),
    ).toEqual([]);
  });

  it("com servidorId, só mexe nas tarefas daquele servidor", async () => {
    const um = await novoServidor();
    const outro = await novoServidor();
    const t = await enfileirarTarefa(db, {
      workspaceId,
      servidorId: outro,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    await vencer(t.id);
    await transicoesPreguicosas(db, um);
    expect((await tarefa(t.id)).status).toBe("pendente");
    await transicoesPreguicosas(db, outro);
    expect((await tarefa(t.id)).status).toBe("expirada");
  });

  it("expirarTarefasAbertas (geração nova): pendente e entregue viram expirada, com limpeza", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    await db
      .update(vpsSites)
      .set({ tlsStatus: "emitindo" })
      .where(eq(vpsSites.id, site.id));
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "servidor.coletar",
      params: {},
      por: POR,
    });
    await entregarTarefa(db, pulsoOpcoes(servidorId));
    await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.ssl_emitir",
      params: {
        siteId: site.id,
        slug: site.slug,
        dominios: [`${site.slug}.com.br`],
        email: null,
      },
      siteId: site.id,
      por: POR,
    });
    expect(await expirarTarefasAbertas(db, servidorId)).toBe(2);
    expect(await temTarefaAberta(db, servidorId)).toBe(false);
    const [s] = await db
      .select({ tls: vpsSites.tlsStatus })
      .from(vpsSites)
      .where(eq(vpsSites.id, site.id));
    expect(s.tls).toBe("erro");
  });
});

describe("trava de ordem", () => {
  it("publicar A concluído depois de publicar B concluído não reativa A", async () => {
    const servidorId = await novoServidor();
    const site = await novoSite(servidorId);
    const a = await novaRelease(site.id);
    const b = await novaRelease(site.id);
    const ta = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.publicar",
      params: publicar(site, a),
      siteId: site.id,
      releaseId: a.releaseId,
      por: POR,
    });
    await db
      .update(vpsJobs)
      .set({ status: "sem_resposta" })
      .where(eq(vpsJobs.id, ta.id));
    const tb = await enfileirarTarefa(db, {
      workspaceId,
      servidorId,
      tipo: "site.publicar",
      params: publicar(site, b),
      siteId: site.id,
      releaseId: b.releaseId,
      por: POR,
    });
    await db
      .update(vpsJobs)
      .set({ status: "concluida" })
      .where(eq(vpsJobs.id, tb.id));
    expect(tb.seq).toBeGreaterThan(ta.seq);
    expect(await trocaDeVersaoLiberada(db, site.id, ta.seq)).toBe(false);
    expect(await trocaDeVersaoLiberada(db, site.id, tb.seq)).toBe(true);
    const outroSite = await novoSite(servidorId);
    expect(await trocaDeVersaoLiberada(db, outroSite.id, ta.seq)).toBe(true);
  });
});
