import type { Metadata } from "next";
import { CampaignAnalysis } from "@/features/ads/campaign-analysis";
import {
  getCampaignPageData,
  type CampaignSearchParams,
} from "@/features/ads/page-data";

export const metadata: Metadata = { title: "Análise de campanhas" };
export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: CampaignSearchParams;
}) {
  const { tree } = await getCampaignPageData(searchParams);
  return <CampaignAnalysis tree={tree} />;
}
