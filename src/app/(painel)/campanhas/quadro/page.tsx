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
          Arraste recursos do topo para o canvas, ligue a saída de um card à
          entrada do próximo e desenhe o funil inteiro. Demonstração — os cards
          são exemplos e ficam salvos neste navegador.
        </p>
      </header>
      <FunnelBoardClient />
    </div>
  );
}
