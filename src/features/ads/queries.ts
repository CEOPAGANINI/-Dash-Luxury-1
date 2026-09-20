import { and, desc, eq, inArray, isNull } from "drizzle-orm";

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
  getMetaCredentials,
  metricasDeInsights,
  objetivoDoMeta,
  statusDoMeta,
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
        and(eq(adCampaigns.workspaceId, workspaceId), isNull(adCampaigns.deletedAt)),
      )
      .orderBy(desc(adCampaigns.spendCents), adCampaigns.name);

    const idsCampanhas = campanhas.map((c) => c.id);
    const conjuntos = idsCampanhas.length
      ? await db
          .select()
          .from(adSets)
          .where(
            and(inArray(adSets.campaignId, idsCampanhas), isNull(adSets.deletedAt)),
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
      lista.push({
        id: a.id,
        externalId: a.externalId,
        name: a.name,
        status: isAdStatus(a.status) ? a.status : "paused",
        creative: (a.creative ?? {}) as AdRow["creative"],
        metrics: metricasDe(a),
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
      if (c.syncedAt && (!ultimaSync || c.syncedAt.toISOString() > ultimaSync)) {
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
        source: c.source === "meta" ? "meta" : "manual",
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
  } catch (error) {
    console.error("[ads] erro ao listar:", error);
    return { campanhas: [], modo: "banco", metaConectado: false, ultimaSync: null, loadError: true };
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
      .where(and(eq(adCampaigns.id, id), eq(adCampaigns.workspaceId, workspaceId)))
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

  const [campanhasMeta, conjuntosMeta, anunciosMeta] = await Promise.all([
    fetchMetaCampaigns(credenciais),
    fetchMetaAdSets(credenciais),
    fetchMetaAds(credenciais),
  ]);

  const idCampanhaPorExterno = new Map<string, string>();
  for (const c of campanhasMeta) {
    const m = metricasDeInsights(c.insights);
    const valores = {
      name: c.name,
      objective: objetivoDoMeta(c.objective),
      status: statusDoMeta(c.effective_status ?? c.status),
      dailyBudgetCents: c.daily_budget ? Number(c.daily_budget) : null,
      lifetimeBudgetCents: c.lifetime_budget ? Number(c.lifetime_budget) : null,
      source: "meta",
      ...m,
      syncedAt: agora,
      updatedAt: agora,
      deletedAt: null,
    };
    const [row] = await db
      .insert(adCampaigns)
      .values({ workspaceId, network: "meta", externalId: c.id, ...valores })
      .onConflictDoUpdate({
        target: [adCampaigns.workspaceId, adCampaigns.network, adCampaigns.externalId],
        set: valores,
      })
      .returning({ id: adCampaigns.id });
    idCampanhaPorExterno.set(c.id, row.id);
  }

  const idConjuntoPorExterno = new Map<string, string>();
  for (const s of conjuntosMeta) {
    const campaignId = idCampanhaPorExterno.get(s.campaign_id);
    if (!campaignId) continue;
    const m = metricasDeInsights(s.insights);
    const valores = {
      campaignId,
      name: s.name,
      status: statusDoMeta(s.status),
      dailyBudgetCents: s.daily_budget ? Number(s.daily_budget) : null,
      targeting: s.targeting ?? {},
      ...m,
      syncedAt: agora,
      updatedAt: agora,
      deletedAt: null,
    };
    const [row] = await db
      .insert(adSets)
      .values({ workspaceId, externalId: s.id, ...valores })
      .onConflictDoUpdate({
        target: [adSets.workspaceId, adSets.externalId],
        set: valores,
      })
      .returning({ id: adSets.id });
    idConjuntoPorExterno.set(s.id, row.id);
  }

  let anuncios = 0;
  for (const a of anunciosMeta) {
    const adSetId = idConjuntoPorExterno.get(a.adset_id);
    if (!adSetId) continue;
    const m = metricasDeInsights(a.insights);
    const valores = {
      adSetId,
      name: a.name,
      status: statusDoMeta(a.status),
      creative: {
        title: a.creative?.title,
        body: a.creative?.body,
        thumbnailUrl: a.creative?.thumbnail_url,
      },
      ...m,
      syncedAt: agora,
      updatedAt: agora,
      deletedAt: null,
    };
    await db
      .insert(ads)
      .values({ workspaceId, externalId: a.id, ...valores })
      .onConflictDoUpdate({
        target: [ads.workspaceId, ads.externalId],
        set: valores,
      });
    anuncios += 1;
  }

  return {
    campanhas: idCampanhaPorExterno.size,
    conjuntos: idConjuntoPorExterno.size,
    anuncios,
  };
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
      .where(and(eq(adChangeLog.workspaceId, workspaceId), inArray(adChangeLog.entityId, ids)))
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
  } catch (error) {
    console.error("[ads] diário indisponível:", error);
    return [];
  }
}
