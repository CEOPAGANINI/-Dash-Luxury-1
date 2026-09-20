import { describe, expect, it } from "vitest";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import {
  INITIAL_CAMPAIGN_FILTERS,
  selectCampaigns,
  campaignOrigin,
} from "@/features/ads/manager-model";
import { derivadas, somarMetricas } from "@/features/ads/types";

const rows = demoCampaignRows();

describe("network managers", () => {
  it.each(["meta", "google", "youtube"] as const)(
    "isolates %s before applying filters and totals",
    (network) => {
      const selected = selectCampaigns(rows, network, INITIAL_CAMPAIGN_FILTERS);
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.every((c) => c.network === network)).toBe(true);
      expect(somarMetricas(selected.map((c) => c.metrics)).spendCents).toBe(
        rows
          .filter((c) => c.network === network)
          .reduce((sum, c) => sum + c.metrics.spendCents, 0),
      );
      expect(selected.map((c) => c.metrics.spendCents)).toEqual(
        selected.map((c) => c.metrics.spendCents).sort((a, b) => b - a),
      );
    },
  );
  it("combines accent-insensitive search, status and objective without mutating input", () => {
    const campaign = rows[0];
    const changed = {
      ...campaign,
      name: "Conversão ESPECIAL",
      status: "paused" as const,
      objective: "Vendas",
    };
    const input = [...rows, changed];
    const before = input.slice();
    expect(
      selectCampaigns(input, campaign.network, {
        search: "conversao especial",
        status: "paused",
        objective: "Vendas",
        sort: "name",
      }),
    ).toEqual([changed]);
    expect(input).toEqual(before);
  });
  it("sorts ROAS with undefined denominators last, never Infinity or NaN", () => {
    const selected = selectCampaigns(rows, "meta", {
      ...INITIAL_CAMPAIGN_FILTERS,
      sort: "roas",
    });
    const values = selected.map((c) => derivadas(c.metrics).roas ?? -Infinity);
    expect(values).toEqual(values.toSorted((a, b) => b - a));
    expect(
      selectCampaigns(rows, "meta", {
        ...INITIAL_CAMPAIGN_FILTERS,
        search: "not-present",
      }),
    ).toEqual([]);
  });
  it("labels saved examples separately from actual local and remote campaigns", () => {
    expect(campaignOrigin(rows[0])).toBe("Dados de exemplo");
    expect(
      campaignOrigin({ ...rows[0], source: "manual", objective: "Exemplo" }),
    ).toBe("Dados de exemplo");
    expect(
      campaignOrigin({ ...rows[0], source: "manual", objective: "Vendas" }),
    ).toBe("Campanha local");
    expect(
      campaignOrigin({ ...rows[0], source: "meta", objective: "Vendas" }),
    ).toBe("Sincronizada com Meta");
  });
});
