import { describe, it, expect, vi, afterEach } from "vitest";
import {
  metaRead,
  metaList,
  metaBusinessAccounts,
  requireBusiness,
  requireAccount,
} from "../../src/features/ads/meta-business-graph";
import {
  trafficStoreId,
  toggleStoreBusiness,
} from "../../src/features/funnel/meta-traffic-scope";
import type { FunnelNode } from "../../src/features/funnel/funnel-model";

afterEach(() => vi.unstubAllGlobals());
const store = (id: string): FunnelNode => ({
  id,
  title: id,
  type: "store",
  x: 0,
  y: 0,
});
const source: FunnelNode = {
  id: "facebook",
  title: "Facebook Ads",
  type: "brand",
  sigla: "f",
  x: 0,
  y: 0,
};
describe("store traffic attribution", () => {
  it("does not choose an arbitrary store when traffic branches into two stores, including cyclic graphs", () => {
    const edges = [
      { id: "1", source: "facebook", target: "a" },
      { id: "2", source: "a", target: "facebook" },
      { id: "3", source: "facebook", target: "b" },
    ];
    expect(
      trafficStoreId(source, [source, store("a"), store("b")], edges),
    ).toBe("");
    expect(
      trafficStoreId(
        { ...source, trafficStoreNodeId: "b" },
        [source, store("a"), store("b")],
        edges,
      ),
    ).toBe("b");
  });
  it("deduplicates a selected BM and rejects a sixth without removing existing bindings", () => {
    const ids = ["1", "2", "3", "4", "5"];
    expect(toggleStoreBusiness(ids, "5", true)).toEqual(ids);
    expect(() => toggleStoreBusiness(ids, "6", true)).toThrow("5 BMs");
    expect(ids).toHaveLength(5);
    expect(toggleStoreBusiness(ids, "2", false)).toEqual(["1", "3", "4", "5"]);
  });
});
describe("Meta access and pagination", () => {
  it("rejects unauthorized businesses and accounts even when an object ID is valid", () => {
    expect(() => requireBusiness([{ id: "1" }], "2")).toThrow(
      "não está acessível",
    );
    expect(() => requireAccount([{ id: "act_1" }], "act_2")).toThrow(
      "não pertence",
    );
  });
  it("never sends a token to an external pagination origin", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "1" }],
          paging: { next: "https://example.org/items?access_token=secret" },
        }),
      });
    vi.stubGlobal("fetch", request);
    await expect(
      metaList("https://graph.facebook.com/v21.0/me/businesses", "secret"),
    ).rejects.toThrow("Destino");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("strips URL tokens and disables redirects while keeping authentication in the header", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", request);
    await metaRead(
      "https://graph.facebook.com/v21.0/me?access_token=old",
      "secret",
    );
    const [url, options] = request.mock.calls[0];
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(options.headers.Authorization).toBe("Bearer secret");
    expect(options.redirect).toBe("error");
  });
  it("collects every page, deduplicating owned and client accounts", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: URL) => ({
        ok: true,
        json: async () =>
          url.searchParams.has("after")
            ? { data: [{ id: "act_2" }] }
            : url.pathname.endsWith("owned_ad_accounts")
              ? {
                  data: [{ id: "act_1" }],
                  paging: {
                    next: "https://graph.facebook.com/v21.0/1/owned_ad_accounts?after=next",
                  },
                }
              : { data: [{ id: "act_1" }, { id: "act_3" }] },
      }));
    vi.stubGlobal("fetch", request);
    expect(
      (await metaBusinessAccounts("1", "secret")).map((row) => row.id).sort(),
    ).toEqual(["act_1", "act_2", "act_3"]);
  });
  it("does not present a truncated result as complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [],
            paging: {
              next: "https://graph.facebook.com/v21.0/me/businesses?after=next",
            },
          }),
        }),
    );
    await expect(
      metaList("https://graph.facebook.com/v21.0/me/businesses", "secret"),
    ).rejects.toThrow("20 páginas");
  });
});
