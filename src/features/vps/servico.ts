import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { auditLogs, checkouts, products } from "@/database/schema";
import {
  vpsArtifacts,
  vpsJobs,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema/vps";

import { INSTALADOR_SHA256 } from "./agente-versao";
import {
  chaveMestraOuErro,
  derivarChaves,
  novoCodigoDeInstalacao,
  paraBase64Url,
  sha256hex,
} from "./chaves";
import { conferirPublico, type OpcoesDaConferencia } from "./conferencia";
import { verificarDominio, type ResolvedorDns } from "./dns";
import {
  checkoutValido,
  CODIGOS_AGENTE,
  controlCharacters,
  derivarSlug,
  dominioDoSiteValido,
  ehTipoDeTarefa,
  ESTADOS_TAREFA_ABERTA,
  ipsEsperados,
  isPublicIpv4,
  lerDominioDoSite,
  MENSAGEM_CERTIFICADO_AUSENTE,
  R_SLUG_CHECKOUT,
  R_UUID,
  slugLivre,
  VpsError,
  type CodigoAgente,
  type CodigoVps,
  type ConferenciaPublica,
  type EstadoNoAr,
  type EstadoTarefa,
  type ParamsDaTarefa,
  type TipoTarefa,
} from "./modelo";
import { lerVisaoGeral } from "./overview";
import type { ZipInspecionado } from "./pacote-zip";
import {
  respostaAgente,
  respostaErroAgente,
  RESULTADO_POR_TIPO,
  type PedidoPulsoDados,
  type PedidoRegistroDados,
  type PedidoResultadoDados,
  type ServidorAutenticado,
  type TarefaParaAgenteDados,
} from "./protocolo";
import {
  detalheDoErroPg,
  faltaTabelaVps,
  mensagemDeErroVps,
  type BancoVps,
} from "./schema-sql";
import {
  enfileirarTarefa,
  entregarTarefa,
  expirarTarefasAbertas,
  temTarefaAberta,
  transicoesPreguicosas,
  trocaDeVersaoLiberada,
  type TarefaEnfileirada,
} from "./tarefas";
import { traduzirErroCertbot } from "./traducao-certbot";

/*
  Os serviços do Servidor do Funil: o que as rotas do agente, as rotas do
  painel e as server actions FAZEM no banco.

  Regras deste módulo:
  - recebe `db` por parâmetro e não importa `next/*` nem a sessão: roda
    igual numa rota, numa action, no seed do E2E (tsx) e nos testes com
    PGlite. Quem decide QUEM pode chamar é a guarda (acesso.ts) ou o HMAC
    (protocolo.ts), antes;
  - int8 (seq, job_seq, agent_last_seq, uncompressed_bytes) só pelo query
    builder: no SQL cru o postgres-js de produção devolve string;
  - efeito colateral que não pode derrubar a resposta (auditoria,
    conferência pública) nunca lança: quem chama agenda em `after()`.
*/

/** O código de instalação vale 30 min e é de uso único. */
export const VALIDADE_CODIGO_MS = 30 * 60_000;

/** Tira o agente da VPS; mantém os sites no ar (sem ninguém para atualizá-los). */
export const COMANDO_DESINSTALAR = "sudo dash-agent desinstalar";
/** Tira o agente e também os sites (vhosts, certificados e pastas). */
export const COMANDO_DESINSTALAR_TUDO =
  "sudo dash-agent desinstalar --remover-sites";

const agoraData = () => new Date();

// ---------------------------------------------------------------------------
// Erros → resposta HTTP
// ---------------------------------------------------------------------------

/** Os códigos do painel que têm equivalente na API do agente. */
const CODIGO_DO_AGENTE: Partial<
  Record<CodigoVps | CodigoAgente, CodigoAgente>
> = {
  sem_chave: "not_configured",
  sem_banco: "database_not_configured",
  sem_tabelas: "tables_missing",
  dados_invalidos: "invalid_request",
  nao_encontrado: "not_found",
  limite: "too_many_requests",
};

function ehCodigoDoAgente(codigo: string): codigo is CodigoAgente {
  return (CODIGOS_AGENTE as readonly string[]).includes(codigo);
}

/**
 * Qualquer erro → resposta JSON com `Cache-Control: no-store`.
 * - VpsError: o próprio status e código (no agente, o código em inglês);
 * - tabela que não existe: 503 `sem_tabelas` / `tables_missing`;
 * - QUALQUER outro erro: 500 `erro_interno` com console.error. O painel VPS
 *   anterior devolvia 503 "falta configuração" para tudo, o que escondia
 *   bug de verdade atrás de um aviso de setup.
 * No painel, o corpo é `{ ok: false, codigo, error: mensagem }`; no agente,
 * `{ ok: false, error: codigo }` (é o que o agente lê). 429 leva
 * Retry-After.
 */
export function respostaDeErroVps(
  erro: unknown,
  contexto: "painel" | "agente" = "painel",
): Response {
  if (erro instanceof VpsError) {
    const extra = erro.extra ?? {};
    const cabecalhos: Record<string, string> =
      erro.status === 429
        ? {
            "Retry-After": String(
              typeof extra.tenteEm === "number" ? extra.tenteEm : 60,
            ),
          }
        : {};
    if (contexto === "agente") {
      const codigo = ehCodigoDoAgente(erro.codigo)
        ? erro.codigo
        : (CODIGO_DO_AGENTE[erro.codigo] ?? "erro_interno");
      if (codigo === "erro_interno")
        console.error("[vps] erro do painel na API do agente", erro);
      return respostaErroAgente(
        codigo === "erro_interno" ? 500 : erro.status,
        codigo,
        extra,
        cabecalhos,
      );
    }
    return respostaAgente(
      erro.status,
      { ok: false, codigo: erro.codigo, error: erro.message, ...extra },
      cabecalhos,
    );
  }
  if (faltaTabelaVps(erro)) {
    console.error("[vps] tabelas do Servidor do Funil ausentes", erro);
    return contexto === "agente"
      ? respostaErroAgente(503, "tables_missing")
      : respostaAgente(503, {
          ok: false,
          codigo: "sem_tabelas",
          error: mensagemDeErroVps(erro),
        });
  }
  console.error("[vps] erro inesperado", erro);
  return contexto === "agente"
    ? respostaErroAgente(500, "erro_interno")
    : respostaAgente(500, {
        ok: false,
        codigo: "erro_interno",
        error:
          "Algo deu errado aqui no painel. Tente de novo; se continuar, veja os logs da Vercel.",
      });
}

// ---------------------------------------------------------------------------
// Auditoria (nunca lança: quem chama agenda em after())
// ---------------------------------------------------------------------------

export type EntradaDeAuditoria = {
  workspaceId: string;
  /** Sem o prefixo "vps." (ex.: "servidor.criado"). */
  acao: string;
  entidade: "vps_server" | "vps_site";
  entidadeId: string | null;
  /** E-mail de quem fez (ou "agente"). */
  por: string;
  /** Campos públicos: nunca hash, código, token, params nem conteúdo. */
  campos?: Record<string, unknown>;
};

/**
 * Grava em audit_logs. `actor_id` fica NULL: o usuário do Supabase pode
 * não existir em profiles (a FK é para profiles.id); quem fez vai em
 * `changes.por`.
 */
export async function auditar(
  db: BancoVps,
  entrada: EntradaDeAuditoria,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: entrada.workspaceId,
      actorId: null,
      action: `vps.${entrada.acao}`,
      entityType: entrada.entidade,
      entityId: entrada.entidadeId,
      changes: { por: entrada.por, ...(entrada.campos ?? {}) },
    });
  } catch (erro) {
    console.error("[vps] auditoria não gravada", entrada.acao, erro);
  }
}

// ---------------------------------------------------------------------------
// Instalação e registro do agente
// ---------------------------------------------------------------------------

export type Instalacao = {
  comando: string;
  expiraEm: string;
  sha256Instalador: string;
};

/** Só host e porta: o texto entra num comando de shell. */
const R_PAINEL = /^https?:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/;
const R_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/**
 * O comando que o dono cola no console da VPS (§7.4). O código de
 * instalação entra pelo STDIN (nunca pelo argv, que aparece no `ps` e no
 * log do sudo), e o instalador só roda depois de conferido o sha256. Isso
 * garante que o arquivo chegou inteiro; não protege contra um painel
 * comprometido (a tela diz isso).
 */
export function comandoDeInstalacao(
  painel: string,
  codigo: string,
  sha256Instalador = INSTALADOR_SHA256,
): string {
  if (!R_PAINEL.test(painel))
    throw new VpsError(
      503,
      "sem_https",
      "O endereço do painel não serve para o comando de instalação.",
    );
  if (!R_CODIGO.test(codigo))
    throw new VpsError(500, "erro_interno", "Código de instalação inválido.");
  return [
    `T=$(mktemp -d)`,
    `curl -fsSL --proto '=https' --tlsv1.2 ${painel}/agente/v1/instalar.sh -o "$T/instalar.sh"`,
    `echo "${sha256Instalador}  $T/instalar.sh" | sha256sum -c --quiet -`,
    `printf '%s\\n' '${codigo}' | if [ "$(id -u)" -eq 0 ]; then bash "$T/instalar.sh" --painel ${painel}; else sudo bash "$T/instalar.sh" --painel ${painel}; fi`,
  ].join(" && ");
}

function montarInstalacao(
  painel: string,
  codigo: string,
  expiraEm: Date,
): Instalacao {
  return {
    comando: comandoDeInstalacao(painel, codigo),
    expiraEm: expiraEm.toISOString(),
    sha256Instalador: INSTALADOR_SHA256,
  };
}

