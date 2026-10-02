import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { tentarWorkspaceAccess } from "@/lib/workspace";
import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";

export const metadata: Metadata = { title: "Roteador de ofertas" };
export const dynamic = "force-dynamic";

/**
 * O Roteador de ofertas vive dentro do quadro do funil: é o bloco
 * "Redirecionador", que manda parte dos visitantes de uma página para
 * outra (por região, aparelho, sistema, rede, origem do anúncio ou fatia).
 * Esta rota abre o mesmo quadro já com o Redirecionador em foco. Só a
 * interface — nada roteia de verdade.
 */
export default async function RoteadorDeOfertasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Banco fora do ar: o quadro abre só com a cópia deste navegador.
  const access = session.demoMode ? null : await tentarWorkspaceAccess();
  return (
    <>
      <h1 className="sr-only">Roteador de ofertas</h1>
      <div className="funnel-stage">
        <FunnelBoardClient
          storageId={session.user.id}
          workspaceId={access?.workspaceId}
          focoTipo="redirect"
        />
      </div>
    </>
  );
}
