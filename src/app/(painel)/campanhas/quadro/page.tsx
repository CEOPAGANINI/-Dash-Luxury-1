import type { Metadata } from "next";

import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";

export const metadata: Metadata = { title: "Quadro do funil" };
export const dynamic = "force-dynamic";

/**
 * O quadro: o planejamento do funil de vendas num canvas escuro de
 * pontinhos, onde cada etapa (origem de tráfego, página, automação,
 * checkout) é um card que arrasta com snap e se liga da saída à entrada.
 * Reimplementado a partir do editor de funil do SellFlux, na pele do
 * dashboard. Substitui o antigo quadro de campanhas nesta rota.
 */
export default function QuadroPage() {
  // Sem cabeçalho, a pedido do dono: só o quadro, em tela cheia.
  return (
    <>
      <h1 className="sr-only">Quadro do funil</h1>
      <div className="funnel-stage">
        <FunnelBoardClient />
      </div>
    </>
  );
}