/**
 * Cria o servidor em `aguardando_agente` com um código de instalação novo.
 * O banco guarda só o sha256 do código; o código em si volta UMA vez (no
 * comando) e nunca mais aparece. `codigo` volta separado só para o seed do
 * E2E, que roda o instalador de verdade.
 */
export async function criarServidor(
  db: BancoVps,
  entrada: { workspaceId: string; nome: string; por: string; painel: string },
): Promise<{ servidorId: string; instalacao: Instalacao; codigo: string }> {
  const codigo = novoCodigoDeInstalacao();
  const expiraEm = new Date(Date.now() + VALIDADE_CODIGO_MS);
  const instalacao = montarInstalacao(entrada.painel, codigo, expiraEm);
  const [srv] = await db
    .insert(vpsServers)
    .values({
      workspaceId: entrada.workspaceId,
      name: entrada.nome,
      status: "aguardando_agente",
      enrollCodeHash: sha256hex(codigo),
      enrollExpiresAt: expiraEm,
      createdBy: entrada.por,
    })
    .returning({ id: vpsServers.id });
  return { servidorId: srv.id, instalacao, codigo };
}

/**
 * Novo código para o mesmo servidor (reinstalar, trocar de VPS, código
 * vencido). O agente atual continua valendo até o novo se registrar: o
 * registro é que gira a geração das chaves.
 */
export async function novaInstalacao(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    servidorId: string;
    painel: string;
  },
): Promise<{ instalacao: Instalacao; codigo: string }> {
  const codigo = novoCodigoDeInstalacao();
  const expiraEm = new Date(Date.now() + VALIDADE_CODIGO_MS);
  const instalacao = montarInstalacao(entrada.painel, codigo, expiraEm);
  const [srv] = await db
    .update(vpsServers)
    .set({
      enrollCodeHash: sha256hex(codigo),
      enrollExpiresAt: expiraEm,
      updatedAt: agoraData(),
    })
    .where(
      and(
        eq(vpsServers.id, entrada.servidorId),
        eq(vpsServers.workspaceId, entrada.workspaceId),
        isNull(vpsServers.deletedAt),
        ne(vpsServers.status, "revogado"),
      ),
    )
    .returning({ id: vpsServers.id });
  if (!srv) throw naoEncontrado("Servidor não encontrado.");
  return { instalacao, codigo };
}

export type RegistroFeito = {
  servidorId: string;
  workspaceId: string;
  hostname: string;
  resposta: {
    ok: true;
    servidorId: string;
    geracao: number;
    chavePedidos: string;
    chaveTarefas: string;
    ultimaSeqTarefa: number;
    proximoPulsoEm: number;
  };
};

/**
 * Registro do agente (§5.A). O código de uso único é consumido por UM
 * UPDATE atômico: dois registros simultâneos com o mesmo código nunca
 * passam os dois, e código vencido, usado ou inexistente dá o mesmo null
 * (a rota responde 401 invalid_code igual para os três). A geração gira,
 * e as tarefas abertas (assinadas com a geração anterior) expiram, com a
 * limpeza por tipo, na mesma transação.
 */
