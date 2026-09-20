import type { Metadata } from "next";
import { CampaignCalculator } from "@/features/ads/campaign-calculator";
import { CampaignDataUnavailable } from "@/features/ads/campaign-data-unavailable";
import {
  getCampaignPageData,
  type CampaignSearchParams,
} from "@/features/ads/page-data";

export const metadata: Metadata = { title: "Calculadora de campanhas" };
export const dynamic = "force-dynamic";

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: CampaignSearchParams;
}) {
  const { tree, regras } = await getCampaignPageData(searchParams);
  if (tree.loadError)
    return <CampaignDataUnavailable title="Calculadora de campanhas" />;
  return (
    <>
      <header className="campaign-page-heading">
        <p className="campaign-eyebrow">Campanhas / Planejamento</p>
        <h1>Calculadora de campanhas</h1>
        <p>
          Simule a distribuição de verba e consulte os limites de segurança.
          Simular não altera suas campanhas.
        </p>
      </header>
      <CampaignCalculator tree={tree} regras={regras} />
    </>
  );
}
