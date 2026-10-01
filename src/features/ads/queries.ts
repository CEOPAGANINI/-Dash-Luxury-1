import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { adCampaigns, adChangeLog, adSets, ads } from "@/database/schema";
import { normalizarClasse } from "./campaign-classes";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { demoCampaignRows } from "./demo-campaigns";
import { ensureAdsSchema } from "./schema-guard";
import {
  fetchMetaAdSets,
  fetchMetaAds,
  fetchMetaCampaigns,
  fetchMetaPlacements,
  getMetaCredentials,
  metricasDeInsights,
  objetivoDoMeta,
  statusDoMeta,
  placementFromMeta,
  metaMetricPeriod,
  type MetaCredentials,
} from "./meta-client";
import {
  isAdNetwork,
  isAdStatus,
  type AdMetrics,
  type AdRow,
  type AdSetRow,
  type CampaignRow,
  type CampaignTree,
} from "./types";
import type { VendaPorPosicao } from "./creative-placements";

/*
  Leitura do gerenciador.

  Com banco, a árvore vem das três tabelas. Sem banco, vem das doze
  campanhas de exemplo (demo-campaigns.ts), com conjuntos e anúncios por
  baixo — e a tela diz que é demonstração.
*/

function metricasDe(row: {
  spendCents: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenueCents: number;
}): AdMetrics {
  return {
    spendCents: Number(row.spendCents),
    impressions: row.impressions,
    clicks: row.clicks,
    purchases: row.purchases,
    revenueCents: Number(row.revenueCents),
  };
}

export async function listCampaignTree(): Promise<CampaignTree> {
  if (!isDatabaseConfigured()) return arvoreDemo();

  try {
    await ensureAdsSchema();
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const credenciais = await getMetaCredentials();

    const campanhas = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.workspaceId, workspaceId),
          isNull(adCampaigns.deletedAt),
        ),
      )
      .orderBy(desc(adCampaigns.spendCents), adCampaigns.name);

    const idsCampanhas = campanhas.map((c) => c.id);
    const conjuntos = idsCampanhas.length
      ? await db
          .select()
          .from(adSets)
          .where(
            and(
              inArray(adSets.campaignId, idsCampanhas),
              isNull(adSets.deletedAt),
            ),
          )
          .orderBy(desc(adSets.spendCents), adSets.name)
      : [];

    const idsConjuntos = conjuntos.map((s) => s.id);
    const anuncios = idsConjuntos.length
      ? await db
          .select()
          .from(ads)
          .where(and(inArray(ads.adSetId, idsConjuntos), isNull(ads.deletedAt)))
          .orderBy(desc(ads.spendCents), ads.name)
      : [];

    const anunciosPorConjunto = new Map<string, AdRow[]>();
    for (const a of anuncios) {
      const lista = anunciosPorConjunto.get(a.adSetId) ?? [];
      const creative = (a.creative ?? {}) as AdRow["creative"] & {
        placements?: VendaPorPosicao[];
        checkouts?: number;
      };
      lista.push({
        id: a.id,
        externalId: a.externalId,
        name: a.name,
        status: isAdStatus(a.status) ? a.status : "paused",
        creative,
        metrics: {
          ...metricasDe(a),
          ...(typeof creative.checkouts === "number"
            ? { checkouts: creative.checkouts }
            : {}),
        },
        placements: creative.placements,
      });
      anunciosPorConjunto.set(a.adSetId, lista);
    }

    const conjuntosPorCampanha = new Map<string, AdSetRow[]>();
    for (const s of conjuntos) {
      const lista = conjuntosPorCampanha.get(s.campaignId) ?? [];
      lista.push({
        id: s.id,
        externalId: s.externalId,
        name: s.name,
        status: isAdStatus(s.status) ? s.status : "paused",
        dailyBudgetCents:
          s.dailyBudgetCents === null ? null : Number(s.dailyBudgetCents),
        metrics: metricasDe(s),
        ads: anunciosPorConjunto.get(s.id) ?? [],
      });
      conjuntosPorCampanha.set(s.campaignId, lista);
    }

    let ultimaSync: string | null = null;
    const arvore: CampaignRow[] = campanhas.map((c) => {
      if (
        c.syncedAt &&
        (!ultimaSync || c.syncedAt.toISOString() > ultimaSync)
      ) {
        ultimaSync = c.syncedAt.toISOString();
      }
      return {
        id: c.id,
        externalId: c.externalId,
        network: isAdNetwork(c.network) ? c.network : "meta",
        name: c.name,
        objective: c.objective,
        status: isAdStatus(c.status) ? c.status : "paused",
        dailyBudgetCents:
          c.dailyBudgetCents === null ? null : Number(c.dailyBudgetCents),
        source:
          c.source === "demo" || c.objective === "Exemplo"
            ? "demo"
            : c.source === "meta"
              ? "meta"
              : "manual",
        campaignClass: normalizarClasse(c.campaignClass) ?? undefined,
        syncedAt: c.syncedAt?.toISOString() ?? null,
        metrics: metricasDe(c),
        adSets: conjuntosPorCampanha.get(c.id) ?? [],
      };
    });

    return {
      campanhas: arvore,
      modo: "banco",
      metaConectado: Boolean(credenciais),
      ultimaSync,
    };
  } catch {
    return {
      campanhas: [],
      modo: "banco",
      metaConectado: false,
      ultimaSync: null,
      loadError: true,
    };
  }
}