export async function registrarAgente(
  db: BancoVps,
  pedido: PedidoRegistroDados,
  ip: string | null,
): Promise<RegistroFeito | null> {
  const mestra = chaveMestraOuErro();
  const { agente } = pedido;
  try {
    return await db.transaction(async (tx) => {
      const [srv] = await tx
        .update(vpsServers)
        .set({
          agentTokenHash: pedido.tokenHash,
          enrollCodeHash: null,
          enrollExpiresAt: null,
          status: "aguardando_confirmacao",
          keyGeneration: sql`${vpsServers.keyGeneration} + 1`,
          agentLastSeq: 0,
          confirmedAt: null,
          confirmedBy: null,
          registeredAt: sql`now()`,
          lastPulseAt: sql`now()`,
          lastSeenIp: ip,
          hostname: agente.hostname,
          osName: agente.so,
          agentVersion: agente.versao,
          capabilities: {
            python: agente.python,
            certbot: agente.certbot,
            nginx: agente.nginx
              ? { versao: agente.nginx, configOk: null, ativo: null }
              : null,
            desvioRelogioMs: 0,
          },
          publicIpv4: agente.ipv4,
          publicIpv6: agente.ipv6,
          lastError: null,
          fastPulseUntil: sql`now() + interval '10 minutes'`,
          updatedAt: agoraData(),
        })
        .where(
          and(
            eq(vpsServers.enrollCodeHash, sha256hex(pedido.codigo)),
            gt(vpsServers.enrollExpiresAt, sql`now()`),
            isNull(vpsServers.deletedAt),
            ne(vpsServers.status, "revogado"),
          ),
        )
        .returning({
          id: vpsServers.id,
          workspaceId: vpsServers.workspaceId,
          geracao: vpsServers.keyGeneration,
          jobSeq: vpsServers.jobSeq,
        });
      if (!srv) return null;
      await expirarTarefasAbertas(tx, srv.id);
      const { pedidos, tarefas } = derivarChaves(mestra, srv.id, srv.geracao);
      return {
        servidorId: srv.id,
        workspaceId: srv.workspaceId,
        hostname: agente.hostname,
        resposta: {
          ok: true as const,
          servidorId: srv.id,
          geracao: srv.geracao,
          chavePedidos: paraBase64Url(pedidos),
          chaveTarefas: paraBase64Url(tarefas),
          ultimaSeqTarefa: srv.jobSeq,
          proximoPulsoEm: 5,
        },
      };
    });
  } catch (erro) {
    // O mesmo token em outro servidor (índice único): pedido inválido,
    // não erro do painel. O agente gera um token novo a cada registro.
    const { codigo, restricao, mensagem } = detalheDoErroPg(erro);
    if (
      codigo === "23505" &&
      `${restricao ?? ""} ${mensagem ?? ""}`.includes("vps_servers_token_idx")
    )
      throw new VpsError(400, "invalid_request", "Token já registrado.");
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Pulso (§5.B)
// ---------------------------------------------------------------------------

export type RespostaDoPulso = {
  ok: true;
  agora: string;
  agoraMs: number;
  proximoPulsoEm: 5 | 30;
  tarefa: TarefaParaAgenteDados | null;
};

/**
 * Reconciliação pelo `sites` do pulso: é o agente quem diz o que existe e
 * o que está ativo na VPS. Uma VPS trocada ou reinstalada aparece aqui
 * (site ausente, versões que sumiram) sem depender de resultado nenhum.
 */
async function reconciliarSites(
  tx: BancoVps,
  servidorId: string,
  informados: NonNullable<PedidoPulsoDados["sites"]>,
): Promise<void> {
  const agora = agoraData();
  const porSlug = new Map(informados.map((s) => [s.slug, s]));
  const sites = await tx
    .select({ id: vpsSites.id, slug: vpsSites.slug })
    .from(vpsSites)
    .where(and(eq(vpsSites.serverId, servidorId), isNull(vpsSites.deletedAt)));
  for (const site of sites) {
    const informado = porSlug.get(site.slug);
    await tx
      .update(vpsSites)
      .set({
        reportedPresent: Boolean(informado),
        reportedRelease: informado?.atual ?? null,
        reportedAt: agora,
        updatedAt: agora,
      })
      .where(eq(vpsSites.id, site.id));

    // Versões guardadas no painel que a VPS não tem mais (poda feita fora
    // de um resultado, disco trocado): viram "Removida".
    const versoes = informado?.versoes ?? [];
    await tx
      .update(vpsReleases)
      .set({ status: "removida", isActive: false, updatedAt: agora })
      .where(
        and(
          eq(vpsReleases.siteId, site.id),
          eq(vpsReleases.status, "no_servidor"),
          versoes.length > 0 ? notInArray(vpsReleases.id, versoes) : undefined,
        ),
      );

    if (!informado) continue;
    if (informado.atual && informado.atual !== "vazio") {
      await ativarRelease(tx, site.id, informado.atual);
    } else {
      // Página de espera (ou nada) em current: nenhuma versão ativa.
      await tx
        .update(vpsReleases)
        .set({ isActive: false, updatedAt: agora })
        .where(
          and(eq(vpsReleases.siteId, site.id), eq(vpsReleases.isActive, true)),
        );
    }
  }
}

/**
 * Passa `is_active` para a release (só uma `no_servidor` do site). Desliga
 * a anterior antes: o índice único parcial não admite duas ativas.
 */
async function ativarRelease(
  tx: BancoVps,
  siteId: string,
  releaseId: string,
): Promise<boolean> {
  if (!R_UUID.test(releaseId)) return false;
  const [alvo] = await tx
    .select({ id: vpsReleases.id, ativa: vpsReleases.isActive })
    .from(vpsReleases)
    .where(
      and(
        eq(vpsReleases.id, releaseId),
        eq(vpsReleases.siteId, siteId),
        eq(vpsReleases.status, "no_servidor"),
      ),
    )
    .limit(1);
  if (!alvo) return false;
  if (alvo.ativa) return true;
  const agora = agoraData();
  await tx
    .update(vpsReleases)
    .set({ isActive: false, updatedAt: agora })
    .where(and(eq(vpsReleases.siteId, siteId), eq(vpsReleases.isActive, true)));
  await tx
    .update(vpsReleases)
    .set({ isActive: true, activatedAt: agora, updatedAt: agora })
    .where(eq(vpsReleases.id, releaseId));
  return true;
}

/**
 * O pulso do agente, numa transação: sinal e capacidades, leitura do
 * servidor, validade dos certificados, reconciliação, transições
 * preguiçosas e entrega (ou reentrega) de UMA tarefa.
 *
 * Freio: um pulso a menos de 1 s do anterior leva 429 `{tenteEm: 5}`. A
 * conferência é no próprio UPDATE (relógio do banco), então dois pulsos
 * simultâneos nunca passam os dois.
 */
export async function processarPulso(
  db: BancoVps,
  servidor: ServidorAutenticado,
  dados: PedidoPulsoDados,
  ip: string | null,
): Promise<RespostaDoPulso> {
  const visao =
    dados.visaoGeral === null ? null : lerVisaoGeral(dados.visaoGeral);
  const capacidades: Record<string, unknown> = {
    desvioRelogioMs: dados.desvioMs,
  };
  if (dados.nginx) capacidades.nginx = dados.nginx;

  return db.transaction(async (tx) => {
    const agora = agoraData();
    const [srv] = await tx
      .update(vpsServers)
      .set({
        lastPulseAt: sql`now()`,
        ...(ip ? { lastSeenIp: ip } : {}),
        agentVersion: dados.versao,
        locks: dados.travas,
        // Junta no jsonb (não troca): o `nginx` só vem de vez em quando.
        capabilities: sql`${vpsServers.capabilities} || ${JSON.stringify(capacidades)}::jsonb`,
        publicIpv4: dados.ipv4,
        publicIpv6: dados.ipv6,
        // As pastas que existem no disco, deste servidor ou não: criarSite
        // nunca dá um desses slugs a um site novo.
        ...(dados.sites
          ? { reportedSlugs: dados.sites.map((s) => s.slug) }
          : {}),
        ...(visao === null
          ? {}
          : visao.ok
            ? {
                lastOverview: visao.visao,
                lastOverviewAt: sql`now()`,
                lastOverviewError: null,
              }
            : { lastOverviewError: visao.erro }),
        updatedAt: agora,
      })
      .where(
        and(
          eq(vpsServers.id, servidor.id),
          or(
            isNull(vpsServers.lastPulseAt),
            lt(vpsServers.lastPulseAt, sql`now() - interval '1 second'`),
          ),
        ),
      )
      .returning({
        status: vpsServers.status,
        fastPulseUntil: vpsServers.fastPulseUntil,
        viewerSeenAt: vpsServers.viewerSeenAt,
      });
    if (!srv)
      throw new VpsError(
        429,
        "too_many_requests",
        "Pulso rápido demais; espere alguns segundos.",
        { tenteEm: 5 },
      );

    if (dados.certificados)
      for (const certificado of dados.certificados)
        await tx
          .update(vpsSites)
          .set({
            tlsExpiresAt: certificado.validoAte
              ? new Date(certificado.validoAte)
              : null,
            tlsCheckedAt: agora,
            updatedAt: agora,
          })
          .where(
            and(
              eq(vpsSites.serverId, servidor.id),
              eq(vpsSites.slug, certificado.slug),
              isNull(vpsSites.deletedAt),
            ),
          );

    if (dados.sites) await reconciliarSites(tx, servidor.id, dados.sites);

    await transicoesPreguicosas(tx, servidor.id);
    const tarefa = await entregarTarefa(tx, {
      servidorId: servidor.id,
      ativo: srv.status === "ativo",
      pausado: dados.travas.pausado,
      executando: dados.executando,
    });

    const agoraMs = Date.now();
    const rapido =
      tarefa !== null ||
      (srv.fastPulseUntil !== null && srv.fastPulseUntil.getTime() > agoraMs) ||
      (srv.viewerSeenAt !== null &&
        srv.viewerSeenAt.getTime() > agoraMs - 120_000) ||
      (await temTarefaAberta(tx, servidor.id));

    return {
      ok: true as const,
      agora: new Date(agoraMs).toISOString(),
      agoraMs,
      proximoPulsoEm: rapido ? (5 as const) : (30 as const),
      tarefa,
    };
  });
}

// ---------------------------------------------------------------------------
// Resultado de tarefa (§5.C)
// ---------------------------------------------------------------------------

/** A resposta de sucesso do resultado (estrita, como tudo que vai ao agente). */
export const RespostaResultado = z.strictObject({
  ok: z.literal(true),
  repetido: z.boolean(),
});

export type ResultadoProcessado = {
  repetido: boolean;
  tipo: TipoTarefa;
  estado: "concluida" | "falhou";
  siteId: string | null;
  releaseId: string | null;
  /** O resultado não passou no schema do tipo: a tarefa virou `falhou`. */
  invalido: string | null;
  /** Uma versão passou a ser a ativa (auditoria e conferência pública). */
  versaoAtivada: string | null;
};

const ESTADOS_QUE_ACEITAM_RESULTADO: readonly EstadoTarefa[] = [
  "entregue",
  "sem_resposta",
  // Uma reentrega pode chegar depois de a tarefa expirar na fila.
  "expirada",
];

/** O que fica em vps_jobs.result: nunca a saída crua do OVERVIEW (até 70 KB). */
function resultadoParaGuardar(
  tipo: TipoTarefa,
  resultado: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!resultado) return null;
  if (tipo === "servidor.coletar")
    return {
      bytes:
        typeof resultado.visaoGeral === "string"
          ? resultado.visaoGeral.length
          : 0,
    };
  return resultado;
}

/**
 * O resultado de uma tarefa, numa transação com a linha da tarefa travada.
 * - tarefa de outro servidor ou outra seq: 404 job_not_found;
 * - já final com o mesmo estado: `repetido` (o agente reenvia pelo diário);
 * - já final com outro estado, ou ainda pendente: 409 job_not_delivered;
 * - `resultado` fora do schema do tipo: a tarefa vira `falhou` (com os
 *   efeitos de falha) e a rota responde 400. Sem isso a tarefa ficaria
 *   `entregue`, e a reentrega travaria a fila do servidor por 15 min.
 */
export async function processarResultado(
  db: BancoVps,
  servidor: ServidorAutenticado,
  tarefaId: string,
  dados: PedidoResultadoDados,
): Promise<ResultadoProcessado> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: vpsJobs.id,
        seq: vpsJobs.seq,
        type: vpsJobs.type,
        status: vpsJobs.status,
        siteId: vpsJobs.siteId,
        releaseId: vpsJobs.releaseId,
      })
      .from(vpsJobs)
      .where(and(eq(vpsJobs.id, tarefaId), eq(vpsJobs.serverId, servidor.id)))
      .limit(1)
      .for("update");
    if (!job || job.seq !== dados.seq || !ehTipoDeTarefa(job.type))
      throw new VpsError(404, "job_not_found", "Tarefa não encontrada.");
    const tipo = job.type;
    const base = {
      tipo,
      siteId: job.siteId,
      releaseId: job.releaseId,
      invalido: null,
      versaoAtivada: null,
    };

    if (job.status === "concluida" || job.status === "falhou") {
      if (job.status === dados.estado)
        return { ...base, repetido: true, estado: dados.estado };
      throw new VpsError(
        409,
        "job_not_delivered",
        "A tarefa já terminou com outro estado.",
      );
    }
    if (!ESTADOS_QUE_ACEITAM_RESULTADO.includes(job.status as EstadoTarefa))
      throw new VpsError(
        409,
        "job_not_delivered",
        "A tarefa ainda não foi entregue.",
      );

    let estado = dados.estado;
    let erro = dados.erro;
    let resultado: Record<string, unknown> | null = null;
    let invalido: string | null = null;
    if (estado === "concluida") {
      const esquema: z.ZodType = RESULTADO_POR_TIPO[tipo];
      const lido = esquema.safeParse(dados.resultado ?? {});
      if (lido.success) {
        resultado = lido.data as Record<string, unknown>;
      } else {
        invalido = lido.error.issues
          .map((i) => i.path.join(".") || i.message)
          .join(", ");
        estado = "falhou";
        erro = `resultado_invalido: o agente devolveu um resultado fora do formato (${invalido}).`;
      }
    }
    if (estado === "falhou" && !erro)
      erro = "O servidor não disse o motivo da falha.";

    await tx
      .update(vpsJobs)
      .set({
        status: estado,
        finishedAt: sql`now()`,
        result: resultadoParaGuardar(tipo, resultado),
        error: estado === "falhou" ? erro : null,
        durationMs: dados.duracaoMs,
        updatedAt: agoraData(),
      })
      .where(eq(vpsJobs.id, job.id));

    const versaoAtivada = await aplicarEfeitos(tx, {
      servidorId: servidor.id,
      job: { ...job, type: tipo },
      estado,
      resultado,
      erro,
    });

    return { ...base, repetido: false, estado, invalido, versaoAtivada };
  });
}

