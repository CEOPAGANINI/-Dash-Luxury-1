import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServidorDTO } from "@/features/vps/modelo";
import { AvisoDeAtualizacao } from "@/features/vps/servidores-painel";
import {
  INTERVALO_LENTO_MS,
  INTERVALO_RAPIDO_MS,
  useEstadoVps,
} from "@/features/vps/use-estado-vps";
import type { EstadoDaTela } from "@/features/vps/vps-cliente";

/*
  O polling das telas: 15 s parado, 5 s com algo andando, nada com a aba
  oculta. Falha mantém os dados e avisa com a hora; sessão vencida para
  de perguntar e pede login.
*/

vi.mock("@/features/vps/actions", () => ({ reentrarAction: vi.fn() }));

const AGORA = "2026-09-23T21:12:00.000Z";

function servidor(nome: string, extra: Partial<ServidorDTO> = {}): ServidorDTO {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nome,
    estado: "ativo",
    sinal: { tipo: "online", ultimoPulsoEm: AGORA },
    instalacao: null,
    registro: null,
    ipDoDns: null,
    ipInformado: null,
    versaoAgente: null,
    travas: { pausado: false, somenteLeitura: false },
    geracaoChave: 1,
    relogio: null,
    nginx: null,
    leitura: null,
    erroLeitura: null,
    totalSites: 0,
    ...extra,
  };
}

function estado(extra: Partial<EstadoDaTela> = {}): EstadoDaTela {
  return {
    agora: AGORA,
    servidores: [servidor("Primeiro")],
    sites: [],
    checkouts: [],
    origens: ["https://painel.com.br"],
    appUrl: "https://painel.com.br",
    comandoDesinstalar: { manterSites: "a", removerSites: "b" },
    podeAlterar: true,
    pendencias: [],
    ...extra,
  };
}

function Sonda({
  inicial,
  filtro,
}: {
  inicial: EstadoDaTela;
  filtro?: { servidorId?: string; siteId?: string };
}) {
  const { estado: atual, falha, atualizar } = useEstadoVps(inicial, filtro);
  return (
    <div>
      <p data-testid="nomes">{atual.servidores.map((s) => s.nome).join(",")}</p>
      <AvisoDeAtualizacao falha={falha} destino="/servidor" />
      <button type="button" onClick={atualizar}>
        <span>Atualizar</span>
      </button>
    </div>
  );
}

function ok(corpo: EstadoDaTela) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    json: () => Promise.resolve({ ok: true, ...corpo }),
  } as unknown as Response;
}

let oculto = false;

beforeEach(() => {
  vi.useFakeTimers();
  oculto = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => oculto,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useEstadoVps", () => {
  it("parado, pergunta a cada 15 s e troca os dados", async () => {
    const fetch = vi.fn().mockResolvedValue(
      ok(
        estado({
          agora: "2026-09-23T21:12:15.000Z",
          servidores: [servidor("Novo")],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={estado()} />);
    await passar(INTERVALO_LENTO_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await passar(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/painel/vps/estado");
    expect(screen.getByTestId("nomes").textContent).toBe("Novo");
    await passar(INTERVALO_LENTO_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("com agente aguardando, pergunta a cada 5 s", async () => {
    const aguardando = estado({
      servidores: [servidor("A", { estado: "aguardando_agente" })],
    });
    const fetch = vi.fn().mockResolvedValue(ok(aguardando));
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={aguardando} filtro={{ servidorId: "abc" }} />);
    await passar(INTERVALO_RAPIDO_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/painel/vps/estado?servidor=abc");
    await passar(INTERVALO_RAPIDO_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falha mantém os dados MAIS NOVOS e avisa com a hora da última atualização", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          ok(
            estado({
              agora: "2026-09-23T21:14:00.000Z",
              servidores: [servidor("Atualizado")],
            }),
          ),
        )
        .mockRejectedValue(new TypeError("offline")),
    );
    render(<Sonda inicial={estado()} />);
    await passar(INTERVALO_LENTO_MS);
    expect(screen.getByTestId("nomes").textContent).toBe("Atualizado");
    await passar(INTERVALO_LENTO_MS);
    expect(screen.getByTestId("nomes").textContent).toBe("Atualizado");
    expect(screen.getByRole("alert").textContent).toBe(
      "Não foi possível atualizar (última atualização 18:14). Tentando de novo.",
    );
  });

  it("depois da falha tenta de novo e, dando certo, o aviso some", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        redirected: false,
        json: () => Promise.reject(new SyntaxError("<html>")),
      })
      .mockResolvedValueOnce(ok(estado({ servidores: [servidor("Voltou")] })));
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={estado()} />);
    await passar(INTERVALO_LENTO_MS);
    expect(screen.getByRole("alert")).toBeTruthy();
    await passar(INTERVALO_LENTO_MS);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("nomes").textContent).toBe("Voltou");
  });

  it("sessão vencida (redirect para o login) pede login e para de perguntar", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: true,
      json: () => Promise.reject(new SyntaxError("<html>")),
    });
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={estado()} />);
    await passar(INTERVALO_LENTO_MS);
    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toMatch(/^Sua sessão expirou\. Entre de novo\./);
    expect(
      screen.getByRole("link", { name: "Entrar" }).getAttribute("href"),
    ).toBe("/login?redirect=%2Fservidor");
    await passar(INTERVALO_LENTO_MS * 4);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aba oculta não pergunta; ao voltar, pergunta na hora", async () => {
    const fetch = vi.fn().mockResolvedValue(ok(estado()));
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={estado()} />);
    oculto = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await passar(INTERVALO_LENTO_MS * 3);
    expect(fetch).not.toHaveBeenCalled();
    oculto = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await passar(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("atualizar() (depois de uma ação) pergunta sem esperar o intervalo", async () => {
    const fetch = vi.fn().mockResolvedValue(ok(estado()));
    vi.stubGlobal("fetch", fetch);
    render(<Sonda inicial={estado()} />);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await passar(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recusa do painel (ex.: sem permissão) aparece junto do aviso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        redirected: false,
        json: () =>
          Promise.resolve({
            ok: false,
            codigo: "sem_permissao",
            error: "Sua conta não está em VPS_DONOS.",
          }),
      }),
    );
    render(<Sonda inicial={estado()} />);
    await passar(INTERVALO_LENTO_MS);
    expect(screen.getByRole("alert").textContent).toBe(
      "Não foi possível atualizar (última atualização 18:12). Tentando de novo. Sua conta não está em VPS_DONOS.",
    );
  });
});
