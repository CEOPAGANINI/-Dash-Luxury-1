import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AcquisitionDemoDiagnostics } from "@/features/unified-dashboard/acquisition-demo-diagnostics";

afterEach(cleanup);

describe("isolated acquisition diagnostic examples", () => {
  it.each([
    ["funnel", "Funil do tráfego"],
    ["audience", "Público e demográficos"],
    ["creatives", "Creative Intelligence"],
  ] as const)(
    "renders only the %s page and explicitly labels the independent demo",
    (section, title) => {
      render(
        <AcquisitionDemoDiagnostics section={section} year={2026} month={8} />,
      );
      expect(screen.getByRole("region", { name: title })).toBeTruthy();
      expect(screen.getByText("Dados de exemplo")).toBeTruthy();
      expect(
        screen.getByText(
          /Cenário fictício independente dos totais do calendário/,
        ),
      ).toBeTruthy();
      expect(screen.getByText(/setembro de 2026/)).toBeTruthy();
      expect(document.querySelectorAll("[data-demo-section]")).toHaveLength(1);
      expect(screen.queryByRole("link")).toBeNull();
      for (const other of [
        "Funil do tráfego",
        "Público e demográficos",
        "Creative Intelligence",
      ]) {
        if (other !== title)
          expect(screen.queryByRole("heading", { name: other })).toBeNull();
      }
    },
  );

  it("calculates stage conversions and bar widths from the same filtered funnel", () => {
    render(<AcquisitionDemoDiagnostics section="funnel" networkId="meta" />);
    const stages = screen.getByRole("list", {
      name: "Etapas do funil de exemplo",
    });
    const rows = within(stages).getAllByRole("listitem");
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain("180.000");
    expect(rows[0].textContent).toContain("—");
    expect(rows[1].textContent).toContain("5.400");
    expect(rows[1].textContent).toContain("3,00%");
    expect(rows[2].textContent).toContain("88,89%");
    expect(
      rows[1].querySelector<HTMLSpanElement>('[role="img"] > span')?.style
        .width,
    ).toBe("3%");
    expect(screen.getByText(/Meta Ads · período ilustrativo/)).toBeTruthy();
  });

  it("keeps demographic counts and new/recurring customers consistent", () => {
    render(<AcquisitionDemoDiagnostics section="audience" networkId="meta" />);
    expect(
      screen.getByRole("img", {
        name: "196 novos e 84 recorrentes; 280 clientes no total.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "18–24 anos: 42 clientes, 15,0% da amostra.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "25–34 anos: 84 clientes, 30,0% da amostra.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("70,0%")).toBeTruthy();
  });

  it("presents three fictional campaigns with correct total ROAS, then filters by channel", () => {
    const { rerender } = render(
      <AcquisitionDemoDiagnostics section="creatives" />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("5,70x")).toBeTruthy();
    const meta = screen.getByRole("article", { name: "Exemplo · Descoberta" });
    expect(within(meta).getByText("6,00x")).toBeTruthy();
    expect(within(meta).getByText(/R\$\s13,13/)).toBeTruthy();
    rerender(
      <AcquisitionDemoDiagnostics section="creatives" networkId="google" />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("article", { name: "Exemplo · Intenção" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("article", { name: "Exemplo · Descoberta" }),
    ).toBeNull();
    expect(screen.getAllByText("5,40x")).toHaveLength(2);
  });
});