/** Efeito de cada tipo no painel. Devolve a versão que ficou ativa, se houve. */
async function aplicarEfeitos(
  tx: BancoVps,
  e: {
    servidorId: string;
    job: {
      id: string;
      seq: number;
      type: TipoTarefa;
      siteId: string | null;
      releaseId: string | null;
    };
    estado: "concluida" | "falhou";
    resultado: Record<string, unknown> | null;
    erro: string | null;
  },
): Promise<string | null> {
  const agora = agoraData();
  const { job, estado } = e;
  const concluida = estado === "concluida";
  const siteId = job.siteId;
  const vivo = siteId
    ? and(
        eq(vpsSites.id, siteId),
        isNull(vpsSites.deletedAt),
        ne(vpsSites.status, "removendo"),
      )
    : undefined;

  switch (job.type) {
    case "servidor.coletar": {
      if (concluida) {
        const r = e.resultado as { visaoGeral: string };
        const visao = lerVisaoGeral(r.visaoGeral);
        await tx
          .update(vpsServers)
          .set(
            visao.ok
              ? {
                  lastOverview: visao.visao,
                  lastOverviewAt: sql`now()`,
                  lastOverviewError: null,
                  updatedAt: agora,
                }
              : { lastOverviewError: visao.erro, updatedAt: agora },
          )
          .where(eq(vpsServers.id, e.servidorId));
      } else {
        await tx
          .update(vpsServers)
          .set({
            lastOverviewError: (e.erro ?? "").slice(0, 500),
            updatedAt: agora,
          })
          .where(eq(vpsServers.id, e.servidorId));
      }
      return null;
    }

    case "site.configurar": {
      if (!siteId) return null;
      if (!concluida) {
        await tx
          .update(vpsSites)
          .set({ status: "erro", nginxError: e.erro, updatedAt: agora })
          .where(vivo);
        return null;
      }
      const r = e.resultado as { modo: "http" | "https"; aplicadoEm?: string };
      const [site] = await tx
        .select({ tlsStatus: vpsSites.tlsStatus })
        .from(vpsSites)
        .where(eq(vpsSites.id, siteId))
        .limit(1);
      // Pediu HTTPS e o certificado não existe (VPS nova, certificado
      // apagado): o agente reaplicou em HTTP. O painel diz a verdade.
      const perdeuHttps = r.modo === "http" && site?.tlsStatus === "ativo";
      await tx
        .update(vpsSites)
        .set({
          status: "ativo",
          nginxAppliedAt: r.aplicadoEm ? new Date(r.aplicadoEm) : agora,
          nginxError: null,
          ...(perdeuHttps
            ? {
                tlsStatus: "sem_ssl",
                tlsError: MENSAGEM_CERTIFICADO_AUSENTE,
                tlsExpiresAt: null,
              }
            : {}),
          updatedAt: agora,
        })
        .where(vivo);
      return null;
    }

    case "site.publicar": {
      if (!siteId || !job.releaseId) return null;
      const [release] = await tx
        .select({ artifactId: vpsReleases.artifactId })
        .from(vpsReleases)
        .where(eq(vpsReleases.id, job.releaseId))
        .limit(1);
      let ativada: string | null = null;
      if (concluida) {
        const r = e.resultado as {
          arquivos?: number | null;
          bytesDescompactados?: number | null;
          indexSha256?: string | null;
          removidas?: string[];
        };
        await tx
          .update(vpsReleases)
          .set({
            status: "no_servidor",
            error: null,
            // A contagem real do agente (bytes extraídos) vale mais que a
            // declarada no ZIP.
            ...(typeof r.arquivos === "number"
              ? { fileCount: r.arquivos }
              : {}),
            ...(typeof r.bytesDescompactados === "number"
              ? { uncompressedBytes: r.bytesDescompactados }
              : {}),
            ...(r.indexSha256 ? { indexSha256: r.indexSha256 } : {}),
            updatedAt: agora,
          })
          .where(
            and(
              eq(vpsReleases.id, job.releaseId),
              inArray(vpsReleases.status, ["enviando", "falhou"]),
            ),
          );
        // Trava de ordem: um resultado atrasado não reativa versão velha.
        if (await trocaDeVersaoLiberada(tx, siteId, job.seq))
          if (await ativarRelease(tx, siteId, job.releaseId))
            ativada = job.releaseId;
        const removidas = (r.removidas ?? []).filter(
          (id) => id !== job.releaseId,
        );
        if (removidas.length > 0)
          await tx
            .update(vpsReleases)
            .set({ status: "removida", isActive: false, updatedAt: agora })
            .where(
              and(
                eq(vpsReleases.siteId, siteId),
                inArray(vpsReleases.id, removidas),
              ),
            );
      } else {
        await tx
          .update(vpsReleases)
          .set({ status: "falhou", error: e.erro, updatedAt: agora })
          .where(
            and(
              eq(vpsReleases.id, job.releaseId),
              eq(vpsReleases.status, "enviando"),
            ),
          );
      }
      // A publicação terminou (bem ou mal): os 3 MB saem do banco.
      if (release?.artifactId)
        await tx
          .delete(vpsArtifacts)
          .where(eq(vpsArtifacts.id, release.artifactId));
      return ativada;
    }

    case "site.ativar_versao": {
      if (!siteId || !concluida) return null;
      const r = e.resultado as { versaoId: string };
      const versaoId = job.releaseId ?? r.versaoId;
      if (!(await trocaDeVersaoLiberada(tx, siteId, job.seq))) return null;
      return (await ativarRelease(tx, siteId, versaoId)) ? versaoId : null;
    }

    case "site.ssl_emitir": {
      if (!siteId) return null;
      if (concluida) {
        const r = e.resultado as { validoAte: string | null };
        await tx
          .update(vpsSites)
          .set({
            tlsStatus: "ativo",
            tlsExpiresAt: r.validoAte ? new Date(r.validoAte) : null,
            tlsCheckedAt: agora,
            tlsError: null,
            updatedAt: agora,
          })
          .where(and(eq(vpsSites.id, siteId), isNull(vpsSites.deletedAt)));
      } else {
        await tx
          .update(vpsSites)
          .set({
            tlsStatus: "erro",
            tlsError: traduzirErroCertbot(e.erro),
            updatedAt: agora,
          })
          .where(and(eq(vpsSites.id, siteId), isNull(vpsSites.deletedAt)));
      }
      return null;
    }

    case "site.remover": {
      // Falhou: o site continua `removendo` e a tela oferece "Remover do
      // painel mesmo sem resposta".
      if (!siteId || !concluida) return null;
      await tirarSiteDoPainel(tx, siteId);
      return null;
    }
  }
}

/** Domínios apagados (liberam o hostname), soft delete e versões removidas. */
async function tirarSiteDoPainel(tx: BancoVps, siteId: string): Promise<void> {
  const agora = agoraData();
  await tx.delete(vpsSiteDomains).where(eq(vpsSiteDomains.siteId, siteId));
  await tx
    .update(vpsReleases)
    .set({ status: "removida", isActive: false, updatedAt: agora })
    .where(
      and(
        eq(vpsReleases.siteId, siteId),
        inArray(vpsReleases.status, ["no_servidor", "enviando"]),
      ),
    );
  await tx
    .update(vpsSites)
    .set({ deletedAt: agora, updatedAt: agora })
    .where(and(eq(vpsSites.id, siteId), isNull(vpsSites.deletedAt)));
}

// ---------------------------------------------------------------------------
// Artefato (§5.D)
// ---------------------------------------------------------------------------

/**
 * O ZIP só sai para o servidor dono do site e só enquanto existe um
 * `site.publicar` ENTREGUE para aquela versão. Fora disso (outro servidor,
 * tarefa terminada, linha já apagada): null, e a rota responde 404.
 */
export async function lerArtefatoParaAgente(
  db: BancoVps,
  servidorId: string,
  artefatoId: string,
): Promise<{ conteudo: Buffer; sha256: string; tamanho: number } | null> {
  const [linha] = await db
    .select({
      conteudo: vpsArtifacts.content,
      sha256: vpsArtifacts.sha256,
      tamanho: vpsArtifacts.sizeBytes,
    })
    .from(vpsArtifacts)
    .innerJoin(vpsReleases, eq(vpsReleases.artifactId, vpsArtifacts.id))
    .innerJoin(vpsSites, eq(vpsSites.id, vpsReleases.siteId))
    .innerJoin(
      vpsJobs,
      and(
        eq(vpsJobs.releaseId, vpsReleases.id),
        eq(vpsJobs.serverId, servidorId),
        eq(vpsJobs.type, "site.publicar"),
        eq(vpsJobs.status, "entregue"),
      ),
    )
    .where(
      and(eq(vpsArtifacts.id, artefatoId), eq(vpsSites.serverId, servidorId)),
    )
    .limit(1);
  return linha ?? null;
}

// ---------------------------------------------------------------------------
// Servidores (painel)
// ---------------------------------------------------------------------------

function naoEncontrado(mensagem: string): VpsError {
  return new VpsError(404, "nao_encontrado", mensagem);
}

/**
 * "Sim, é o meu": o servidor fica `ativo` e cada site dele é reaplicado
 * (reinstalação na mesma máquina ou numa nova: o nginx e as pastas são
 * refeitos com os parâmetros atuais; o HTTPS segue se o certificado ainda
 * estiver lá). "Não é o meu": corta o acesso (token NULL, geração nova) e
 * volta a esperar um agente, que precisa de um comando novo.
 */
export async function confirmarServidor(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    servidorId: string;
    resposta: "sim" | "nao";
    por: string;
  },
): Promise<{ sitesReaplicados: number }> {
  return db.transaction(async (tx) => {
    const agora = agoraData();
    const dono = and(
      eq(vpsServers.id, entrada.servidorId),
      eq(vpsServers.workspaceId, entrada.workspaceId),
      isNull(vpsServers.deletedAt),
      eq(vpsServers.status, "aguardando_confirmacao"),
    );
    if (entrada.resposta === "nao") {
      const [srv] = await tx
        .update(vpsServers)
        .set({
          agentTokenHash: null,
          keyGeneration: sql`${vpsServers.keyGeneration} + 1`,
          status: "aguardando_agente",
          updatedAt: agora,
        })
        .where(dono)
        .returning({ id: vpsServers.id });
      if (!srv) throw estadoInvalido();
      await expirarTarefasAbertas(tx, srv.id, "O dono recusou este servidor");
      return { sitesReaplicados: 0 };
    }

    const [srv] = await tx
      .update(vpsServers)
      .set({
        status: "ativo",
        confirmedAt: agora,
        confirmedBy: entrada.por,
        updatedAt: agora,
      })
      .where(dono)
      .returning({ id: vpsServers.id });
    if (!srv) throw estadoInvalido();

    const sites = await tx
      .select({ id: vpsSites.id })
      .from(vpsSites)
      .where(
        and(
          eq(vpsSites.serverId, srv.id),
          isNull(vpsSites.deletedAt),
          ne(vpsSites.status, "removendo"),
        ),
      )
      .orderBy(asc(vpsSites.createdAt));
    let reaplicados = 0;
    for (const site of sites) {
      try {
        await reaplicarNaTransacao(tx, {
          workspaceId: entrada.workspaceId,
          siteId: site.id,
          por: entrada.por,
        });
        reaplicados++;
      } catch (erro) {
        // Um site com tarefa aberta (ou sem domínio) fica como está; os
        // outros seguem, e o dono usa "Reaplicar no servidor" nele depois.
        if (!(erro instanceof VpsError)) throw erro;
      }
    }
    return { sitesReaplicados: reaplicados };
  });
}

