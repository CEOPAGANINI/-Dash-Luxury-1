import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";

import {
  vpsArtifacts,
  vpsJobs,
  vpsReleases,
  vpsServers,
  vpsSites,
} from "@/database/schema/vps";

import {
  chaveMestraOuErro,
  derivarChaves,
  hmacHex,
  mensagemTarefa,
} from "./chaves";
import {
  ESTADOS_TAREFA_ABERTA,
  VpsError,
  type ParamsDaTarefa,
  type TipoTarefa,
} from "./modelo";
import {
  envelopeDaTarefa,
  montarParams,
  type TarefaParaAgenteDados,
} from "./protocolo";
import { detalheDoErroPg, type BancoVps } from "./schema-sql";

/*
  A fila de tarefas painel → agente.

  Não há cron na Vercel: as tarefas mudam de estado de forma PREGUIÇOSA,
  em todo pulso, em toda leitura de estado e antes de enfileirar, na mesma
  transação. Não há "cancelar" no MVP: a tarefa vence pela `expiraEm`
  assinada, e a `seq` assinada (gravada no agente antes de executar)
  impede reviver uma tarefa.

  Tudo aqui usa o query builder: `seq` e `job_seq` são int8, e só o
  `bigint({ mode: "number" })` do schema os devolve como number nos dois
  drivers (postgres-js e PGlite).
*/

/** A tarefa assinada vale 10 min; o agente aceita até 120 s de folga. */
export const VALIDADE_TAREFA_S = 600;

export const FRASE_NAO_BUSCOU = "O servidor não buscou a tarefa em 10 min";
export const FRASE_NAO_RESPONDEU =
  "O servidor começou a tarefa e não respondeu";
export const FRASE_SSL_NAO_BUSCOU = "O servidor não buscou o pedido de HTTPS";

type TarefaParaLimpar = {
  id: string;
  type: string;
  siteId: string | null;
  releaseId: string | null;
  /** Como a tarefa terminou sem resultado. */
  motivo: "expirada" | "sem_resposta";
};

/**
 * A release não chegou ao servidor: vira `falhou` (se ainda estava
 * `enviando`) e a LINHA do artefato sai do banco — 3 MB de bytea não
 * ficam órfãos.
 */
async function falharRelease(
  tx: BancoVps,
  releaseId: string,
  mensagem: string,
): Promise<void> {
  const agora = new Date();
  const [release] = await tx
    .select({ artifactId: vpsReleases.artifactId })
    .from(vpsReleases)
    .where(eq(vpsReleases.id, releaseId))
    .limit(1);
  await tx
    .update(vpsReleases)
    .set({ status: "falhou", error: mensagem, updatedAt: agora })
    .where(
      and(eq(vpsReleases.id, releaseId), eq(vpsReleases.status, "enviando")),
    );
  if (release?.artifactId)
    await tx
      .delete(vpsArtifacts)
      .where(eq(vpsArtifacts.id, release.artifactId));
}

/**
 * Limpeza por tipo (§4, passo 3) para tarefas que terminaram sem
 * resultado. Cada efeito é condicional ao estado atual, então rodar de
 * novo não muda nada.
 */
export async function limparPorTipo(
  tx: BancoVps,
  tarefas: TarefaParaLimpar[],
): Promise<void> {
  const agora = new Date();
  for (const t of tarefas) {
    const naoBuscou = t.motivo === "expirada";
    if (t.type === "site.publicar" && t.releaseId) {
      await falharRelease(
        tx,
        t.releaseId,
        naoBuscou
          ? "O servidor não buscou a publicação; envie de novo."
          : "O servidor não respondeu à publicação; envie de novo.",
      );
    } else if (t.type === "site.configurar" && t.siteId) {
      await tx
        .update(vpsSites)
        .set({
          status: "erro",
          nginxError: naoBuscou
            ? `${FRASE_NAO_BUSCOU}. Use "Reaplicar no servidor".`
            : `${FRASE_NAO_RESPONDEU}. Use "Reaplicar no servidor".`,
          updatedAt: agora,
        })
        .where(
          and(eq(vpsSites.id, t.siteId), eq(vpsSites.status, "configurando")),
        );
    } else if (t.type === "site.ssl_emitir" && t.siteId) {
      // Não conta como falha do Let's Encrypt para a espera de 15 min:
      // o certbot nem rodou (a tarefa fica expirada/sem_resposta, não falhou).
      await tx
        .update(vpsSites)
        .set({
          tlsStatus: "erro",
          tlsError: naoBuscou
            ? FRASE_SSL_NAO_BUSCOU
            : "O servidor começou o pedido de HTTPS e não respondeu",
          updatedAt: agora,
        })
        .where(
          and(eq(vpsSites.id, t.siteId), eq(vpsSites.tlsStatus, "emitindo")),
        );
    }
    // site.remover: o site continua `removendo`; a tela oferece
    // "Remover do painel mesmo sem resposta". servidor.coletar: nada.
  }
}

