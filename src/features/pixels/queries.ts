import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { pixels } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import type { PixelRow, PixelType } from "@/features/pixels/types";

// Reexportados para não quebrar quem já importa tipos/labels daqui —
// mas o conteúdo client-safe vive em `./types` (sem tocar em `postgres`).
export {
  PIXEL_TYPE_INFO,
  type PixelType,
  type PixelRow,
} from "@/features/pixels/types";

/** Pixels do workspace (painel). */
export async function listPixels(): Promise<PixelRow[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const rows = await db
    .select()
    .from(pixels)
    .where(and(eq(pixels.workspaceId, workspaceId), isNull(pixels.deletedAt)));

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type as PixelType,
    pixelId: p.pixelId,
    isActive: p.isActive,
    hasToken: Boolean(p.encryptedToken),
    lastActivityAt: p.lastActivityAt,
  }));
}

/**
 * Pixels ativos para injeção nas páginas públicas.
 * Retorna apenas dados que podem ir ao navegador — nunca tokens.
 */
export async function getActivePixelsForPublic(): Promise<
  { type: PixelType; pixelId: string }[]
> {
  if (!isDatabaseConfigured()) return [];

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const rows = await db
      .select({ type: pixels.type, pixelId: pixels.pixelId })
      .from(pixels)
      .where(
        and(
          eq(pixels.workspaceId, workspaceId),
          eq(pixels.isActive, true),
          isNull(pixels.deletedAt),
        ),
      );

    return rows
      .filter((r) => r.pixelId && r.type !== "meta_capi")
      .map((r) => ({ type: r.type as PixelType, pixelId: r.pixelId! }));
  } catch {
    // Páginas públicas nunca podem quebrar por causa de rastreamento.
    return [];
  }
}