function estadoInvalido(): VpsError {
  return new VpsError(
    409,
    "estado_invalido",
    "Este servidor não está esperando confirmação (a tela pode estar desatualizada).",
  );
}

/** IP público informado pelo dono (vazio apaga). Vence os IPs relatados. */
export async function informarIp(
  db: BancoVps,
  entrada: { workspaceId: string; servidorId: string; ip: string },
): Promise<{ ip: string | null }> {
  const ip = entrada.ip.trim();
  if (ip && !isPublicIpv4(ip))
    throw new VpsError(
      400,
      "dados_invalidos",
      // Sem IP de exemplo: os de documentação (203.0.113.x) são recusados
      // pela mesma regra, e um exemplo recusado confunde.
      "Informe o IPv4 público que o provedor mostra, ou deixe vazio.",
      { erros: { ip: "IPv4 público, como aparece no painel do provedor." } },
    );
  const [srv] = await db
    .update(vpsServers)
    .set({ ipOverride: ip || null, updatedAt: agoraData() })
    .where(
      and(
        eq(vpsServers.id, entrada.servidorId),
        eq(vpsServers.workspaceId, entrada.workspaceId),
        isNull(vpsServers.deletedAt),
      ),
    )
    .returning({ id: vpsServers.id });
  if (!srv) throw naoEncontrado("Servidor não encontrado.");
  return { ip: ip || null };
}

/** "Ler agora": uma coleta (a repetida devolve a que já está na fila). */
export async function lerAgora(
  db: BancoVps,
  entrada: { workspaceId: string; servidorId: string; por: string },
): Promise<TarefaEnfileirada> {
  return enfileirarTarefa(db, {
    workspaceId: entrada.workspaceId,
    servidorId: entrada.servidorId,
    tipo: "servidor.coletar",
    params: {},
    por: entrada.por,
  });
}

/**
 * Remove o servidor do painel: soft delete, token e código NULL, geração
 * nova (o agente leva 401 com a marca e sai com código 3), tarefas abertas
 * expiradas com a limpeza por tipo, e os sites saem do painel (domínios
 * apagados). A VPS continua servindo o que tem até alguém desinstalar.
 */
