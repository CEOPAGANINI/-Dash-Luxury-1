import { and, desc, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { ledgerEntries, workspaces } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import { emptyDashboardData } from "./empty-data";
import { observeDashboardRead } from "./read-observer";
import type { UnifiedDashboardData } from "./types";

export async function getUnifiedFinancialData(
  now = new Date(),
): Promise<UnifiedDashboardData> {
  if (!isDatabaseConfigured()) return emptyDashboardData("unavailable", now);
  // A denied membership is not converted into an empty successful result.
  const workspaceId = await getOrCreateDefaultWorkspace();
  try {
    return await readUnifiedFinancialData(workspaceId, now);
  } catch {
    return emptyDashboardData("error", now);
  }
}

/** The finance screens need metadata and ledger rows, not all analytics. */
export async function readUnifiedFinancialData(
  workspaceId: string,
  now = new Date(),
): Promise<UnifiedDashboardData> {
  const db = getDb();
  const [workspace] = await observeDashboardRead("financial-context", () =>
    db
      .select({ name: workspaces.name, settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  );
  const settings = (
    workspace?.settings as
      { operation?: { currency?: unknown; timezone?: unknown } } | undefined
  )?.operation;
  const currency = settings?.currency === "EUR" ? "EUR" : "BRL";
  const allowedZones = [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Fortaleza",
    "Europe/Lisbon",
    "UTC",
  ];
  const timeZone =
    typeof settings?.timezone === "string" &&
    allowedZones.includes(settings.timezone)
      ? settings.timezone
      : "America/Sao_Paulo";
  const ledger = await observeDashboardRead("financial-ledger", () =>
    db
      .select({
        date: ledgerEntries.occurredAt,
        description: ledgerEntries.description,
        category: ledgerEntries.category,
        direction: ledgerEntries.direction,
        value: ledgerEntries.amountCents,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.workspaceId, workspaceId),
          eq(ledgerEntries.currency, currency),
          eq(ledgerEntries.status, "confirmed"),
        ),
      )
      .orderBy(desc(ledgerEntries.occurredAt))
      .limit(100),
  );
  const data = emptyDashboardData("unavailable", now);
  data.operations.alpha.name = workspace?.name ?? "Operação";
  data.operations.alpha.status = "Livro-caixa registrado";
  data.transactions = ledger.map((entry) => ({
    date: entry.date.toISOString(),
    description: entry.description,
    category: entry.category ?? "Sem categoria",
    type: entry.direction === "in" ? "entrada" : "saida",
    value: entry.value / 100,
  }));
  data.source = {
    ...data.source,
    status: "ready",
    currency,
    timeZone,
    note: `${currency} · ${timeZone} · até 100 lançamentos confirmados mais recentes. Outras moedas não são somadas. Esta lista não representa saldo disponível no gateway.`,
  };
  return data;
}
