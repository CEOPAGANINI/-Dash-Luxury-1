/*
  O lado do PAINEL no ponta a ponta real (§14.E), chamado por
  scripts/vps/e2e_teste.py:

    npx tsx scripts/vps/semear.ts <comando> [--opcao valor ...]

  Cada comando chama os SERVIÇOS reais (src/features/vps/servico.ts e
  tarefas.ts) com um cliente postgres-js próprio, igual ao de produção
  (prepare:false, int8 como string no SQL cru), e escreve UMA linha JSON
  no stdout. Nada de next/*: a sessão e a guarda (acesso.ts) ficam de
  fora de propósito, porque o E2E roda no build demo, onde nenhuma action
  passa da guarda. Quem confere a guarda são os testes de integração.

  Saída: exit 0 com `{ok:true,...}`; exit 3 com `{ok:false,codigo,...}`
  quando o serviço RECUSOU (VpsError: é o que alguns passos esperam); exit
  1 para qualquer outro erro.

  Os comandos `publicar-forjado` e `forjar-tarefa` imitam quem tem o env e
  o banco (ou um bug no painel): pulam a inspeção do ZIP ou a validação
  dos parâmetros e assinam com a chave de verdade. Servem para provar que
  o AGENTE recusa sozinho o que o painel deixaria passar.
*/
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";
import path from "node:path";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/database/schema";
import { profiles, workspaces } from "@/database/schema";
import { vpsJobs, vpsServers, vpsSites } from "@/database/schema/vps";
import {
  chaveMestraOuErro,
  derivarChaves,
  hmacHex,
  mensagemTarefa,
  sha256hex,
} from "@/features/vps/chaves";
import { lookupFixo } from "@/features/vps/conferencia";
import type { ResolvedorDns } from "@/features/vps/dns";
import {
  calcularHostsReservados,
  calcularOrigensPermitidas,
  VpsError,
  type TipoTarefa,
} from "@/features/vps/modelo";
import {
  inspecionarZip,
  type ZipInspecionado,
} from "@/features/vps/pacote-zip";
import { montarParams } from "@/features/vps/protocolo";
import { entregarTarefa } from "@/features/vps/tarefas";
import {
  ativarVersao,
  confirmarServidor,
  conferirSite,
  criarServidor,
  criarSite,
  informarIp,
  lerAgora,
  novaInstalacao,
  publicarZip,
  reaplicarSite,
  removerServidor,
  removerSite,
  verificarDns,
} from "@/features/vps/servico";
import { getAppUrl } from "@/lib/app-url";

type Banco = ReturnType<typeof abrirBanco>["db"];
type Opcoes = Record<string, string>;

/** O mesmo slug de getOrCreateDefaultWorkspace (src/lib/workspace.ts). */
const WORKSPACE_PADRAO = "infinity-principal";

function abrirBanco() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  // Cliente próprio (e não o singleton de @/database/client): o seed é um
  // processo curto e precisa fechar a conexão para sair.
  const cliente = postgres(url, { prepare: false, max: 12 });
  return { cliente, db: drizzle(cliente, { schema }) };
}

/**
 * O workspace que o painel usaria. Igual a getOrCreateDefaultWorkspace,
 * mas sobre o cliente deste processo (aquele usa o singleton de getDb,
 * que nunca fecha).
 */
async function workspacePadrao(db: Banco): Promise<string> {
  const [existente] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, WORKSPACE_PADRAO))
    .limit(1);
  if (existente) return existente.id;
  const [perfil] = await db
    .insert(profiles)
    .values({
      id: randomUUID(),
      email: "sistema@infinity.app",
      name: "Sistema Infinity",
    })
    .returning({ id: profiles.id });
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: "Infinity Principal",
      slug: WORKSPACE_PADRAO,
      ownerId: perfil.id,
    })
    .returning({ id: workspaces.id });
  return ws.id;
}

