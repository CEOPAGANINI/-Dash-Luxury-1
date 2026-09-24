import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VPS_INPUT_LIMITS, type ServidorDTO } from "@/features/vps/modelo";
import { NovoServidor } from "@/features/vps/novo-servidor";
import type { Instalacao } from "@/features/vps/servico";
import type { EstadoDaTela } from "@/features/vps/vps-cliente";

const mocks = vi.hoisted(() => ({
  criarServidorAction: vi.fn(),
  novaInstalacaoAction: vi.fn(),
  confirmarServidorAction: vi.fn(),
  reentrarAction: vi.fn(),
  atualizar: vi.fn(),
}));

vi.mock("@/features/vps/actions", () => mocks);
vi.mock("@/features/vps/use-estado-vps", () => ({
  useEstadoVps: (inicial: EstadoDaTela) => ({
    estado: inicial,
    falha: null,
    atualizar: mocks.atualizar,
  }),
}));

const AGORA = "2026-09-23T21:12:00.000Z";
const SERVIDOR_ID = "11111111-1111-4111-8111-111111111111";
const instalacao: Instalacao = {
  comando: "comando-real-devolvido-pela-action",
  expiraEm: "2026-09-23T21:42:00.000Z",
  sha256Instalador: "0".repeat(64),
};

function estado(extra: Partial<EstadoDaTela> = {}): EstadoDaTela {
  return {
    agora: AGORA,
    servidores: [],
    sites: [],
    checkouts: [],
    origens: ["https://painel.example"],
    appUrl: "https://painel.example",
    comandoDesinstalar: {
      manterSites: "sudo dash-agent desinstalar",
      removerSites: "sudo dash-agent desinstalar --remover-sites",
    },
    podeAlterar: true,
    pendencias: [],
    ...extra,
  };
}

function servidorRegistrado(): ServidorDTO {
  return {
    id: SERVIDOR_ID,
    nome: "Nova VPS",
    estado: "aguardando_confirmacao",
    sinal: { tipo: "online", ultimoPulsoEm: AGORA },
    instalacao: null,
    registro: {
      hostname: "vps-recebida",
      so: "Debian GNU/Linux 12",
      ipVisto: "203.0.113.10",
      ipsPublicos: [],
      registradoEm: AGORA,
    },
    ipDoDns: null,
    ipInformado: null,
    versaoAgente: "1.0.0",
    travas: { pausado: false, somenteLeitura: false },
    geracaoChave: 1,
    relogio: null,
    nginx: null,
    leitura: null,
    erroLeitura: null,
    totalSites: 0,
  };
}

function etapas() {
  return within(
    screen.getByRole("list", { name: "Etapas para conectar o servidor" }),
  ).getAllByRole("listitem");
}

function etapaAtual() {
  return etapas().filter(
    (etapa) => etapa.getAttribute("aria-current") === "step",
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

afterEach(cleanup);

describe("onboarding Nexus da VPS", () => {
  it("explica os próximos passos sem inventar comando ou identidade do servidor", () => {
    const { container } = render(<NovoServidor inicial={estado()} />);

    expect(etapas()).toHaveLength(3);
    expect(etapaAtual()).toHaveLength(1);
    expect(etapaAtual()[0].textContent).toContain("Nome");
    expect(
      screen.getByRole("heading", { name: "O comando aparece aqui" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Confira a identidade" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Requisitos da VPS" }),
    ).toBeTruthy();
    expect(container.querySelectorAll("pre, code")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Sim, é o meu" })).toBeNull();
    expect(container.textContent).not.toMatch(
      /\d+\.\d+\.\d+\.\d+|Online|está conectado/,
    );
    expect(mocks.criarServidorAction).not.toHaveBeenCalled();
  });

  it("avança só depois da action e da identidade devolvida pelo servidor", async () => {
    let concluirCriacao!: (resultado: {
      ok: true;
      mensagem: string;
      dados: { servidorId: string; instalacao: Instalacao };
    }) => void;
    mocks.criarServidorAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          concluirCriacao = resolve;
        }),
    );
    const { container, rerender } = render(<NovoServidor inicial={estado()} />);

    fireEvent.change(screen.getByLabelText("Nome do servidor"), {
      target: { value: "Nova VPS" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar comando" }));
    });

    expect(mocks.criarServidorAction).toHaveBeenCalledOnce();
    const dados = mocks.criarServidorAction.mock.calls[0][1] as FormData;
    expect(dados.get("nome")).toBe("Nova VPS");
    expect(etapaAtual()[0].textContent).toContain("Nome");
    expect(container.querySelector("pre")).toBeNull();

    await act(async () => {
      concluirCriacao({
        ok: true,
        mensagem: "Servidor criado. Cole o comando no console da VPS.",
        dados: { servidorId: SERVIDOR_ID, instalacao },
      });
    });

    expect(etapaAtual()).toHaveLength(1);
    expect(etapaAtual()[0].textContent).toContain("Instalação");
    expect(etapas()[0].textContent).toContain("Concluído");
    expect(etapas()[2].textContent).toContain("A seguir");
    expect(container.querySelector("pre code")?.textContent).toBe(
      instalacao.comando,
    );
    expect(
      screen.queryByRole("heading", { name: "O comando aparece aqui" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Confira a identidade" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Sim, é o meu" })).toBeNull();
    expect(mocks.atualizar).toHaveBeenCalledOnce();

    const registrado = servidorRegistrado();
    rerender(<NovoServidor inicial={estado({ servidores: [registrado] })} />);

    expect(etapaAtual()).toHaveLength(1);
    expect(etapaAtual()[0].textContent).toContain("Confirmação");
    expect(
      screen.getByRole("heading", { name: "É o seu servidor?" }),
    ).toBeTruthy();
    expect(screen.getByText("vps-recebida")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();

    rerender(
      <NovoServidor
        inicial={estado({ servidores: [{ ...registrado, estado: "ativo" }] })}
      />,
    );

    expect(etapaAtual()).toHaveLength(0);
    expect(
      etapas().every((etapa) => etapa.textContent?.includes("Concluído")),
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Nova VPS está conectado" }),
    ).toBeTruthy();
  });

  it.each([
    ["vazio", "   ", "Dê um nome ao servidor."],
    [
      "acima do limite",
      "a".repeat(VPS_INPUT_LIMITS.name + 1),
      `O nome vai até ${VPS_INPUT_LIMITS.name} caracteres, sem caracteres de controle.`,
    ],
    [
      "com caractere de controle",
      "VPS\u0001loja",
      `O nome vai até ${VPS_INPUT_LIMITS.name} caracteres, sem caracteres de controle.`,
    ],
  ])(
    "mantém o passo Nome ao recusar nome %s",
    async (_caso, nome, mensagem) => {
      render(<NovoServidor inicial={estado()} />);
      const campo = screen.getByLabelText("Nome do servidor");
      fireEvent.change(campo, { target: { value: nome } });

      await act(async () => {
        fireEvent.submit(
          screen
            .getByRole("button", { name: "Gerar comando" })
            .closest("form")!,
        );
      });

      expect(screen.getByRole("alert").textContent).toBe(mensagem);
      expect(campo.getAttribute("aria-invalid")).toBe("true");
      expect(etapaAtual()).toHaveLength(1);
      expect(etapaAtual()[0].textContent).toContain("Nome");
      expect(
        screen.getByRole("heading", { name: "O comando aparece aqui" }),
      ).toBeTruthy();
      expect(mocks.criarServidorAction).not.toHaveBeenCalled();
      expect(mocks.atualizar).not.toHaveBeenCalled();
    },
  );
});
