"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { notifications } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export async function markNotificationReadAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt),
      ),
    );

  revalidatePath("/notificacoes");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt),
      ),
    );

  revalidatePath("/notificacoes");
}
