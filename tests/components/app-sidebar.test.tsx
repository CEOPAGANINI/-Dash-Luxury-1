import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

vi.mock("next/navigation", () => ({ usePathname: () => "/campanhas/meta" }));
vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));

const user = { id: "test", name: "Pessoa Teste", email: "teste@example.com" };

afterEach(cleanup);

describe("left menu without pinned areas", () => {
  it("scrolls brand, search, pages, settings and account in one desktop container", () => {
    const { container } = render(<AppSidebar user={user} unreadCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu lateral" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Sistema" }),
    );

    const scroll = container.querySelector(".dash-sidebar-scroll")!;
    expect(container.querySelectorAll(".dash-sidebar-scroll")).toHaveLength(1);
    expect(scroll.classList.contains("overflow-y-auto")).toBe(true);
    for (const element of [
      screen.getByRole("link", { name: "Dash Luxury" }),
      screen.getByRole("searchbox", { name: "Buscar no painel" }),
      screen.getByRole("navigation", { name: "Navegação principal" }),
      screen.getByRole("link", { name: "Configurações" }),
      screen.getByRole("link", { name: "Ver loja" }),
      screen.getByText("Sistemas saudáveis"),
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    ]) {
      expect(scroll.contains(element)).toBe(true);
    }
    expect(
      scroll.querySelector(".overflow-y-auto, .fixed, .sticky"),
    ).toBeNull();
  });

  it("keeps opening from the edge and closing after navigation", () => {
    render(<AppSidebar user={user} unreadCount={0} />);
    const trigger = screen.getByRole("button", { name: "Abrir menu lateral" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.pointerEnter(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir pasta Meta Ads" }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Por classe" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("also scrolls the entire left drawer on mobile", () => {
    render(<Header user={user} unreadCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: /^Abrir menu$/ }));
    const drawer = screen.getByRole("dialog", { name: "Menu de navegação" });
    expect(drawer.classList.contains("dash-skin")).toBe(true);
    expect(drawer.getAttribute("data-design-system")).toBe("nebula");
    const scroll = drawer.querySelector(".dash-sidebar-scroll")!;
    expect(scroll).not.toBeNull();
    expect(scroll.contains(within(drawer).getByText("Dash Luxury"))).toBe(true);
    expect(scroll.contains(within(drawer).getByRole("searchbox"))).toBe(true);
    expect(scroll.contains(within(drawer).getByRole("navigation"))).toBe(true);
    expect(
      scroll.contains(
        within(drawer).getByRole("button", { name: "Abrir menu da conta" }),
      ),
    ).toBe(true);
    expect(
      scroll.querySelector(".overflow-y-auto, .fixed, .sticky"),
    ).toBeNull();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Abrir pasta Gestão" }),
    );
    expect(within(drawer).getAllByRole("link")).toHaveLength(5);
    expect(
      within(drawer).queryByRole("link", { name: "Configurações" }),
    ).toBeNull();
    expect(
      within(drawer).queryByRole("button", { name: "Abrir pasta Sistema" }),
    ).toBeNull();
    fireEvent.keyDown(
      within(drawer).getByRole("button", { name: "Todas as pastas" }),
      { key: "Escape" },
    );
    expect(
      screen.queryByRole("dialog", { name: "Menu de navegação" }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("button", { name: "Abrir pasta Gestão" }),
    ).toBe(document.activeElement);
  });

  it("keeps an accessible menu trigger in the Nebula header at every viewport", () => {
    const { container } = render(<Header user={user} unreadCount={0} />);
    const topbar = container.querySelector(".nebula-topbar")!;
    expect(topbar).not.toBeNull();
    expect(topbar.classList.contains("lg:hidden")).toBe(false);
    expect(
      within(topbar as HTMLElement).getByRole("button", { name: "Abrir menu" }),
    ).not.toBeNull();
    expect(container.querySelector(".nebula-brand-mark")).not.toBeNull();
  });
});