/** Uma campanha, conjunto ou anúncio pelo id, com o que a edição precisa. */
export async function getAdEntity(
  tipo: "campaign" | "ad_set" | "ad",
  id: string,
): Promise<{
  id: string;
  externalId: string | null;
  name: string;
  status: string;
  dailyBudgetCents: number | null;
  metrics: AdMetrics;
  network: string | null;
} | null> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  if (tipo === "campaign") {
    const [c] = await db
      .select()
      .from(adCampaigns)
      .where(
        and(eq(adCampaigns.id, id), eq(adCampaigns.workspaceId, workspaceId)),
      )
      .limit(1);
    return c
      ? {
          id: c.id,
          externalId: c.externalId,
          name: c.name,
          status: c.status,
          dailyBudgetCents:
            c.dailyBudgetCents === null ? null : Number(c.dailyBudgetCents),
          metrics: metricasDe(c),
          network: c.network,
        }
      : null;
  }
  if (tipo === "ad_set") {
    const [s] = await db
      .select()
      .from(adSets)
      .where(and(eq(adSets.id, id), eq(adSets.workspaceId, workspaceId)))
      .limit(1);
    return s
      ? {
          id: s.id,
          externalId: s.externalId,
          name: s.name,
          status: s.status,
          dailyBudgetCents:
            s.dailyBudgetCents === null ? null : Number(s.dailyBudgetCents),
          metrics: metricasDe(s),
          network: null,
        }
      : null;
  }
  const [a] = await db
    .select()
    .from(ads)
    .where(and(eq(ads.id, id), eq(ads.workspaceId, workspaceId)))
    .limit(1);
  return a
    ? {
        id: a.id,
        externalId: a.externalId,
        name: a.name,
        status: a.status,
        dailyBudgetCents: null,
        metrics: metricasDe(a),
        network: null,
      }
    : null;
}

/**
 * Puxa campanhas, conjuntos e anúncios do Meta e grava. Quem já existe
 * (mesmo external_id) é atualizado; quem é novo, criado. Nada é apagado:
 * o que sumiu na plataforma fica aqui até alguém arquivar.
 */
