import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_FLOW,
  parseFlow,
  type LandingFlow,
} from "@/features/landing-editor/flow-model";
import {
  landingFlowStorageKey,
  useLandingFlowDraft,
} from "@/features/landing-editor/flow-store";

const draft = (name = "Rascunho editado"): LandingFlow => ({
  ...parseFlow(INITIAL_FLOW)!,
  name,
});
const key = landingFlowStorageKey("user-a");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("landing flow local persistence", () => {
  it("namespaces drafts by user without ambiguous separators", () => {
    expect(landingFlowStorageKey("user-a")).not.toBe(
      landingFlowStorageKey("user-b"),
    );
    expect(landingFlowStorageKey("a:b")).not.toBe(
      landingFlowStorageKey("a%3Ab"),
    );
    expect(landingFlowStorageKey("a/b")).toContain("a%2Fb");
    expect(() => landingFlowStorageKey("")).toThrow();
    expect(() => landingFlowStorageKey(" ")).toThrow();
  });

  it("renders an unready server snapshot without touching browser storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    let current: ReturnType<typeof useLandingFlowDraft> | undefined;
    function ServerView() {
      current = useLandingFlowDraft("user-a");
      return <span>{String(current.ready)}</span>;
    }
    expect(renderToString(<ServerView />)).toContain("false");
    expect(get).not.toHaveBeenCalled();
    expect(current!.save(draft())).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("loads the initial draft without automatically saving it", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    expect(result.current.ready).toBe(true);
    expect(result.current.flow).toEqual(INITIAL_FLOW);
    expect(result.current.notice).toBe("");
    expect(set).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("loads an existing valid draft without rewriting it", () => {
    const saved = draft("Nome salvo");
    localStorage.setItem(key, JSON.stringify(saved));
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    expect(result.current.flow).toEqual(saved);
    expect(set).not.toHaveBeenCalled();
  });

  it("only explicit Save persists validated edits and reload restores them", () => {
    const first = renderHook(() => useLandingFlowDraft("user-a"));
    const edited = draft();
    expect(localStorage.getItem(key)).toBeNull();
    let saved = false;
    act(() => {
      saved = first.result.current.save(edited);
    });
    expect(saved).toBe(true);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(edited);
    expect(first.result.current.flow).toEqual(edited);
    expect(first.result.current.flow).not.toBe(edited);
    expect(first.result.current.notice).toBe("");
    first.unmount();
    const second = renderHook(() => useLandingFlowDraft("user-a"));
    expect(second.result.current.flow).toEqual(edited);
  });

  it("loads and saves separately when the user identifier changes", () => {
    const otherKey = landingFlowStorageKey("user-b");
    localStorage.setItem(key, JSON.stringify(draft("Usuário A")));
    localStorage.setItem(otherKey, JSON.stringify(draft("Usuário B")));
    const { result, rerender } = renderHook(
      ({ id }) => useLandingFlowDraft(id),
      { initialProps: { id: "user-a" } },
    );
    expect(result.current.flow.name).toBe("Usuário A");
    rerender({ id: "user-b" });
    expect(result.current.flow.name).toBe("Usuário B");
    act(() => {
      expect(result.current.save(draft("B atualizado"))).toBe(true);
    });
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe("Usuário A");
    expect(JSON.parse(localStorage.getItem(otherKey)!).name).toBe(
      "B atualizado",
    );
  });

  it.each([
    "broken JSON",
    JSON.stringify({ ...INITIAL_FLOW, version: 2 }),
    JSON.stringify({
      ...INITIAL_FLOW,
      connections: [
        { id: "bad", source: "missing", target: "page-landing", label: "" },
      ],
    }),
  ])("preserves corrupt or incompatible draft data %#", (raw) => {
    localStorage.setItem(key, raw);
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    expect(result.current.ready).toBe(true);
    expect(result.current.notice).toMatch(/corrompido|incompatível/);
    expect(result.current.flow).toEqual(INITIAL_FLOW);
    act(() => {
      expect(result.current.save(draft())).toBe(false);
    });
    expect(localStorage.getItem(key)).toBe(raw);
    expect(result.current.notice).toContain("preservados");
  });

  it("does not overwrite a valid draft with invalid editor data", () => {
    const saved = JSON.stringify(draft("Original"));
    localStorage.setItem(key, saved);
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    const invalid = draft();
    invalid.pages[0].url = "javascript:alert(1)";
    act(() => {
      expect(result.current.save(invalid)).toBe(false);
    });
    expect(result.current.notice).toContain("verifique");
    expect(result.current.flow.name).toBe("Original");
    expect(localStorage.getItem(key)).toBe(saved);
  });

  it("reports storage read failures and never claims a save succeeded", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    expect(result.current.ready).toBe(true);
    expect(result.current.notice).toContain("indisponível");
    act(() => {
      expect(result.current.save(draft())).toBe(false);
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps the previous draft and reports quota failures", () => {
    const saved = JSON.stringify(draft("Anterior"));
    localStorage.setItem(key, saved);
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    act(() => {
      expect(result.current.save(draft())).toBe(false);
    });
    expect(result.current.notice).toContain("não foram salvas");
    expect(result.current.flow.name).toBe("Anterior");
    expect(localStorage.getItem(key)).toBe(saved);
  });

  it("clamps positions only on explicit Save", () => {
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    const edited = draft();
    edited.pages[0].x = -99;
    edited.pages[0].y = 9000;
    act(() => {
      expect(result.current.save(edited)).toBe(true);
    });
    expect(JSON.parse(localStorage.getItem(key)!).pages[0]).toMatchObject({
      x: 0,
      y: 2000,
    });
    expect(edited.pages[0]).toMatchObject({ x: -99, y: 9000 });
  });
});

describe("landing flow concurrent edits", () => {
  it("warns about cross-tab changes without replacing the editor baseline", () => {
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    const original = result.current.flow;
    const external = JSON.stringify(draft("Outra aba"));
    act(() => {
      localStorage.setItem(key, external);
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: external }),
      );
    });
    expect(result.current.flow).toBe(original);
    expect(result.current.notice).toContain("outra aba");
    act(() => {
      expect(result.current.save(draft("Edição local"))).toBe(false);
    });
    expect(localStorage.getItem(key)).toBe(external);
  });

  it("checks the stored baseline again even if a storage event was missed", () => {
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    const external = JSON.stringify(draft("Outra aba"));
    localStorage.setItem(key, external);
    act(() => {
      expect(result.current.save(draft())).toBe(false);
    });
    expect(result.current.notice).toContain("outra aba");
    expect(localStorage.getItem(key)).toBe(external);
  });

  it("does not react to another user's storage changes", () => {
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    act(() => {
      localStorage.setItem(
        landingFlowStorageKey("user-b"),
        JSON.stringify(draft()),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: landingFlowStorageKey("user-b") }),
      );
    });
    expect(result.current.notice).toBe("");
    act(() => {
      expect(result.current.save(draft())).toBe(true);
    });
  });

  it("detects clear() events without recreating removed data", () => {
    localStorage.setItem(key, JSON.stringify(draft("Anterior")));
    const { result } = renderHook(() => useLandingFlowDraft("user-a"));
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.flow.name).toBe("Anterior");
    expect(result.current.notice).toContain("outra aba");
    act(() => {
      expect(result.current.save(draft())).toBe(false);
    });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("notifies other mounted editors in the same tab without overwriting their work", () => {
    const first = renderHook(() => useLandingFlowDraft("user-a"));
    const second = renderHook(() => useLandingFlowDraft("user-a"));
    const secondOriginal = second.result.current.flow;
    act(() => {
      expect(first.result.current.save(draft("Primeiro editor"))).toBe(true);
    });
    expect(first.result.current.notice).toBe("");
    expect(second.result.current.flow).toBe(secondOriginal);
    expect(second.result.current.notice).toContain("outra aba");
    act(() => {
      expect(second.result.current.save(draft("Segundo editor"))).toBe(false);
    });
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe("Primeiro editor");
  });
});
