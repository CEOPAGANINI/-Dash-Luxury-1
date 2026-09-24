import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/database/client";
import { checkouts, products } from "@/database/schema";
import {
  vpsJobs,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema/vps";
import { DEMO_USER, getSession } from "@/lib/auth/session";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import {
  configuracaoDoPainel,
  ehDonoDaVps,
  preRequisitosVps,
  type PendenciaVps,
} from "./acesso";
import { chaveMestra } from "./chaves";
import {
  ESTADOS_TAREFA_ABERTA,
  ipsEsperados,
  R_SLUG_CHECKOUT,
  R_UUID,
  ROTULO_DO_ESTADO_DA_TAREFA,
  ROTULO_DO_TIPO,
  sinalDoServidor,
  type DominioDTO,
  type EstadoDns,
  type EstadoRelease,
  type EstadoServidor,
  type EstadoSite,
  type EstadoTarefa,
  type EstadoTls,
  type ReleaseDTO,
  type ServidorDetalheDTO,
  type ServidorDTO,
  type SiteDetalheDTO,
  type SiteDTO,
  type TarefaDTO,
  type TipoTarefa,
} from "./modelo";
import { mensagemDeErroVps, type BancoVps } from "./schema-sql";
import {
  calcularEsperaDoSsl,
  COMANDO_DESINSTALAR,
  COMANDO_DESINSTALAR_TUDO,
  noArDaConferencia,
  podeForcarRemocao,
  type PedidoDeSslRecente,
} from "./servico";
import { transicoesPreguicosas } from "./tarefas";
import { traduzirErroCertbot } from "./traducao-certbot";

/*
  Leitura do Servidor do Funil para as telas e para o polling
  (GET /api/painel/vps/estado).

  Padrão PUBLIC_COLUMNS (do painel VPS anterior): cada consulta escolhe as
  colunas que viram DTO, e nenhuma escolhe hash de token/código, `params`,
  `signature` ou `content`. Não basta "não mostrar": o que não é
  selecionado não tem como vazar num JSON.

  Datas saem como ISO de `Date` do query builder; números int8 só pelo
  query builder (bigint mode number).
*/

const iso = (data: Date | null | undefined): string | null =>
  data ? data.toISOString() : null;

// ---------------------------------------------------------------------------
// Colunas públicas e DTOs
// ---------------------------------------------------------------------------

export const COLUNAS_DO_SERVIDOR = {
  id: vpsServers.id,
  name: vpsServers.name,
  status: vpsServers.status,
  enrollExpiresAt: vpsServers.enrollExpiresAt,
  keyGeneration: vpsServers.keyGeneration,
  registeredAt: vpsServers.registeredAt,
  confirmedAt: vpsServers.confirmedAt,
  confirmedBy: vpsServers.confirmedBy,
  lastPulseAt: vpsServers.lastPulseAt,
  lastSeenIp: vpsServers.lastSeenIp,
  publicIpv4: vpsServers.publicIpv4,
  publicIpv6: vpsServers.publicIpv6,
  ipOverride: vpsServers.ipOverride,
  hostname: vpsServers.hostname,
  osName: vpsServers.osName,
  agentVersion: vpsServers.agentVersion,
  capabilities: vpsServers.capabilities,
  locks: vpsServers.locks,
  lastOverview: vpsServers.lastOverview,
  lastOverviewAt: vpsServers.lastOverviewAt,
  lastOverviewError: vpsServers.lastOverviewError,
  createdAt: vpsServers.createdAt,
};
type LinhaDoServidor = Pick<
  typeof vpsServers.$inferSelect,
  keyof typeof COLUNAS_DO_SERVIDOR
>;

export const COLUNAS_DO_SITE = {
  id: vpsSites.id,
  serverId: vpsSites.serverId,
  name: vpsSites.name,
  slug: vpsSites.slug,
  status: vpsSites.status,
  checkoutOrigin: vpsSites.checkoutOrigin,
  checkoutUrl: vpsSites.checkoutUrl,
  nginxAppliedAt: vpsSites.nginxAppliedAt,
  nginxError: vpsSites.nginxError,
  tlsStatus: vpsSites.tlsStatus,
  tlsExpiresAt: vpsSites.tlsExpiresAt,
  tlsCheckedAt: vpsSites.tlsCheckedAt,
  tlsError: vpsSites.tlsError,
  reportedPresent: vpsSites.reportedPresent,
  reportedRelease: vpsSites.reportedRelease,
  publicCheck: vpsSites.publicCheck,
  createdAt: vpsSites.createdAt,
};
type LinhaDoSite = Pick<
  typeof vpsSites.$inferSelect,
  keyof typeof COLUNAS_DO_SITE
>;

export const COLUNAS_DO_DOMINIO = {
  siteId: vpsSiteDomains.siteId,
  hostname: vpsSiteDomains.hostname,
  isPrimary: vpsSiteDomains.isPrimary,
  dnsStatus: vpsSiteDomains.dnsStatus,
  dnsDetail: vpsSiteDomains.dnsDetail,
  dnsCheckedAt: vpsSiteDomains.dnsCheckedAt,
};
type LinhaDoDominio = Pick<
  typeof vpsSiteDomains.$inferSelect,
  keyof typeof COLUNAS_DO_DOMINIO
>;

export const COLUNAS_DA_RELEASE = {
  id: vpsReleases.id,
  siteId: vpsReleases.siteId,
  fileName: vpsReleases.fileName,
  createdAt: vpsReleases.createdAt,
  createdBy: vpsReleases.createdBy,
  fileCount: vpsReleases.fileCount,
  uncompressedBytes: vpsReleases.uncompressedBytes,
  zipBytes: vpsReleases.zipBytes,
  indexSha256: vpsReleases.indexSha256,
  pages: vpsReleases.pages,
  hasTracking: vpsReleases.hasTracking,
  status: vpsReleases.status,
  isActive: vpsReleases.isActive,
  activatedAt: vpsReleases.activatedAt,
  error: vpsReleases.error,
  warnings: vpsReleases.warnings,
};
type LinhaDaRelease = Pick<
  typeof vpsReleases.$inferSelect,
  keyof typeof COLUNAS_DA_RELEASE
>;

export const COLUNAS_DA_TAREFA = {
  id: vpsJobs.id,
  type: vpsJobs.type,
  status: vpsJobs.status,
  createdAt: vpsJobs.createdAt,
  deliveredAt: vpsJobs.deliveredAt,
  finishedAt: vpsJobs.finishedAt,
  expiresAt: vpsJobs.expiresAt,
  error: vpsJobs.error,
  createdBy: vpsJobs.createdBy,
};
type LinhaDaTarefa = Pick<
  typeof vpsJobs.$inferSelect,
  keyof typeof COLUNAS_DA_TAREFA
>;

/** Um checkout publicado, como aparece no BlockPicker do site. */
export type CheckoutOpcaoDTO = {
  id: string;
  nome: string;
  slug: string;
  produtoSlug: string | null;
};

export function servidorParaDTO(
  s: LinhaDoServidor,
  totalSites: number,
  agora: Date = new Date(),
): ServidorDTO {
  const visao = s.lastOverview;
  const desvio = s.capabilities?.desvioRelogioMs ?? null;
  const travas = s.locks ?? {};
  return {
    id: s.id,
    nome: s.name,
    estado: s.status as EstadoServidor,
    sinal: {
      tipo: sinalDoServidor(s.lastPulseAt, agora),
      ultimoPulsoEm: iso(s.lastPulseAt),
    },
    instalacao:
      s.enrollExpiresAt && s.enrollExpiresAt.getTime() > agora.getTime()
        ? { expiraEm: s.enrollExpiresAt.toISOString() }
        : null,
    registro: s.registeredAt
      ? {
          hostname: s.hostname,
          so: s.osName,
          ipVisto: s.lastSeenIp,
          ipsPublicos: [...(s.publicIpv4 ?? []), ...(s.publicIpv6 ?? [])],
          registradoEm: iso(s.registeredAt),
        }
      : null,
    ipDoDns: ipsEsperados(s).ipv4[0] ?? null,
    ipInformado: s.ipOverride,
    versaoAgente: s.agentVersion,
    travas: {
      pausado: travas.pausado === true,
      somenteLeitura: travas.somenteLeitura === true,
    },
    geracaoChave: s.keyGeneration,
    relogio:
      typeof desvio === "number" && Math.abs(desvio) > 60_000
        ? { desvioSegundos: Math.round(desvio / 1000) }
        : null,
    nginx: s.capabilities?.nginx ?? null,
    // A hora que vale é a da gravação (last_overview_at), não a do parse.
    leitura:
      visao && s.lastOverviewAt
        ? {
            em: s.lastOverviewAt.toISOString(),
            cpuPercent: visao.cpuPercent,
            cpuCores: visao.cpuCores,
            memoria: visao.memory
              ? {
                  usadoBytes: visao.memory.usedBytes,
                  totalBytes: visao.memory.totalBytes,
                }
              : null,
            disco: visao.disk
              ? {
                  usadoBytes: visao.disk.usedBytes,
                  totalBytes: visao.disk.totalBytes,
                }
              : null,
            uptimeSegundos: visao.uptimeSeconds,
            avisos: visao.warnings ?? [],
          }
        : null,
    erroLeitura: s.lastOverviewError,
    totalSites,
  };
}

export function releaseParaDTO(r: LinhaDaRelease): ReleaseDTO {
  return {
    id: r.id,
    arquivo: r.fileName,
    criadaEm: r.createdAt.toISOString(),
    por: r.createdBy,
    arquivos: r.fileCount,
    bytes: r.uncompressedBytes,
    bytesZip: r.zipBytes,
    paginas: r.pages ?? {},
    temRastreio: r.hasTracking,
    estado: r.status as EstadoRelease,
    ativa: r.isActive,
    ativadaEm: iso(r.activatedAt),
    erro: r.error,
    avisos: r.warnings ?? [],
  };
}

export function tarefaParaDTO(t: LinhaDaTarefa): TarefaDTO {
  const tipo = t.type as TipoTarefa;
  const estado = t.status as EstadoTarefa;
  const erro =
    tipo === "site.ssl_emitir" && estado === "falhou"
      ? traduzirErroCertbot(t.error)
      : t.error;
  return {
    id: t.id,
    tipo,
    rotulo: ROTULO_DO_TIPO[tipo] ?? t.type,
    estado,
    rotuloEstado:
      estado === "falhou"
        ? `Falhou: ${erro ?? "o servidor não disse o motivo"}`
        : (ROTULO_DO_ESTADO_DA_TAREFA[estado] ?? t.status),
    criadaEm: t.createdAt.toISOString(),
    entregueEm: iso(t.deliveredAt),
    concluidaEm: iso(t.finishedAt),
    expiraEm: t.expiresAt.toISOString(),
    erro,
    por: t.createdBy,
  };
}

function dominioParaDTO(d: LinhaDoDominio): DominioDTO {
  return {
    hostname: d.hostname,
    principal: d.isPrimary,
    dns: d.dnsStatus as EstadoDns,
    verificadoEm: iso(d.dnsCheckedAt),
    detalhe: d.dnsDetail ?? {},
  };
}

export const AVISO_CHECKOUT_DESPUBLICADO =
  "O checkout escolhido foi despublicado ou apagado: o botão /checkout deste site leva a uma página de erro. Escolha outro.";

function siteParaDTO(
  s: LinhaDoSite,
  e: {
    servidorNome: string;
    dominios: LinhaDoDominio[];
    ativa: LinhaDaRelease | null;
    checkouts: Map<string, CheckoutOpcaoDTO>;
    esperaSsl: Date | null;
  },
): SiteDTO {
  // O slug do checkout sai da própria URL gravada (a origem pode ser outra).
  const prefixo = `${s.checkoutOrigin}/checkout/`;
  const slugDoCheckout =
    s.checkoutUrl && s.checkoutUrl.startsWith(prefixo)
      ? s.checkoutUrl.slice(prefixo.length)
      : null;
  const checkout =
    slugDoCheckout && R_SLUG_CHECKOUT.test(slugDoCheckout)
      ? (e.checkouts.get(slugDoCheckout) ?? null)
      : null;
  return {
    id: s.id,
    servidorId: s.serverId,
    servidorNome: e.servidorNome,
    nome: s.name,
    slug: s.slug,
    estado: s.status as EstadoSite,
    dominios: e.dominios.map(dominioParaDTO),
    checkout: {
      origem: s.checkoutOrigin,
      url: s.checkoutUrl,
      aviso: s.checkoutUrl && !checkout ? AVISO_CHECKOUT_DESPUBLICADO : null,
    },
    nginx: { aplicadoEm: iso(s.nginxAppliedAt), erro: s.nginxError },
    https: {
      estado: s.tlsStatus as EstadoTls,
      validoAte: iso(s.tlsExpiresAt),
      conferidoEm: iso(s.tlsCheckedAt),
      erro: s.tlsError,
      podeTentarEm: iso(e.esperaSsl),
    },
    naVps:
      s.reportedPresent === null
        ? "desconhecido"
        : s.reportedPresent
          ? "presente"
          : "ausente",
    versaoAtiva: e.ativa ? releaseParaDTO(e.ativa) : null,
    servidorInforma: s.reportedRelease,
    rastreioProduto: checkout?.produtoSlug ?? null,
    noAr: noArDaConferencia(s.publicCheck, e.ativa?.id ?? null),
  };
}

// ---------------------------------------------------------------------------
// Montagem do estado
// ---------------------------------------------------------------------------

/** Checkouts PUBLICADOS do workspace (o /checkout de um site só vai para um deles). */
export async function checkoutsPublicados(
  db: BancoVps,
  workspaceId: string,
): Promise<CheckoutOpcaoDTO[]> {
  const linhas = await db
    .select({
      id: checkouts.id,
      nome: checkouts.name,
      slug: checkouts.slug,
      produtoSlug: products.slug,
    })
    .from(checkouts)
    .leftJoin(products, eq(products.id, checkouts.mainProductId))
    .where(
      and(
        eq(checkouts.workspaceId, workspaceId),
        eq(checkouts.status, "published"),
        isNull(checkouts.deletedAt),
      ),
    )
    .orderBy(asc(checkouts.name));
  return linhas.filter((c) => R_SLUG_CHECKOUT.test(c.slug));
}

export type EstadoDoPainelVps = {
  agora: string;
  servidores: ServidorDTO[];
  sites: SiteDTO[];
  /** Pedido com ?servidor=: null quando não existe (a página dá notFound). */
  servidor?: ServidorDetalheDTO | null;
  /** Pedido com ?site=: null quando não existe. */
  site?: SiteDetalheDTO | null;
  checkouts: CheckoutOpcaoDTO[];
  /** Lista ORIGENS: o BlockPicker de origem só aparece com mais de uma. */
  origens: string[];
  /** Endereço do painel (base do snippet de rastreio). */
  appUrl: string;
  comandoDesinstalar: { manterSites: string; removerSites: string };
};

export type OpcoesDoEstado = {
  servidorId?: string | null;
  siteId?: string | null;
  /** Grava viewer_seen_at (pulso rápido enquanto a tela está aberta). */
  marcarVisto?: boolean;
};

/**
 * Tudo que as telas precisam, numa passada: roda as transições
 * preguiçosas (não há cron), lê servidores e sites do workspace e, se
 * pedido, o detalhe de um servidor ou de um site.
 */
export async function montarEstado(
  db: BancoVps,
  workspaceId: string,
  opcoes: OpcoesDoEstado = {},
): Promise<EstadoDoPainelVps> {
  await db.transaction((tx) => transicoesPreguicosas(tx));
  const agora = new Date();
  const config = configuracaoDoPainel();

  const servidoresLinhas = await db
    .select(COLUNAS_DO_SERVIDOR)
    .from(vpsServers)
    .where(
      and(
        eq(vpsServers.workspaceId, workspaceId),
        isNull(vpsServers.deletedAt),
      ),
    )
    .orderBy(asc(vpsServers.createdAt));
  const sitesLinhas = await db
    .select(COLUNAS_DO_SITE)
    .from(vpsSites)
    .where(
      and(eq(vpsSites.workspaceId, workspaceId), isNull(vpsSites.deletedAt)),
    )
    .orderBy(asc(vpsSites.createdAt));
  const siteIds = sitesLinhas.map((s) => s.id);

  const [dominios, ativas, pedidosSsl, listaDeCheckouts] = await Promise.all([
    siteIds.length
      ? db
          .select(COLUNAS_DO_DOMINIO)
          .from(vpsSiteDomains)
          .where(inArray(vpsSiteDomains.siteId, siteIds))
          .orderBy(desc(vpsSiteDomains.isPrimary), asc(vpsSiteDomains.hostname))
      : Promise.resolve([] as LinhaDoDominio[]),
    siteIds.length
      ? db
          .select(COLUNAS_DA_RELEASE)
          .from(vpsReleases)
          .where(
            and(
              inArray(vpsReleases.siteId, siteIds),
              eq(vpsReleases.isActive, true),
            ),
          )
      : Promise.resolve([] as LinhaDaRelease[]),
    siteIds.length
      ? db
          .select({
            siteId: vpsJobs.siteId,
            status: vpsJobs.status,
            createdAt: vpsJobs.createdAt,
            finishedAt: vpsJobs.finishedAt,
          })
          .from(vpsJobs)
          .where(
            and(
              inArray(vpsJobs.siteId, siteIds),
              eq(vpsJobs.type, "site.ssl_emitir"),
              gte(vpsJobs.createdAt, new Date(agora.getTime() - 3_600_000)),
            ),
          )
      : Promise.resolve(
          [] as Array<PedidoDeSslRecente & { siteId: string | null }>,
        ),
    checkoutsPublicados(db, workspaceId),
  ]);

  const nomeDoServidor = new Map(servidoresLinhas.map((s) => [s.id, s.name]));
  const checkoutPorSlug = new Map(listaDeCheckouts.map((c) => [c.slug, c]));
  const sites = sitesLinhas.map((s) =>
    siteParaDTO(s, {
      servidorNome: nomeDoServidor.get(s.serverId) ?? "",
      dominios: dominios.filter((d) => d.siteId === s.id),
      ativa: ativas.find((r) => r.siteId === s.id) ?? null,
      checkouts: checkoutPorSlug,
      esperaSsl: calcularEsperaDoSsl(
        pedidosSsl.filter((p) => p.siteId === s.id),
        agora.getTime(),
      ),
    }),
  );
  const servidores = servidoresLinhas.map((s) =>
    servidorParaDTO(
      s,
      sites.filter((site) => site.servidorId === s.id).length,
      agora,
    ),
  );

  const estado: EstadoDoPainelVps = {
    agora: agora.toISOString(),
    servidores,
    sites,
    checkouts: listaDeCheckouts,
    origens: config.origens,
    appUrl: config.painel ?? config.appUrl,
    comandoDesinstalar: {
      manterSites: COMANDO_DESINSTALAR,
      removerSites: COMANDO_DESINSTALAR_TUDO,
    },
  };

  const vistos = new Set<string>();

  if (opcoes.servidorId !== undefined && opcoes.servidorId !== null) {
    const id = opcoes.servidorId;
    const linha = R_UUID.test(id)
      ? servidoresLinhas.find((s) => s.id === id)
      : undefined;
    estado.servidor = linha
      ? await detalheDoServidor(db, linha, servidores, sites)
      : null;
    if (linha) vistos.add(linha.id);
  }

  if (opcoes.siteId !== undefined && opcoes.siteId !== null) {
    const id = opcoes.siteId;
    const linha = R_UUID.test(id)
      ? sitesLinhas.find((s) => s.id === id)
      : undefined;
    const dto = linha ? sites.find((s) => s.id === linha.id) : undefined;
    estado.site =
      linha && dto
        ? await detalheDoSite(db, linha, dto, servidoresLinhas)
        : null;
    if (linha) vistos.add(linha.serverId);
  }

  if (opcoes.marcarVisto) {
    const ids =
      opcoes.servidorId || opcoes.siteId
        ? [...vistos]
        : servidoresLinhas.map((s) => s.id);
    await marcarVisto(db, workspaceId, ids);
  }

  return estado;
}

async function detalheDoServidor(
  db: BancoVps,
  linha: LinhaDoServidor,
  servidores: ServidorDTO[],
  sites: SiteDTO[],
): Promise<ServidorDetalheDTO> {
  const tarefas = await db
    .select(COLUNAS_DA_TAREFA)
    .from(vpsJobs)
    .where(eq(vpsJobs.serverId, linha.id))
    .orderBy(desc(vpsJobs.seq))
    .limit(20);
  const dto = servidores.find((s) => s.id === linha.id)!;
  return {
    ...dto,
    ipsEsperados: ipsEsperados(linha),
    confirmado: linha.confirmedAt
      ? { em: linha.confirmedAt.toISOString(), por: linha.confirmedBy }
      : null,
    sites: sites.filter((s) => s.servidorId === linha.id),
    tarefas: tarefas.map(tarefaParaDTO),
  };
}

async function detalheDoSite(
  db: BancoVps,
  linha: LinhaDoSite,
  dto: SiteDTO,
  servidoresLinhas: LinhaDoServidor[],
): Promise<SiteDetalheDTO> {
  const [versoes, tarefas, abertas, servidorLinha] = await Promise.all([
    db
      .select(COLUNAS_DA_RELEASE)
      .from(vpsReleases)
      .where(eq(vpsReleases.siteId, linha.id))
      .orderBy(desc(vpsReleases.createdAt))
      .limit(5),
    db
      .select(COLUNAS_DA_TAREFA)
      .from(vpsJobs)
      .where(eq(vpsJobs.siteId, linha.id))
      .orderBy(desc(vpsJobs.seq))
      .limit(10),
    db
      .select(COLUNAS_DA_TAREFA)
      .from(vpsJobs)
      .where(
        and(
          eq(vpsJobs.siteId, linha.id),
          inArray(vpsJobs.status, [...ESTADOS_TAREFA_ABERTA]),
        ),
      )
      .limit(1),
    // O servidor do site pode ter saído da lista (removido): lê direto.
    servidoresLinhas.find((s) => s.id === linha.serverId)
      ? Promise.resolve(null)
      : db
          .select({
            status: vpsServers.status,
            deletedAt: vpsServers.deletedAt,
            ipOverride: vpsServers.ipOverride,
            publicIpv4: vpsServers.publicIpv4,
            publicIpv6: vpsServers.publicIpv6,
            lastSeenIp: vpsServers.lastSeenIp,
          })
          .from(vpsServers)
          .where(eq(vpsServers.id, linha.serverId))
          .limit(1)
          .then((l) => l[0] ?? null),
  ]);
  const naLista = servidoresLinhas.find((s) => s.id === linha.serverId);
  const servidor = naLista
    ? { ...naLista, deletedAt: null as Date | null }
    : servidorLinha;
  return {
    ...dto,
    ipsEsperados: servidor ? ipsEsperados(servidor) : { ipv4: [], ipv6: [] },
    versoes: versoes.map(releaseParaDTO),
    tarefas: tarefas.map(tarefaParaDTO),
    tarefaAberta: abertas[0] ? tarefaParaDTO(abertas[0]) : null,
    podeForcarRemocao: await podeForcarRemocao(
      db,
      linha,
      servidor ?? { status: "revogado", deletedAt: new Date() },
    ),
  };
}

/**
 * viewer_seen_at com freio de 30 s: com a tela aberta o agente pulsa a
 * cada 5 s (tarefa sai rápido), sem uma escrita por polling.
 */
async function marcarVisto(
  db: BancoVps,
  workspaceId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(vpsServers)
    .set({ viewerSeenAt: sql`now()` })
    .where(
      and(
        inArray(vpsServers.id, ids),
        eq(vpsServers.workspaceId, workspaceId),
        or(
          isNull(vpsServers.viewerSeenAt),
          lt(vpsServers.viewerSeenAt, sql`now() - interval '30 seconds'`),
        ),
      ),
    );
}

// ---------------------------------------------------------------------------
// Entrada das páginas
// ---------------------------------------------------------------------------

export type PainelVps =
  | { estado: "demo" }
  | { estado: "sem_permissao"; motivo: string }
  | { estado: "configurar"; pendencias: PendenciaVps[] }
  | { estado: "erro"; mensagem: string }
  | {
      estado: "ok";
      /** VPS_CHAVE_MESTRA presente: dá para assinar tarefas. */
      podeAlterar: boolean;
      /** A lista inteira (ok e pendentes); o bloco aparece se alguma falhar. */
      pendencias: PendenciaVps[];
      dados: EstadoDoPainelVps;
    };

/**
 * O que cada página do Servidor lê no servidor, antes de passar para a
 * ilha "use client". Nunca lança: cada situação vira um estado que a tela
 * sabe mostrar. No modo demo não toca no banco.
 */
export async function lerPainelVps(
  opcoes: { servidorId?: string; siteId?: string } = {},
): Promise<PainelVps> {
  const session = await getSession();
  if (!session)
    return {
      estado: "sem_permissao",
      motivo: "Entre na sua conta para ver os servidores.",
    };
  if (session.demoMode || session.user.id === DEMO_USER.id)
    return { estado: "demo" };
  if (!ehDonoDaVps(session.user))
    return {
      estado: "sem_permissao",
      motivo: `Sua conta (${session.user.email || session.user.id}) não está em VPS_DONOS (ou o e-mail não foi confirmado).`,
    };

  const pendencias = await preRequisitosVps(session);
  const essencial = (chave: PendenciaVps["chave"]) =>
    pendencias.find((p) => p.chave === chave)?.ok === true;
  if (!essencial("banco") || !essencial("tabelas"))
    return { estado: "configurar", pendencias };

  try {
    const db: BancoVps = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const dados = await montarEstado(db, workspaceId, {
      servidorId: opcoes.servidorId,
      siteId: opcoes.siteId,
      marcarVisto: true,
    });
    return {
      estado: "ok",
      podeAlterar: Boolean(chaveMestra()),
      pendencias,
      dados,
    };
  } catch (erro) {
    console.error("[vps] leitura do painel", erro);
    return { estado: "erro", mensagem: mensagemDeErroVps(erro) };
  }
}
