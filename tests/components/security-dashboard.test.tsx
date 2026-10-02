// @vitest-environment jsdom
import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecurityDashboard } from "@/features/security-center/security-dashboard";
import { unknownHeaderChecks } from "@/features/security-center/checks";
import type {
  SecurityCheck,
  SecuritySnapshot,
} from "@/features/security-center/model";

const CHECKED_AT = "2026-10-02T15:00:00.000Z";
const HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
};

function check(overrides: Partial<SecurityCheck> = {}): SecurityCheck {
  return {
    id: "auth-production",
    title: "Login obrigatório",
    description: "O painel exige autenticação.",
    detail: "Autenticação confirmada.",
    status: "active",
    source: "live",
    category: "application",
    checkedAt: CHECKED_AT,
    ...overrides,
  };
}

function snapshot(checks = [check()]): SecuritySnapshot {
  return { version: "security-v1", checkedAt: CHECKED_AT, checks };
}

function response(
  value: SecuritySnapshot,
  headers: HeadersInit = HEADERS,
): Response {
  return {
    ok: true,
    headers: new Headers(headers),
    json: async () => value,
  } as Response;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function status(container: HTMLElement, id = "auth-production") {
  return container
    .querySelector(`[data-check-id="${id}"]`)
    ?.getAttribute("data-status");
}

function visibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(CHECKED_AT));
  visibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("central de segurança e privacidade", () => {
  it("perde os verdes automáticos quando a consulta falha e preserva a revisão manual datada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret-database-host")),
    );
    const manual = check({
      id: "github-private",
      title: "Código privado",
      source: "audit",
      category: "github",
      checkedAt: "2026-10-02",
    });
    const { container } = render(
      <SecurityDashboard initialSnapshot={snapshot([check(), manual])} />,
    );
    await flush();

    expect(status(container)).toBe("unknown");
    expect(status(container, "github-private")).toBe("active");
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível confirmar",
    );
    expect(screen.getByText("Revisada · 02/10/2026")).toBeTruthy();
    expect(container.textContent).not.toContain("secret-database-host");
  });

  it("usa os cabeçalhos recebidos de verdade e marca proteção ausente como atenção", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(snapshot(), {})));
    const { container } = render(
      <SecurityDashboard initialSnapshot={snapshot()} />,
    );
    await flush();

    expect(status(container, "headers-cache")).toBe("warning");
    expect(status(container, "headers-robots")).toBe("warning");
    expect(status(container, "headers-frame")).toBe("warning");
    expect(status(container, "headers-referrer")).toBe("warning");
    expect(status(container, "headers-powered-by")).toBe("active");
    expect(fetch).toHaveBeenCalledWith(
      "/api/painel/seguranca",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("não sobrepõe consultas e pausa a verificação até ser retomada", async () => {
    let resolve: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(response(snapshot()));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <SecurityDashboard initialSnapshot={snapshot()} />,
    );

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      visibility("visible");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Pausar verificação automática" }),
    );
    resolve?.(response(snapshot()));
    await flush();
    expect(status(container)).toBe("unknown");
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Retomar verificação automática" }),
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não consulta em segundo plano e confere ao voltar à aba", async () => {
    visibility("hidden");
    const fetchMock = vi.fn().mockResolvedValue(response(snapshot()));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <SecurityDashboard initialSnapshot={snapshot()} />,
    );
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(status(container)).toBe("unknown");

    await act(async () => {
      visibility("visible");
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      visibility("hidden");
      vi.advanceTimersByTime(180_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(status(container)).toBe("unknown");
  });

  it("vence a revisão manual depois de sete dias e não confunde um aviso com revisão vencida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const old = check({
      id: "old-audit",
      title: "Revisão antiga",
      source: "audit",
      category: "github",
      checkedAt: "2026-09-20",
    });
    const warning = check({
      id: "existing-warning",
      title: "Aviso já conhecido",
      source: "audit",
      category: "github",
      status: "warning",
      checkedAt: "2026-10-02",
    });
    const { container } = render(
      <SecurityDashboard initialSnapshot={snapshot([old, warning])} />,
    );
    await flush();
    expect(status(container, "old-audit")).toBe("warning");
    expect(screen.getByText("Revisão vencida · 20/09/2026")).toBeTruthy();
    expect(screen.getByText("Revisada · 02/10/2026")).toBeTruthy();
  });

  it("registra mudança de estado, mas não cria alerta só porque a data mudou", async () => {
    const newer = {
      ...snapshot(),
      checkedAt: "2026-10-02T15:01:00.000Z",
      checks: [check({ checkedAt: "2026-10-02T15:01:00.000Z" })],
    };
    const changed = {
      ...newer,
      checks: [
        check({
          status: "warning",
          detail: "A proteção mudou.",
          checkedAt: "2026-10-02T15:01:00.000Z",
        }),
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(snapshot()))
      .mockResolvedValueOnce(response(newer))
      .mockResolvedValueOnce(response(changed));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SecurityDashboard
        initialSnapshot={snapshot([check(), ...unknownHeaderChecks()])}
      />,
    );
    await flush();
    expect(screen.getByText("Nenhuma mudança observada")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Verificar agora" }));
    await flush();
    expect(screen.getByText("Nenhuma mudança observada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verificar agora" }));
    await flush();
    expect(screen.getByText("Ativa → Atenção")).toBeTruthy();
    expect(screen.queryByText("Nenhuma mudança observada")).toBeNull();
  });

  it("cancela a consulta e o timer ao sair da página", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <SecurityDashboard initialSnapshot={snapshot()} />,
    );
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
