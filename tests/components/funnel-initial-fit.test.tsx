import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunnelBoard } from "@/features/funnel/funnel-board";
import { criarCofreFunil } from "@/features/funnel/funil-store";
import type { FunnelData } from "@/features/funnel/funnel-model";

vi.mock("@/features/funnel/page-publisher", () => ({
  PagePublisher: () => <aside className="pub" />,
}));

let width = 1000;
let height = 625;
beforeEach(() => {
  window.localStorage.clear();
  width = 1000;
  height = 625;
  vi.stubGlobal("ResizeObserver", undefined);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const w = this.classList.contains("funnel")
        ? width
        : this.classList.contains("pub")
          ? 420
          : 0;
      const h = this.classList.contains("funnel") ? height : 0;
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: w,
        bottom: h,
        width: w,
        height: h,
        toJSON: () => ({}),
      };
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return width > 0 && this.classList.contains("funnel__node") ? 280 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return height > 0 && this.classList.contains("funnel__node") ? 300 : 0;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(): FunnelData {
  return {
    id: "initial-fit",
    nome: "Funil largo",
    projeto: "Loja",
    edges: [],
    nodes: [
      { id: "first", type: "sales", title: "Oferta", x: 0, y: 0 },
      { id: "last", type: "thanks", title: "Obrigado", x: 2500, y: 200 },
    ],
  };
}
function mount(focoTipo?: "sales", data = fixture()) {
  return render(
    <FunnelBoard
      storageId="fit-user"
      cofre={criarCofreFunil("fit-user")}
      inicial={data}
      onSalvar={vi.fn()}
      focoTipo={focoTipo}
    />,
  );
}
function camera(container: HTMLElement) {
  const transform =
    container.querySelector<HTMLElement>(".funnel__world")!.style.transform;
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(
    transform,
  )!;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    k: Number(match[3]),
    transform,
  };
}

describe("initial measured funnel framing", () => {
  it("fits all measured cards into a positive viewport without clicking Enquadrar", async () => {
    const view = mount();
    await waitFor(() => expect(camera(view.container).k).toBeLessThan(0.8));
    const vp = camera(view.container);
    for (const node of fixture().nodes) {
      expect(vp.x + node.x * vp.k).toBeGreaterThanOrEqual(68);
      expect(vp.x + (node.x + 280) * vp.k).toBeLessThanOrEqual(width);
      expect(vp.y + node.y * vp.k).toBeGreaterThanOrEqual(0);
      expect(vp.y + (node.y + 300) * vp.k).toBeLessThanOrEqual(height);
    }
  });

  it("preserves a user's zoom after resize and unrelated rerenders", async () => {
    const view = mount();
    await waitFor(() => expect(camera(view.container).k).toBeLessThan(0.8));
    fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
    const chosen = camera(view.container).transform;
    width = 850;
    height = 500;
    act(() => window.dispatchEvent(new Event("resize")));
    fireEvent.click(screen.getByRole("button", { name: "Travar quadro" }));
    expect(camera(view.container).transform).toBe(chosen);
  });

  it("waits for actual canvas dimensions instead of consuming the initial fit at zero size", async () => {
    width = 0;
    height = 0;
    const view = mount();
    expect(camera(view.container).k).toBe(0.8);
    width = 1000;
    height = 625;
    act(() => window.dispatchEvent(new Event("resize")));
    await waitFor(() => expect(camera(view.container).k).toBeLessThan(0.8));
  });

  it("does not replace an explicit focused-page camera with whole-funnel framing", () => {
    const view = mount("sales");
    expect(
      view.container
        .querySelector('.funnel__node[data-in="first"]')
        ?.getAttribute("data-aberto"),
    ).toBe("true");
    expect(camera(view.container).k).toBeGreaterThan(0.5);
    width = 850;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(camera(view.container).k).toBeGreaterThan(0.5);
  });

  it("frames more than 200 nodes even when the distant card has no DOM measurement, then retains virtualization after manual zoom", async () => {
    const data = fixture();
    data.nodes = Array.from({ length: 200 }, (_, index) => ({
      id: `near-${index}`,
      type: "sales" as const,
      title: `Página ${index}`,
      x: (index % 10) * 50,
      y: Math.floor(index / 10) * 20,
    }));
    data.nodes.push({
      id: "far",
      type: "thanks",
      title: "Distante",
      x: 2500,
      y: 200,
    });
    // The first hidden render measures zero; the revealed viewport excludes
    // the distant node before initial framing has happened.
    width = 0;
    height = 0;
    const view = mount(undefined, data);
    expect(camera(view.container).k).toBe(0.8);
    width = 1000;
    height = 625;
    act(() => window.dispatchEvent(new Event("resize")));
    await waitFor(() => expect(camera(view.container).k).toBeLessThan(0.8));
    const fitted = camera(view.container);
    expect(fitted.x + 2500 * fitted.k).toBeGreaterThanOrEqual(68);
    expect(fitted.x + (2500 + 280) * fitted.k).toBeLessThanOrEqual(width);
    expect(fitted.y + (200 + 300) * fitted.k).toBeLessThanOrEqual(height);
    for (let index = 0; index < 8; index++)
      fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
    const chosen = camera(view.container).transform;
    expect(
      view.container.querySelector('.funnel__node[data-in="far"]'),
    ).toBeNull();
    width = 900;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(camera(view.container).transform).toBe(chosen);
  });
});
