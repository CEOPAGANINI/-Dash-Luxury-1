import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/database/client";
import { profiles, workspaces, workspaceMembers } from "@/database/schema";
import { getSession, type SessionUser } from "@/lib/auth/session";
import {
  principalOperator,
  roleAllows,
  type WorkspaceRole,
} from "./workspace-policy";

export type { WorkspaceRole } from "./workspace-policy";
export class WorkspaceAccessError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}
export interface WorkspaceAccess {
  workspaceId: string;
  user: SessionUser;
  role: WorkspaceRole;
}

/**
 * Banco fora de alcance (DNS, recusa, tempo esgotado, DATABASE_URL ausente)
 * não é falta de permissão: as telas devem degradar para o modo local, não
 * quebrar. Olha o erro e as suas causas encadeadas (o drizzle embrulha o
 * erro do driver em `cause`).
 */
const CODIGOS_SEM_BANCO = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "08001",
  "08006",
  "57P01",
]);
export function bancoIndisponivel(err: unknown): boolean {
  let atual: unknown = err;
  for (let nivel = 0; nivel < 5 && atual; nivel += 1) {
    const codigo = (atual as { code?: unknown }).code;
    if (typeof codigo === "string" && CODIGOS_SEM_BANCO.has(codigo)) return true;
    const mensagem =
      atual instanceof Error ? atual.message : typeof atual === "string" ? atual : "";
    if (
      /DATABASE_URL não configurada|timeout exceeded when trying to connect|Connection terminated|getaddrinfo/i.test(
        mensagem,
      )
    )
      return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Como getWorkspaceAccess, mas devolve null quando o banco está fora do ar,
 * para a tela seguir só com a cópia deste navegador. Acesso negado (401/403)
 * continua sendo erro: nunca se esconde uma recusa.
 */
export async function tentarWorkspaceAccess(): Promise<WorkspaceAccess | null> {
  try {
    return await getWorkspaceAccess();
  } catch (err) {
    if (bancoIndisponivel(err)) return null;
    throw err;
  }
}

/** Existing access is a read, not a profile write or a serialized bootstrap. */
async function findActiveMembership(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: string,
  selectedWorkspace: string | undefined,
) {
  const memberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.profileId, userId),
        eq(workspaceMembers.isActive, true),
        isNull(workspaces.deletedAt),
      ),
    )
    .orderBy(asc(workspaces.createdAt));
  return (
    memberships.find((item) => item.workspaceId === selectedWorkspace) ??
    memberships[0]
  );
}

/** Authenticate and check membership at the data boundary, not only by Proxy. */
export const getWorkspaceAccess = cache(async (): Promise<WorkspaceAccess> => {
  const session = await getSession();
  if (!session || session.demoMode)
    throw new WorkspaceAccessError(
      401,
      "Entre na sua conta para acessar os dados.",
    );
  const user = session.user;
  const selectedWorkspace = (await cookies()).get("dashboard_workspace")?.value;
  const db = getDb();
  const existing = await findActiveMembership(db, user.id, selectedWorkspace);
  if (existing) return { ...existing, user };

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`workspace:${user.id}`}))`,
    );
    // Another request may have finished onboarding while this one awaited the lock.
    const membership = await findActiveMembership(
      tx,
      user.id,
      selectedWorkspace,
    );
    if (membership) return { ...membership, user };
    await tx
      .insert(profiles)
      .values({ id: user.id, email: user.email, name: user.name })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { email: user.email, name: user.name, updatedAt: new Date() },
      });
    let workspaceId: string;
    if (principalOperator(user, process.env)) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('workspace:infinity-principal'))`,
      );
      const [legacy] = await tx
        .select({
          id: workspaces.id,
          ownerId: workspaces.ownerId,
          ownerEmail: profiles.email,
        })
        .from(workspaces)
        .innerJoin(profiles, eq(profiles.id, workspaces.ownerId))
        .where(
          and(
            eq(workspaces.slug, "infinity-principal"),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1);
      // Only the explicitly configured operator may claim the old system-owned operation.
      if (
        legacy &&
        (legacy.ownerId === user.id ||
          legacy.ownerEmail === "sistema@infinity.app")
      ) {
        workspaceId = legacy.id;
        await tx
          .update(workspaces)
          .set({ ownerId: user.id, updatedAt: new Date() })
          .where(eq(workspaces.id, legacy.id));
      } else if (!legacy) {
        const [created] = await tx
          .insert(workspaces)
          .values({
            name: "Minha operação",
            slug: "infinity-principal",
            ownerId: user.id,
          })
          .returning({ id: workspaces.id });
        workspaceId = created.id;
      } else {
        const [created] = await tx
          .insert(workspaces)
          .values({
            name: `Operação de ${user.name}`,
            slug: `conta-${user.id}`,
            ownerId: user.id,
          })
          .onConflictDoUpdate({
            target: workspaces.slug,
            set: { updatedAt: new Date() },
          })
          .returning({ id: workspaces.id });
        workspaceId = created.id;
      }
    } else {
      const [created] = await tx
        .insert(workspaces)
        .values({
          name: `Operação de ${user.name}`,
          slug: `conta-${user.id}`,
          ownerId: user.id,
        })
        .onConflictDoUpdate({
          target: workspaces.slug,
          set: { updatedAt: new Date() },
        })
        .returning({ id: workspaces.id });
      workspaceId = created.id;
    }
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId,
        profileId: user.id,
        role: "owner",
        joinedAt: new Date(),
        isActive: true,
      })
      .onConflictDoNothing();
    const [allowed] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.profileId, user.id),
          eq(workspaceMembers.isActive, true),
          eq(workspaces.ownerId, user.id),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1);
    if (!allowed)
      throw new WorkspaceAccessError(
        403,
        "O acesso a esta operação está suspenso. Peça ao proprietário para revisar sua permissão.",
      );
    return { workspaceId, user, role: allowed.role };
  });
});

export async function getOrCreateDefaultWorkspace(): Promise<string> {
  return (await getWorkspaceAccess()).workspaceId;
}
export async function exigirWorkspaceRole(
  roles: WorkspaceRole | WorkspaceRole[] = ["owner", "admin"],
): Promise<WorkspaceAccess> {
  const access = await getWorkspaceAccess();
  if (!roleAllows(access.role, roles))
    throw new WorkspaceAccessError(
      403,
      "Sua função não permite alterar esta configuração.",
    );
  return access;
}
/** Public flows only look up an existing operation and cannot create ownership. */
export async function getPublicWorkspaceId(): Promise<string> {
  const [workspace] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.slug, "infinity-principal"),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!workspace)
    throw new Error("A operação pública ainda não foi configurada.");
  return workspace.id;
}