export async function syncFromMeta(
  credenciais: MetaCredentials,
): Promise<{ campanhas: number; conjuntos: number; anuncios: number }> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const agora = new Date();

  const [campanhasMeta, conjuntosMeta, anunciosMeta, posicoesMeta] =
    await Promise.all([
      fetchMetaCampaigns(credenciais),
      fetchMetaAdSets(credenciais),
      fetchMetaAds(credenciais),
      fetchMetaPlacements(credenciais),
    ]);
  const posicoesPorAnuncio = new Map<string, VendaPorPosicao[]>();
  for (const row of posicoesMeta) {
    const position = placementFromMeta(row);
    if (!position) continue;
    const positions = posicoesPorAnuncio.get(row.ad_id) ?? [];
    positions.push(position);
    posicoesPorAnuncio.set(row.ad_id, positions);
  }
  // Uma leitura incompleta nunca deixa metade da árvore com um snapshot novo.
  // Todos os fetches são GET; os writes abaixo ficam no banco, em uma transação.
  return db.transaction(async (tx) => {
    const metricsSet = {
      spendCents: sql`excluded.spend_cents`,
      impressions: sql`excluded.impressions`,
      clicks: sql`excluded.clicks`,
      purchases: sql`excluded.purchases`,
      revenueCents: sql`excluded.revenue_cents`,
      syncedAt: agora,
      updatedAt: agora,
      deletedAt: null,
    };
    const campaigns = campanhasMeta.map((c) => ({
      workspaceId,
      network: "meta",
      externalId: c.id,
      name: c.name,
      objective: objetivoDoMeta(c.objective),
      status: statusDoMeta(c.effective_status ?? c.status),
      dailyBudgetCents: c.daily_budget ? Number(c.daily_budget) : null,
      lifetimeBudgetCents: c.lifetime_budget ? Number(c.lifetime_budget) : null,
      source: "meta",
      ...metricasDeInsights(c.insights),
      syncedAt: agora,
      updatedAt: agora,
      deletedAt: null,
    }));
    const idCampanhaPorExterno = new Map<string, string>();
    for (const chunk of chunks(campaigns)) {
      const rows = await tx
        .insert(adCampaigns)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            adCampaigns.workspaceId,
            adCampaigns.network,
            adCampaigns.externalId,
          ],
          set: {
            ...metricsSet,
            name: sql`excluded.name`,
            objective: sql`excluded.objective`,
            status: sql`excluded.status`,
            dailyBudgetCents: sql`excluded.daily_budget_cents`,
            lifetimeBudgetCents: sql`excluded.lifetime_budget_cents`,
            source: "meta",
          },
        })
        .returning({ id: adCampaigns.id, externalId: adCampaigns.externalId });
      for (const row of rows)
        if (row.externalId) idCampanhaPorExterno.set(row.externalId, row.id);
    }
    const sets = conjuntosMeta.flatMap((s) => {
      const campaignId = idCampanhaPorExterno.get(s.campaign_id);
      return campaignId
        ? [
            {
              workspaceId,
              campaignId,
              externalId: s.id,
              name: s.name,
              status: statusDoMeta(s.status),
              dailyBudgetCents: s.daily_budget ? Number(s.daily_budget) : null,
              targeting: s.targeting ?? {},
              ...metricasDeInsights(s.insights),
              syncedAt: agora,
              updatedAt: agora,
              deletedAt: null,
            },
          ]
        : [];
    });
    const idConjuntoPorExterno = new Map<string, string>();
    for (const chunk of chunks(sets)) {
      const rows = await tx
        .insert(adSets)
        .values(chunk)
        .onConflictDoUpdate({
          target: [adSets.workspaceId, adSets.externalId],
          set: {
            ...metricsSet,
            campaignId: sql`excluded.campaign_id`,
            name: sql`excluded.name`,
            status: sql`excluded.status`,
            dailyBudgetCents: sql`excluded.daily_budget_cents`,
            targeting: sql`excluded.targeting`,
          },
        })
        .returning({ id: adSets.id, externalId: adSets.externalId });
      for (const row of rows)
        if (row.externalId) idConjuntoPorExterno.set(row.externalId, row.id);
    }
    const adValues = anunciosMeta.flatMap((a) => {
      const adSetId = idConjuntoPorExterno.get(a.adset_id);
      const metrics = metricasDeInsights(a.insights);
      return adSetId
        ? [
            {
              workspaceId,
              adSetId,
              externalId: a.id,
              name: a.name,
              status: statusDoMeta(a.status),
              creative: {
                title: a.creative?.title,
                body: a.creative?.body,
                thumbnailUrl: a.creative?.thumbnail_url,
                placements: posicoesPorAnuncio.get(a.id) ?? [],
                checkouts: metrics.checkouts,
                metricsPeriod: metaMetricPeriod(credenciais.metricsPeriod),
              },
              ...metrics,
              syncedAt: agora,
              updatedAt: agora,
              deletedAt: null,
            },
          ]
        : [];
    });
    for (const chunk of chunks(adValues))
      await tx
        .insert(ads)
        .values(chunk)
        .onConflictDoUpdate({
          target: [ads.workspaceId, ads.externalId],
          set: {
            ...metricsSet,
            adSetId: sql`excluded.ad_set_id`,
            name: sql`excluded.name`,
            status: sql`excluded.status`,
            creative: sql`excluded.creative`,
          },
        });
    return {
      campanhas: campaigns.length,
      conjuntos: sets.length,
      anuncios: adValues.length,
    };
  });
}

function chunks<T>(values: T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks;
}

/* ------------------------------------------------------------------ */
/* Demonstração                                                        */
/* ------------------------------------------------------------------ */

/** Sem banco: as doze campanhas de exemplo (ver demo-campaigns.ts). */
function arvoreDemo(): CampaignTree {
  return {
    campanhas: demoCampaignRows(),
    modo: "demo",
    metaConectado: false,
    ultimaSync: null,
  };
}

export interface MudancaRegistrada {
  id: string;
  entityType: string;
  entityName: string;
  field: string;
  before: string | null;
  after: string | null;
  appliedRemote: boolean;
  error: string | null;
  actor: string | null;
  createdAt: string;
}

/** O diário de uma campanha (e dos conjuntos/anúncios dela), mais recente primeiro. */
export async function listCampaignChangeLog(
  ids: string[],
  limit = 50,
): Promise<MudancaRegistrada[]> {
  if (!isDatabaseConfigured() || ids.length === 0) return [];
  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const rows = await db
      .select()
      .from(adChangeLog)
      .where(
        and(
          eq(adChangeLog.workspaceId, workspaceId),
          inArray(adChangeLog.entityId, ids),
        ),
      )
      .orderBy(desc(adChangeLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityName: r.entityName,
      field: r.field,
      before: r.before,
      after: r.after,
      appliedRemote: r.appliedRemote,
      error: r.error,
      actor: r.actor,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    console.error("[ads] diário indisponível");
    return [];
  }
}
