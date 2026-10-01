import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/database/client";
import {
  funnelVaultHistory,
  funnelVaults,
} from "@/database/schema/funnel-storage";
import type { FunnelEnvelope } from "./funil-store";

export class FunnelCloudConflict extends Error {
  constructor() {
    super(
      "Outra sessão alterou o funil. Sua cópia local foi preservada; sincronize novamente antes de salvar.",
    );
  }
}

export async function readCloudVault(workspaceId: string, userId: string) {
  const rows = await getDb()
    .select({
      envelope: funnelVaults.envelope,
      revision: funnelVaults.revision,
    })
    .from(funnelVaults)
    .where(
      and(
        eq(funnelVaults.workspaceId, workspaceId),
        eq(funnelVaults.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? { envelope: null, revision: null };
}

export async function listCloudHistory(workspaceId: string, userId: string) {
  const rows = await getDb()
    .select({
      revision: funnelVaultHistory.revision,
      createdAt: funnelVaultHistory.createdAt,
      envelope: funnelVaultHistory.envelope,
    })
    .from(funnelVaultHistory)
    .where(
      and(
        eq(funnelVaultHistory.workspaceId, workspaceId),
        eq(funnelVaultHistory.userId, userId),
      ),
    )
    .orderBy(desc(funnelVaultHistory.createdAt))
    .limit(20);
  return rows.map((row) => ({
    revision: row.revision,
    createdAt: row.createdAt,
    name: row.envelope.rascunho?.nome ?? "Cofre de funis",
    count: row.envelope.funis.length,
  }));
}
export async function readCloudHistory(
  workspaceId: string,
  userId: string,
  revision: string,
) {
  const [row] = await getDb()
    .select({ envelope: funnelVaultHistory.envelope })
    .from(funnelVaultHistory)
    .where(
      and(
        eq(funnelVaultHistory.workspaceId, workspaceId),
        eq(funnelVaultHistory.userId, userId),
        eq(funnelVaultHistory.revision, revision),
      ),
    )
    .limit(1);
  return row?.envelope ?? null;
}

export async function writeCloudVault(
  workspaceId: string,
  userId: string,
  expectedRevision: string | null,
  envelope: FunnelEnvelope,
) {
  return getDb().transaction(async (tx) => {
    // Serialize creation and update even when the row doesn't exist yet.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${userId}:funnel`}, 0))`,
    );
    const [current] = await tx
      .select()
      .from(funnelVaults)
      .where(
        and(
          eq(funnelVaults.workspaceId, workspaceId),
          eq(funnelVaults.userId, userId),
        ),
      )
      .limit(1);
    if ((current?.revision ?? null) !== expectedRevision)
      throw new FunnelCloudConflict();
    if (current)
      await tx
        .insert(funnelVaultHistory)
        .values({
          workspaceId,
          userId,
          revision: current.revision,
          envelope: current.envelope,
        })
        .onConflictDoNothing();
    const revision = crypto.randomUUID();
    await tx
      .insert(funnelVaults)
      .values({ workspaceId, userId, revision, envelope })
      .onConflictDoUpdate({
        target: [funnelVaults.workspaceId, funnelVaults.userId],
        set: { revision, envelope, updatedAt: new Date() },
      });
    const previous = await tx
      .select({ revision: funnelVaultHistory.revision })
      .from(funnelVaultHistory)
      .where(
        and(
          eq(funnelVaultHistory.workspaceId, workspaceId),
          eq(funnelVaultHistory.userId, userId),
        ),
      )
      .orderBy(desc(funnelVaultHistory.createdAt))
      .offset(20);
    if (previous.length)
      await tx.delete(funnelVaultHistory).where(
        and(
          eq(funnelVaultHistory.workspaceId, workspaceId),
          eq(funnelVaultHistory.userId, userId),
          inArray(
            funnelVaultHistory.revision,
            previous.map((row) => row.revision),
          ),
        ),
      );
    return { revision };
  });
}
