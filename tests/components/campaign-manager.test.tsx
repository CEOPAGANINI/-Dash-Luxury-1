import * as React from "react";
import {
  cleanup,
  act,
  fireEvent,
  render as renderView,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { pick } from "../helpers/block-picker";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignManager } from "@/features/ads/campaign-manager";
import { CampaignDemoControls } from "@/features/ads/campaign-demo-controls";
import { CampaignAnalysis } from "@/features/ads/campaign-analysis";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { resetCampaignDemo } from "@/features/ads/demo-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";
import {
  createCampaignAction,
  updateAdEntityAction,
  syncMetaAction,
} from "@/features/ads/actions";

vi.mock("@/features/ads/actions", () => ({
  createCampaignAction: vi.fn(async () => ({
    ok: true,
    mensagem: "Campanha local criada.",
  })),
  updateAdEntityAction: vi.fn(async () => ({
    ok: false,
    mensagem: "Aprovação necessária.",
    pedeAprovacao: true,
  })),
  syncMetaAction: vi.fn(),
  seedDemoCampaignsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  act(() => resetCampaignDemo());
  vi.clearAllMocks();
});
const tree: CampaignTree = {
  campanhas: demoCampaignRows(),
  modo: "demo",
  metaConectado: false,
  ultimaSync: null,
};
function render(element: React.ReactElement) {
  const result = renderView(element);
  const table = screen.queryByRole("button", { name: "Tabela de métricas" });
  if (table) fireEvent.click(table);
  return result;
}

describe("campaign network pages", () => {
  it("does not turn a failed database query into zero KPIs or an empty campaign list", () => {
    render(
      <CampaignManager
        tree={{ ...tree, loadError: true }}
        network="meta"
        regras={GUARDRAILS_PADRAO}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "conexão com o banco",
    );
    expect(screen.queryByRole("button", { name: "Nova campanha" })).toBeNull();
    expect(screen.queryByRole("definitionlist")).toBeNull();
    expect(screen.queryByText("Nenhuma campanha de Meta Ads")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).not.toBeNull();
  });
  it.each(["meta", "google", "youtube"] as const)(
    "starts directly with the inventory on %s, without the removed header or demo banner",
    (network) => {
      const { container } = render(
        <CampaignManager
          tree={tree}
          network={network}
          regras={GUARDRAILS_PADRAO}
        />,
      );
      const table = screen.getByRole("table");
      expect(
        within(table)
          .getAllByRole("row")
          .filter((row) => row.parentElement?.tagName === "TBODY")
          .map((card) => card.getAttribute("aria-label")),
      ).toEqual(
        expect.arrayContaining(
          tree.campanhas
            .filter((c) => c.network === network)
            .map((c) => c.name),
        ),
      );
      expect(table.querySelectorAll("tbody tr")).toHaveLength(
        tree.campanhas.filter((c) => c.network === network).length,
      );
      for (const other of tree.campanhas.filter((c) => c.network !== network))
        expect(screen.queryByRole("row", { name: other.name })).toBeNull();
      expect(screen.queryByRole("tab")).toBeNull();
      expect(
        container
          .querySelector(".campaign-manager")
          ?.firstElementChild?.classList.contains("campaign-inventory"),
      ).toBe(true);
      expect(
        screen.getByRole("heading", { level: 2, name: "Suas campanhas" }),
      ).not.toBeNull();
      expect(container.querySelector(".campaign-page-heading")).toBeNull();
      expect(container.querySelector(".campaign-source")).toBeNull();
      expect(screen.queryByText(/Demonstração interativa/)).toBeNull();
      for (const name of ["Nova campanha", "Restaurar exemplos"]) {
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
      expect(
        screen.queryByRole("link", { name: "Consultar dados reais" }),
      ).toBeNull();
      expect(screen.getAllByText("Dados de exemplo").length).toBeGreaterThan(0);
      expect(container.querySelector("table")).not.toBeNull();
      if (network !== "meta")
        expect(
          screen.queryByRole("button", { name: /Sincronizar com o Meta/ }),
        ).toBeNull();
    },
  );
  it("updates the list and totals with search/status filters and clears them", () => {
    render(
      <CampaignManager tree={tree} network="meta" regras={GUARDRAILS_PADRAO} />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "not-found" },
    });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(
      screen.getByRole("heading", {
        name: "Nenhuma campanha corresponde aos filtros",
      }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    pick("Estado", "paused");
    expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(
      tree.campanhas.filter(
        (c) => c.network === "meta" && c.status === "paused",
      ).length,
    );
  });
  it("keeps database-loaded fixture IDs read-only outside the interactive sandbox", () => {
    render(
      <CampaignManager
        tree={{ ...tree, modo: "banco" }}
        network="google"
        regras={GUARDRAILS_PADRAO}
      />,
    );
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ativar / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Pausar / })).toBeNull();
  });
  it("retains the approval/error flow when a saved campaign is edited", async () => {
    const saved = {
      ...tree.campanhas.find((c) => c.network === "google")!,
      id: "saved-test",
      source: "manual" as const,
      adSets: [],
    };
    render(
      <CampaignManager
        tree={{ ...tree, modo: "banco", campanhas: [saved] }}
        network="google"
        regras={GUARDRAILS_PADRAO}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Gerenciar ${saved.name}` }),
    );
    const card = screen.getByRole("article", { name: saved.name });
    fireEvent.click(
      within(card).getByRole("button", { name: "Editar", hidden: true }),
    );
    const name = within(card).getByLabelText("Nome");
    fireEvent.submit(name.closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { hidden: true })).not.toBeNull(),
    );
    expect(updateAdEntityAction).toHaveBeenCalledTimes(1);
  });
  it("compares the same manager data on a separate analysis page", () => {
    render(<CampaignAnalysis tree={tree} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual([
      "/campanhas/analise?modo=real",
      "/campanhas/meta",
      "/campanhas/google",
      "/campanhas/youtube",
    ]);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText(/faturamento deduplicado/)).not.toBeNull();
  });
  it.each(["meta", "google", "youtube"] as const)(
    "still edits existing %s campaigns locally after removing the header",
    async (network) => {
      render(
        <CampaignManager
          tree={tree}
          network={network}
          regras={GUARDRAILS_PADRAO}
        />,
      );
      const campaign = tree.campanhas.find((c) => c.network === network)!;
      fireEvent.click(
        screen.getByRole("button", { name: `Gerenciar ${campaign.name}` }),
      );
      const card = screen.getByRole("article", { name: campaign.name });
      fireEvent.click(
        within(card).getAllByRole("button", { name: "Editar", hidden: true })[0],
      );
      const name = within(card).getByLabelText("Nome");
      fireEvent.change(name, { target: { value: `Editada ${network}` } });
      fireEvent.submit(name.closest("form")!);
      await screen.findByRole("article", { name: `Editada ${network}` });
      expect(localStorage.getItem("dash-luxury:campaign-sandbox:v1")).toContain(
        `Editada ${network}`,
      );
      expect(createCampaignAction).not.toHaveBeenCalled();
      expect(updateAdEntityAction).not.toHaveBeenCalled();
      expect(syncMetaAction).not.toHaveBeenCalled();
    },
  );
  it("retains confirmation in demo controls used on the other campaign pages", () => {
    render(<CampaignDemoControls page="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar exemplos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar restauração" }),
    );
    expect(
      screen.queryByRole("group", { name: "Confirmar restauração" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar exemplos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar restauração" }),
    );
    expect(
      screen.getByText(/Exemplos das três redes restaurados/),
    ).not.toBeNull();
  });
});