export async function removerServidor(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    servidorId: string;
    confirmacao: string;
  },
): Promise<{ nome: string; sitesRemovidos: number }> {
  return db.transaction(async (tx) => {
    const [srv] = await tx
      .select({ id: vpsServers.id, nome: vpsServers.name })
      .from(vpsServers)
      .where(
        and(
          eq(vpsServers.id, entrada.servidorId),
          eq(vpsServers.workspaceId, entrada.workspaceId),
          isNull(vpsServers.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!srv) throw naoEncontrado("Servidor não encontrado.");
    if (entrada.confirmacao.trim() !== srv.nome)
      throw new VpsError(
        400,
        "dados_invalidos",
        "Digite o nome do servidor exatamente como aparece para confirmar.",
        { erros: { confirmacao: `Digite: ${srv.nome}` } },
      );
    const agora = agoraData();
    await tx
      .update(vpsServers)
      .set({
        deletedAt: agora,
        agentTokenHash: null,
        enrollCodeHash: null,
        enrollExpiresAt: null,
        keyGeneration: sql`${vpsServers.keyGeneration} + 1`,
        status: "revogado",
        updatedAt: agora,
      })
      .where(eq(vpsServers.id, srv.id));
    await expirarTarefasAbertas(
      tx,
      srv.id,
      "O servidor foi removido do painel",
    );
    const sites = await tx
      .select({ id: vpsSites.id })
      .from(vpsSites)
      .where(and(eq(vpsSites.serverId, srv.id), isNull(vpsSites.deletedAt)));
    for (const site of sites) await tirarSiteDoPainel(tx, site.id);
    return { nome: srv.nome, sitesRemovidos: sites.length };
  });
}

// ---------------------------------------------------------------------------
// Sites (painel)
// ---------------------------------------------------------------------------

export type CheckoutEscolhido = {
  id: string;
  slug: string;
  produtoSlug: string | null;
} | null;

/** Um checkout PUBLICADO do workspace (o /checkout do site vai para ele). */
export async function checkoutPublicado(
  db: BancoVps,
  workspaceId: string,
  checkoutId: string,
): Promise<NonNullable<CheckoutEscolhido>> {
  if (!R_UUID.test(checkoutId)) throw checkoutInvalido();
  const [linha] = await db
    .select({
      id: checkouts.id,
      slug: checkouts.slug,
      produtoSlug: products.slug,
    })
    .from(checkouts)
    .leftJoin(products, eq(products.id, checkouts.mainProductId))
    .where(
      and(
        eq(checkouts.id, checkoutId),
        eq(checkouts.workspaceId, workspaceId),
        eq(checkouts.status, "published"),
        isNull(checkouts.deletedAt),
      ),
    )
    .limit(1);
  if (!linha || !R_SLUG_CHECKOUT.test(linha.slug)) throw checkoutInvalido();
  return linha;
}

function checkoutInvalido(): VpsError {
  return new VpsError(
    400,
    "dados_invalidos",
    "Escolha um checkout publicado (ou Nenhum).",
    { erros: { checkoutId: "Escolha um checkout publicado." } },
  );
}

/** Domínio digitado + opção www → lista validada (principal primeiro). */
export function lerDominios(
  dominio: string,
  incluirWww: boolean,
  hostsReservados: readonly string[],
): string[] {
  const principal = lerDominioDoSite(dominio, hostsReservados);
  if (!principal)
    throw new VpsError(
      400,
      "dados_invalidos",
      "Domínio inválido. Use só o nome, como loja.com.br (sem https://, sem barra; *.vercel.app e o domínio do painel não servem).",
      { erros: { dominio: "Digite só o domínio, ex.: loja.com.br" } },
    );
  if (principal.startsWith("www."))
    throw new VpsError(
      400,
      "dados_invalidos",
      "Digite o domínio sem o www e marque “Incluir www”.",
      { erros: { dominio: "Sem o www (use a opção Incluir www)." } },
    );
  const lista = [principal];
  if (incluirWww) {
    const www = `www.${principal}`;
    if (!dominioDoSiteValido(www, hostsReservados))
      throw new VpsError(
        400,
        "dados_invalidos",
        "O www deste domínio fica longo demais.",
        {
          erros: { dominio: "Domínio longo demais para incluir o www." },
        },
      );
    lista.push(www);
  }
  return lista;
}

function lerOrigem(origem: string, origens: readonly string[]): string {
  if (!origens.includes(origem))
    throw new VpsError(
      400,
      "dados_invalidos",
      "Escolha uma das origens de checkout permitidas.",
      { erros: { origemCheckout: "Origem fora da lista permitida." } },
    );
  return origem;
}

function urlDoCheckout(
  origem: string,
  checkout: CheckoutEscolhido,
): string | null {
  if (!checkout) return null;
  const url = `${origem}/checkout/${checkout.slug}`;
  if (!checkoutValido(url, origem)) throw checkoutInvalido();
  return url;
}

type SiteCarregado = {
  site: typeof vpsSites.$inferSelect;
  servidor: {
    id: string;
    nome: string;
    status: string;
    deletedAt: Date | null;
    ipOverride: string | null;
    publicIpv4: string[];
    publicIpv6: string[];
    lastSeenIp: string | null;
  };
  dominios: Array<typeof vpsSiteDomains.$inferSelect>;
};

/** Site do workspace (não removido), com o servidor e os domínios. */
async function carregarSite(
  db: BancoVps,
  workspaceId: string,
  siteId: string,
  opcoes: { travar?: boolean } = {},
): Promise<SiteCarregado> {
  if (!R_UUID.test(siteId)) throw naoEncontrado("Site não encontrado.");
  const consulta = db
    .select()
    .from(vpsSites)
    .where(
      and(
        eq(vpsSites.id, siteId),
        eq(vpsSites.workspaceId, workspaceId),
        isNull(vpsSites.deletedAt),
      ),
    )
    .limit(1);
  const [site] = opcoes.travar ? await consulta.for("update") : await consulta;
  if (!site) throw naoEncontrado("Site não encontrado.");
  const [servidor] = await db
    .select({
      id: vpsServers.id,
      nome: vpsServers.name,
      status: vpsServers.status,
      deletedAt: vpsServers.deletedAt,
      ipOverride: vpsServers.ipOverride,
      publicIpv4: vpsServers.publicIpv4,
      publicIpv6: vpsServers.publicIpv6,
      lastSeenIp: vpsServers.lastSeenIp,
    })
    .from(vpsServers)
    .where(eq(vpsServers.id, site.serverId))
    .limit(1);
  const dominios = await db
    .select()
    .from(vpsSiteDomains)
    .where(eq(vpsSiteDomains.siteId, site.id))
    .orderBy(desc(vpsSiteDomains.isPrimary), asc(vpsSiteDomains.hostname));
  return { site, servidor, dominios };
}

/** Os parâmetros de `site.configurar` com o estado atual do site. */
function paramsDeConfigurar(
  site: {
    id: string;
    slug: string;
    checkoutOrigin: string;
    checkoutUrl: string | null;
  },
  dominios: string[],
  tls: boolean,
): ParamsDaTarefa<"site.configurar"> {
  return {
    siteId: site.id,
    slug: site.slug,
    dominios,
    principal: dominios[0],
    origemCheckout: site.checkoutOrigin,
    checkout: site.checkoutUrl,
    tls,
  };
}

async function enfileirarConfigurar(
  tx: BancoVps,
  e: {
    workspaceId: string;
    servidorId: string;
    site: {
      id: string;
      slug: string;
      checkoutOrigin: string;
      checkoutUrl: string | null;
    };
    dominios: string[];
    tls: boolean;
    por: string;
  },
): Promise<TarefaEnfileirada> {
  const tarefa = await enfileirarTarefa(tx, {
    workspaceId: e.workspaceId,
    servidorId: e.servidorId,
    tipo: "site.configurar",
    params: paramsDeConfigurar(e.site, e.dominios, e.tls),
    siteId: e.site.id,
    por: e.por,
  });
  await tx
    .update(vpsSites)
    .set({ status: "configurando", nginxError: null, updatedAt: agoraData() })
    .where(eq(vpsSites.id, e.site.id));
  return tarefa;
}

function traduzirDominioEmUso(erro: unknown): unknown {
  const { codigo, restricao, mensagem } = detalheDoErroPg(erro);
  if (
    codigo === "23505" &&
    `${restricao ?? ""} ${mensagem ?? ""}`.includes(
      "vps_site_domains_hostname_idx",
    )
  )
    return new VpsError(
      409,
      "dominio_em_uso",
      "Este domínio já está em outro site do painel. Remova-o de lá antes.",
      { erros: { dominio: "Domínio já usado em outro site." } },
    );
  return erro;
}

/**
 * Cria o site (servidor precisa estar `ativo`), com slug derivado do nome
 * e único no servidor, e enfileira `site.configurar` sem TLS: o nginx já
 * responde com a página de espera antes de existir ZIP.
 */
export async function criarSite(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    servidorId: string;
    nome: string;
    dominio: string;
    incluirWww: boolean;
    checkout: CheckoutEscolhido;
    origemCheckout: string;
    origens: readonly string[];
    hostsReservados: readonly string[];
    por: string;
  },
): Promise<{ siteId: string; slug: string; tarefaId: string }> {
  const dominios = lerDominios(
    entrada.dominio,
    entrada.incluirWww,
    entrada.hostsReservados,
  );
  const origem = lerOrigem(entrada.origemCheckout, entrada.origens);
  const checkoutUrl = urlDoCheckout(origem, entrada.checkout);
  try {
    return await db.transaction(async (tx) => {
      const [srv] = await tx
        .select({
          id: vpsServers.id,
          status: vpsServers.status,
          reportedSlugs: vpsServers.reportedSlugs,
        })
        .from(vpsServers)
        .where(
          and(
            eq(vpsServers.id, entrada.servidorId),
            eq(vpsServers.workspaceId, entrada.workspaceId),
            isNull(vpsServers.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!srv) throw naoEncontrado("Servidor não encontrado.");
      if (srv.status !== "ativo")
        throw new VpsError(
          409,
          "servidor_nao_pronto",
          "Confirme o servidor (“Sim, é o meu”) antes de criar um site nele.",
        );
      // Slugs de sites removidos também contam: a pasta antiga pode ter
      // ficado na VPS (remoção forçada) e não pode ser reaproveitada. E as
      // pastas que o agente relatou no disco também: o slug é único só
      // dentro deste servidor do painel, mas a VPS pode ter pastas de outro
      // (servidor removido que continua servindo, VPS registrada de novo).
      // Reaproveitar uma delas trocaria o vhost e o que está no ar do outro
      // site; o agente recusa (slug_de_outro_site), e aqui nem se chega lá.
      const usados = await tx
        .select({ slug: vpsSites.slug })
        .from(vpsSites)
        .where(eq(vpsSites.serverId, srv.id));
      const slug = slugLivre(derivarSlug(entrada.nome), [
        ...usados.map((u) => u.slug),
        ...(Array.isArray(srv.reportedSlugs) ? srv.reportedSlugs : []),
      ]);
      const [site] = await tx
        .insert(vpsSites)
        .values({
          workspaceId: entrada.workspaceId,
          serverId: srv.id,
          name: entrada.nome,
          slug,
          status: "configurando",
          checkoutOrigin: origem,
          checkoutUrl,
          createdBy: entrada.por,
        })
        .returning();
      await tx.insert(vpsSiteDomains).values(
        dominios.map((hostname, i) => ({
          workspaceId: entrada.workspaceId,
          siteId: site.id,
          hostname,
          isPrimary: i === 0,
        })),
      );
      const tarefa = await enfileirarConfigurar(tx, {
        workspaceId: entrada.workspaceId,
        servidorId: srv.id,
        site,
        dominios,
        tls: false,
        por: entrada.por,
      });
      return { siteId: site.id, slug, tarefaId: tarefa.id };
    });
  } catch (erro) {
    throw traduzirDominioEmUso(erro);
  }
}

/**
 * Troca os domínios: a verificação de DNS recomeça, o HTTPS volta para
 * `sem_ssl` (o certificado antigo não cobre a lista nova) e o nginx é
 * reaplicado em HTTP. É honesto: o HTTPS é pedido de novo quando o DNS
 * ficar certo.
 */
export async function alterarDominios(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    dominio: string;
    incluirWww: boolean;
    hostsReservados: readonly string[];
    por: string;
  },
): Promise<{ tarefaId: string; dominios: string[] }> {
  const dominios = lerDominios(
    entrada.dominio,
    entrada.incluirWww,
    entrada.hostsReservados,
  );
  try {
    return await db.transaction(async (tx) => {
      const { site, servidor } = await carregarSite(
        tx,
        entrada.workspaceId,
        entrada.siteId,
        { travar: true },
      );
      exigirSiteMutavel(site.status);
      const agora = agoraData();
      await tx.delete(vpsSiteDomains).where(eq(vpsSiteDomains.siteId, site.id));
      await tx.insert(vpsSiteDomains).values(
        dominios.map((hostname, i) => ({
          workspaceId: entrada.workspaceId,
          siteId: site.id,
          hostname,
          isPrimary: i === 0,
        })),
      );
      await tx
        .update(vpsSites)
        .set({
          tlsStatus: "sem_ssl",
          tlsError: null,
          tlsExpiresAt: null,
          publicCheck: {},
          publicCheckAt: null,
          updatedAt: agora,
        })
        .where(eq(vpsSites.id, site.id));
      const tarefa = await enfileirarConfigurar(tx, {
        workspaceId: entrada.workspaceId,
        servidorId: servidor.id,
        site,
        dominios,
        tls: false,
        por: entrada.por,
      });
      return { tarefaId: tarefa.id, dominios };
    });
  } catch (erro) {
    throw traduzirDominioEmUso(erro);
  }
}

function exigirSiteMutavel(status: string): void {
  if (status === "removendo")
    throw new VpsError(
      409,
      "estado_invalido",
      "Este site está sendo removido do servidor.",
    );
}

/** Troca para onde o /checkout do site vai; reaplica o nginx (TLS como está). */
export async function alterarCheckout(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    checkout: CheckoutEscolhido;
    origemCheckout: string;
    origens: readonly string[];
    por: string;
  },
): Promise<{ tarefaId: string; checkoutUrl: string | null }> {
  const origem = lerOrigem(entrada.origemCheckout, entrada.origens);
  const checkoutUrl = urlDoCheckout(origem, entrada.checkout);
  return db.transaction(async (tx) => {
    const { site, servidor, dominios } = await carregarSite(
      tx,
      entrada.workspaceId,
      entrada.siteId,
      { travar: true },
    );
    exigirSiteMutavel(site.status);
    const [atualizado] = await tx
      .update(vpsSites)
      .set({ checkoutOrigin: origem, checkoutUrl, updatedAt: agoraData() })
      .where(eq(vpsSites.id, site.id))
      .returning();
    const tarefa = await enfileirarConfigurar(tx, {
      workspaceId: entrada.workspaceId,
      servidorId: servidor.id,
      site: atualizado,
      dominios: dominios.map((d) => d.hostname),
      tls: site.tlsStatus === "ativo",
      por: entrada.por,
    });
    return { tarefaId: tarefa.id, checkoutUrl };
  });
}

/** "Reaplicar no servidor": `site.configurar` com os parâmetros atuais. */
async function reaplicarNaTransacao(
  tx: BancoVps,
  e: { workspaceId: string; siteId: string; por: string },
): Promise<TarefaEnfileirada> {
  const { site, servidor, dominios } = await carregarSite(
    tx,
    e.workspaceId,
    e.siteId,
  );
  exigirSiteMutavel(site.status);
  if (dominios.length === 0)
    throw new VpsError(409, "estado_invalido", "O site está sem domínio.");
  return enfileirarConfigurar(tx, {
    workspaceId: e.workspaceId,
    servidorId: servidor.id,
    site,
    dominios: dominios.map((d) => d.hostname),
    tls: site.tlsStatus === "ativo",
    por: e.por,
  });
}

export async function reaplicarSite(
  db: BancoVps,
  entrada: { workspaceId: string; siteId: string; por: string },
): Promise<{ tarefaId: string }> {
  return db.transaction(async (tx) => {
    const tarefa = await reaplicarNaTransacao(tx, entrada);
    return { tarefaId: tarefa.id };
  });
}

// ---------------------------------------------------------------------------
// DNS e HTTPS
// ---------------------------------------------------------------------------

/** Espera depois de um `site.ssl_emitir` que FALHOU (limite do Let's Encrypt). */
export const ESPERA_SSL_MS = 15 * 60_000;
export const MAXIMO_SSL_POR_HORA = 3;
/** A verificação de DNS vale 10 min para pedir o HTTPS. */
export const VALIDADE_DNS_MS = 10 * 60_000;

export type PedidoDeSslRecente = {
  status: string;
  createdAt: Date;
  finishedAt: Date | null;
};

/**
 * Quando dá para pedir HTTPS de novo, a partir dos `site.ssl_emitir` da
 * última hora: 15 min depois da última falha do certbot e no máximo 3
 * pedidos por hora por site (o Let's Encrypt bloqueia depois de 5 falhas
 * por hora). `expirada` e `sem_resposta` não contam como falha: o certbot
 * nem rodou. null = pode agora.
 */
export function calcularEsperaDoSsl(
  recentes: readonly PedidoDeSslRecente[],
  agora = Date.now(),
): Date | null {
  const naJanela = recentes
    .filter((t) => t.createdAt.getTime() > agora - 3_600_000)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let libera = 0;
  for (const t of naJanela)
    if (t.status === "falhou" && t.finishedAt)
      libera = Math.max(libera, t.finishedAt.getTime() + ESPERA_SSL_MS);
  if (naJanela.length >= MAXIMO_SSL_POR_HORA)
    libera = Math.max(
      libera,
      naJanela[naJanela.length - MAXIMO_SSL_POR_HORA].createdAt.getTime() +
        3_600_000,
    );
  return libera > agora ? new Date(libera) : null;
}

export async function esperaDoSsl(
  db: BancoVps,
  siteId: string,
  agora = Date.now(),
): Promise<Date | null> {
  const recentes = await db
    .select({
      status: vpsJobs.status,
      createdAt: vpsJobs.createdAt,
      finishedAt: vpsJobs.finishedAt,
    })
    .from(vpsJobs)
    .where(
      and(
        eq(vpsJobs.siteId, siteId),
        eq(vpsJobs.type, "site.ssl_emitir"),
        gte(vpsJobs.createdAt, new Date(agora - 3_600_000)),
      ),
    );
  return calcularEsperaDoSsl(recentes, agora);
}

async function pedirSsl(
  tx: BancoVps,
  e: {
    workspaceId: string;
    carregado: SiteCarregado;
    email: string | null;
    por: string;
  },
): Promise<TarefaEnfileirada> {
  const { site, servidor, dominios } = e.carregado;
  const tarefa = await enfileirarTarefa(tx, {
    workspaceId: e.workspaceId,
    servidorId: servidor.id,
    tipo: "site.ssl_emitir",
    params: {
      siteId: site.id,
      slug: site.slug,
      dominios: dominios.map((d) => d.hostname),
      email: e.email,
    },
    siteId: site.id,
    por: e.por,
  });
  await tx
    .update(vpsSites)
    .set({ tlsStatus: "emitindo", tlsError: null, updatedAt: agoraData() })
    .where(eq(vpsSites.id, site.id));
  return tarefa;
}

/**
 * "Verificar DNS": consulta cada domínio contra os IPs do servidor e grava
 * o que viu. Se todos ficaram `ok`, o nginx já foi aplicado e o HTTPS não
 * está em espera, o HTTPS é pedido SOZINHO (o dono não precisa saber que
 * existe um segundo botão).
 */
export async function verificarDns(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    email: string | null;
    por: string;
    resolvedor?: ResolvedorDns;
  },
): Promise<{
  dominios: Array<{
    hostname: string;
    status: string;
    mensagem: string | null;
  }>;
  httpsPedido: boolean;
}> {
  const carregado = await carregarSite(db, entrada.workspaceId, entrada.siteId);
  const { site, servidor, dominios } = carregado;
  const esperados = ipsEsperados(servidor);
  const agora = agoraData();
  const vistos = await Promise.all(
    dominios.map(async (d) => ({
      d,
      r: await verificarDominio(d.hostname, esperados, {
        resolvedor: entrada.resolvedor,
      }),
    })),
  );
  for (const { d, r } of vistos)
    await db
      .update(vpsSiteDomains)
      .set({
        dnsStatus: r.status,
        dnsDetail: r.detalhe,
        dnsCheckedAt: agora,
        updatedAt: agora,
      })
      .where(eq(vpsSiteDomains.id, d.id));

  const todosOk =
    vistos.length > 0 && vistos.every(({ r }) => r.status === "ok");
  let httpsPedido = false;
  if (
    todosOk &&
    site.status === "ativo" &&
    site.nginxAppliedAt &&
    (site.tlsStatus === "sem_ssl" || site.tlsStatus === "erro") &&
    servidor.status === "ativo" &&
    !servidor.deletedAt &&
    !(await esperaDoSsl(db, site.id))
  ) {
    try {
      await db.transaction((tx) =>
        pedirSsl(tx, {
          workspaceId: entrada.workspaceId,
          carregado,
          email: entrada.email,
          por: entrada.por,
        }),
      );
      httpsPedido = true;
    } catch (erro) {
      // Fila ocupada ou servidor fora do ar: o DNS foi verificado mesmo
      // assim; o HTTPS sai na próxima verificação ou pelo botão.
      if (!(erro instanceof VpsError)) throw erro;
    }
  }
  return {
    dominios: vistos.map(({ d, r }) => ({
      hostname: d.hostname,
      status: r.status,
      mensagem: r.detalhe.mensagem ?? null,
    })),
    httpsPedido,
  };
}

