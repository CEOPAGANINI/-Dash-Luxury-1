import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSessionMenu } from "@/components/dashboard/page-session-menu";

afterEach(cleanup);

function renderMenu(onSelect = vi.fn()) {
  return render(
    <div className="board-pager">
      <PageSessionMenu
        items={[
          { label: "Calendário de aquisição", short: "Calendário" },
          { label: "Tráfego e público", short: "Tráfego" },
        ]}
        activeIndex={0}
        onSelect={onSelect}
        ariaLabel="Sessões de aquisição"
        title="Aquisição"
      />
      <div className="board-pager-content">Conteúdo da página</div>
    </div>,
  );
}

function trigger() {
  return screen.getByRole("button", {
    name: "Abrir menu de sessões desta página",
  });
}

describe("page session menu", () => {
  it("keeps the retractable menu beside the content in the same layout parent", () => {
    const { container } = renderMenu();
    const menu = container.querySelector(".board-pager-sidebar");
    const content = container.querySelector(".board-pager-content");

    expect(menu?.parentElement).toBe(content?.parentElement);
    expect(menu?.getAttribute("data-open")).toBe("false");
    expect(menu?.hasAttribute("inert")).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    fireEvent.pointerEnter(trigger());
    expect(menu?.getAttribute("data-open")).toBe("true");
    expect(menu?.hasAttribute("inert")).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("selects the session and retracts without leaving focus in hidden content", () => {
    const onSelect = vi.fn();
    const { container } = renderMenu(onSelect);
    fireEvent.focus(trigger());
    const session = screen.getByRole("button", {
      name: "Abrir sessão 2: Tráfego e público",
    });
    session.focus();
    fireEvent.click(session);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector(".board-pager-sidebar")?.hasAttribute("inert"),
    ).toBe(true);
  });

  it("closes on Escape and allows reopening from the edge", () => {
    renderMenu();
    fireEvent.pointerEnter(trigger());
    const session = screen.getByRole("button", {
      name: "Abrir sessão 1: Calendário de aquisição",
    });
    session.focus();
    fireEvent.keyDown(session, { key: "Escape" });
    expect(document.activeElement).toBe(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    fireEvent.pointerEnter(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape while the opening trigger still has keyboard focus", () => {
    const { container } = renderMenu();
    trigger().focus();
    fireEvent.focus(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
    expect(
      container.querySelector(".board-pager-sidebar")?.hasAttribute("inert"),
    ).toBe(true);

    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("scrolls its own list without passing wheel events to page pagination", () => {
    const { container } = renderMenu();
    fireEvent.pointerEnter(trigger());
    const pageWheel = vi.fn();
    window.addEventListener("wheel", pageWheel);

    try {
      fireEvent.wheel(screen.getByRole("navigation"), { deltaY: 300 });
      expect(pageWheel).not.toHaveBeenCalled();
      expect(trigger().getAttribute("aria-expanded")).toBe("true");

      fireEvent.pointerLeave(container.querySelector(".board-pager-sidebar")!);
      expect(trigger().getAttribute("aria-expanded")).toBe("false");
    } finally {
      window.removeEventListener("wheel", pageWheel);
    }
  });
});
