import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { pick, pickerDisabled } from "../helpers/block-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignBoard } from "@/features/ads/campaign-board";
import { CampaignManager } from "@/features/ads/campaign-manager";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import {
  CAMPAIGN_DEMO_KEY,
  resetCampaignDemo,
  type CampaignFormAction,
} from "@/features/ads/demo-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { AdNetwork, CampaignRow } from "@/features/ads/types";
import type { ResultadoAds } from "@/features/ads/actions";

vi.mock("@/features/ads/actions", () => ({
  createCampaignAction: vi.fn(),
  updateAdEntityAction: vi.fn(),
  syncMetaAction: vi.fn(),
  seedDemoCampaignsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  act(() => resetCampaignDemo());
  vi.clearAllMocks();
});
const campaigns = demoCampaignRows();
const mountManager = (network: AdNetwork = "meta") =>
  render(
    <CampaignManager
      network={network}
      regras={GUARDRAILS_PADRAO}
      tree={{
        campanhas: campaigns,
        modo: "demo",
        metaConectado: false,
        ultimaSync: null,
      }}
    />,
  );
const savedCampaign = (id: string) =>
  JSON.parse(localStorage.getItem(CAMPAIGN_DEMO_KEY)!).rows.find(
    (c: CampaignRow) => c.id === id,
  );

describe("Trello-style campaign board", () => {
  it.each(["meta", "google", "youtube"] as const)(
    "defaults to three columns containing only %s campaigns",
    (network) => {
      mountManager(network);
      expect(screen.queryByRole("table")).toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Quadro de campanhas" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
      for (const [status, label] of [
        ["active", "ativas"],
        ["paused", "pausadas"],
        ["archived", "arquivadas"],
      ]) {
        const column = screen.getByRole("region", {
          name: `Campanhas ${label}`,
        });
        const cards = campaigns.filter(
          (c) => c.network === network && c.status === status,
        );
        expect(within(column).queryAllByRole("article")).toHaveLength(
          cards.length,
        );
        cards.forEach((c) =>
          expect(
            within(column).getByRole("article", { name: `Cartão ${c.name}` }),
          ).toBeTruthy(),
        );
      }
      campaigns
        .filter((c) => c.network !== network)
        .forEach((c) =>
          expect(
            screen.queryByRole("article", { name: `Cartão ${c.name}` }),
          ).toBeNull(),
        );
    },
  );
  it("preserves filters when switching board/table and opens the existing campaign analysis", () => {
    mountManager();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: campaigns[0].name },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tabela de métricas" }));
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(
      1,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Quadro de campanhas" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Analisar campanha ${campaigns[0].name}`,
      }),
    );
    const panel = screen.getByRole("article", { name: campaigns[0].name });
    expect(
      within(panel).getByRole("region", { name: "Diagnóstico da campanha" }),
    ).toBeTruthy();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Funil de tráfego" }),
    );
    expect(
      within(panel).getByRole("region", { name: "Funil da campanha" }),
    ).toBeTruthy();
  });
  it("moves a card by pausing and restores it without changing its budget or historical metrics", async () => {
    mountManager();
    const c = campaigns[0];
    fireEvent.click(screen.getByRole("button", { name: `Pausar ${c.name}` }));
    const paused = screen.getByRole("region", { name: "Campanhas pausadas" });
    await within(paused).findByRole("article", { name: `Cartão ${c.name}` });
    expect(savedCampaign(c.id).metrics).toEqual(c.metrics);
    expect(savedCampaign(c.id).dailyBudgetCents).toBe(c.dailyBudgetCents);
    fireEvent.click(screen.getByRole("button", { name: `Ativar ${c.name}` }));
    await within(
      screen.getByRole("region", { name: "Campanhas ativas" }),
    ).findByRole("article", { name: `Cartão ${c.name}` });
  });
  it("edits budget inside the card and persists cents accurately", async () => {
    mountManager();
    const c = campaigns[0];
    const card = screen.getByRole("article", { name: `Cartão ${c.name}` });
    fireEvent.click(
      within(card).getByRole("button", {
        name: `Editar orçamento de ${c.name}`,
      }),
    );
    const input = within(card).getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "150.25" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(within(card).queryByRole("spinbutton")).toBeNull(),
    );
    expect(savedCampaign(c.id).dailyBudgetCents).toBe(15025);
    expect(savedCampaign(c.id).metrics).toEqual(c.metrics);
  });
  it("supports keyboard/touch movement with confirmation and cancellation", async () => {
    mountManager();
    const c = campaigns[0];
    const before = localStorage.getItem(CAMPAIGN_DEMO_KEY);
    fireEvent.click(
      screen.getByRole("button", { name: `Mover campanha ${c.name}` }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    pick("Coluna de destino", "archived");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar movimento" }));
    expect(localStorage.getItem(CAMPAIGN_DEMO_KEY)).toBe(before);
    fireEvent.click(
      screen.getByRole("button", { name: `Mover campanha ${c.name}` }),
    );
    pick("Coluna de destino", "archived");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar movimento" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await within(
      screen.getByRole("region", { name: "Campanhas arquivadas" }),
    ).findByRole("article", { name: `Cartão ${c.name}` });
    expect(savedCampaign(c.id).metrics).toEqual(c.metrics);
  });
  it("dragging opens confirmation; dropping unknown content does nothing", async () => {
    const action = vi.fn<CampaignFormAction>(async () => ({
      ok: true,
      mensagem: "Movida.",
    }));
    const c = campaigns[0];
    render(
      <CampaignBoard
        campaigns={[c]}
        revision={0}
        action={action}
        selectedId={null}
        onManage={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    const column = screen.getByRole("region", { name: "Campanhas pausadas" });
    fireEvent.drop(column);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.dragStart(
      screen.getByRole("button", { name: `Mover campanha ${c.name}` }),
      { dataTransfer: { setData: vi.fn(), effectAllowed: "" } },
    );
    fireEvent.drop(column);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar movimento" }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0][1] as FormData)).toEqual({
      tipo: "campaign",
      id: c.id,
      status: "paused",
    });
  });
  it("keeps a failed move in the original column and guards pending submissions", async () => {
    let finish!: (r: ResultadoAds) => void;
    const action = vi.fn<CampaignFormAction>(
      () =>
        new Promise<ResultadoAds>((resolve) => {
          finish = resolve;
        }),
    );
    const c = { ...campaigns[0], status: "paused" as const };
    render(
      <CampaignBoard
        campaigns={[c]}
        revision={0}
        action={action}
        selectedId={null}
        onManage={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Mover campanha ${c.name}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar movimento" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Movendo…" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(pickerDisabled("Coluna de destino")).toBe(true);
    await act(async () =>
      finish({
        ok: false,
        mensagem: "Reativação bloqueada pelos limites de segurança.",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("bloqueada");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      document
        .querySelector('[aria-label="Campanhas pausadas"] article')
        ?.getAttribute("aria-label"),
    ).toBe(`Cartão ${c.name}`);
    expect(action).toHaveBeenCalledTimes(1);
  });
  it("does not allow database-loaded fixtures to mutate outside the demo sandbox", () => {
    render(
      <CampaignBoard
        campaigns={[campaigns[0]]}
        revision={0}
        selectedId={null}
        onManage={vi.fn()}
        onAnalyze={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^Mover campanha/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pausar / })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Editar orçamento/ }),
    ).toBeNull();
  });
});
