"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cookies } from "next/headers";
import { getDb } from "@/database/client";
import { profiles, workspaces, workspaceMembers } from "@/database/schema";
import { exigirWorkspaceRole } from "@/lib/workspace";
import { operationSchema } from "./operation";

export interface SettingsResult {
  ok: boolean;
  message: string;
}
export async function switchOperationAction(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  try {
    const access = await exigirWorkspaceRole([
      "finance",
      "marketing",
      "support",
      "analyst",
      "viewer",
    ]);
    const id = z.string().uuid().parse(formData.get("workspaceId"));
    const [membership] = await getDb()
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.profileId, access.user.id),
          eq(workspaceMembers.isActive, true),
        ),
      )
      .limit(1);
    if (!membership)
      return {
        ok: false,
        message: "Você não tem acesso ativo a esta operação.",
      };
    (await cookies()).set("dashboard_workspace", id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "Operação selecionada. Os próximos dados pertencem a ela.",
    };
  } catch {
    return { ok: false, message: "Não foi possível selecionar a operação." };
  }
}
export async function saveOperationAction(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  try {
    const { workspaceId } = await exigirWorkspaceRole();
    const parsed = operationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
      return { ok: false, message: "Confira nome, e-mail e URLs HTTPS." };
    await getDb()
      .update(workspaces)
      .set({
        name: parsed.data.name,
        settings: sql`${workspaces.settings} || ${JSON.stringify({ operation: parsed.data })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        "Configurações da operação salvas no banco. A moeda seleciona o relatório; preços e histórico não foram convertidos nem recalculados.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Não foi possível salvar. Verifique sua permissão e o diagnóstico do banco.",
    };
  }
}

const memberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum([
    "admin",
    "finance",
    "marketing",
    "support",
    "analyst",
    "viewer",
  ]),
  active: z.enum(["true", "false"]),
});
/** Adds only existing dashboard profiles; never creates an Auth identity or assigns ownership. */
export async function saveMemberAction(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  try {
    const access = await exigirWorkspaceRole();
    const parsed = memberSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
      return { ok: false, message: "Confira e-mail, função e estado." };
    const data = parsed.data;
    if (data.role === "admin" && access.role !== "owner")
      return {
        ok: false,
        message: "Somente o proprietário pode nomear um administrador.",
      };
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`team:${access.workspaceId}`}))`,
      );
      const [workspace] = await tx
        .select({ ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, access.workspaceId));
      const [profile] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(sql`lower(${profiles.email}) = ${data.email.toLowerCase()}`)
        .limit(1);
      if (!profile)
        return {
          ok: false,
          message:
            "Essa pessoa precisa criar uma conta, confirmar o e-mail e entrar no dashboard primeiro. Nenhum convite foi enviado.",
        };
      if (profile.id === workspace?.ownerId || profile.id === access.user.id)
        return {
          ok: false,
          message:
            "O proprietário e seu próprio acesso não podem ser alterados por este formulário.",
        };
      const [existing] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, access.workspaceId),
            eq(workspaceMembers.profileId, profile.id),
          ),
        );
      if (existing?.role === "admin" && access.role !== "owner")
        return {
          ok: false,
          message: "Somente o proprietário pode alterar um administrador.",
        };
      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: access.workspaceId,
          profileId: profile.id,
          role: data.role,
          isActive: data.active === "true",
          joinedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.profileId],
          set: {
            role: data.role,
            isActive: data.active === "true",
            updatedAt: new Date(),
          },
        });
      return {
        ok: true,
        message:
          "Acesso atualizado. A permissão é conferida no servidor a cada nova requisição.",
      };
    });
    revalidatePath("/configuracoes/acessos");
    return result;
  } catch {
    return {
      ok: false,
      message:
        "Não foi possível alterar o acesso. Apenas proprietário e administrador gerenciam a equipe.",
    };
  }
}
