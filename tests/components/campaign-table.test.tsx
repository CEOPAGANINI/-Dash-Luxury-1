import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { pick } from "../helpers/block-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignManager } from "@/features/ads/campaign-manager";
import { CampaignTable } from "@/features/ads/campaign-table";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import {
  CAMPAIGN_DEMO_KEY,
  resetCampaignDemo,
  type CampaignFormAction,
} from "@/features/ads/demo-store";
import {
  updateAdEntityAction,
  type ResultadoAds,
} from "@/features/ads/actions";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import {
  derivadas,
  somarMetricas,
  type CampaignTree,
} from "@/features/ads/types";
import {
  formatCurrency,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";

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
  vi.resetAllMocks();
});
const tree: CampaignTree = {
  campanhas: demoCampaignRows(),
  modo: "demo",
  metaConectado: false,
  ultimaSync: null,
};
// These regression tests exercise the retained table view explicitly.
function render(element: React.ReactElement) {
  const result = renderView(element);
  const table = screen.queryByRole("button", { name: "Tabela de métricas" });
  if (table) fireEvent.click(table);
  return result;
}

describe("campaign table and inline controls", () => {
  it("exposes all available metrics and weighted filtered totals, without expanding cards", () => {
    render(
      <CampaignManager tree={tree} network="meta" regras={GUARDRAILS_PADRAO} />,
    );
    expect(screen.queryByRole("article")).toBeNull();
    for (const title of [
      "Veiculação",
      "Campanha",
      "Orçamento diário",
      "Valor gasto",
      "Compras",
      "Custo por compra",
      "Receita",
      "ROAS",
      "Impressões",
      "Cliques",
      "CTR",
      "CPC",
      "CPM",
      "Resultado após mídia",
      "Margem após mídia",
      "Objetivo",
      "Grupos / conjuntos",
      "Anúncios",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: new RegExp(`^${title}`) }),
      ).not.toBeNull();
    }
    pick("Estado", "paused");
    const totals = somarMetricas(
      tree.campanhas
        .filter((c) => c.network === "meta" && c.status === "paused")
        .map((c) => c.metrics),
    );
    const row = screen.getByRole("row", {
      name: "Totais das campanhas filtradas",
    });
    expect(row.children[3].textContent).toBe(
      formatCurrency(totals.spendCents / 100, 2),
    );
    expect(row.children[7].textContent).toBe(
      formatRatio(derivadas(totals).roas!),
    );
    expect(row.children[10].textContent).toBe(
      formatPercent(derivadas(totals).ctr!, 2),
    );
  });

  it.each(["meta", "google", "youtube"] as const)(
    "edits the %s budget in its row, persists it and preserves all metrics",
    async (network) => {
      render(
        <CampaignManager
          tree={tree}
          network={network}
          regras={GUARDRAILS_PADRAO}
        />,
      );
      const campaign = tree.campanhas.find((c) => c.network === network)!;
      const row = screen.getByRole("row", { name: campaign.name });
      fireEvent.click(
        within(row).getByRole("button", {
          name: `Editar orçamento de ${campaign.name}`,
        }),
      );
      const amount = within(row).getByRole("spinbutton");
      fireEvent.change(amount, { target: { value: "150.25" } });
      fireEvent.submit(amount.closest("form")!);
      await waitFor(() =>
        expect(within(row).queryByRole("spinbutton")).toBeNull(),
      );
      expect(
        within(row).getByRole("button", {
          name: `Editar orçamento de ${campaign.name}`,
        }).textContent,
      ).toContain("150,25");
      const saved = JSON.parse(
        localStorage.getItem(CAMPAIGN_DEMO_KEY)!,
      ).rows.find((c: { id: string }) => c.id === campaign.id);
      expect(saved.dailyBudgetCents).toBe(15025);
      expect(saved.metrics).toEqual(campaign.metrics);
      expect(saved.name).toBe(campaign.name);
      expect(saved.status).toBe(campaign.status);
      expect(updateAdEntityAction).not.toHaveBeenCalled();
    },
  );

  it("cancels an inline budget with Escape without changing the campaign", () => {
    render(
      <CampaignManager tree={tree} network="meta" regras={GUARDRAILS_PADRAO} />,
    );
    const campaign = tree.campanhas[0];
    const row = screen.getByRole("row", { name: campaign.name });
    const trigger = within(row).getByRole("button", {
      name: `Editar orçamento de ${campaign.name}`,
    });
    fireEvent.click(trigger);
    fireEvent.change(within(row).getByRole("spinbutton"), {
      target: { value: "999" },
    });
    fireEvent.keyDown(within(row).getByRole("spinbutton"), { key: "Escape" });
    expect(within(row).queryByRole("spinbutton")).toBeNull();
    fireEvent.click(trigger);
    expect(
      (within(row).getByRole("spinbutton") as HTMLInputElement).value,
    ).toBe(String(campaign.dailyBudgetCents! / 100));
    expect(updateAdEntityAction).not.toHaveBeenCalled();
  });

  it("submits only the budget fields, retains approval and prevents duplicate submissions while pending", async () => {
    let finish!: (result: ResultadoAds) => void;
    const action = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ResultadoAds>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: true, mensagem: "Salvo." });
    const campaign = {
      ...tree.campanhas[0],
      id: "saved-campaign",
      source: "manual" as const,
    };
    render(
      <CampaignTable
        campaigns={[campaign]}
        revision={0}
        action={action}
        sort="spend"
        onSort={vi.fn()}
        selectedId={null}
        onManage={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Editar orçamento de ${campaign.name}`,
      }),
    );
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1500.50" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Salvando…" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(
      screen.getByRole("button", { name: "Cancelar" }).hasAttribute("disabled"),
    ).toBe(true);
    await act(async () =>
      finish({
        ok: false,
        mensagem: "Aprovação necessária.",
        pedeAprovacao: true,
      }),
    );
    expect(screen.getByRole("alert").textContent).toBe("Aprovação necessária.");
    expect((input as HTMLInputElement).value).toBe("1500.50");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.queryByRole("spinbutton")).toBeNull());
    const submitted = action.mock.calls[1][1] as FormData;
    expect(Object.fromEntries(submitted)).toEqual({
      tipo: "campaign",
      id: "saved-campaign",
      dailyBudget: "1500.50",
      aprovado: "on",
    });
  });

  it("keeps blocked activation unchanged and displays the safety reason inside its row", async () => {
    const action = vi.fn<CampaignFormAction>(async () => ({
      ok: false,
      mensagem: "Reativação bloqueada pelo limite de segurança.",
    }));
    const campaign = { ...tree.campanhas[0], status: "paused" as const };
    render(
      <CampaignTable
        campaigns={[campaign]}
        revision={0}
        action={action}
        sort="spend"
        onSort={vi.fn()}
        selectedId={null}
        onManage={vi.fn()}
      />,
    );
    const row = screen.getByRole("row", { name: campaign.name });
    fireEvent.submit(
      within(row)
        .getByRole("button", { name: `Ativar ${campaign.name}` })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    expect(within(row).getByText("Pausada")).not.toBeNull();
    expect(Object.fromEntries(action.mock.calls[0][1] as FormData)).toEqual({
      tipo: "campaign",
      id: campaign.id,
      status: "active",
    });
  });

  it("shows missing ratios as unavailable, not fabricated zeros, and archived campaigns have no pause button", () => {
    const campaign = tree.campanhas.find((c) => c.status === "archived")!;
    render(
      <CampaignTable
        campaigns={[campaign]}
        revision={0}
        action={vi.fn()}
        sort="spend"
        onSort={vi.fn()}
        selectedId={null}
        onManage={vi.fn()}
      />,
    );
    const row = screen.getByRole("row", { name: campaign.name });
    expect(row.children[7].textContent).toBe("—");
    expect(
      within(row).queryByRole("button", { name: /^Pausar |^Ativar / }),
    ).toBeNull();
  });
});