/** Quem "clicou": o primeiro e-mail de VPS_DONOS, como a sessão do dono. */
function dono(): string {
  const email = (process.env.VPS_DONOS ?? "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.includes("@"));
  if (!email) throw new Error("VPS_DONOS sem e-mail.");
  return email.toLowerCase();
}

function configuracao() {
  const appUrl = getAppUrl();
  const extras = process.env.VPS_CHECKOUT_ORIGENS;
  return {
    appUrl,
    origens: calcularOrigensPermitidas(appUrl, extras),
    hostsReservados: calcularHostsReservados(appUrl, extras),
  };
}

function exigir(opcoes: Opcoes, nome: string): string {
  const valor = opcoes[nome];
  if (valor === undefined) throw new Error(`Falta --${nome}.`);
  return valor;
}

/** Um Resolver de verdade (node:dns, UDP) apontado para o DNS do teste. */
function resolvedorLocal(servidor: string): ResolvedorDns {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers([servidor]);
  return {
    resolve4: (hostname) => resolver.resolve4(hostname),
    resolve6: (hostname) => resolver.resolve6(hostname),
  };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

type Comando = (
  db: Banco,
  ws: string,
  opcoes: Opcoes,
) => Promise<Record<string, unknown>>;

const comandos: Record<string, Comando> = {
  async servidor(db, ws, o) {
    const criado = await criarServidor(db, {
      workspaceId: ws,
      nome: exigir(o, "nome"),
      por: dono(),
      painel: configuracao().appUrl,
    });
    return {
      workspaceId: ws,
      servidorId: criado.servidorId,
      codigo: criado.codigo,
      comando: criado.instalacao.comando,
      sha256Instalador: criado.instalacao.sha256Instalador,
      expiraEm: criado.instalacao.expiraEm,
    };
  },

  async "nova-instalacao"(db, ws, o) {
    const nova = await novaInstalacao(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      painel: configuracao().appUrl,
    });
    return { codigo: nova.codigo, comando: nova.instalacao.comando };
  },

  async confirmar(db, ws, o) {
    const resposta = exigir(o, "resposta");
    if (resposta !== "sim" && resposta !== "nao")
      throw new Error("--resposta sim|nao");
    return confirmarServidor(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      resposta,
      por: dono(),
    });
  },

  async "ler-agora"(db, ws, o) {
    const t = await lerAgora(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      por: dono(),
    });
    return { tarefaId: t.id, seq: t.seq, repetida: t.repetida };
  },

  async "informar-ip"(db, ws, o) {
    return informarIp(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      ip: exigir(o, "ip"),
    });
  },

  async site(db, ws, o) {
    const { origens, hostsReservados } = configuracao();
    return criarSite(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      nome: exigir(o, "nome"),
      dominio: exigir(o, "dominio"),
      incluirWww: o.www === "sim",
      checkout: null,
      origemCheckout: o.origem ?? origens[0] ?? "",
      origens,
      hostsReservados,
      por: dono(),
    });
  },

  /**
   * N sites criados AO MESMO TEMPO (Promise.all, conexões separadas do
   * pool): cada um enfileira um site.configurar pelo UPDATE atômico de
   * job_seq. As seqs têm de sair todas diferentes.
   */
  async "sites-paralelos"(db, ws, o) {
    const { origens, hostsReservados } = configuracao();
    const servidorId = exigir(o, "servidor");
    const quantos = Number(exigir(o, "quantos"));
    const prefixo = exigir(o, "prefixo");
    const criados = await Promise.all(
      Array.from({ length: quantos }, (_, i) =>
        criarSite(db, {
          workspaceId: ws,
          servidorId,
          nome: `${prefixo} ${i + 1}`,
          dominio: `${prefixo}-${i + 1}.com.br`,
          incluirWww: false,
          checkout: null,
          origemCheckout: origens[0] ?? "",
          origens,
          hostsReservados,
          por: dono(),
        }),
      ),
    );
    const tarefas = await db
      .select({ id: vpsJobs.id, seq: vpsJobs.seq, siteId: vpsJobs.siteId })
      .from(vpsJobs)
      .where(
        inArray(
          vpsJobs.id,
          criados.map((c) => c.tarefaId),
        ),
      )
      .orderBy(asc(vpsJobs.seq));
    return { sites: criados, tarefas };
  },

  /**
   * Reivindicações AO MESMO TEMPO direto no banco, sem o freio de 1 s do
   * pulso (que por HTTP já serializa tudo): cada transação reivindica e
   * segura a trava por 1 s. Com FOR UPDATE SKIP LOCKED nenhuma tarefa sai
   * duas vezes e ninguém espera a outra (o tempo total fica perto de 1 s,
   * e não de N s).
   */
  async "reivindicar-paralelo"(db, _ws, o) {
    const servidorId = exigir(o, "servidor");
    const quantos = Number(exigir(o, "quantos"));
    const inicio = Date.now();
    const entregues = await Promise.all(
      Array.from({ length: quantos }, () =>
        db.transaction(async (tx) => {
          const t = await entregarTarefa(tx, {
            servidorId,
            ativo: true,
            pausado: false,
            executando: null,
          });
          await tx.execute(sql`select pg_sleep(1)`);
          return t ? { id: t.id, seq: t.seq } : null;
        }),
      ),
    );
    return { entregues, ms: Date.now() - inicio };
  },

  async dns(db, ws, o) {
    return verificarDns(db, {
      workspaceId: ws,
      siteId: exigir(o, "site"),
      email: dono(),
      por: dono(),
      resolvedor: resolvedorLocal(exigir(o, "servidor-dns")),
    });
  },

  async publicar(db, ws, o) {
    const arquivo = exigir(o, "zip");
    const bytes = readFileSync(arquivo);
    const inspecao = inspecionarZip(bytes);
    if (!inspecao.ok)
      throw new VpsError(422, "dados_invalidos", "O ZIP tem problemas", {
        problemas: inspecao.problemas,
      });
    const feito = await publicarZip(db, {
      workspaceId: ws,
      siteId: exigir(o, "site"),
      por: dono(),
      nomeDoArquivo: path.basename(arquivo),
      bytes,
      inspecao,
    });
    return {
      versaoId: feito.release.id,
      tarefaId: feito.tarefa.id,
      seq: feito.tarefa.seq,
      indexSha256: inspecao.indexSha256,
      sha256: inspecao.sha256,
      arquivos: inspecao.arquivos,
      temRastreio: inspecao.temRastreio,
      paginas: inspecao.paginas,
    };
  },

  /**
   * Publica SEM a inspeção do painel: o ZIP vai assinado (sha256 real)
   * para o agente, que precisa recusá-lo sozinho na extração.
   */
  async "publicar-forjado"(db, ws, o) {
    const arquivo = exigir(o, "zip");
    const bytes = readFileSync(arquivo);
    const painel = inspecionarZip(bytes);
    const inspecao: Extract<ZipInspecionado, { ok: true }> = {
      ok: true,
      sha256: sha256hex(bytes),
      zipBytes: bytes.length,
      arquivos: ["index.html"],
      bytesDescompactados: bytes.length,
      indexSha256: "0".repeat(64),
      paginas: {},
      temRastreio: false,
      avisos: ["forjado pelo E2E: a inspeção do painel foi pulada"],
    };
    const feito = await publicarZip(db, {
      workspaceId: ws,
      siteId: exigir(o, "site"),
      por: "e2e-forjado",
      nomeDoArquivo: path.basename(arquivo),
      bytes,
      inspecao,
    });
    return {
      versaoId: feito.release.id,
      tarefaId: feito.tarefa.id,
      artefatoId: feito.release.artifactId,
      painelRecusaria: !painel.ok,
      problemasNoPainel: painel.ok ? [] : painel.problemas,
    };
  },

  async ativar(db, ws, o) {
    return ativarVersao(db, {
      workspaceId: ws,
      versaoId: exigir(o, "versao"),
      por: dono(),
    });
  },

  async reaplicar(db, ws, o) {
    return reaplicarSite(db, {
      workspaceId: ws,
      siteId: exigir(o, "site"),
      por: dono(),
    });
  },

  /**
   * Uma tarefa assinada com a chave de verdade, mas com parâmetros que o
   * painel recusaria (montarParams). Prova que a regex do AGENTE barra a
   * injeção mesmo com assinatura válida.
   */
  async "forjar-tarefa"(db, ws, o) {
    const servidorId = exigir(o, "servidor");
    const tipo = exigir(o, "tipo") as TipoTarefa;
    const siteId = o.site ?? null;
    const objeto = JSON.parse(exigir(o, "params")) as Record<string, unknown>;
    let painelRecusou: string | null = null;
    try {
      montarParams(tipo, objeto as never);
    } catch (erro) {
      painelRecusou = erro instanceof Error ? erro.message : String(erro);
    }
    const params = JSON.stringify(objeto);
    return db.transaction(async (tx) => {
      const [srv] = await tx
        .update(vpsServers)
        .set({
          jobSeq: sql`${vpsServers.jobSeq} + 1`,
          fastPulseUntil: sql`now() + interval '5 minutes'`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(vpsServers.id, servidorId), eq(vpsServers.workspaceId, ws)),
        )
        .returning({
          seq: vpsServers.jobSeq,
          geracao: vpsServers.keyGeneration,
        });
      if (!srv) throw new Error("Servidor não encontrado.");
      const id = randomUUID();
      const expiraEm = Math.floor(Date.now() / 1000) + 600;
      const { tarefas } = derivarChaves(
        chaveMestraOuErro(),
        servidorId,
        srv.geracao,
      );
      await tx.insert(vpsJobs).values({
        id,
        workspaceId: ws,
        serverId: servidorId,
        siteId,
        seq: srv.seq,
        type: tipo,
        params,
        signature: hmacHex(
          tarefas,
          mensagemTarefa({
            servidorId,
            id,
            seq: srv.seq,
            tipo,
            expiraEm,
            params,
          }),
        ),
        expiresAt: new Date(expiraEm * 1000),
        createdBy: "e2e-forjado",
      });
      return { tarefaId: id, seq: srv.seq, painelRecusou };
    });
  },

  /** O painel recusa cada entrada com injeção ANTES de qualquer tarefa. */
  async injecao(db, ws, o) {
    const { origens, hostsReservados } = configuracao();
    const servidorId = exigir(o, "servidor");
    const tentativas: Array<{ dominio: string; origem: string }> = [
      { dominio: "loja-x.com.br;return 200", origem: origens[0] },
      { dominio: "loja-x.com.br\nserver_name evil.com", origem: origens[0] },
      { dominio: "$(id).com.br", origem: origens[0] },
      { dominio: "loja-x.com.br include /etc/passwd", origem: origens[0] },
      { dominio: "-d.com.br", origem: origens[0] },
      { dominio: "loja-x.vercel.app", origem: origens[0] },
      { dominio: "loja-x.com.br", origem: `${origens[0]}/;return 200` },
      { dominio: "loja-x.com.br", origem: "https://evil.com" },
    ];
    const antes = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(vpsJobs)
      .where(eq(vpsJobs.serverId, servidorId));
    const resultados = [];
    for (const t of tentativas) {
      try {
        const criado = await criarSite(db, {
          workspaceId: ws,
          servidorId,
          nome: "Injecao",
          dominio: t.dominio,
          incluirWww: false,
          checkout: null,
          origemCheckout: t.origem,
          origens,
          hostsReservados,
          por: dono(),
        });
        resultados.push({ ...t, recusado: false, siteId: criado.siteId });
      } catch (erro) {
        if (!(erro instanceof VpsError)) throw erro;
        resultados.push({ ...t, recusado: true, codigo: erro.codigo });
      }
    }
    const depois = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(vpsJobs)
      .where(eq(vpsJobs.serverId, servidorId));
    return {
      resultados,
      tarefasAntes: antes[0].n,
      tarefasDepois: depois[0].n,
    };
  },

  /**
   * "Conferir do lado de fora", com o nome fixado num servidor local que
   * serve o `current` da raiz falsa com o certificado que o certbot falso
   * emitiu (o nginx de verdade não roda aqui).
   */
  async conferir(db, ws, o) {
    const ca = o.ca ? readFileSync(o.ca) : undefined;
    const noAr = await conferirSite(
      db,
      { workspaceId: ws, siteId: exigir(o, "site") },
      {
        porta: Number(exigir(o, "porta")),
        lookup: lookupFixo("127.0.0.1"),
        ca,
      },
    );
    return { noAr };
  },

  async "remover-site"(db, ws, o) {
    return removerSite(db, {
      workspaceId: ws,
      siteId: exigir(o, "site"),
      confirmacao: exigir(o, "confirmacao"),
      por: dono(),
    });
  },

  async "remover-servidor"(db, ws, o) {
    return removerServidor(db, {
      workspaceId: ws,
      servidorId: exigir(o, "servidor"),
      confirmacao: exigir(o, "confirmacao"),
    });
  },

  /** Sites do servidor (para o teste conferir slugs sem SQL próprio). */
  async sites(db, ws, o) {
    return {
      sites: await db
        .select({ id: vpsSites.id, slug: vpsSites.slug })
        .from(vpsSites)
        .where(
          and(
            eq(vpsSites.serverId, exigir(o, "servidor")),
            eq(vpsSites.workspaceId, ws),
          ),
        ),
    };
  },
};

