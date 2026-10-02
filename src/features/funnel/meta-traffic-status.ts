import type { MetaEntity } from "@/features/ads/meta-business-graph";

/** Effective delivery accounts for parent pauses and overrides configured ACTIVE. */
export function matchesTrafficStatus(row: MetaEntity, filter: string): boolean {
  if (filter === "all") return true;
  const effective = row.effective_status ?? row.status;
  if (filter === "PAUSED")
    return ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(
      effective ?? "",
    );
  return effective === filter;
}
