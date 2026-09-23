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

/* As cinco linhas de posicionamento de uma coluna: já não são cinco
   cartões, são cinco abas de um bloco só. */
function placementRowsIn(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[data-placement]")];
}

/* O painel que mostra as métricas do posicionamento apontado. */
function panelIn(root: HTMLElement) {
  return root.querySelector<HTMLElement>("[role='tabpanel']")!;
}

/* Aponta um posicionamento e devolve o painel já com as métricas dele. */
function hover(root: HTMLElement, label: string) {
  fireEvent.mouseEnter(
    within(root).getByRole("tab", { name: new RegExp(`^${label}`) }),
  );
  return panelIn(root);
}

/* Todas as métricas de um cartão, pelo rótulo. As vendas são agora a
   primeira das três principais, e não um destaque à parte. */
function metricsIn(root: HTMLElement) {
  return Object.fromEntries(
    [...root.querySelectorAll("dt")].map((term) => [
      term.textContent?.trim().toLowerCase().replace(/^venda$/, "vendas"),
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
    const block = within(section).getByRole("group", {
      name: "Análise de Criativo dourado",
    });
    const linhas = placementRowsIn(block);

    expect(linhas.map((linha) => linha.textContent)).toEqual(
      labels.map((l) => expect.stringContaining(l)),
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
    expect(metricsIn(hover(block, "Feed Instagram"))).toMatchObject({
      vendas: "3",
      roas: "2,00x",
      checkout: "9",
      impressões: "1.500",
      cliques: "30",
      ctr: "2,00%",
      cpc: "R$ 5,00",
      cpa: "R$ 50,00",
    });
    // A ordem pedida: vendas, ROAS e checkout em destaque; as seis
    // secundárias por baixo, sempre na mesma sequência.
    expect(Object.keys(metricsIn(hover(block, "Feed Instagram")))).toEqual([
      "vendas",
      "roas",
      "checkout",
      "impressões",
      "cliques",
      "ctr",
      "cpc",
      "cpm",
      "cpa",
    ]);
    expect(metricsIn(hover(block, "Feed Facebook"))).toMatchObject({
      vendas: "2",
      roas: "3,00x",
      checkout: "8",
      impressões: "4.000",
      cliques: "80",
      ctr: "2,00%",
      cpc: "R$ 2,50",
      cpa: "R$ 100,00",
    });
  });

  it("calcula o resumo e uma distribuição de 100% apenas sobre os posicionamentos aceitos", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const block = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
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
    // O total das vendas vive no cartão do criativo, em "Vendas totais".
    expect(metricsIn(within(block).getByRole("article", { name: "Criativo Criativo dourado" }))).toMatchObject({
      "vendas totais": "6",
      "roas geral": "2,15x",
      "cpa geral": "R$ 71,67",
    });
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
    const coluna = screen.getByRole("group", { name: "Análise de Criativo dourado" });
    expect(metricsIn(hover(coluna, "Explorar Instagram"))).toMatchObject({
      vendas: "0",
      roas: "—",
      checkout: "0",
      impressões: "0",
      cliques: "0",
    });
    expect(
      metricsIn(hover(coluna, "Stories Instagram")).checkout,
    ).toBe("—");
    expect(
      metricsIn(hover(coluna, "Stories Facebook")).checkout,
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
    const populated = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
    });
    const empty = screen.getByRole("group", {
      name: "Análise de Criativo sem partição",
    });
    const totalDe = (coluna: HTMLElement) =>
      metricsIn(
        within(coluna).getByRole("article", { name: /^Criativo / }),
      )["vendas totais"];
    expect(totalDe(populated)).toBe("6");
    expect(totalDe(empty)).toBe("0");
    expect(placementRowsIn(empty)).toHaveLength(5);
    expect(within(empty).getAllByText("0% das vendas")).toHaveLength(5);
    for (const label of labels) {
      expect(metricsIn(hover(empty, label))).toMatchObject({
        vendas: "0",
        checkout: "0",
        impressões: "0",
        cliques: "0",
      });
    }
  });

  it("não traz faixa de cabeçalho: nem título, nem subtexto, nem seletor de período, nem menu", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const block = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
    });
    expect(
      within(block).queryByRole("heading", {
        name: "Desempenho por posicionamento",
      }),
    ).toBeNull();
    expect(
      within(block).queryByText(/performou em cada posicionamento/),
    ).toBeNull();
    expect(within(block).queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/Últimos 7 dias sincronizados/)).toBeNull();
    expect(screen.queryByText(/Filtro de datas indisponível/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Mais opções de / }),
    ).toBeNull();
    // O nome da secção continua a existir para quem lê por leitor de
    // ecrã — na secção que envolve os blocos, não numa faixa visível.
    expect(
      screen.getByRole("region", { name: "Desempenho por posicionamento" }),
    ).toBeTruthy();
  });

  it("põe numa coluna o criativo, a distribuição e os cinco posicionamentos, nessa ordem", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const coluna = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
    });
    /* A ordem dentro da coluna é o contrato desta secção: quem lê na
       horizontal, comparando colunas, tem de encontrar o mesmo bloco na
       mesma altura em todas elas. */
    const ordem = [...coluna.children]
      .map((el) =>
        el.tagName === "FIGURE"
          ? "distribuicao"
          : el.tagName === "SECTION"
            ? "posicionamentos"
            : el.tagName === "ARTICLE"
              ? "criativo"
              : null,
      )
      .filter(Boolean);
    expect(ordem).toEqual(["criativo", "distribuicao", "posicionamentos"]);
    // E os cinco posicionamentos vêm na ordem definida, dentro do bloco.
    expect(placementRowsIn(coluna).map((c) => c.getAttribute("data-placement"))).toEqual([
      "instagram-feed",
      "instagram-stories",
      "instagram-explore",
      "facebook-feed",
      "facebook-stories",
    ]);
  });

  it("uma coluna por criativo, lado a lado na mesma grade", () => {
    render(
      <PlacementPerformance
        creatives={[
          creative(),
          creative({ id: "creative-2", name: "Segundo criativo" }),
          creative({ id: "creative-3", name: "Terceiro criativo" }),
        ]}
      />,
    );
    const colunas = screen.getAllByRole("group", { name: /^Análise de / });
    expect(colunas.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Análise de Criativo dourado",
      "Análise de Segundo criativo",
      "Análise de Terceiro criativo",
    ]);
    // Todas irmãs na mesma grade: é isso que as põe lado a lado.
    const grade = colunas[0].parentElement!;
    expect(colunas.every((c) => c.parentElement === grade)).toBe(true);
    // E cada coluna leva os seus cinco posicionamentos, sem os misturar.
    for (const coluna of colunas) {
      expect(placementRowsIn(coluna)).toHaveLength(5);
    }
  });

  it("mostra as métricas do posicionamento apontado, e nunca começa vazio", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    const coluna = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
    });
    const painel = panelIn(coluna);

    /* Começa no que mais vendeu — o Feed Instagram, com 3 — para o
       painel não estar à espera de um gesto que num telemóvel pode
       nunca vir. */
    expect(painel.querySelector("h4")?.textContent).toBe("Feed Instagram");
    expect(metricsIn(painel)).toMatchObject({ vendas: "3", roas: "2,00x" });

    // O rato troca o que se vê, e a linha apontada fica marcada.
    expect(metricsIn(hover(coluna, "Feed Facebook"))).toMatchObject({
      vendas: "2",
      roas: "3,00x",
      checkout: "8",
    });
    expect(painel.querySelector("h4")?.textContent).toBe("Feed Facebook");
    const aba = (label: string) =>
      within(coluna).getByRole("tab", { name: new RegExp(`^${label}`) });
    expect(aba("Feed Facebook").getAttribute("aria-selected")).toBe("true");
    expect(aba("Feed Instagram").getAttribute("aria-selected")).toBe("false");

    /* O teclado anda pela lista com as setas: sem isto, as métricas só
       existiriam para quem tem rato. */
    fireEvent.keyDown(within(coluna).getByRole("tablist"), { key: "ArrowDown" });
    expect(painel.querySelector("h4")?.textContent).toBe("Stories Facebook");
    fireEvent.keyDown(within(coluna).getByRole("tablist"), { key: "ArrowDown" });
    // Dá a volta, em vez de parar no fim.
    expect(painel.querySelector("h4")?.textContent).toBe("Feed Instagram");
    fireEvent.keyDown(within(coluna).getByRole("tablist"), { key: "End" });
    expect(painel.querySelector("h4")?.textContent).toBe("Stories Facebook");

    // E o toque, que não tem "passar por cima": o clique também escolhe.
    fireEvent.click(aba("Explorar Instagram"));
    expect(painel.querySelector("h4")?.textContent).toBe("Explorar Instagram");

    // O painel pertence à aba escolhida, e não a todas.
    expect(painel.getAttribute("aria-labelledby")).toBe(
      aba("Explorar Instagram").getAttribute("id"),
    );
  });

  it("uma coluna não mexe no painel da outra", () => {
    render(
      <PlacementPerformance
        creatives={[creative(), creative({ id: "creative-2", name: "Outro" })]}
      />,
    );
    const [uma, outra] = screen.getAllByRole("group", { name: /^Análise de / });
    hover(uma, "Stories Facebook");
    expect(panelIn(uma).querySelector("h4")?.textContent).toBe("Stories Facebook");
    expect(panelIn(outra).querySelector("h4")?.textContent).toBe("Feed Instagram");
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
    const first = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
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
    const second = screen.getByRole("group", {
      name: "Análise de Vídeo 15s sem metadados",
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
    const block = screen.getByRole("group", {
      name: "Análise de Criativo dourado",
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
    const second = screen.getByRole("group", {
      name: "Análise de Segundo criativo",
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

  it("com o menu de opções fora, os detalhes continuam a um clique no botão do criativo", () => {
    render(<PlacementPerformance creatives={[creative()]} />);
    expect(
      screen.queryByRole("button", { name: "Mais opções de Criativo dourado" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver detalhes do criativo" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Detalhes de Criativo dourado" }),
    ).toBeTruthy();
  });
});
