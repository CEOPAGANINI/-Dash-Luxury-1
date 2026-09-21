import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { adCampaigns, orderItems, orders, products, stores, visitorSessions } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

import { campanhaFalaDaOferta, type CampanhaDaOferta, type LojaComOfertas, type Oferta } from "./offer-traffic";

/*
  As lojas ligadas ao painel e as ofertas delas, com o que aponta para
  cada uma no período: campanhas ligadas, visitas à página e pedidos
  pagos. Sem banco não há nada a mostrar — e a página diz isso em vez de
  inventar números.
*/

export interface PanoramaDasLojas {
  bancoConfigurado: boolean;
  lojas: LojaComOfertas[];
  dias: number;
}

export async function panoramaDasLojas(dias = 30): Promise<PanoramaDasLojas> {
  if (!isDatabaseConfigured()) return { bancoConfigurado: false, lojas: [], dias };

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const lojasCruas = await db
    .select({ id: stores.id, nome: stores.name, slug: stores.slug, ativa: stores.isActive, moeda: stores.currency })
    .from(stores)
    .where(and(eq(stores.workspaceId, workspaceId), isNull(stores.deletedAt)));

  const produtosCrus = await db
    .select({
      id: products.id,
      storeId: products.storeId,
      nome: products.name,
      slug: products.slug,
      precoCents: products.priceCents,
      status: products.status,
    })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), isNull(products.deletedAt)));

  /* Pedidos pagos por produto no período. */
  const vendasCruas = await db
    .select({
      productId: orderItems.productId,
      pedidos: sql<number>`count(distinct ${orders.id})::int`,
      receitaCents: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::bigint`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.workspaceId, workspaceId), gte(orders.createdAt, desde), sql`${orders.paidAt} is not null`))
    .groupBy(orderItems.productId);
  const vendas = new Map(vendasCruas.map((v) => [v.productId ?? "", { pedidos: Number(v.pedidos ?? 0), receitaCents: Number(v.receitaCents ?? 0) }]));

  /* Visitas: sessões cuja página de entrada ou atual leva o slug. */
  const sessoes = await db
    .select({ primeira: visitorSessions.firstPage, atual: visitorSessions.currentPage })
    .from(visitorSessions)
    .where(and(eq(visitorSessions.workspaceId, workspaceId), gte(visitorSessions.lastSeenAt, desde)));

  /* Campanhas do período, para ligar pelo nome. */
  const campanhasCruas = await db
    .select({
      id: adCampaigns.id,
      nome: adCampaigns.name,
      rede: adCampaigns.network,
      status: adCampaigns.status,
      spendCents: adCampaigns.spendCents,
      revenueCents: adCampaigns.revenueCents,
    })
    .from(adCampaigns)
    .where(and(eq(adCampaigns.workspaceId, workspaceId), isNull(adCampaigns.deletedAt)));
  const campanhas: CampanhaDaOferta[] = campanhasCruas.map((c) => ({
    id: c.id,
    nome: c.nome,
    rede: c.rede,
    status: c.status,
    spendCents: Number(c.spendCents ?? 0),
    revenueCents: Number(c.revenueCents ?? 0),
  }));

  const ofertaDe = (p: (typeof produtosCrus)[number]): Oferta => {
    const venda = vendas.get(p.id) ?? { pedidos: 0, receitaCents: 0 };
    const alvo = `/${p.slug}`;
    const visitas = sessoes.filter((s) => (s.primeira ?? "").includes(alvo) || (s.atual ?? "").includes(alvo)).length;
    return {
      id: p.id,
      nome: p.nome,
      slug: p.slug,
      precoCents: Number(p.precoCents ?? 0),
      ativa: p.status === "active",
      visitas,
      pedidos: venda.pedidos,
      receitaCents: venda.receitaCents,
      campanhas: campanhas.filter((c) => campanhaFalaDaOferta(c.nome, { nome: p.nome, slug: p.slug })),
    };
  };

  const lojas: LojaComOfertas[] = lojasCruas.map((l) => ({
    id: l.id,
    nome: l.nome,
    slug: l.slug,
    ativa: l.ativa,
    moeda: l.moeda,
    ofertas: produtosCrus.filter((p) => p.storeId === l.id).map(ofertaDe),
  }));

  /* Produtos sem loja não somem: entram numa loja sem nome, para não
     desaparecerem do painel só por falta de ligação. */
  const soltos = produtosCrus.filter((p) => !p.storeId);
  if (soltos.length) {
    lojas.push({
      id: "sem-loja",
      nome: "Sem loja ligada",
      slug: "",
      ativa: true,
      moeda: "BRL",
      ofertas: soltos.map(ofertaDe),
    });
  }

  return { bancoConfigurado: true, lojas, dias };
}
