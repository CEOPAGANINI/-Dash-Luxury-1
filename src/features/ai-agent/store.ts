import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/database/client";
import {
  adCampaigns,
  domains,
  integrations,
  integrationLogs,
} from "@/database/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  AgentError,
  DEFAULT_AGENT_SETTINGS,
  parseAgentSettings,
  redactSecrets,
  type AgentRun,
  type AgentSettings,
} from "./model";

const KEY = "dashboard_ai_agent";
export async function readAgentConnection(workspaceId: string) {
  const [row] = await getDb()
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, KEY)),
    )
    .limit(1);
  if (!row?.encryptedCredentials || row.status !== "connected") return null;
  const settings = parseAgentSettings(row.config);
  const secret = JSON.parse(decryptSecret(row.encryptedCredentials)) as {
    apiKey?: string;
  };
  if (!secret.apiKey) return null;
  return { settings, apiKey: secret.apiKey };
}
export async function publicAgentConnection(workspaceId: string) {
  const [row] = await getDb()
    .select({
      config: integrations.config,
      status: integrations.status,
      encrypted: integrations.encryptedCredentials,
    })
    .from(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, KEY)),
    )
    .limit(1);
  return {
    settings: row ? parseAgentSettings(row.config) : DEFAULT_AGENT_SETTINGS,
    configured: Boolean(row?.encrypted && row.status === "connected"),
  };
}
export async function saveAgentConnection(
  workspaceId: string,
  settings: AgentSettings,
  apiKey: string,
) {
  const [existing] = await getDb()
    .select({
      encrypted: integrations.encryptedCredentials,
      config: integrations.config,
    })
    .from(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, KEY)),
    )
    .limit(1);
  if (apiKey && !/^\S{20,500}$/.test(apiKey))
    throw new AgentError("A chave deve ter 20 a 500 caracteres, sem espaços.");
  if (
    !apiKey &&
    (!existing?.encrypted ||
      (existing.config as AgentSettings).provider !== settings.provider)
  )
    throw new AgentError("Informe a chave do provedor selecionado.");
  const encryptedCredentials = apiKey
    ? encryptSecret(JSON.stringify({ apiKey }))
    : existing!.encrypted;
  await getDb()
    .insert(integrations)
    .values({
      workspaceId,
      key: KEY,
      name: "Agente IA",
      category: "automation",
      status: "connected",
      config: settings,
      encryptedCredentials,
    })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.key],
      set: {
        config: settings,
        encryptedCredentials,
        status: "connected",
        updatedAt: new Date(),
      },
    });
}
export async function disconnectAgent(workspaceId: string) {
  await getDb()
    .delete(integrations)
    .where(
      and(eq(integrations.workspaceId, workspaceId), eq(integrations.key, KEY)),
    );
}
/** Reserve before calling the provider, atomically across Vercel instances. Fail closed. */
export async function reserveAgentRun(
  workspaceId: string,
  userId: string,
  settings: AgentSettings,
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`agent:${workspaceId}`}))`,
    );
    const [used] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(integrationLogs)
      .where(
        and(
          eq(integrationLogs.workspaceId, workspaceId),
          eq(integrationLogs.integrationKey, KEY),
          eq(integrationLogs.action, "ai_request"),
          gte(
            integrationLogs.createdAt,
            sql`date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`,
          ),
        ),
      );
    if (used.count >= settings.dailyRequests)
      throw new AgentError(
        "Limite diário de consultas atingido. O limite reinicia à meia-noite UTC.",
        429,
      );
    const [row] = await tx
      .insert(integrationLogs)
      .values({
        workspaceId,
        integrationKey: KEY,
        action: "ai_request",
        level: "request",
        message: "Consulta de IA reservada",
        data: { userId, provider: settings.provider, model: settings.model },
      })
      .returning({ id: integrationLogs.id });
    return row.id;
  });
}
export async function finishAgentRun(
  workspaceId: string,
  userId: string,
  run: AgentRun,
) {
  // Transcripts are intentionally encrypted; generic logs expose only metadata.
  await getDb()
    .update(integrationLogs)
    .set({
      level: "response",
      message: "Análise ou rascunho concluído",
      data: {
        userId,
        provider: run.provider,
        model: run.model,
        totalTokens: run.totalTokens,
        encryptedTranscript: encryptSecret(JSON.stringify(run)),
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationLogs.workspaceId, workspaceId),
        eq(integrationLogs.id, run.id),
        eq(integrationLogs.integrationKey, KEY),
      ),
    );
}
export async function failAgentRun(workspaceId: string, id: string) {
  await getDb()
    .update(integrationLogs)
    .set({
      level: "error",
      message: "Consulta não concluída; confira provedor e configuração",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationLogs.workspaceId, workspaceId),
        eq(integrationLogs.id, id),
        eq(integrationLogs.integrationKey, KEY),
      ),
    );
}
export async function agentHistory(workspaceId: string, userId: string) {
  const rows = await getDb()
    .select({ data: integrationLogs.data })
    .from(integrationLogs)
    .where(
      and(
        eq(integrationLogs.workspaceId, workspaceId),
        eq(integrationLogs.integrationKey, KEY),
        eq(integrationLogs.level, "response"),
        sql`${integrationLogs.data}->>'userId' = ${userId}`,
      ),
    )
    .orderBy(desc(integrationLogs.createdAt))
    .limit(20);
  return rows.flatMap((row) => {
    try {
      const data = row.data as { encryptedTranscript?: string };
      return data.encryptedTranscript
        ? [JSON.parse(decryptSecret(data.encryptedTranscript)) as AgentRun]
        : [];
    } catch {
      return [];
    }
  });
}
export async function agentContext(
  workspaceId: string,
  settings: AgentSettings,
) {
  const [campaigns, infrastructure] = await Promise.all([
    settings.includeCampaigns
      ? getDb()
          .select({
            name: adCampaigns.name,
            network: adCampaigns.network,
            status: adCampaigns.status,
            spendCents: adCampaigns.spendCents,
            revenueCents: adCampaigns.revenueCents,
            purchases: adCampaigns.purchases,
            syncedAt: adCampaigns.syncedAt,
          })
          .from(adCampaigns)
          .where(
            and(
              eq(adCampaigns.workspaceId, workspaceId),
              isNull(adCampaigns.deletedAt),
            ),
          )
          .orderBy(desc(adCampaigns.syncedAt))
          .limit(20)
      : Promise.resolve([]),
    settings.includeInfrastructure
      ? getDb()
          .select({ hostname: domains.hostname, verified: domains.isVerified })
          .from(domains)
          .where(eq(domains.workspaceId, workspaceId))
          .limit(20)
      : Promise.resolve([]),
  ]);
  return redactSecrets(
    JSON.stringify({
      scope:
        "Operação atual inteira; não há vínculo comprovado dessas campanhas com uma loja específica",
      source:
        "Snapshot do banco, até 20 campanhas e 20 domínios. Não é auditoria ao vivo. Valores de mídia em centavos; verificar moeda das contas antes de agregar. Datas syncedAt indicam última sincronização; null indica ausência de sincronização comprovada. isVerified é cadastro, não comprova SSL nem proteção Cloudflare.",
      campaignsIncluded: settings.includeCampaigns,
      infrastructureIncluded: settings.includeInfrastructure,
      campaigns,
      domains: infrastructure,
    }),
  );
}
