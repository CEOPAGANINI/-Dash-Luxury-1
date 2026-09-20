import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { notifications } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

export interface NotificationRow {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  href: string | null;
  valueCents: number | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Notificações do workspace, mais recentes primeiro. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationRow[]> {
  if (!isDatabaseConfigured()) return [];

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    return await db
      .select({
        id: notifications.id,
        eventType: notifications.eventType,
        title: notifications.title,
        body: notifications.body,
        href: notifications.href,
        valueCents: notifications.valueCents,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.workspaceId, workspaceId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("[notifications] erro ao listar:", error);
    return [];
  }
}

/** Quantas estão por ler — alimenta o contador do sino no header. */
export async function countUnreadNotifications(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          isNull(notifications.readAt),
        ),
      );

    return row?.n ?? 0;
  } catch {
    // O header nunca pode quebrar por causa do contador.
    return 0;
  }
}
