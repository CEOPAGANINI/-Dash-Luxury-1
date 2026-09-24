import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PainelVps } from "@/features/vps/queries";

import * as PaginaServidores from "@/app/(painel)/servidor/page";
import * as PaginaNovo from "@/app/(painel)/servidor/novo/page";
import * as PaginaServidor from "@/app/(painel)/servidor/[servidorId]/page";
import * as PaginaSites from "@/app/(painel)/servidor/sites/page";
import * as PaginaSite from "@/app/(painel)/servidor/sites/[siteId]/page";
import { FRASE_DO_DEMO } from "@/features/vps/pre-requisitos";

/*
  As cinco páginas (Server Components) com a leitura do painel falsa:
  configuração de segmento, título sem h1, frase do demo em todas e
  notFound para id inválido ou de fora do workspace.
*/

const leitura = vi.hoisted(() => ({ lerPainelVps: vi.fn() }));
vi.mock("@/features/vps/queries", () => leitura);
vi.mock("@/features/vps/actions", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const SRV = "11111111-1111-4111-8111-111111111111";
const SITE = "33333333-3333-4333-8333-333333333333";

type Dados = Extract<PainelVps, { estado: "ok" }>["dados"];

function ok(extra: Partial<Dados> = {}): PainelVps {
  return {
    estado: "ok",
    podeAlterar: true,
    pendencias: [],
    dados: {
      agora: "2026-09-23T21:12:00.000Z",
      servidores: [],
      sites: [],
      checkouts: [],
      origens: ["https://painel.com.br"],
      appUrl: "https://painel.com.br",
      comandoDesinstalar: { manterSites: "a", removerSites: "b" },
      ...extra,
    },
  };
}

const params = <T,>(valor: T) => ({ params: Promise.resolve(valor) });

beforeEach(() => {
  leitura.lerPainelVps.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("configuração das páginas", () => {
  it.each([
    ["/servidor", PaginaServidores],
    ["/servidor/novo", PaginaNovo],
    ["/servidor/[servidorId]", PaginaServidor],
    ["/servidor/sites", PaginaSites],
    ["/servidor/sites/[siteId]", PaginaSite],
  ])("%s: título Servidor, sempre dinâmica, 30 s", (_rota, modulo) => {
    expect(modulo.metadata).toEqual({ title: "Servidor" });
    expect(modulo.dynamic).toBe("force-dynamic");
    expect(modulo.maxDuration).toBe(30);
  });
});

describe("modo demonstração", () => {
  it.each([
    ["/servidor", () => PaginaServidores.default()],
    ["/servidor/novo", () => PaginaNovo.default()],
    [
      "/servidor/[servidorId]",
      () => PaginaServidor.default(params({ servidorId: SRV })),
    ],
    ["/servidor/sites", () => PaginaSites.default()],
    [
      "/servidor/sites/[siteId]",
      () => PaginaSite.default(params({ siteId: SITE })),
    ],
  ])(
    "%s: a frase e o 'Como funciona', sem formulário e sem h1",
    async (_rota, pagina) => {
      leitura.lerPainelVps.mockResolvedValue({ estado: "demo" });
      const { container } = render(await pagina());
      expect(screen.getByText(FRASE_DO_DEMO)).toBeTruthy();
      expect(screen.getByText("Do comando ao site no ar")).toBeTruthy();
      expect(container.querySelectorAll("h1")).toHaveLength(0);
      expect(container.querySelectorAll("h2")).toHaveLength(1);
      expect(
        container.querySelectorAll("form, input, select, button"),
      ).toHaveLength(0);
      expect(container.textContent).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    },
  );
});

describe("ids", () => {
  it("id que não é UUID dá 404 sem ler o banco", async () => {
    await expect(
      PaginaServidor.default(params({ servidorId: "nao-e-uuid" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      PaginaSite.default(params({ siteId: "../x" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(leitura.lerPainelVps).not.toHaveBeenCalled();
  });

  it("servidor de outro workspace (ou removido) também dá 404", async () => {
    leitura.lerPainelVps.mockResolvedValue(ok({ servidor: null }));
    await expect(
      PaginaServidor.default(params({ servidorId: SRV })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(leitura.lerPainelVps).toHaveBeenCalledWith({ servidorId: SRV });
  });

  it("site de outro workspace (ou removido) também dá 404", async () => {
    leitura.lerPainelVps.mockResolvedValue(ok({ site: null }));
    await expect(PaginaSite.default(params({ siteId: SITE }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(leitura.lerPainelVps).toHaveBeenCalledWith({ siteId: SITE });
  });
});

describe("com o painel funcionando", () => {
  it("/servidor: título e a frase de vazio", async () => {
    leitura.lerPainelVps.mockResolvedValue(ok());
    render(await PaginaServidores.default());
    expect(
      screen.getByRole("heading", { level: 2, name: "Servidores" }),
    ).toBeTruthy();
    expect(screen.getByText(/Nenhum servidor conectado ainda\./)).toBeTruthy();
  });

  it("/servidor/novo: pendência aberta aparece antes do formulário", async () => {
    leitura.lerPainelVps.mockResolvedValue({
      ...ok(),
      pendencias: [
        {
          chave: "https",
          ok: false,
          texto: "Painel sem https.",
          ondePegar: "Vercel.",
        },
      ],
    });
    render(await PaginaNovo.default());
    expect(
      screen.getByText("Falta 1 item para o Servidor funcionar"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gerar comando" })).toBeTruthy();
  });

  it("sem permissão: só a frase, sem formulário", async () => {
    leitura.lerPainelVps.mockResolvedValue({
      estado: "sem_permissao",
      motivo: "Sua conta (x@y.com) não está em VPS_DONOS.",
    });
    const { container } = render(await PaginaSites.default());
    expect(
      screen.getByText("Sua conta (x@y.com) não está em VPS_DONOS."),
    ).toBeTruthy();
    expect(container.querySelectorAll("form, button")).toHaveLength(0);
  });
});