/**
 * Transições preguiçosas (§4). Com `servidorId`, só as tarefas e releases
 * desse servidor; sem, todas.
 * 1. `pendente` vencida vira `expirada`;
 * 2. `entregue` há mais de 15 min vira `sem_resposta`;
 * 3. limpeza por tipo das que acabaram de expirar e das `sem_resposta`
 *    há mais de 1 h (um resultado atrasado ainda pode chegar antes disso);
 * 4. rede de segurança: release `enviando` há mais de 2 h sem tarefa aberta.
 */
export async function transicoesPreguicosas(
  tx: BancoVps,
  servidorId?: string,
): Promise<void> {
  const agora = new Date();
  const doServidor = servidorId ? eq(vpsJobs.serverId, servidorId) : undefined;

  const expiradas = await tx
    .update(vpsJobs)
    .set({
      status: "expirada",
      finishedAt: sql`now()`,
      error: FRASE_NAO_BUSCOU,
      updatedAt: agora,
    })
    .where(
      and(
        eq(vpsJobs.status, "pendente"),
        lt(vpsJobs.expiresAt, sql`now()`),
        doServidor,
      ),
    )
    .returning({
      id: vpsJobs.id,
      type: vpsJobs.type,
      siteId: vpsJobs.siteId,
      releaseId: vpsJobs.releaseId,
    });

  await tx
    .update(vpsJobs)
    .set({ status: "sem_resposta", updatedAt: agora })
    .where(
      and(
        eq(vpsJobs.status, "entregue"),
        lt(vpsJobs.deliveredAt, sql`now() - interval '15 minutes'`),
        doServidor,
      ),
    );

  const semResposta = await tx
    .select({
      id: vpsJobs.id,
      type: vpsJobs.type,
      siteId: vpsJobs.siteId,
      releaseId: vpsJobs.releaseId,
    })
    .from(vpsJobs)
    .where(
      and(
        eq(vpsJobs.status, "sem_resposta"),
        lt(vpsJobs.updatedAt, sql`now() - interval '1 hour'`),
        doServidor,
      ),
    );

  await limparPorTipo(tx, [
    ...expiradas.map((t) => ({ ...t, motivo: "expirada" as const })),
    ...semResposta.map((t) => ({ ...t, motivo: "sem_resposta" as const })),
  ]);

  const orfas = await tx
    .select({ id: vpsReleases.id })
    .from(vpsReleases)
    .innerJoin(vpsSites, eq(vpsSites.id, vpsReleases.siteId))
    .where(
      and(
        eq(vpsReleases.status, "enviando"),
        lt(vpsReleases.createdAt, sql`now() - interval '2 hours'`),
        servidorId ? eq(vpsSites.serverId, servidorId) : undefined,
        sql`not exists (select 1 from ${vpsJobs} where ${vpsJobs.releaseId} = ${vpsReleases.id} and ${vpsJobs.status} in ('pendente', 'entregue'))`,
      ),
    );
  for (const release of orfas)
    await falharRelease(
      tx,
      release.id,
      "O servidor não buscou/não respondeu; envie de novo.",
    );
}

/**
 * Expira as tarefas abertas de um servidor, com a limpeza por tipo. Usado
 * quando a geração das chaves muda (registro novo, recusa, remoção): as
 * assinaturas antigas não valem mais.
 */
export async function expirarTarefasAbertas(
  tx: BancoVps,
  servidorId: string,
  motivo = "As chaves do servidor mudaram; a tarefa não vale mais",
): Promise<number> {
  const abertas = await tx
    .update(vpsJobs)
    .set({
      status: "expirada",
      finishedAt: sql`now()`,
      error: motivo,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vpsJobs.serverId, servidorId),
        inArray(vpsJobs.status, [...ESTADOS_TAREFA_ABERTA]),
      ),
    )
    .returning({
      id: vpsJobs.id,
      type: vpsJobs.type,
      siteId: vpsJobs.siteId,
      releaseId: vpsJobs.releaseId,
    });
  await limparPorTipo(
    tx,
    abertas.map((t) => ({ ...t, motivo: "expirada" as const })),
  );
  return abertas.length;
}