/** "Ativar HTTPS" pelo botão, com as mesmas pré-condições do pedido automático. */
export async function emitirSsl(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    email: string | null;
    por: string;
  },
): Promise<{ tarefaId: string }> {
  return db.transaction(async (tx) => {
    const carregado = await carregarSite(
      tx,
      entrada.workspaceId,
      entrada.siteId,
      {
        travar: true,
      },
    );
    const { site, dominios } = carregado;
    exigirSiteMutavel(site.status);
    const limite = Date.now() - VALIDADE_DNS_MS;
    const pendente = dominios.find(
      (d) =>
        d.dnsStatus !== "ok" ||
        !d.dnsCheckedAt ||
        d.dnsCheckedAt.getTime() < limite,
    );
    if (dominios.length === 0 || pendente || !site.nginxAppliedAt)
      throw new VpsError(
        409,
        "dns_pendente",
        pendente
          ? `Verifique o DNS de ${pendente.hostname} antes (precisa estar certo e conferido nos últimos 10 min).`
          : "O nginx ainda não foi aplicado neste site. Espere a configuração terminar.",
      );
    const espera = await esperaDoSsl(tx, site.id);
    if (espera) {
      const falhouRecente = await tx
        .select({ id: vpsJobs.id })
        .from(vpsJobs)
        .where(
          and(
            eq(vpsJobs.siteId, site.id),
            eq(vpsJobs.type, "site.ssl_emitir"),
            eq(vpsJobs.status, "falhou"),
            gte(vpsJobs.finishedAt, new Date(Date.now() - ESPERA_SSL_MS)),
          ),
        )
        .limit(1);
      throw falhouRecente.length > 0
        ? new VpsError(
            409,
            "ssl_aguarde",
            "O último pedido de HTTPS falhou há pouco. Para não estourar o limite do Let's Encrypt, espere um pouco.",
            { podeTentarEm: espera.toISOString() },
          )
        : new VpsError(
            429,
            "limite",
            "No máximo 3 pedidos de HTTPS por hora neste site.",
            { podeTentarEm: espera.toISOString() },
          );
    }
    const tarefa = await pedirSsl(tx, {
      workspaceId: entrada.workspaceId,
      carregado,
      email: entrada.email,
      por: entrada.por,
    });
    return { tarefaId: tarefa.id };
  });
}

// ---------------------------------------------------------------------------
// Versões
// ---------------------------------------------------------------------------

/** "Voltar para esta": só versão guardada no servidor (`no_servidor`). */
export async function ativarVersao(
  db: BancoVps,
  entrada: { workspaceId: string; versaoId: string; por: string },
): Promise<{ tarefaId: string; siteId: string }> {
  if (!R_UUID.test(entrada.versaoId))
    throw naoEncontrado("Versão não encontrada.");
  return db.transaction(async (tx) => {
    const [versao] = await tx
      .select({
        id: vpsReleases.id,
        siteId: vpsReleases.siteId,
        status: vpsReleases.status,
        ativa: vpsReleases.isActive,
      })
      .from(vpsReleases)
      .where(
        and(
          eq(vpsReleases.id, entrada.versaoId),
          eq(vpsReleases.workspaceId, entrada.workspaceId),
        ),
      )
      .limit(1);
    if (!versao) throw naoEncontrado("Versão não encontrada.");
    if (versao.status !== "no_servidor")
      throw new VpsError(
        409,
        "estado_invalido",
        "Só dá para voltar para uma versão guardada no servidor.",
      );
    if (versao.ativa)
      throw new VpsError(409, "estado_invalido", "Esta já é a versão ativa.");
    const { site, servidor } = await carregarSite(
      tx,
      entrada.workspaceId,
      versao.siteId,
    );
    exigirSiteMutavel(site.status);
    const tarefa = await enfileirarTarefa(tx, {
      workspaceId: entrada.workspaceId,
      servidorId: servidor.id,
      tipo: "site.ativar_versao",
      params: { siteId: site.id, slug: site.slug, versaoId: versao.id },
      siteId: site.id,
      releaseId: versao.id,
      por: entrada.por,
    });
    return { tarefaId: tarefa.id, siteId: site.id };
  });
}

/**
 * Upload do ZIP já inspecionado: artefato (bytea de vida curta) + versão
 * `enviando` + `site.publicar` assinado, numa transação. Se a fila do site
 * estiver ocupada, nada fica gravado.
 */
