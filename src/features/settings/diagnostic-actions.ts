"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import { exigirWorkspaceRole } from "@/lib/workspace";
import type { SettingsResult } from "./operation-actions";
import { registeredMigrations } from "./registered-migrations";

/** Explicit owner-only repair, not a public request hook or arbitrary SQL console. */
export async function applySchemaAction(): Promise<void> {
  const access = await exigirWorkspaceRole();
  if (access.role !== "owner")
    throw new Error("Somente o proprietário pode preparar o banco.");
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('dashboard:registered-migrations'))`,
    );
    for (const migration of registeredMigrations)
      await tx.execute(sql.raw(migration.sql));
  });
  revalidatePath("/configuracoes/diagnosticos");
  revalidatePath("/editor/landing-page");
}
export async function saveMetaPeriodAction(
  _prev: SettingsResult | null,
  data: FormData,
): Promise<SettingsResult> {
  try {
    const { workspaceId } = await exigirWorkspaceRole(["marketing"]);
    const period = String(data.get("period"));
    if (
      !["last_7d", "last_30d", "today", "yesterday", "this_month"].includes(
        period,
      )
    )
      return { ok: false, message: "Período inválido." };
    const changed = await getDb()
      .update(integrations)
      .set({
        config: sql`${integrations.config} || ${JSON.stringify({ metricsPeriod: period })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, "meta"),
        ),
      )
      .returning({ id: integrations.id });
    if (!changed.length)
      return { ok: false, message: "Conecte uma conta Meta primeiro." };
    revalidatePath("/configuracoes/diagnosticos");
    return {
      ok: true,
      message:
        "Período salvo. Clique em Sincronizar no gerenciador Meta para buscar esse intervalo.",
    };
  } catch {
    return { ok: false, message: "Não foi possível salvar o período." };
  }
}
/** Read-only provider probes. Response bodies and credentials never leave the server. */
export async function testConnectionAction(
  _prev: SettingsResult | null,
  data: FormData,
): Promise<SettingsResult> {
  try {
    const { workspaceId } = await exigirWorkspaceRole();
    const id = String(data.get("id"));
    if (!["meta", "shopify"].includes(id))
      return {
        ok: false,
        message:
          "Esse serviço precisa de uma sincronização ou evento real para validar. Não foi feita nenhuma cobrança ou envio.",
      };
    const db = getDb();
    const where = and(
      eq(integrations.workspaceId, workspaceId),
      eq(integrations.key, id),
    );
    const [row] = await db.select().from(integrations).where(where).limit(1);
    if (!row?.encryptedCredentials)
      return {
        ok: false,
        message: "Salve as credenciais em Integrações primeiro.",
      };
    const secrets = JSON.parse(
      decryptSecret(row.encryptedCredentials),
    ) as Record<string, string>;
    const config = row.config as Record<string, unknown>;
    const identifier = String(config.identifier ?? "");
    let response: Response;
    if (id === "meta") {
      if (!/^act_\d{5,20}$/.test(identifier) || !secrets.token)
        return { ok: false, message: "Conta ou credencial inválida." };
      response = await fetch(
        `https://graph.facebook.com/v21.0/${identifier}?fields=id,name`,
        {
          headers: { Authorization: `Bearer ${secrets.token}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
    } else {
      if (
        !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(identifier) ||
        !secrets.adminToken
      )
        return { ok: false, message: "Domínio ou credencial inválida." };
      response = await fetch(
        `https://${identifier}/admin/api/2026-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": secrets.adminToken,
          },
          body: JSON.stringify({ query: "{ shop { id } }" }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        },
      );
    }
    const body = await response.json().catch(() => ({}));
    const ok =
      response.ok &&
      !body.error &&
      !body.errors &&
      (id === "meta"
        ? typeof body.id === "string"
        : typeof body.data?.shop?.id === "string");
    await db
      .update(integrations)
      .set({
        config: sql`${integrations.config} || ${JSON.stringify({ verification: ok ? "verified" : "failed", testedAt: new Date().toISOString() })}::jsonb`,
        lastError: ok
          ? null
          : "Teste recusado pela plataforma. Confira a credencial e as permissões.",
        updatedAt: new Date(),
      })
      .where(where);
    revalidatePath("/configuracoes/diagnosticos");
    return {
      ok,
      message: ok
        ? "Acesso de leitura validado agora. Isso não garante que métricas já foram sincronizadas."
        : "A plataforma recusou o teste. Confira token, conta e permissões. Nenhum segredo foi exibido.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Teste indisponível ou expirado. Nenhuma credencial foi exposta e nenhuma alteração foi feita na plataforma.",
    };
  }
}