export type NovaTarefa<T extends TipoTarefa = TipoTarefa> = {
  workspaceId: string;
  servidorId: string;
  tipo: T;
  params: ParamsDaTarefa<T>;
  /** Obrigatório (e igual a params.siteId) nos tipos `site.*`. */
  siteId?: string | null;
  /** Obrigatório (e igual a params.versaoId) em `site.publicar`. */
  releaseId?: string | null;
  /** E-mail de quem pediu (auditoria e tela). */
  por: string;
};

export type TarefaEnfileirada = {
  id: string;
  seq: number;
  /** true quando era uma coleta já aberta (dedupe pelo índice). */
  repetida: boolean;
};

/**
 * Enfileira uma tarefa assinada. A seq vem do UPDATE atômico de `job_seq`
 * (a numeração nunca repete, nem com duas instâncias ao mesmo tempo), e a
 * assinatura é calculada UMA vez, com o `expiraEm` inteiro que também vai
 * para `expires_at`.
 *
 * Aceita `db` ou uma transação (vira savepoint). Erros:
 * - 409 `servidor_nao_pronto`: servidor não está `ativo`;
 * - 409 `site_ocupado`: já há tarefa aberta para o site (índice parcial);
 * - coleta repetida devolve a coleta já aberta (`repetida: true`).
 */
export async function enfileirarTarefa<T extends TipoTarefa>(
  db: BancoVps,
  nova: NovaTarefa<T>,
): Promise<TarefaEnfileirada> {
  const { workspaceId, servidorId, tipo, por } = nova;
  const params = montarParams(tipo, nova.params);
  const siteId = nova.siteId ?? null;
  const releaseId = nova.releaseId ?? null;
  const doParam = nova.params as { siteId?: string; versaoId?: string };
  if (tipo.startsWith("site.") && (!siteId || siteId !== doParam.siteId))
    throw new VpsError(
      400,
      "dados_invalidos",
      "A tarefa de site precisa do siteId da linha igual ao dos parâmetros.",
    );
  if (
    tipo === "site.publicar" &&
    (!releaseId || releaseId !== doParam.versaoId)
  )
    throw new VpsError(
      400,
      "dados_invalidos",
      "A publicação precisa do releaseId igual ao versaoId dos parâmetros.",
    );
  const mestra = chaveMestraOuErro();

  try {
    return await db.transaction(async (tx) => {
      await transicoesPreguicosas(tx, servidorId);
      const [srv] = await tx
        .update(vpsServers)
        .set({
          jobSeq: sql`${vpsServers.jobSeq} + 1`,
          fastPulseUntil: sql`now() + interval '5 minutes'`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(vpsServers.id, servidorId),
            eq(vpsServers.workspaceId, workspaceId),
            eq(vpsServers.status, "ativo"),
            isNull(vpsServers.deletedAt),
          ),
        )
        .returning({
          seq: vpsServers.jobSeq,
          geracao: vpsServers.keyGeneration,
        });
      if (!srv)
        throw new VpsError(
          409,
          "servidor_nao_pronto",
          "O servidor ainda não está pronto.",
        );
      const id = randomUUID();
      const expiraEm = Math.floor(Date.now() / 1000) + VALIDADE_TAREFA_S;
      const { tarefas } = derivarChaves(mestra, servidorId, srv.geracao);
      const assinatura = hmacHex(
        tarefas,
        mensagemTarefa({
          servidorId,
          id,
          seq: srv.seq,
          tipo,
          expiraEm,
          params,
        }),
      );
      await tx.insert(vpsJobs).values({
        id,
        workspaceId,
        serverId: servidorId,
        siteId,
        releaseId,
        seq: srv.seq,
        type: tipo,
        params,
        signature: assinatura,
        expiresAt: new Date(expiraEm * 1000),
        createdBy: por,
      });
      return { id, seq: srv.seq, repetida: false };
    });
  } catch (erro) {
    const { codigo, restricao, mensagem } = detalheDoErroPg(erro);
    if (codigo !== "23505") throw erro;
    const indice = `${restricao ?? ""} ${mensagem ?? ""}`;
    if (indice.includes("vps_jobs_site_aberta_idx"))
      throw new VpsError(
        409,
        "site_ocupado",
        "Este site já tem uma tarefa em andamento. Espere a anterior terminar.",
      );
    if (indice.includes("vps_jobs_coleta_aberta_idx")) {
      const [aberta] = await db
        .select({ id: vpsJobs.id, seq: vpsJobs.seq })
        .from(vpsJobs)
        .where(
          and(
            eq(vpsJobs.serverId, servidorId),
            eq(vpsJobs.type, "servidor.coletar"),
            inArray(vpsJobs.status, [...ESTADOS_TAREFA_ABERTA]),
          ),
        )
        .limit(1);
      if (aberta) return { ...aberta, repetida: true };
    }
    throw erro;
  }
}

