import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { INTERVALO_AO_VIVO_MS, INTERVALO_META_MS, QuadroAoVivo } from "@/features/ads/class-board-live";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignRow, CampaignTree } from "@/features/ads/types";

const { refresh, router, syncMetaAction } = vi.hoisted(() => {
  const refresh = vi.fn();
  // Como no Next, o roteador é o mesmo objeto em todas as renderizações.
  return { refresh, router: { refresh }, syncMetaAction: vi.fn(async () => ({ ok: true, mensagem: "ok" })) };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/ads/actions", () => ({
  syncMetaAction,
  setCampaignClassAction: vi.fn(),
  updateAdEntityAction: vi.fn(),
}));

afterEach(cleanup);

const nomes = () => [...screen.getByRole("region", { name: "Quadro de classes" }).querySelectorAll(":scope > section")].map((s) => s.getAttribute("aria-label"));

function linha(base: CampaignRow, id: string, spend: number, revenue: number, classe: CampaignRow["campaignClass"]): CampaignRow {
  return { ...base, id, name: id, campaignClass: classe, source: "manual", metrics: { ...base.metrics, spendCents: spend, revenueCents: revenue } };
}

describe("o quadro ao vivo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    syncMetaAction.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it("com a aba visível recarrega os números a cada minuto; sem Meta conectado, não chama o Meta", async () => {
    render(<QuadroAoVivo metaConectado={false} />);
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_AO_VIVO_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(syncMetaAction).not.toHaveBeenCalled();
    expect(screen.getByText(/^Números atualizados às/).className).toContain("sr-only");
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_AO_VIVO_MS * 2); });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("com o Meta conectado puxa do Meta a cada cinco minutos, não a cada volta; aba escondida não atualiza", async () => {
    render(<QuadroAoVivo metaConectado />);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_AO_VIVO_MS * 4); });
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(syncMetaAction).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_AO_VIVO_MS); });
    expect(syncMetaAction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(5);
    // A sincronização vem antes da recarga: os números novos já entram nessa volta.
    expect(syncMetaAction.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[4]);
    expect(INTERVALO_META_MS).toBe(5 * INTERVALO_AO_VIVO_MS);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_AO_VIVO_MS * 3); });
    expect(refresh).toHaveBeenCalledTimes(5);
    // Ao voltar para a aba, atualiza na hora.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(refresh).toHaveBeenCalledTimes(6);
  });

  it("o quadro com banco liga o ao vivo; na demonstração não", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    const demo: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };
    const { unmount } = render(<ClassBoard tree={demo} regras={GUARDRAILS_PADRAO} network="meta" />);
    expect(document.querySelector("[data-ao-vivo]")).toBeNull();
    unmount();
    render(<ClassBoard tree={{ ...demo, modo: "banco", campanhas: [] }} regras={GUARDRAILS_PADRAO} network="meta" />);
    expect(document.querySelector("[data-ao-vivo]")?.getAttribute("data-ao-vivo")).toBe("esperando");
    vi.unstubAllGlobals();
  });

  it("quando os números novos chegam, os blocos trocam de lugar pelo ROAS, deslizando", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    const animate = vi.fn(() => ({ cancel() {}, finished: Promise.resolve() }));
    const original = HTMLElement.prototype.animate;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    let chamada = 0;
    rect.mockImplementation(() => ({ left: (chamada++ % 15) * 10, top: chamada * 3, width: 100, height: 100, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect);
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    try {
      const base = demoCampaignRows().find((c) => c.network === "meta")!;
      const antes: CampaignTree = {
        modo: "banco", metaConectado: true, ultimaSync: null,
        campanhas: [linha(base, "a", 100_00, 300_00, "scale"), linha(base, "b", 100_00, 200_00, "explosive")],
      };
      const { rerender } = render(<ClassBoard tree={antes} regras={GUARDRAILS_PADRAO} network="meta" />);
      expect(nomes().slice(0, 2)).toEqual(["Escala", "Explosiva"]);
      expect(animate).not.toHaveBeenCalled();
      // A sincronização trouxe números novos: Explosiva passou Escala.
      const depois: CampaignTree = {
        ...antes,
        campanhas: [linha(base, "a", 100_00, 300_00, "scale"), linha(base, "b", 100_00, 900_00, "explosive")],
      };
      rerender(<ClassBoard tree={depois} regras={GUARDRAILS_PADRAO} network="meta" />);
      expect(nomes().slice(0, 2)).toEqual(["Explosiva", "Escala"]);
      expect(animate).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.animate = original;
      rect.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
