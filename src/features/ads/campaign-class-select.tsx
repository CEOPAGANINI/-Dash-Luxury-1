"use client";

import { BlockPicker } from "@/components/ui/block-picker";
import {
  CAMPAIGN_CLASSES,
  campaignClass,
  campaignClassLabel,
  isCampaignClass,
  type CampaignClassId,
} from "./campaign-classes";
import type { CampaignRow } from "./types";

const OPCOES = CAMPAIGN_CLASSES.map((item) => ({
  value: item.id,
  label: item.label,
}));

export function CampaignClassSelect({
  campaign,
  onChange,
}: {
  campaign: CampaignRow;
  onChange?: (id: string, value: CampaignClassId) => void;
}) {
  const value = campaignClass(campaign);
  return (
    <div className="campaign-class-select">
      <span>Classe</span>
      {onChange ? (
        <BlockPicker
          ariaLabel={`Classe de ${campaign.name}`}
          size="sm"
          collapsible
          value={value}
          onChange={(v) => {
            if (isCampaignClass(v)) onChange(campaign.id, v);
          }}
          options={OPCOES}
        />
      ) : (
        <strong>{campaignClassLabel(value)}</strong>
      )}
    </div>
  );
}
