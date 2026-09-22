import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlacementPerformance } from "@/features/ads/placement-performance";
import type { VendaPorPosicao } from "@/features/ads/creative-placements";
import type { AdMetrics, AdRow } from "@/features/ads/types";

afterEach(cleanup);

const labels = [
  "Feed Instagram",
  "Stories Instagram",
  "Explorar Instagram",
  "Feed Facebook",
  "Stories Facebook",
];

function placement(
  id: VendaPorPosicao["id"],
  plataforma: VendaPorPosicao["plataforma"],
  metrics: AdMetrics,
): VendaPorPosicao {
  return { id, plataforma, metrics };
}

function creative(overrides: Partial<AdRow> = {}): AdRow {
  return {
    id: "creative-1",
    externalId: null,
    name: "Criativo dourado",
    status: "active",
    creative: {
      title: "Tempo que define quem você é",
      body: "Anúncio da coleção dourada.",
      thumbnailUrl: "/creative-gold.jpg",
    },
    // O total geral inclui outras posições. Nesta seção, só os cinco
    // posicionamentos permitidos entram nas métricas e na distribuição.
    metrics: {
      purchases: 777,
      spendCents: 999_00,
      revenueCents: 9999_00,
      impressions: 99_999,
      clicks: 999,
    },
    placements: [
      placement("feed", "instagram", {
        purchases: 2,
        spendCents: 100_00,
        revenueCents: 200_00,
        impressions: 1_000,
        clicks: 25,
        checkouts: 6,
      }),
      placement("feed", "instagram", {
        purchases: 1,
        spendCents: 50_00,
        revenueCents: 100_00,
        impressions: 500,
        clicks: 5,
        checkouts: 3,
      }),
      placement("stories", "instagram", {
        purchases: 1,
        spendCents: 50_00,
        revenueCents: 25_00,
        impressions: 2_000,
        clicks: 40,
      }),
      placement("feed", "facebook", {
        purchases: 2,
        spendCents: 200_00,
        revenueCents: 600_00,
        impressions: 4_000,
        clicks: 80,
        checkouts: 8,
      }),
      placement("stories", "facebook", {
        purchases: 0,
        spendCents: 30_00,
        revenueCents: 0,
        impressions: 500,
        clicks: 10,
        checkouts: 0,
      }),
      placement("reels", "instagram", {
        purchases: 99,
        spendCents: 900_00,
        revenueCents: 9000_00,
        impressions: 90_000,
        clicks: 900,
        checkouts: 999,
      }),
      placement("explorar", "facebook", {
        purchases: 88,
        spendCents: 800_00,
        revenueCents: 8000_00,
        impressions: 80_000,
        clicks: 800,
        checkouts: 888,
      }),
    ],
    ...overrides,
  };
}

/* As vendas saíram da lista de métricas para o destaque do cartão: já
   não são um par dt/dd, são o número grande com "venda(s)" ao lado. */
function salesIn(root: HTMLElement) {
  const p = root.querySelector("p");
  return p?.querySelector("b")?.textContent?.trim();
}

function metricsIn(root: HTMLElement) {
  return Object.fromEntries(
    [...root.querySelectorAll("dt")].map((term) => [
      term.textContent?.trim().toLowerCase(),
      term.parentElement
        ?.querySelector("dd")
        ?.textContent?.trim()
        .replace(/\u00a0/g, " "),
    ]),
  );
}

