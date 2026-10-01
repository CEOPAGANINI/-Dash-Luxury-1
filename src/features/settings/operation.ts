import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/database/client";
import { workspaces, profiles, workspaceMembers } from "@/database/schema";
import { getWorkspaceAccess } from "@/lib/workspace";

export const operationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.enum([
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Fortaleza",
    "Europe/Lisbon",
    "UTC",
  ]),
  currency: z.enum(["BRL", "EUR"]),
  supportEmail: z.string().trim().email().or(z.literal("")),
  supportUrl: z.string().trim().url().startsWith("https://").or(z.literal("")),
  website: z.string().trim().url().startsWith("https://").or(z.literal("")),
});
export type OperationSettings = z.infer<typeof operationSchema>;
export async function getOperationSettings(): Promise<OperationSettings> {
  const { workspaceId } = await getWorkspaceAccess();
  const [row] = await getDb()
    .select({ name: workspaces.name, settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const settings = row?.settings as { operation?: unknown } | undefined;
  const parsed = operationSchema.safeParse(settings?.operation);
  return parsed.success
    ? { ...parsed.data, name: row?.name ?? parsed.data.name }
    : {
        name: row?.name ?? "Minha operação",
        timezone: "America/Sao_Paulo",
        currency: "BRL",
        supportEmail: "",
        supportUrl: "",
        website: "",
      };
}
export async function getWorkspaceMembers() {
  const access = await getWorkspaceAccess();
  const rows = await getDb()
    .select({
      id: workspaceMembers.id,
      profileId: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: workspaceMembers.role,
      active: workspaceMembers.isActive,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.profileId, profiles.id))
    .where(eq(workspaceMembers.workspaceId, access.workspaceId));
  const operations = await getDb()
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceMembers.profileId, access.user.id),
        eq(workspaceMembers.isActive, true),
        isNull(workspaces.deletedAt),
      ),
    );
  return { rows, access, operations };
}
