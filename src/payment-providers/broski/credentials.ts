import { and, eq } from "drizzle-orm";

import { getDb } from "@/database/client";
import { integrations } from "@/database/schema";
import { decryptSecret } from "@/lib/crypto";
import type { BroskiCredentials } from ".";

/** Server-only: credentials never cross a Server Component/action boundary. */
export async function resolveBroskiCredentials(
  workspaceId: string,
): Promise<BroskiCredentials | null> {
  const [connection] = await getDb()
    .select({
      config: integrations.config,
      encrypted: integrations.encryptedCredentials,
      status: integrations.status,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        eq(integrations.key, "gateway"),
      ),
    )
    .limit(1);

  if (connection) {
    if (connection.status !== "connected") return null;
    const config = (connection.config ?? {}) as {
      gatewayName?: string;
      identifier?: string;
    };
    if (!/broski/i.test(config.gatewayName ?? config.identifier ?? ""))
      return null;
    if (!connection.encrypted) return null;
    try {
      const secret = JSON.parse(decryptSecret(connection.encrypted)) as {
        apiKey?: string;
        webhookSecret?: string;
      };
      return secret.apiKey && secret.webhookSecret
        ? {
            environment: "production",
            apiKey: secret.apiKey,
            webhookSecret: secret.webhookSecret,
          }
        : null;
    } catch {
      // A broken connection must not silently charge through another account.
      return null;
    }
  }

  // Legacy environment credentials belong only to the principal public operation.
  const { getPublicWorkspaceId } = await import("@/lib/workspace");
  if (workspaceId !== (await getPublicWorkspaceId())) return null;
  return process.env.BROSKI_API_KEY && process.env.BROSKI_WEBHOOK_SECRET
    ? {
        environment: "production",
        apiKey: process.env.BROSKI_API_KEY,
        webhookSecret: process.env.BROSKI_WEBHOOK_SECRET,
      }
    : null;
}