describe("desempenho por posicionamento de cada criativo", () => {
  it("mantém cinco cards na ordem definida, com identificação e métricas próprias de cada plataforma", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const section = screen.getByRole("region", {
      name: "Desempenho por posicionamento",
    });
    const block = within(section).getByRole("article", {
      name: "Desempenho de Criativo dourado",
    });
    const cards = within(block).getAllByRole("article");

    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(
      labels,
    );
    labels.forEach((label) =>
      expect(within(block).getByRole("heading", { name: label })).toBeTruthy(),
    );
    expect(
      within(block).queryByRole("heading", { name: "Instagram" }),
    ).toBeNull();
    expect(
      within(block).queryByRole("heading", { name: "Facebook" }),
    ).toBeNull();
    expect(within(block).queryByRole("table")).toBeNull();
    expect(
      within(block).queryByText(/Reels|Marketplace|Outras posições/),
    ).toBeNull();

    // As duas linhas de feed do Instagram são agregadas; o feed do
    // Facebook continua separado, com os próprios custos e resultados.
    expect(salesIn(cards[0])).toBe("3");
    expect(metricsIn(cards[0])).toMatchObject({
      roas: "2,00x",
      "initiate checkout": "9",
      impressões: "1.500",
      cliques: "30",
      ctr: "2,00%",
      cpc: "R$ 5,00",
      cpa: "R$ 50,00",
    });
    expect(Object.keys(metricsIn(cards[0]))).toEqual([
      "roas",
      "initiate checkout",
      "impressões",
      "cliques",
      "ctr",
      "cpc",
      "cpm",
      "cpa",
    ]);
    expect(salesIn(cards[3])).toBe("2");
    expect(metricsIn(cards[3])).toMatchObject({
      roas: "3,00x",
      "initiate checkout": "8",
      impressões: "4.000",
      cliques: "80",
      ctr: "2,00%",
      cpc: "R$ 2,50",
      cpa: "R$ 100,00",
    });
  });

  it("calcula o resumo e uma distribuição de 100% apenas sobre os posicionamentos aceitos", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const block = screen.getByRole("article", {
      name: "Desempenho de Criativo dourado",
    });
    const badges = within(block).getAllByText(/\d+% das vendas/);
    expect(badges.map((badge) => badge.textContent)).toEqual([
      "50% das vendas",
      "17% das vendas",
      "0% das vendas",
      "33% das vendas",
      "0% das vendas",
    ]);
    expect(
      badges.reduce(
        (sum, badge) => sum + Number.parseInt(badge.textContent ?? "0", 10),
        0,
      ),
    ).toBe(100);
    expect(within(block).getByText("Total de 6 vendas")).toBeTruthy();
    const distribution = within(block).getByRole("figure");
    expect(
      within(distribution)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "50% (3)Feed Instagram",
      "17% (1)Stories Instagram",
      "0% (0)Explorar Instagram",
      "33% (2)Feed Facebook",
      "0% (0)Stories Facebook",
    ]);
    const accessibleDistribution = within(distribution)
      .getByRole("img")
      .getAttribute("aria-label");
    [
      "Feed Instagram: 50% (3",
      "Stories Instagram: 17% (1",
      "Explorar Instagram: 0% (0",
      "Feed Facebook: 33% (2",
      "Stories Facebook: 0% (0",
    ].forEach((label) => {
      expect(accessibleDistribution).toContain(label);
    });
    expect(within(block).getByText("2,15x")).toBeTruthy();
    expect(within(block).getByText("R$ 71,67")).toBeTruthy();
    expect(within(block).queryByText("777", { exact: true })).toBeNull();
  });

  it("mostra zeros para posições ausentes e distingue checkout desconhecido de zero real", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const explore = screen.getByRole("article", { name: "Explorar Instagram" });
    expect(salesIn(explore)).toBe("0");
    expect(metricsIn(explore)).toMatchObject({
      roas: "—",
      "initiate checkout": "0",
      impressões: "0",
      cliques: "0",
    });
    expect(
      metricsIn(screen.getByRole("article", { name: "Stories Instagram" }))[
        "initiate checkout"
      ],
    ).toBe("—");
    expect(
      metricsIn(screen.getByRole("article", { name: "Stories Facebook" }))[
        "initiate checkout"
      ],
    ).toBe("0");
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("cria um bloco por criativo, inclusive sem dados, sem reutilizar números entre eles", () => {
    render(
      <PlacementPerformance
        creatives={[
          creative(),
          creative({
            id: "creative-2",
            name: "Criativo sem partição",
            status: "paused",
            creative: {},
            placements: undefined,
          }),
        ]}
      />,
    );
    const populated = screen.getByRole("article", {
      name: "Desempenho de Criativo dourado",
    });
    const empty = screen.getByRole("article", {
      name: "Desempenho de Criativo sem partição",
    });
    expect(within(populated).getByText("Total de 6 vendas")).toBeTruthy();
    expect(within(empty).getByText("Total de 0 vendas")).toBeTruthy();
    expect(within(empty).getAllByRole("article")).toHaveLength(5);
    expect(within(empty).getAllByText("0% das vendas")).toHaveLength(5);
    for (const card of within(empty).getAllByRole("article")) {
      expect(salesIn(card)).toBe("0");
      expect(metricsIn(card)).toMatchObject({
        "initiate checkout": "0",
        impressões: "0",
        cliques: "0",
      });
    }
  });

  it("explica o período disponível e não oferece um filtro que a origem não suporta", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const period = screen.getByRole("combobox", {
      name: "Período de Criativo dourado",
    });
    expect(period.hasAttribute("disabled")).toBe(true);
    expect(
      within(period).getByRole("option", {
        name: "Últimos 7 dias sincronizados",
      }),
    ).toBeTruthy();
    expect(
      period.closest("label")?.getAttribute("title")?.trim().length,
    ).toBeGreaterThan(0);
  });

  it("preserva a identificação do criativo quando a prévia falha e não inventa metadados de mídia", () => {
    render(
      <PlacementPerformance
        creatives={[
          creative(),
          creative({
            id: "creative-2",
            name: "Vídeo 15s sem metadados",
            creative: {},
            placements: [],
          }),
        ]}
      />,
    );
    const first = screen.getByRole("article", {
      name: "Desempenho de Criativo dourado",
    });
    // A miniatura pode ser de um vídeo: sozinha não revela o formato.
    expect(within(first).getByText("Formato não informado")).toBeTruthy();
    expect(within(first).queryByText("Imagem", { exact: true })).toBeNull();
    fireEvent.error(
      within(first).getByRole("img", { name: "Prévia de Criativo dourado" }),
    );
    expect(within(first).getByText("Prévia indisponível")).toBeTruthy();
    expect(
      within(first).getByRole("heading", { name: "Criativo dourado" }),
    ).toBeTruthy();
    const second = screen.getByRole("article", {
      name: "Desempenho de Vídeo 15s sem metadados",
    });
    expect(within(second).getByText("Formato não informado")).toBeTruthy();
    expect(
      within(second).queryByText("Vídeo · 15s", { exact: true }),
    ).toBeNull();
  });

  it("mostra vídeo, duração e controles quando esses metadados estão disponíveis", () => {
    const videoMetadata = {
      type: "video" as const,
      videoUrl: "/creative-video.mp4",
      thumbnailUrl: "/creative-poster.jpg",
      durationSeconds: 15,
    };
    render(
      <PlacementPerformance
        creatives={[creative({ creative: videoMetadata })]}
      />,
    );
    const block = screen.getByRole("article", {
      name: "Desempenho de Criativo dourado",
    });
    expect(within(block).getByText("Vídeo · 15s")).toBeTruthy();
    const video = within(block).getByLabelText("Vídeo de Criativo dourado");
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("src")).toBe("/creative-video.mp4");
    expect(video.getAttribute("poster")).toBe("/creative-poster.jpg");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(within(block).queryByText("Formato não informado")).toBeNull();
  });

  it("abre os detalhes do criativo correto e permite fechar o diálogo pelo teclado", async () => {
    render(
      <PlacementPerformance
        creatives={[
          creative(),
          creative({
            id: "creative-2",
            name: "Segundo criativo",
            creative: { body: "Descrição do segundo criativo." },
            placements: [],
          }),
        ]}
      />,
    );
    const second = screen.getByRole("article", {
      name: "Desempenho de Segundo criativo",
    });
    fireEvent.click(
      within(second).getByRole("button", { name: "Ver detalhes do criativo" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Detalhes de Segundo criativo",
    });
    expect(
      within(dialog).getByText("Descrição do segundo criativo."),
    ).toBeTruthy();
    expect(
      within(dialog).queryByText("Anúncio da coleção dourada."),
    ).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("oferece detalhes também pelo menu de opções do próprio criativo", async () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const trigger = screen.getByRole("button", {
      name: "Mais opções de Criativo dourado",
    });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menuItem = await screen.findByRole("menuitem", {
      name: /detalhes do criativo/i,
    });
    fireEvent.click(menuItem);
    expect(
      await screen.findByRole("dialog", {
        name: "Detalhes de Criativo dourado",
      }),
    ).toBeTruthy();
  });
});
