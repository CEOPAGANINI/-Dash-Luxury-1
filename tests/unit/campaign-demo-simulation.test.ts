import { describe, expect, it } from "vitest";
import {
  createDemoCampaign,
  restoreDemoRows,
  updateDemoEntity,
} from "@/features/ads/demo-simulation";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { somarMetricas } from "@/features/ads/types";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  return data;
};
describe("isolated campaign sandbox", () => {
  it("has coherent campaign/group/ad totals in every network", () => {
    for (const c of demoCampaignRows()) {
      expect(c.metrics).toEqual(somarMetricas(c.adSets.map((s) => s.metrics)));
      for (const s of c.adSets)
        expect(s.metrics).toEqual(somarMetricas(s.ads.map((a) => a.metrics)));
    }
  });
  it.each(["meta", "google", "youtube"])(
    "creates paused %s examples with no remote IDs or fabricated history",
    (network) => {
      const rows = demoCampaignRows();
      const result = createDemoCampaign(
        rows,
        form({
          name: "Novo teste",
          network,
          objective: "Vendas",
          dailyBudget: "123,45",
        }),
        "demo-local-test",
        GUARDRAILS_PADRAO,
      );
      expect(result.result.ok).toBe(true);
      expect(result.rows[0]).toMatchObject({
        network,
        status: "paused",
        source: "demo",
        externalId: null,
        dailyBudgetCents: 12345,
        metrics: { spendCents: 0 },
      });
      expect(rows).toHaveLength(12);
    },
  );
  it("edits groups and ads without changing totals, siblings or source fixtures", () => {
    const rows = demoCampaignRows();
    const group = rows[0].adSets[0];
    const updated = updateDemoEntity(
      rows,
      form({
        id: group.id,
        tipo: "ad_set",
        name: "Grupo editado",
        status: "paused",
        dailyBudget: "500",
      }),
      GUARDRAILS_PADRAO,
    );
    expect(updated.rows[0].adSets[0]).toMatchObject({
      name: "Grupo editado",
      status: "paused",
      dailyBudgetCents: 50000,
    });
    const ad = group.ads[0];
    const editedAd = updateDemoEntity(
      updated.rows,
      form({
        id: ad.id,
        tipo: "ad",
        name: "Anúncio editado",
        status: "archived",
      }),
      GUARDRAILS_PADRAO,
    );
    expect(editedAd.rows[0].adSets[0].ads[0].status).toBe("archived");
    expect(editedAd.rows[0].metrics).toEqual(rows[0].metrics);
    expect(rows[0].adSets[0]).toEqual(group);
  });
  it("rejects invalid values and refuses non-demo IDs", () => {
    const rows = demoCampaignRows();
    for (const dailyBudget of ["-1", "NaN", "Infinity", "1000001"]) {
      expect(
        updateDemoEntity(
          rows,
          form({ tipo: "campaign", id: rows[0].id, dailyBudget }),
          GUARDRAILS_PADRAO,
        ).result.ok,
      ).toBe(false);
    }
    expect(
      updateDemoEntity(
        rows,
        form({ tipo: "campaign", id: "real-123" }),
        GUARDRAILS_PADRAO,
      ).result.ok,
    ).toBe(false);
  });
  it("enforces simulated scale and pause guardrails", () => {
    const rows = demoCampaignRows();
    const winner = rows[0];
    expect(
      updateDemoEntity(
        rows,
        form({ tipo: "campaign", id: winner.id, dailyBudget: "1300" }),
        GUARDRAILS_PADRAO,
      ).result.ok,
    ).toBe(true);
    expect(
      updateDemoEntity(
        rows,
        form({ tipo: "campaign", id: winner.id, dailyBudget: "1600" }),
        GUARDRAILS_PADRAO,
      ).result.ok,
    ).toBe(false);
    const losing = rows.find((c) => c.name === "Lançamento Produto B")!;
    const paused = updateDemoEntity(
      rows,
      form({ tipo: "campaign", id: losing.id, status: "paused" }),
      GUARDRAILS_PADRAO,
    );
    expect(paused.result.ok).toBe(true);
    expect(
      updateDemoEntity(
        paused.rows,
        form({ tipo: "campaign", id: losing.id, status: "active" }),
        GUARDRAILS_PADRAO,
      ).result.ok,
    ).toBe(false);
  });
  it("accepts only valid, versioned, strictly fictional stored data", () => {
    const rows = demoCampaignRows();
    expect(restoreDemoRows(JSON.stringify({ version: 1, rows }))).toHaveLength(
      12,
    );
    expect(restoreDemoRows("{broken")).toBeNull();
    expect(restoreDemoRows(JSON.stringify({ version: 2, rows }))).toBeNull();
    expect(
      restoreDemoRows(
        JSON.stringify({ version: 1, rows: [{ ...rows[0], source: "meta" }] }),
      ),
    ).toBeNull();
    expect(
      restoreDemoRows(
        JSON.stringify({
          version: 1,
          rows: [{ ...rows[0], externalId: "123" }],
        }),
      ),
    ).toBeNull();
  });
});
