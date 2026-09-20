import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignManager } from "@/features/ads/campaign-manager";
import { ClassBoard } from "@/features/ads/class-board";
import { CampaignBoardMonday } from "@/features/ads/campaign-board-monday";
import { CampaignCalculator } from "@/features/ads/campaign-calculator";
import { NetworkSessionNav } from "@/features/ads/network-session-nav";
import {
  SESSOES_DA_REDE,
  isSessaoDaRede,
} from "@/features/ads/network-sessions-model";
import { NETWORK_MANAGERS } from "@/features/ads/manager-model";
import {
  getCampaignPageData,
  type CampaignSearchParams,
} from "@/features/ads/page-data";
import { isAdNetwork } from "@/features/ads/types";

type Props = {
  params: Promise<{ rede: string; sessao: string }>;
  searchParams: CampaignSearchParams;
};
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { rede, sessao } = await params;
  const pagina = SESSOES_DA_REDE.find((s) => s.id === sessao);
  return {
    title:
      isAdNetwork(rede) && pagina
        ? `${pagina.short} · ${NETWORK_MANAGERS[rede].label}`
        : "Campanhas",
  };
}

/*
  Uma página por sessão da rede: quadro por classe, tabela, gerenciador
  ou calculadora. O menu da borda direita troca de página; o endereço
  muda junto, então dá para abrir direto e compartilhar.
*/
export default async function NetworkSessionPage({ params, searchParams }: Props) {
  const { rede, sessao } = await params;
  if (!isAdNetwork(rede) || !isSessaoDaRede(sessao)) notFound();
  const { tree, regras } = await getCampaignPageData(searchParams);
  const scopedTree = {
    ...tree,
    campanhas: tree.campanhas.filter((campaign) => campaign.network === rede),
  };
  const manager = NETWORK_MANAGERS[rede];
  const pagina = SESSOES_DA_REDE.find((s) => s.id === sessao)!;
  const indice = SESSOES_DA_REDE.indexOf(pagina) + 1;

  const conteudo = {
    classes: <ClassBoard tree={tree} regras={regras} network={rede} />,
    tabela: <CampaignBoardMonday tree={tree} regras={regras} network={rede} />,
    gerenciador: (
      <CampaignManager
        key={`${rede}-${tree.modo}-board`}
        network={rede}
        tree={scopedTree}
        regras={regras}
        view="board"
      />
    ),
    metricas: (
      <CampaignManager
        key={`${rede}-${tree.modo}-table`}
        network={rede}
        tree={scopedTree}
        regras={regras}
        view="table"
      />
    ),
    calculadora: <CampaignCalculator tree={scopedTree} regras={regras} />,
  }[sessao];

  return (
    <div className="board-pager" data-pager-ready="true">
      <NetworkSessionNav
        rede={rede}
        sessao={sessao}
        title={manager.label}
        ariaLabel={`Páginas de ${manager.label}`}
      />
      <div className="board-pager-content space-y-4">
        {/* Sem cabeçalho visível: o menu da direita já diz a rede e a página.
            O título fica só para leitores de tela. */}
        <h2 className="sr-only">
          {manager.label} · {pagina.short} · {String(indice).padStart(2, "0")} de {SESSOES_DA_REDE.length}
        </h2>
        <section aria-label={pagina.label} className="board-pager-page" data-active="true">
          {conteudo}
        </section>
      </div>
    </div>
  );
}
