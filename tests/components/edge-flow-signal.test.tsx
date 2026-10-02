import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowEdgeSignal } from "@/features/funnel/edge-flow-signal";
import type { FunnelNode } from "@/features/funnel/funnel-model";
import { usePageZip } from "@/features/funnel/use-page-zip";

vi.mock("@/features/funnel/use-page-zip", () => ({ usePageZip: vi.fn() }));

const source: FunnelNode = {
  id: "router",
  type: "redirect",
  title: "Roteador",
  x: 0,
  y: 0,
  redir: { regras: [] },
};
const target: FunnelNode = {
  id: "thanks",
  type: "thanks",
  title: "Obrigado",
  url: "/obrigado",
  x: 300,
  y: 0,
  pagina: {
    caminho: "/obrigado",
    meta: {},
    saidas: {},
    zip: {
      nome: "pagina.zip",
      tamanho: 10,
      ok: true,
      sourceFunnelId: "original-funnel",
    },
  },
};
const props = {
  source: source.id,
  target: target.id,
  nodes: [source, target],
  edges: [{ id: "default", source: source.id, target: target.id }],
  storageId: "workspace",
  funnelId: "current-funnel",
  path: "M 0 0 C 100 0 200 50 300 50",
  tip: { x: 300, y: 50 },
};

let reducedMotion = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  reducedMotion = false;
  listeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: (_event: string, callback: () => void) =>
        listeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) =>
        listeners.delete(callback),
    })),
  );
  vi.mocked(usePageZip).mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mount(enabled = true) {
  return render(
    <svg>
      <FlowEdgeSignal {...props} enabled={enabled} />
    </svg>,
  );
}

describe("wire configuration light", () => {
  it("turns green when the prepared ZIP is available and returns to red when it is forgotten", () => {
    vi.mocked(usePageZip).mockImplementation(({ nodeId }) =>
      nodeId === target.id
        ? {
            file: new File(["prepared ZIP bytes"], "pagina.zip"),
            metadata: { nome: "pagina.zip", tamanho: 18, ok: true },
            fileCount: 1,
          }
        : null,
    );
    const { container, rerender } = mount();
    expect(
      container
        .querySelector(".funnel__edge-signal")
        ?.getAttribute("data-ready"),
    ).toBe("true");
    vi.mocked(usePageZip).mockReturnValue(null);
    rerender(
      <svg>
        <FlowEdgeSignal {...props} />
      </svg>,
    );
    expect(
      container
        .querySelector(".funnel__edge-signal")
        ?.getAttribute("data-ready"),
    ).toBe("false");
  });

  it("animates along the actual curve and keeps an incomplete destination red", () => {
    const { container } = mount();
    expect(
      container
        .querySelector(".funnel__edge-signal")
        ?.getAttribute("data-ready"),
    ).toBe("false");
    expect(container.querySelector("animateMotion")?.getAttribute("path")).toBe(
      props.path,
    );
    expect(
      container
        .querySelector(".funnel__edge-signal-tip")
        ?.getAttribute("transform"),
    ).toBe("translate(300 50)");
    expect(vi.mocked(usePageZip)).toHaveBeenCalledWith({
      storageId: "workspace",
      funnelId: "original-funnel",
      nodeId: "thanks",
    });
  });

  it("removes both the moving and static lights when flow is disabled", () => {
    const { container } = mount(false);
    expect(
      container
        .querySelector(".funnel__edge-signal")
        ?.getAttribute("data-enabled"),
    ).toBe("false");
    expect(container.querySelector("animateMotion")).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
  });

  it("responds to reduced motion immediately, retaining only the static configuration light", () => {
    const { container } = mount();
    expect(container.querySelector("animateMotion")).not.toBeNull();
    act(() => {
      reducedMotion = true;
      for (const callback of listeners) callback();
    });
    expect(container.querySelector("animateMotion")).toBeNull();
    expect(container.querySelector(".funnel__edge-signal-tip")).not.toBeNull();
    expect(
      container
        .querySelector(".funnel__edge-signal")
        ?.getAttribute("data-reduced-motion"),
    ).toBe("true");
  });
});
