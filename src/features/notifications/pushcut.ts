import { and, eq } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

/**
 * Adapter do Pushcut — notificações push no iPhone/Apple Watch.
 *
 * Formato confirmado na API pública do serviço:
 *   POST https://api.pushcut.io/v1/notifications/{nome}
 *   Headers: API-Key: <token> + Content-Type: application/json
 *   Corpo: { title, text }
 *
 * O "nome" é o da notificação criada dentro da app Pushcut — é ela que
 * define som, ícone e ações.
 */
const PUSHCUT_BASE = "https://api.pushcut.io/v1";
const INTEGRATION_KEY = "pushcut";

export interface PushcutConfig {
  /** Nome da notificação definida na app Pushcut */
  notificationName: string;
  /** Eventos que disparam push */
  events: string[];
  isActive: boolean;
}

export interface PushcutStatus {
  configured: boolean;
  isActive: boolean;
  notificationName: string;
  events: string[];
  lastEventAt: Date | null;
  lastError: string | null;
}

const DEFAULT_EVENTS = ["payment_approved", "chargeback", "webhook_error"];

/** Estado atual da integração, para exibir no painel. */
export async function getPushcutStatus(): Promise<PushcutStatus> {
  const empty: PushcutStatus = {
    configured: false,
    isActive: false,
    notificationName: "",
    events: DEFAULT_EVENTS,
    lastEventAt: null,
    lastError: null,
  };

  if (!isDatabaseConfigured()) return empty;

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, INTEGRATION_KEY),
        ),
      )
      .limit(1);

    if (!row) return empty;

    const config = (row.config ?? {}) as Partial<PushcutConfig>;
    return {
      configured: Boolean(row.encryptedCredentials),
      isActive: row.status === "connected",
      notificationName: config.notificationName ?? "",
      events: config.events ?? DEFAULT_EVENTS,
      lastEventAt: row.lastEventAt,
      lastError: row.lastError,
    };
  } catch (error) {
    console.error("[pushcut] erro ao ler estado:", error);
    return empty;
  }
}

/** Guarda o token (cifrado) e a configuração da integração. */
export async function savePushcutCredentials(
  apiKey: string,
  notificationName: string,
  events: string[],
): Promise<void> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  const values = {
    workspaceId,
    key: INTEGRATION_KEY,
    name: "Pushcut",
    category: "automation" as const,
    status: "connected" as const,
    encryptedCredentials: encryptSecret(apiKey),
    config: { notificationName, events, isActive: true },
    lastError: null,
  };

  await db
    .insert(integrations)
    .values(values)
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.key],
      set: {
        encryptedCredentials: values.encryptedCredentials,
        config: values.config,
        status: values.status,
        lastError: null,
        updatedAt: new Date(),
      },
    });
}

export async function setPushcutActive(active: boolean): Promise<void> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();

  await db
    .update(integrations)
    .set({
      status: active ? "connected" : "disabled",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.key, INTEGRATION_KEY),
      ),
    );
}

export interface PushcutSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Envia um push. Nunca lança: é chamado a partir do webhook do gateway,
 * onde uma falha de push não pode afetar o processamento do pagamento.
 */
export async function sendPushcutNotification(
  title: string,
  text: string,
  options: { force?: boolean } = {},
): Promise<PushcutSendResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Banco de dados não configurado." };
  }

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          eq(integrations.key, INTEGRATION_KEY),
        ),
      )
      .limit(1);

    if (!row?.encryptedCredentials) {
      return { ok: false, error: "Pushcut não configurado." };
    }
    // `force` permite o botão "Enviar teste" mesmo com a integração pausada.
    if (row.status !== "connected" && !options.force) {
      return { ok: false, error: "Integração desativada." };
    }

    const config = (row.config ?? {}) as Partial<PushcutConfig>;
    const name = config.notificationName?.trim();
    if (!name) {
      return { ok: false, error: "Falta o nome da notificação do Pushcut." };
    }

    const apiKey = decryptSecret(row.encryptedCredentials);

    const response = await fetch(
      `${PUSHCUT_BASE}/notifications/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          "API-Key": apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ title, text }),
      },
    );

    const now = new Date();

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error =
        response.status === 401 || response.status === 403
          ? "Chave de API do Pushcut inválida."
          : response.status === 404
            ? `Notificação "${name}" não existe na app Pushcut.`
            : `Erro HTTP ${response.status} do Pushcut. ${detail.slice(0, 200)}`;

      await db
        .update(integrations)
        .set({ lastError: error, updatedAt: now })
        .where(eq(integrations.id, row.id));

      return { ok: false, error };
    }

    await db
      .update(integrations)
      .set({ lastEventAt: now, lastError: null, updatedAt: now })
      .where(eq(integrations.id, row.id));

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao contactar o Pushcut.";
    console.error("[pushcut] erro ao enviar:", error);
    return { ok: false, error: message };
  }
}

/** O evento está na lista escolhida pelo utilizador? */
export async function shouldPushEvent(eventType: string): Promise<boolean> {
  const status = await getPushcutStatus();
  return (
    status.configured && status.isActive && status.events.includes(eventType)
  );
}
