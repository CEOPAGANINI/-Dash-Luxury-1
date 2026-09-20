import type { Metadata } from "next";
import Link from "next/link";

import { CampaignBoardMonday } from "@/features/ads/campaign-board-monday";
import { ClassBoard } from "@/features/ads/class-board";
import { NETWORK_MANAGERS } from "@/features/ads/manager-model";
import {
  getCampaignPageData,
  type CampaignSearchParams,
} from "@/features/ads/page-data";
import { QuadroViews } from "@/features/ads/quadro-views";
import type { AdNetwork } from "@/features/ads/types";

export const metadata: Metadata = { title: "Quadro de campanhas" };
export const dynamic = "force-dynamic";

/**
 * O quadro: as campanhas em colunas por classe de trabalho (teste de
 * criativos, teste de público, aquecimento de pixel, pré-escala,
 * escala…), como num quadro de tarefas. Passar o mouse num cartão mostra
 * a tabela da campanha; clicar abre a página dela. A vista "por rede"
 * é a mesma coisa em tabela, com estado e freio em células coloridas.
 */
export default async function QuadroPage({
  searchParams,
}: {
  searchParams: CampaignSearchParams;
}) {
  const { tree, regras } = await getCampaignPageData(searchParams);
  const redes = Object.keys(NETWORK_MANAGERS) as AdNetwork[];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-extrabold tracking-[0.14em] uppercase">
            Mídia e UTMs
          </p>
          <h2 className="mt-1 text-[clamp(1.5rem,1.2rem+1vw,2.2rem)] leading-none font-extrabold tracking-[-0.045em]">
            Quadro de campanhas
          </h2>
          <p className="text-muted-foreground mt-2 max-w-4xl text-sm leading-6">
            Cada coluna é uma classe de trabalho; cada cartão, uma campanha.
            Passe o mouse para ver a tabela, clique para abrir tudo.
            {tree.modo === "demo" ? " Demonstração — os cartões são exemplos." : ""}
          </p>
        </div>
        <nav aria-label="Gerenciadores por rede" className="flex flex-wrap gap-2 text-xs">
          {redes.map((rede) => (
            <Link
              key={rede}
              href={`/campanhas/${rede}`}
              className="border-input hover:bg-muted/30 rounded-lg border px-3 py-1.5 font-bold"
            >
              {NETWORK_MANAGERS[rede].label}
            </Link>
          ))}
        </nav>
      </header>
      <QuadroViews
        rotulo="Vista do quadro"
        vistas={[
          { id: "classes", label: "Por classe", icon: "colunas", conteudo: <ClassBoard tree={tree} regras={regras} /> },
          { id: "tabela", label: "Por rede (tabela)", icon: "tabela", conteudo: <CampaignBoardMonday tree={tree} regras={regras} /> },
        ]}
      />
    </div>
  );
}
