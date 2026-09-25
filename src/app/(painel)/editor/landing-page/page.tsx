import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";

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
  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
          Planejamento
        </p>
        <h2 className="mt-1 text-[clamp(1.5rem,1.2rem+1vw,2.2rem)] leading-none font-extrabold tracking-[-0.045em]">
          Quadro do funil
        </h2>
        <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
          Arraste recursos para o canvas, ligue a saída de um card à entrada
          do próximo e desenhe o funil inteiro. O botão “Editar” de uma página
          abre o editor de conteúdo e o ZIP dela.
        </p>
      </header>
      <FunnelBoardClient />
    </div>
  );
}
