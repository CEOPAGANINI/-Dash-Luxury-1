import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";
import { getSession } from "@/lib/auth/session";
import { getWorkspaceAccess } from "@/lib/workspace";

export const metadata: Metadata = { title: "Quadro do funil" };
export const dynamic = "force-dynamic";

/**
 * O quadro: o planejamento do funil de vendas num canvas escuro de
 * pontinhos, onde cada etapa (origem de tráfego, página, automação,
 * checkout) é um card que arrasta com snap e se liga da saída à entrada.
 * Reimplementado a partir do editor de funil do SellFlux, na pele do
 * dashboard. Substitui o antigo quadro de campanhas nesta rota.
 */
export default async function QuadroPage() {
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