function lerOpcoes(argv: string[]): Opcoes {
  const opcoes: Opcoes = {};
  for (let i = 0; i < argv.length; i += 2) {
    const nome = argv[i];
    if (!nome.startsWith("--") || i + 1 >= argv.length)
      throw new Error(`Opção inválida: ${nome}`);
    opcoes[nome.slice(2)] = argv[i + 1];
  }
  return opcoes;
}

async function main(): Promise<number> {
  const [nome, ...resto] = process.argv.slice(2);
  const comando = comandos[nome ?? ""];
  if (!comando) {
    console.error(
      `Uso: semear.ts <${Object.keys(comandos).join("|")}> [--opcao valor]`,
    );
    return 1;
  }
  const opcoes = lerOpcoes(resto);
  const { cliente, db } = abrirBanco();
  try {
    const ws = await workspacePadrao(db);
    const dados = await comando(db, ws, opcoes);
    process.stdout.write(`${JSON.stringify({ ok: true, ...dados })}\n`);
    return 0;
  } catch (erro) {
    if (erro instanceof VpsError) {
      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          status: erro.status,
          codigo: erro.codigo,
          mensagem: erro.message,
          ...(erro.extra ?? {}),
        })}\n`,
      );
      return 3;
    }
    console.error("[semear]", erro);
    return 1;
  } finally {
    await cliente.end({ timeout: 5 });
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (erro) => {
    console.error("[semear]", erro);
    process.exit(1);
  },
);
