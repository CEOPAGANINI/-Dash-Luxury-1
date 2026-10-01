import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";
import { getWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Quadro do funil · Orbit" };
export const dynamic = "force-dynamic";

/**
 * O editor de páginas é o quadro do funil: um canvas escuro de pontinhos
 * onde cada etapa (origem de tráfego, página, automação, checkout) é um
 * card que arrasta com snap e se liga da saída à entrada do próximo.
 * O botão "Editar" de um card de página abre o editor de conteúdo/ZIP
 * em /editor/pagina.
 */
export default async function EditorLandingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const access = session.demoMode ? null : await getWorkspaceAccess();
  // Sem cabeçalho, a pedido do dono: só o quadro, em tela cheia.
  return (
    <>
      <h1 className="sr-only">Quadro do funil</h1>
      <div className="funnel-stage">
        <FunnelBoardClient
          storageId={session.user.id}
          workspaceId={access?.workspaceId}
        />
      </div>
    </>
  );
}
