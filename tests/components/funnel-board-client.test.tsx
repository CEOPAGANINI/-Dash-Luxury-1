import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FunnelBoardClient } from "@/features/funnel/funnel-board-client";
import { FUNIL_DEMO } from "@/features/funnel/funnel-demo";
import type { FunnelData } from "@/features/funnel/funnel-model";
import {
  criarCofreFunil,
  funnelStorageKey,
} from "@/features/funnel/funil-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/funnel/funnel-board", () => ({
  FunnelBoard: ({
    inicial,
    storageId,
    onAbrir,
    onSalvar,
  }: {
    inicial: FunnelData;
    storageId: string;
    onAbrir: (data: FunnelData) => void;
    onSalvar: (data: FunnelData) => void;
  }) => (
    <div>
      <div data-testid="account">{storageId}</div>
      <div data-testid="funnel-name">{inicial.nome}</div>
      <button
        onClick={() =>
          onAbrir({ ...inicial, id: "another", nome: "Aberto sem salvar" })
        }
      >
        Abrir outro
      </button>
      <button onClick={() => onSalvar(inicial)}>Salvar quadro</button>
    </div>
  ),
}));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FunnelBoardClient account boundary", () => {
  it("resets mounted state on account changes and never shows the previous account draft", () => {
    criarCofreFunil("a").salvarFunil(FUNIL_DEMO, "Conta A");
    criarCofreFunil("b").salvarFunil(FUNIL_DEMO, "Conta B");
    const view = render(<FunnelBoardClient storageId="a" />);
    expect(screen.getByTestId("funnel-name").textContent).toBe("Conta A");
    view.rerender(<FunnelBoardClient storageId="b" />);
    expect(screen.getByTestId("account").textContent).toBe("b");
    expect(screen.getByTestId("funnel-name").textContent).toBe("Conta B");
  });

  it("opens without autosaving, then saves only after explicit action", () => {
    render(<FunnelBoardClient storageId="a" />);
    expect(window.localStorage.getItem(funnelStorageKey("a"))).toBeNull();
    fireEvent.click(screen.getByText("Abrir outro"));
    expect(screen.getByTestId("funnel-name").textContent).toBe(
      "Aberto sem salvar",
    );
    expect(window.localStorage.getItem(funnelStorageKey("a"))).toBeNull();
    fireEvent.click(screen.getByText("Salvar quadro"));
    expect(criarCofreFunil("a").lerRascunho()?.nome).toBe("Aberto sem salvar");
  });

  it("warns about corrupt storage without replacing the saved value", () => {
    window.localStorage.setItem(funnelStorageKey("a"), "{bad");
    render(<FunnelBoardClient storageId="a" />);
    expect(screen.getByRole("status").textContent).toContain("corrompido");
    expect(window.localStorage.getItem(funnelStorageKey("a"))).toBe("{bad");
  });

  it("does not load old global records and requires an ownership confirmation to copy them", () => {
    window.localStorage.setItem(
      "funnel-board:demo",
      JSON.stringify({ ...FUNIL_DEMO, nome: "Dado sem dono" }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FunnelBoardClient storageId="a" />);
    expect(screen.getByTestId("funnel-name").textContent).not.toBe(
      "Dado sem dono",
    );
    fireEvent.click(screen.getByText("Importar meus dados antigos"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(criarCofreFunil("a").listarFunis()).toEqual([]);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Importar meus dados antigos"));
    expect(criarCofreFunil("a").listarFunis()[0].nome).toBe("Dado sem dono");
    expect(window.localStorage.getItem("funnel-board:demo")).not.toBeNull();
  });

  it("warns instead of silently reloading when another tab changes the draft", () => {
    render(<FunnelBoardClient storageId="a" />);
    fireEvent.click(screen.getByText("Abrir outro"));
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: funnelStorageKey("a"),
        storageArea: window.localStorage,
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("Outra aba");
    expect(screen.getByTestId("funnel-name").textContent).toBe(
      "Aberto sem salvar",
    );
  });
});
