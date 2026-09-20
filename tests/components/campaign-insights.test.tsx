import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignManager } from "@/features/ads/campaign-manager";
import { CampaignInsights } from "@/features/ads/campaign-insights";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import {
  resetCampaignDemo,
  CAMPAIGN_DEMO_KEY,
} from "@/features/ads/demo-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { METRICAS_ZERADAS } from "@/features/ads/types";
import { updateAdEntityAction } from "@/features/ads/actions";

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
function render(element: React.ReactElement) {
  const result = renderView(element);
  const table = screen.queryByRole("button", { name: "Tabela de métricas" });
  if (table) fireEvent.click(table);
  return result;
}

describe("campaign-specific calculator and traffic funnel", () => {
  it.each(["meta", "google", "youtube"] as const)(
    "opens each %s campaign from its row and keeps scenarios separate from history",
    (network) => {
      render(
        <CampaignManager
          tree={{
            campanhas: campaigns,
            modo: "demo",
            metaConectado: false,
            ultimaSync: null,
          }}
          network={network}
          regras={GUARDRAILS_PADRAO}
        />,
      );
      const campaign = campaigns.find((c) => c.network === network)!;
      const rowBefore = screen.getByRole("row", {
        name: campaign.name,
      }).textContent;
      const savedBefore = localStorage.getItem(CAMPAIGN_DEMO_KEY);
      fireEvent.click(
        screen.getByRole("button", {
          name: `Analisar campanha ${campaign.name}`,
        }),
      );
      const panel = screen.getByRole("article", { name: campaign.name });
      expect(
        within(panel).getByRole("region", { name: "Diagnóstico da campanha" }),
      ).toBeTruthy();
      fireEvent.click(
        within(panel).getByRole("button", { name: "Calculadora" }),
      );
      for (const [label, value] of [
        ["Investimento simulado (R$)", "1000"],
        ["CPC previsto (R$)", "2"],
        ["CTR previsto (%)", "5"],
        ["Compras por clique (%)", "4"],
        ["Ticket médio previsto (R$)", "100"],
      ]) {
        fireEvent.change(within(panel).getByLabelText(label), {
          target: { value },
        });
      }
      const projectedRevenue = within(panel)
        .getByText("Receita prevista", { exact: true })
        .closest("div")!;
      expect(projectedRevenue.textContent).toContain("2.000,00");
      expect(
        within(panel).getByText(
          "Projeção hipotética · não é resultado realizado",
        ),
      ).toBeTruthy();
      // Opening the panel changes the details link, never its numeric cells.
      expect(
        screen
          .getByRole("row", { name: campaign.name })
          .textContent?.replace("Fechar detalhes", "Editar e ver estrutura"),
      ).toBe(rowBefore);
      expect(localStorage.getItem(CAMPAIGN_DEMO_KEY)).toBe(savedBefore);
      expect(updateAdEntityAction).not.toHaveBeenCalled();
      fireEvent.click(
        within(panel).getByRole("button", { name: "Funil de tráfego" }),
      );
      expect(
        within(panel).getByRole("region", { name: "Funil da campanha" }),
      ).toBeTruthy();
      expect(within(panel).getByRole("list").children).toHaveLength(3);
      fireEvent.click(
        within(panel).getByRole("button", { name: "Calculadora" }),
      );
      expect(
        (within(panel).getByLabelText("CPC previsto (R$)") as HTMLInputElement)
          .value,
      ).toBe("2");
      fireEvent.click(
        within(panel).getByRole("button", {
          name: "Restaurar premissas do histórico",
        }),
      );
      expect(
        (
          within(panel).getByLabelText(
            "Investimento simulado (R$)",
          ) as HTMLInputElement
        ).value,
      ).toBe(String(campaign.metrics.spendCents / 100));
    },
  );

  it("removes a stale projection on invalid input and displays a field error", () => {
    render(
      <CampaignInsights campaign={campaigns[0]} rules={GUARDRAILS_PADRAO} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));
    fireEvent.change(screen.getByLabelText("CPC previsto (R$)"), {
      target: { value: "0" },
    });
    expect(
      screen.getByLabelText("CPC previsto (R$)").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.queryByText("Receita prevista", { exact: true })).toBeNull();
  });

  it("handles new or archived campaigns with no metrics without fabricating a funnel", () => {
    render(
      <CampaignInsights
        campaign={{
          ...campaigns[0],
          status: "archived",
          metrics: METRICAS_ZERADAS,
        }}
        rules={GUARDRAILS_PADRAO}
      />,
    );
    expect(
      screen.getByText("Sem investimento para calcular o retorno"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));
    expect(
      (screen.getByLabelText("CPC previsto (R$)") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.queryByText("Receita prevista", { exact: true })).toBeNull();
  });

  it("switches campaign context rather than reusing another campaign's simulation", () => {
    render(
      <CampaignManager
        tree={{
          campanhas: campaigns,
          modo: "demo",
          metaConectado: false,
          ultimaSync: null,
        }}
        network="meta"
        regras={GUARDRAILS_PADRAO}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Analisar campanha ${campaigns[0].name}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));
    fireEvent.change(screen.getByLabelText("Investimento simulado (R$)"), {
      target: { value: "999" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: `Analisar campanha ${campaigns[1].name}`,
      }),
    );
    expect(
      screen.queryByRole("article", { name: campaigns[0].name }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Calculadora" }));
    expect(
      (screen.getByLabelText("Investimento simulado (R$)") as HTMLInputElement)
        .value,
    ).toBe(String(campaigns[1].metrics.spendCents / 100));
  });
});
