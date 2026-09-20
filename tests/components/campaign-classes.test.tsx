import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { pick, picked } from "../helpers/block-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignManager } from "@/features/ads/campaign-manager";
import {
  campaignClass,
  CAMPAIGN_CLASSES,
  isCampaignClass,
} from "@/features/ads/campaign-classes";
import {
  CAMPAIGN_CLASSES_KEY,
  restoreCampaignClasses,
} from "@/features/ads/campaign-class-store";
import {
  CAMPAIGN_DEMO_KEY,
  resetCampaignDemo,
} from "@/features/ads/demo-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import {
  selectCampaigns,
  INITIAL_CAMPAIGN_FILTERS,
} from "@/features/ads/manager-model";
import { updateAdEntityAction } from "@/features/ads/actions";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { AdNetwork } from "@/features/ads/types";

vi.mock("@/features/ads/actions", () => ({
  createCampaignAction: vi.fn(),
  updateAdEntityAction: vi.fn(),
  syncMetaAction: vi.fn(),
  seedDemoCampaignsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const rows = demoCampaignRows();
const first = rows[0];
const mount = (network: AdNetwork = "meta", real = false) =>
  render(
    <CampaignManager
      network={network}
      regras={GUARDRAILS_PADRAO}
      tree={{
        campanhas: rows,
        modo: real ? "banco" : "demo",
        metaConectado: false,
        ultimaSync: null,
      }}
    />,
  );
const assignments = () =>
  restoreCampaignClasses(localStorage.getItem(CAMPAIGN_CLASSES_KEY)!);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key: CAMPAIGN_CLASSES_KEY }),
    );
    resetCampaignDemo();
  });
  vi.clearAllMocks();
});

describe("campaign classification", () => {
  it("defines strategies separately from delivery and only labels known examples automatically", () => {
    expect(CAMPAIGN_CLASSES).toHaveLength(17);
    expect(isCampaignClass("active")).toBe(false);
    expect(campaignClass(first)).toBe("scale");
    expect(campaignClass({ ...first, source: "meta" })).toBe("unclassified");
    expect(campaignClass({ ...first, id: "demo-new" })).toBe("unclassified");
    expect(campaignClass({ ...first, campaignClass: "audience-test" })).toBe(
      "audience-test",
    );
  });
  it("validates persisted classes and rejects malformed data", () => {
    const valid = {
      "demo:meta:demo-a1": "scale",
      "banco:google:real-1": "offer-test",
    };
    expect(
      restoreCampaignClasses(
        JSON.stringify({ version: 1, assignments: valid }),
      ),
    ).toEqual(valid);
    for (const value of [
      "bad",
      { version: 2, assignments: valid },
      { version: 1, assignments: { "demo:meta:demo-a1": "active" } },
      { version: 1, assignments: { "unknown:key": "scale" } },
    ]) {
      expect(restoreCampaignClasses(JSON.stringify(value))).toBeNull();
    }
  });
  it.each(["meta", "google", "youtube"] as const)(
    "offers all classes on every %s card without mixing networks",
    (network) => {
      mount(network);
      const networkRows = rows.filter((c) => c.network === network);
      expect(screen.getAllByRole("article")).toHaveLength(networkRows.length);
      for (const row of networkRows) {
        const name = `Classe de ${row.name}`;
        expect(picked(name)).toBe(campaignClass(row));
        fireEvent.click(screen.getByRole("button", { name }));
        expect(
          within(screen.getByRole("radiogroup", { name })).getAllByRole(
            "radio",
          ),
        ).toHaveLength(17);
        fireEvent.click(screen.getByRole("button", { name }));
      }
    },
  );
  it("changes only the class, saves it, and retains it in table view and after remount", () => {
    const instance = mount();
    const before = localStorage.getItem(CAMPAIGN_DEMO_KEY);
    pick(`Classe de ${first.name}`, "audience-test");
    expect(assignments()?.["demo:meta:demo-a1"]).toBe("audience-test");
    expect(localStorage.getItem(CAMPAIGN_DEMO_KEY)).toBe(before);
    expect(updateAdEntityAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tabela de métricas" }));
    expect(picked(`Classe de ${first.name}`)).toBe("audience-test");
    instance.unmount();
    mount();
    expect(picked(`Classe de ${first.name}`)).toBe("audience-test");
  });
  it("filters by class, supports searching its label and clears filters", () => {
    mount();
    pick("Classe da campanha", "creative-test-video");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("article", { name: `Cartão ${rows[1].name}` }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(
      selectCampaigns(rows, "google", {
        ...INITIAL_CAMPAIGN_FILTERS,
        search: "teste de publico",
      }).map((c) => c.id),
    ).toEqual(["demo-g2"]);
  });
  it("preserves real labels and restores only demo labels on reset", () => {
    mount();
    act(() => {
      localStorage.setItem(
        CAMPAIGN_CLASSES_KEY,
        JSON.stringify({
          version: 1,
          assignments: {
            "banco:meta:real-1": "scale",
            "demo:meta:demo-a1": "sales-page-test",
          },
        }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: CAMPAIGN_CLASSES_KEY }),
      );
    });
    expect(picked(`Classe de ${first.name}`)).toBe("sales-page-test");
    act(() => resetCampaignDemo());
    expect(assignments()).toEqual({ "banco:meta:real-1": "scale" });
    expect(picked(`Classe de ${first.name}`)).toBe("scale");
  });
  it("keeps the edited class in memory and warns when storage is blocked", () => {
    mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    pick(`Classe de ${first.name}`, "sales-page-test");
    expect(picked(`Classe de ${first.name}`)).toBe("sales-page-test");
    expect(
      screen.getByText(/Classe: Teste de página de vendas.*Armazenamento indisponível/),
    ).toBeTruthy();
  });
  it("keeps demo and database class assignments isolated", () => {
    const instance = mount();
    pick(`Classe de ${first.name}`, "sales-page-test");
    instance.unmount();
    mount("meta", true);
    expect(picked(`Classe de ${first.name}`)).toBe("scale");
  });
});
