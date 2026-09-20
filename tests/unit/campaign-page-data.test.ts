import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCampaignPageData } from "@/features/ads/page-data";
import { listCampaignTree } from "@/features/ads/queries";
import { getGuardrails } from "@/features/guardrails/queries";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";

vi.mock("@/features/ads/queries", () => ({ listCampaignTree: vi.fn() }));
vi.mock("@/features/guardrails/queries", () => ({ getGuardrails: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("campaign demo entry point", () => {
  it("opens all three networks in interactive demo without accessing the database", async () => {
    const data = await getCampaignPageData(Promise.resolve({}));
    expect(data.tree.modo).toBe("demo");
    expect(data.tree.campanhas).toHaveLength(12);
    expect(new Set(data.tree.campanhas.map((c) => c.network)).size).toBe(3);
    expect(listCampaignTree).not.toHaveBeenCalled();
    expect(getGuardrails).not.toHaveBeenCalled();
  });
  it("does not disguise a real-data error with example metrics", async () => {
    vi.mocked(listCampaignTree).mockResolvedValue({
      campanhas: [],
      modo: "banco",
      metaConectado: false,
      ultimaSync: null,
      loadError: true,
    });
    vi.mocked(getGuardrails).mockResolvedValue({
      regras: GUARDRAILS_PADRAO,
      persistidas: false,
    });
    const data = await getCampaignPageData(Promise.resolve({ modo: "real" }));
    expect(data.tree.loadError).toBe(true);
    expect(data.tree.campanhas).toEqual([]);
    expect(listCampaignTree).toHaveBeenCalledOnce();
  });
});
