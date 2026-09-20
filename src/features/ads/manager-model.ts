import {
  derivadas,
  type AdNetwork,
  type AdStatus,
  type CampaignRow,
} from "./types";
import {
  campaignClass,
  campaignClassLabel,
  type CampaignClassId,
} from "./campaign-classes";

export const NETWORK_MANAGERS = {
  meta: {
    label: "Meta Ads",
    description: "Facebook e Instagram",
    groups: "Conjuntos de anúncios",
    localDescription:
      "Conecte uma conta Meta para sincronizar campanhas e editar na plataforma.",
  },
  google: {
    label: "Google Ads",
    description: "Pesquisa, Shopping e Performance Max",
    groups: "Grupos de anúncios",
    localDescription:
      "Gestão local. A sincronização e a publicação no Google Ads ainda não estão disponíveis.",
  },
  youtube: {
    label: "YouTube Ads",
    description: "Campanhas de vídeo",
    groups: "Grupos de anúncios",
    localDescription:
      "Gestão local. A sincronização e a publicação no YouTube Ads ainda não estão disponíveis.",
  },
} satisfies Record<
  AdNetwork,
  {
    label: string;
    description: string;
    groups: string;
    localDescription: string;
  }
>;

export type CampaignSort = "spend" | "revenue" | "roas" | "name";
export type CampaignFilters = {
  search: string;
  status: AdStatus | "all";
  objective: string;
  campaignClass?: CampaignClassId | "all";
  sort: CampaignSort;
};
export const INITIAL_CAMPAIGN_FILTERS: CampaignFilters = {
  search: "",
  status: "all",
  objective: "all",
  campaignClass: "all",
  sort: "spend",
};
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

/** Filter before sorting/aggregating: network pages can never mix their totals. */
export function selectCampaigns(
  campaigns: CampaignRow[],
  network: AdNetwork,
  filters: CampaignFilters,
) {
  const term = normalize(filters.search);
  return campaigns
    .filter(
      (campaign) =>
        campaign.network === network &&
        (filters.status === "all" || campaign.status === filters.status) &&
        (filters.objective === "all" ||
          campaign.objective === filters.objective) &&
        (!filters.campaignClass ||
          filters.campaignClass === "all" ||
          campaignClass(campaign) === filters.campaignClass) &&
        (!term ||
          normalize(
            `${campaign.name} ${campaign.objective ?? ""} ${campaign.externalId ?? ""} ${campaignClassLabel(campaignClass(campaign))}`,
          ).includes(term)),
    )
    .sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
      const value = (c: CampaignRow) =>
        filters.sort === "roas"
          ? (derivadas(c.metrics).roas ?? -Infinity)
          : filters.sort === "revenue"
            ? c.metrics.revenueCents
            : c.metrics.spendCents;
      const first = value(a),
        second = value(b);
      return first === second
        ? a.name.localeCompare(b.name, "pt-BR")
        : first > second
          ? -1
          : 1;
    });
}

export function campaignOrigin(campaign: CampaignRow) {
  if (campaign.source === "demo" || campaign.objective === "Exemplo")
    return "Dados de exemplo";
  return campaign.source === "meta"
    ? "Sincronizada com Meta"
    : "Campanha local";
}
