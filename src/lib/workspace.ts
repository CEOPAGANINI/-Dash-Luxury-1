import { eq } from "drizzle-orm";

import { getDb } from "@/database/client";
import { profiles, workspaces } from "@/database/schema";

const DEFAULT_WORKSPACE_SLUG = "infinity-principal";

/**
 * Garante a existência do workspace padrão da operação (multi-tenant desde
 * o início: toda entidade de negócio pertence a um workspace).
 *
 * Enquanto o fluxo completo de onboarding não existe, o workspace é criado
 * sob um perfil de sistema; quando o dono fizer login, a posse será
 * transferida (Fase 1 → onboarding).
 */
export async function getOrCreateDefaultWorkspace(): Promise<string> {
  const db = getDb();

  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [systemProfile] = await db
    .insert(profiles)
    .values({
      id: crypto.randomUUID(),
      email: "sistema@infinity.app",
      name: "Sistema Infinity",
    })
    .returning({ id: profiles.id });

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: "Infinity Principal",
      slug: DEFAULT_WORKSPACE_SLUG,
      ownerId: systemProfile.id,
    })
    .returning({ id: workspaces.id });

  return workspace.id;
}