const COLUNAS_DO_ENVELOPE = {
  id: vpsJobs.id,
  seq: vpsJobs.seq,
  type: vpsJobs.type,
  params: vpsJobs.params,
  signature: vpsJobs.signature,
  expiresAt: vpsJobs.expiresAt,
};

/**
 * Entrega de tarefa no pulso (§5.B, passo 6), dentro da transação do pulso
 * e DEPOIS das transições preguiçosas:
 * - servidor não `ativo`, agente pausado ou já executando algo: nada;
 * - há tarefa `entregue`: reentrega a MESMA (mesmo envelope assinado, sem
 *   mudar o estado). Cobre resposta de pulso perdida e reinício; o diário
 *   do agente torna isso idempotente;
 * - senão, reivindica UMA `pendente` não vencida, com FOR UPDATE SKIP
 *   LOCKED (dois pulsos simultâneos nunca levam a mesma).
 */
export async function entregarTarefa(
  tx: BancoVps,
  opcoes: {
    servidorId: string;
    ativo: boolean;
    pausado: boolean;
    executando: string | null;
  },
): Promise<TarefaParaAgenteDados | null> {
  const { servidorId } = opcoes;
  if (!opcoes.ativo || opcoes.pausado || opcoes.executando) return null;

  const [jaEntregue] = await tx
    .select(COLUNAS_DO_ENVELOPE)
    .from(vpsJobs)
    .where(
      and(eq(vpsJobs.serverId, servidorId), eq(vpsJobs.status, "entregue")),
    )
    .orderBy(asc(vpsJobs.seq))
    .limit(1);
  if (jaEntregue) return envelopeDaTarefa(jaEntregue);

  const [prox] = await tx
    .select({ id: vpsJobs.id })
    .from(vpsJobs)
    .where(
      and(
        eq(vpsJobs.serverId, servidorId),
        eq(vpsJobs.status, "pendente"),
        gt(vpsJobs.expiresAt, sql`now()`),
      ),
    )
    .orderBy(asc(vpsJobs.seq))
    .limit(1)
    .for("update", { skipLocked: true });
  if (!prox) return null;
  const [tarefa] = await tx
    .update(vpsJobs)
    .set({ status: "entregue", deliveredAt: sql`now()`, updatedAt: new Date() })
    .where(and(eq(vpsJobs.id, prox.id), eq(vpsJobs.status, "pendente")))
    .returning(COLUNAS_DO_ENVELOPE);
  return tarefa ? envelopeDaTarefa(tarefa) : null;
}

/** Há tarefa aberta (pendente ou entregue) para este servidor? */
export async function temTarefaAberta(
  tx: BancoVps,
  servidorId: string,
): Promise<boolean> {
  const [aberta] = await tx
    .select({ id: vpsJobs.id })
    .from(vpsJobs)
    .where(
      and(
        eq(vpsJobs.serverId, servidorId),
        inArray(vpsJobs.status, [...ESTADOS_TAREFA_ABERTA]),
      ),
    )
    .limit(1);
  return Boolean(aberta);
}

/**
 * Trava de ordem (§5.C): um resultado que troca a versão ativa (publicar
 * ou ativar) só aplica a troca se NÃO existe tarefa `concluida` do mesmo
 * site, desses dois tipos, com seq maior. Um resultado atrasado ainda
 * corrige o estado da release, mas não reativa uma versão velha.
 */
export async function trocaDeVersaoLiberada(
  tx: BancoVps,
  siteId: string,
  seq: number,
): Promise<boolean> {
  const [maisNova] = await tx
    .select({ id: vpsJobs.id })
    .from(vpsJobs)
    .where(
      and(
        eq(vpsJobs.siteId, siteId),
        eq(vpsJobs.status, "concluida"),
        inArray(vpsJobs.type, ["site.publicar", "site.ativar_versao"]),
        gt(vpsJobs.seq, seq),
        isNotNull(vpsJobs.siteId),
      ),
    )
    .limit(1);
  return !maisNova;
}
