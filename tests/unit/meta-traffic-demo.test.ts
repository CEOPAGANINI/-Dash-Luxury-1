import { test } from "vitest";
import assert from "node:assert/strict";
import { matchesTrafficStatus } from "../../src/features/funnel/meta-traffic-status";
import type { MetaEntity } from "../../src/features/ads/meta-business-graph";
import {
  DEFAULT_DEMO_SETTINGS as settings,
  DEMO_STORES,
  DEMO_BUSINESSES,
  demoBusiness,
  demoCampaigns,
  demoResources,
  demoStoreSummary,
  demoTrafficResponse,
} from "../../src/features/funnel/meta-traffic-demo";

test("store totals include exactly the selected BMs and accounts", () => {
  const summary = demoStoreSummary(
    DEMO_STORES[0].loja!.metaBusinessIds!,
    "last_7d",
    settings,
  );
  assert.equal(summary.accounts.length, 6);
  assert.equal(summary.campaigns.length, 18);
  assert.equal(Number(summary.metrics.spend), 6 * 350 * 7);
  const narrowed = demoStoreSummary(["demo-bm-1"], "last_7d", settings);
  assert.equal(narrowed.accounts.length, 2);
  assert.equal(Number(narrowed.metrics.spend), 2 * 350 * 7);
});
test("purchases and spend reconcile between campaigns, sets and ads", () => {
  const resources = (["campaigns", "adsets", "ads"] as const).map((r) =>
    demoResources("demo-account-1-1", r, "last_7d", settings),
  );
  const sum = (rows: MetaEntity[], key: "purchases" | "spend") =>
    rows.reduce(
      (total, row) =>
        total +
        Number(
          key === "purchases"
            ? row.insights!.data![0].actions![0].value
            : row.insights!.data![0].spend,
        ),
      0,
    );
  for (const rows of resources) {
    assert.equal(sum(rows, "purchases"), sum(resources[0], "purchases"));
    assert.ok(Math.abs(sum(rows, "spend") - sum(resources[0], "spend")) < 0.05);
  }
});
test("period and budget changes recalculate the scenario", () => {
  const days = demoResources(
    "demo-account-1-1",
    "insights",
    "today",
    settings,
  )[0];
  const month = demoResources(
    "demo-account-1-1",
    "insights",
    "last_30d",
    settings,
  )[0];
  assert.equal(Number(month.spend), Number(days.spend) * 30);
  const doubled = demoResources("demo-account-1-1", "insights", "today", {
    ...settings,
    dailyBudget: 700,
  })[0];
  assert.equal(Number(doubled.spend), Number(days.spend) * 2);
});
test("simulated campaign status reaches its children without mutating defaults", () => {
  const campaigns = demoCampaigns("demo-account-1-1", "last_7d", settings),
    id = campaigns[0].id;
  const changed = { ...settings, campaignStates: { [id]: "PAUSED" as const } };
  assert.ok(
    demoResources("demo-account-1-1", "ads", "last_7d", changed)
      .filter((a) => a.campaign_id === id)
      .every((a) => a.effective_status === "CAMPAIGN_PAUSED"),
  );
  assert.equal(
    demoCampaigns("demo-account-1-1", "last_7d", settings)[0].status,
    "ACTIVE",
  );
  assert.deepEqual(settings.campaignStates, {});
});
test("pause filters include parent pauses and never classify a restricted ad as delivering", () => {
  assert.equal(
    matchesTrafficStatus(
      { id: "demo-ad", status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" },
      "PAUSED",
    ),
    true,
  );
  assert.equal(
    matchesTrafficStatus(
      { id: "demo-ad", status: "ACTIVE", effective_status: "ADSET_PAUSED" },
      "PAUSED",
    ),
    true,
  );
  assert.equal(
    matchesTrafficStatus(
      { id: "demo-ad", status: "ACTIVE", effective_status: "ACCOUNT_DISABLED" },
      "ACTIVE",
    ),
    false,
  );
});
test("restricted account has no delivery today and keeps historical metrics", () => {
  assert.equal(demoBusiness("demo-bm-5").accounts[1].account_status, 2);
  assert.equal(
    Number(
      demoResources("demo-account-5-2", "insights", "today", settings)[0].spend,
    ),
    0,
  );
  assert.ok(
    Number(
      demoResources("demo-account-5-2", "insights", "last_7d", settings)[0]
        .spend,
    ) > 0,
  );
});
test("demo identifiers cannot be mistaken for real Meta IDs and fixtures need no connection", () => {
  assert.ok(
    DEMO_BUSINESSES.every(
      (b) => b.id.startsWith("demo-") && !/^\d+$/.test(b.id),
    ),
  );
  assert.ok(
    DEMO_BUSINESSES.flatMap((b) => demoBusiness(b.id).accounts).every(
      (a) => !/^act_\d+$/.test(a.id),
    ),
  );
  const result = demoTrafficResponse(
    {
      businessId: "demo-bm-1",
      accountId: "demo-account-1-1",
      resource: "adspixels",
      period: "today",
    },
    { ...settings, pixel: false },
  );
  assert.ok("rows" in result);
  assert.deepEqual(result.rows, []);
  const catalog = demoTrafficResponse({}, settings);
  assert.ok("businesses" in catalog);
  assert.equal(catalog.businesses.length, 5);
});
