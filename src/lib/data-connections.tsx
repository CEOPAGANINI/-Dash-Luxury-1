"use client";

import * as React from "react";

import type { ConnectionsState } from "@/features/integrations/connection-meta";

export {
  CONNECTION_META,
  maskSecret,
  type ConnectionId,
  type ConnectionMeta,
  type ConnectionsState,
  type StoredConnection,
} from "@/features/integrations/connection-meta";

/**
 * Estado das conexões de fontes de dados (redes de anúncio, gateway, loja).
 *
 * As conexões moram no banco (tabela `integrations`, ver
 * src/features/integrations/connections-store.ts). O servidor lê a lista
 * uma vez por página e a entrega aqui; quem salva ou remove uma conexão
 * chama uma ação do servidor, que revalida a página — e este estado troca
 * junto. O navegador nunca guarda segredo nenhum.
 */
const ConnectionsContext = React.createContext<ConnectionsState | null>(null);

export function ConnectionsProvider({
  initial,
  children,
}: {
  initial: ConnectionsState;
  children: React.ReactNode;
}) {
  return (
    <ConnectionsContext.Provider value={initial}>
      {children}
    </ConnectionsContext.Provider>
  );
}

/**
 * O estado das conexões. `ready` fica por compatibilidade com quem
 * distinguia o render do servidor: agora os dois lados veem o mesmo.
 */
export function useDataConnections() {
  const connections = React.useContext(ConnectionsContext) ?? {};
  return { connections, ready: true };
}
