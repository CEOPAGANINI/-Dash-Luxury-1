import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { shippingMethods } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { ShippingMethodRow } from "@/features/shipping/types";

// Reexportados para quem já importava daqui — o conteúdo client-safe vive
// em `./types` (sem tocar no cliente do banco).
export {
  calculateShippingCost,
  type ShippingMethodRow,
} from "@/features/shipping/types";

/** Todos os fretes do workspace (painel — inclui inativos). */
export async function listShippingMethods(): Promise<ShippingMethodRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select()
    .from(shippingMethods)
    .where(
      and(
        eq(shippingMethods.workspaceId, workspaceId),
        isNull(shippingMethods.deletedAt),
      ),
    )
    .orderBy(asc(shippingMethods.position));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deliveryEstimate: r.deliveryEstimate,
    priceCents: r.priceCents,
    currency: r.currency,
    country: r.country,
    freeAboveCents: r.freeAboveCents,
    isActive: r.isActive,
    position: r.position,
  }));
}

/** Apenas os fretes ativos — usados no checkout público. */
export async function listActiveShippingMethods(): Promise<
  ShippingMethodRow[]
> {
  const all = await listShippingMethods();
  return all.filter((m) => m.isActive);
}