export async function publicarZip(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    por: string;
    nomeDoArquivo: string;
    bytes: Buffer;
    inspecao: Extract<ZipInspecionado, { ok: true }>;
  },
): Promise<{
  release: typeof vpsReleases.$inferSelect;
  tarefa: typeof vpsJobs.$inferSelect;
  servidorId: string;
}> {
  const { inspecao, bytes } = entrada;
  const nome = entrada.nomeDoArquivo
    .replace(new RegExp(controlCharacters.source, "g"), "")
    .slice(0, 200);
  return db.transaction(async (tx) => {
    const { site, servidor } = await carregarSite(
      tx,
      entrada.workspaceId,
      entrada.siteId,
      { travar: true },
    );
    exigirSiteMutavel(site.status);
    const [artefato] = await tx
      .insert(vpsArtifacts)
      .values({
        workspaceId: entrada.workspaceId,
        sha256: inspecao.sha256,
        sizeBytes: bytes.length,
        content: bytes,
      })
      .returning({ id: vpsArtifacts.id });
    const releaseId = randomUUID();
    const [release] = await tx
      .insert(vpsReleases)
      .values({
        id: releaseId,
        workspaceId: entrada.workspaceId,
        siteId: site.id,
        artifactId: artefato.id,
        source: "zip",
        fileName: nome || null,
        fileCount: inspecao.arquivos.length,
        uncompressedBytes: inspecao.bytesDescompactados,
        zipBytes: bytes.length,
        sha256: inspecao.sha256,
        indexSha256: inspecao.indexSha256,
        pages: inspecao.paginas,
        hasTracking: inspecao.temRastreio,
        warnings: inspecao.avisos,
        status: "enviando",
        createdBy: entrada.por,
      })
      .returning();
    const enfileirada = await enfileirarTarefa(tx, {
      workspaceId: entrada.workspaceId,
      servidorId: servidor.id,
      tipo: "site.publicar",
      params: {
        siteId: site.id,
        slug: site.slug,
        versaoId: releaseId,
        artefatoId: artefato.id,
        sha256: inspecao.sha256,
        bytes: bytes.length,
      },
      siteId: site.id,
      releaseId,
      por: entrada.por,
    });
    const [tarefa] = await tx
      .select()
      .from(vpsJobs)
      .where(eq(vpsJobs.id, enfileirada.id))
      .limit(1);
    return { release, tarefa, servidorId: servidor.id };
  });
}

// ---------------------------------------------------------------------------
// "No ar" e remoção
// ---------------------------------------------------------------------------

export type NoAr = {
  estado: EstadoNoAr;
  url: string | null;
  em: string | null;
  detalhe: string | null;
};

/** A conferência gravada, lida para a tela ("Não conferido" se nunca rodou). */
export function noArDaConferencia(
  conferencia: ConferenciaPublica | null | undefined,
  versaoAtivaId: string | null,
): NoAr {
  if (!conferencia?.estado)
    return { estado: "nao_conferido", url: null, em: null, detalhe: null };
  // Um "ok" de outra versão não vale para a atual.
  if (
    conferencia.estado === "ok" &&
    (conferencia.versaoId ?? null) !== versaoAtivaId
  )
    return {
      estado: "nao_conferido",
      url: conferencia.url ?? null,
      em: conferencia.em ?? null,
      detalhe: "A versão ativa mudou desde a última conferência.",
    };
  return {
    estado: conferencia.estado,
    url: conferencia.url ?? null,
    em: conferencia.em ?? null,
    detalhe: conferencia.detalhe ?? null,
  };
}

/**
 * "Conferir do lado de fora": busca `/` do domínio principal pelo IPv4 do
 * servidor e compara com o index.html da versão ativa. Só com o DNS do
 * principal `ok`. Grava o resultado no site.
 */
export async function conferirSite(
  db: BancoVps,
  entrada: { workspaceId: string; siteId: string },
  opcoes: OpcoesDaConferencia = {},
): Promise<NoAr> {
  const { site, servidor, dominios } = await carregarSite(
    db,
    entrada.workspaceId,
    entrada.siteId,
  );
  const principal = dominios.find((d) => d.isPrimary) ?? dominios[0];
  if (!principal || principal.dnsStatus !== "ok")
    throw new VpsError(
      409,
      "dns_pendente",
      "Verifique o DNS do domínio principal antes de conferir.",
    );
  const [ativa] = await db
    .select({ id: vpsReleases.id, indexSha256: vpsReleases.indexSha256 })
    .from(vpsReleases)
    .where(and(eq(vpsReleases.siteId, site.id), eq(vpsReleases.isActive, true)))
    .limit(1);
  const conferencia = await conferirPublico(
    {
      dominio: principal.hostname,
      ipv4: ipsEsperados(servidor).ipv4[0] ?? null,
      https: site.tlsStatus === "ativo",
      indexSha256: ativa?.indexSha256 ?? null,
      versaoId: ativa?.id ?? null,
    },
    opcoes,
  );
  const em = conferencia.em ? new Date(conferencia.em) : agoraData();
  await db
    .update(vpsSites)
    .set({
      publicCheck: conferencia,
      publicCheckAt: em,
      updatedAt: agoraData(),
    })
    .where(eq(vpsSites.id, site.id));
  return noArDaConferencia(conferencia, ativa?.id ?? null);
}

/**
 * A conferência que roda sozinha depois de publicar, voltar versão ou
 * emitir HTTPS. Nunca lança (roda em after()); sem DNS ok, não faz nada.
 */
export async function conferirSiteDepois(
  db: BancoVps,
  entrada: { workspaceId: string; siteId: string },
  opcoes: OpcoesDaConferencia = {},
): Promise<void> {
  try {
    await conferirSite(db, entrada, opcoes);
  } catch (erro) {
    if (erro instanceof VpsError && erro.codigo === "dns_pendente") return;
    if (erro instanceof VpsError && erro.codigo === "nao_encontrado") return;
    console.error("[vps] conferência pública", erro);
  }
}

/** "Remover site": confirmação pelo domínio principal; o agente faz a limpeza. */
export async function removerSite(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    confirmacao: string;
    por: string;
  },
): Promise<{ tarefaId: string }> {
  return db.transaction(async (tx) => {
    const { site, servidor, dominios } = await carregarSite(
      tx,
      entrada.workspaceId,
      entrada.siteId,
      { travar: true },
    );
    exigirConfirmacaoDoDominio(dominios, entrada.confirmacao);
    exigirSiteMutavel(site.status);
    const tarefa = await enfileirarTarefa(tx, {
      workspaceId: entrada.workspaceId,
      servidorId: servidor.id,
      tipo: "site.remover",
      params: { siteId: site.id, slug: site.slug },
      siteId: site.id,
      por: entrada.por,
    });
    await tx
      .update(vpsSites)
      .set({ status: "removendo", updatedAt: agoraData() })
      .where(eq(vpsSites.id, site.id));
    return { tarefaId: tarefa.id };
  });
}

function exigirConfirmacaoDoDominio(
  dominios: Array<{ hostname: string; isPrimary: boolean }>,
  confirmacao: string,
): void {
  const principal = (dominios.find((d) => d.isPrimary) ?? dominios[0])
    ?.hostname;
  if (!principal || confirmacao.trim().toLowerCase() !== principal)
    throw new VpsError(
      400,
      "dados_invalidos",
      "Digite o domínio principal exatamente como aparece para confirmar.",
      {
        erros: {
          confirmacao: principal ? `Digite: ${principal}` : "Sem domínio.",
        },
      },
    );
}

/**
 * Quando dá para tirar o site do painel sem a resposta do agente: depois de
 * uma remoção que falhou, expirou ou ficou sem resposta, ou com o servidor
 * removido/revogado.
 */
export async function podeForcarRemocao(
  db: BancoVps,
  site: { id: string; status: string },
  servidor: { status: string; deletedAt: Date | null },
): Promise<boolean> {
  if (servidor.deletedAt || servidor.status === "revogado") return true;
  if (site.status !== "removendo") return false;
  const [ultima] = await db
    .select({ status: vpsJobs.status })
    .from(vpsJobs)
    .where(and(eq(vpsJobs.siteId, site.id), eq(vpsJobs.type, "site.remover")))
    .orderBy(desc(vpsJobs.seq))
    .limit(1);
  return (
    !ultima || ["falhou", "expirada", "sem_resposta"].includes(ultima.status)
  );
}

/** "Remover do painel mesmo sem resposta" (a VPS pode continuar servindo). */
export async function forcarRemocaoSite(
  db: BancoVps,
  entrada: {
    workspaceId: string;
    siteId: string;
    confirmacao: string;
  },
): Promise<{ siteId: string }> {
  return db.transaction(async (tx) => {
    await transicoesPreguicosas(tx);
    const { site, servidor, dominios } = await carregarSite(
      tx,
      entrada.workspaceId,
      entrada.siteId,
      { travar: true },
    );
    exigirConfirmacaoDoDominio(dominios, entrada.confirmacao);
    if (!(await podeForcarRemocao(tx, site, servidor)))
      throw new VpsError(
        409,
        "estado_invalido",
        "Só dá para forçar depois de uma remoção que falhou, expirou ou ficou sem resposta.",
      );
    const [aberta] = await tx
      .select({ id: vpsJobs.id })
      .from(vpsJobs)
      .where(
        and(
          eq(vpsJobs.siteId, site.id),
          inArray(vpsJobs.status, [...ESTADOS_TAREFA_ABERTA]),
        ),
      )
      .limit(1);
    if (aberta)
      throw new VpsError(
        409,
        "site_ocupado",
        "Ainda há uma tarefa deste site em andamento. Espere ela terminar.",
      );
    await tirarSiteDoPainel(tx, site.id);
    return { siteId: site.id };
  });
}
