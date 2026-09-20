import { notFound, redirect } from "next/navigation";
import { SESSAO_PADRAO } from "@/features/ads/network-sessions-model";
import { isAdNetwork } from "@/features/ads/types";

type Props = {
  params: Promise<{ rede: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const dynamic = "force-dynamic";

/* /campanhas/meta abre a primeira página da rede, levando o ?modo=real junto. */
export default async function NetworkCampaignPage({ params, searchParams }: Props) {
  const { rede } = await params;
  if (!isAdNetwork(rede)) notFound();
  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") busca.set(k, v);
  }
  const q = busca.toString();
  redirect(`/campanhas/${rede}/${SESSAO_PADRAO}${q ? `?${q}` : ""}`);
}
