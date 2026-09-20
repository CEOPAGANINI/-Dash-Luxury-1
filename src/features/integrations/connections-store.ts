import { and, eq, inArray } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/database/client";
import { integrations } from "@/database/schema";
import { encryptSecret } from "@/lib/crypto";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";
import {
  CONNECTION_IDS,
  CONNECTION_META,
  isConnectionId,
  type ConnectionId,
  type ConnectionsState,
  type StoredConnection,
} from "./connection-meta";

/*
  Onde as conexões moram.

  Uma linha na tabela `integrations` por fonte, com a chave igual ao id da
  fonte (meta, google, youtube, gateway, shopify). O segredo vai
  criptografado em `encrypted_credentials`; o que a tela mostra — o
  identificador da conta, a máscara do token, como foi conectado — vai em
  `config`. Ninguém lê o segredo de volta para a tela, nunca.

  As ações do formulário e as rotas de OAuth gravam pelas mesmas funções
  daqui; a diferença entre elas é só de onde a credencial veio.
*/

/** A categoria da tabela para cada fonte. */
const CATEGORY: Record<
  ConnectionId,
  "ads" | "payments" | "analytics"
> = {
  meta: "ads",
  google: "ads",
  youtube: "ads",
  gateway: "payments",
  /* A tabela não tem categoria "loja"; a Shopify entra como fonte de
     dados de pedidos, que é o que ela alimenta no painel. */
  shopify: "analytics",
};

interface ConfigGuardada {
  identifier?: string;
  tokenMask?: string;
  connectedAt?: string;
  via?: "form" | "oauth";
  [chave: string]: unknown;
}

/** As conexões ativas do workspace, no formato que a tela usa. Sem banco: nada. */
export async function listConnections(): Promise<ConnectionsState> {
  if (!isDatabaseConfigured()) return {};

  try {
    const db = getDb();
    const workspaceId = await getOrCreateDefaultWorkspace();
    const rows = await db
      .select({
        key: integrations.key,
        status: integrations.status,
        config: integrations.config,
        createdAt: integrations.createdAt,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.workspaceId, workspaceId),
          inArray(integrations.key, CONNECTION_IDS),
          eq(integrations.status, "connected"),
        ),
      );

    const state: ConnectionsState = {};
    for (const row of rows) {
      if (!isConnectionId(row.key)) continue;
      const config = (row.config ?? {}) as ConfigGuardada;
      if (!config.identifier) continue;
      state[row.key] = {
        id: row.key,
        identifier: String(config.identifier),
        tokenMask: String(config.tokenMask ?? "—"),
        connectedAt: String(config.connectedAt ?? row.createdAt.toISOString()),
        via: config.via === "oauth" ? "oauth" : "form",
      };
    }
    return state;
  } catch (error) {
    console.error("[connections] erro ao listar:", error);
    return {};
  }
}

export interface UpsertConnectionInput {
  id: ConnectionId;
  identifier: string;
  tokenMask: string;
  via: "form" | "oauth";
  /** Vai criptografado. Vazio para o YouTube, que usa a credencial do Google. */
  secrets: Record<string, string>;
  /** Vai em claro no config — só o que pode aparecer na tela. */
  publicConfig?: Record<string, unknown>;
}

/** Grava (ou troca) a conexão de uma fonte. Lança se o banco falhar. */
export async function upsertConnection(
  input: UpsertConnectionInput,
): Promise<StoredConnection> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const meta = CONNECTION_META.find((item) => item.id === input.id)!;
  const connectedAt = new Date().toISOString();

  const config: ConfigGuardada = {
    ...input.publicConfig,
    identifier: input.identifier,
    tokenMask: input.tokenMask,
    connectedAt,
    via: input.via,
  };
  const encryptedCredentials =
    Object.keys(input.secrets).length > 0
      ? encryptSecret(JSON.stringify(input.secrets))
      : null;

  await db
    .insert(integrations)
    .values({
      workspaceId,
      key: input.id,
      name: meta.name,
      category: CATEGORY[input.id],
      status: "connected",
      encryptedCredentials,
      config,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [integrations.workspaceId, integrations.key],
      set: {
        name: meta.name,
        category: CATEGORY[input.id],
        status: "connected",
        encryptedCredentials,
        config,
        lastError: null,
        updatedAt: new Date(),
      },
    });

  return {
    id: input.id,
    identifier: input.identifier,
    tokenMask: input.tokenMask,
    connectedAt,
    via: input.via,
  };
}

/** Apaga a conexão. YouTube usa a do Google: sem Google, ele cai junto. */
export async function deleteConnection(id: ConnectionId): Promise<void> {
  const db = getDb();
  const workspaceId = await getOrCreateDefaultWorkspace();
  const keys: ConnectionId[] = id === "google" ? ["google", "youtube"] : [id];

  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.workspaceId, workspaceId),
        inArray(integrations.key, keys),
      ),
    );
}

/**
 * O que o OAuth de cada plataforma precisa para existir. As chaves ficam
 * nas variáveis de ambiente da Vercel — a página diz qual falta.
 */
export function oauthAvailability(): Record<"meta" | "google", boolean> {
  return {
    meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
  };
}
