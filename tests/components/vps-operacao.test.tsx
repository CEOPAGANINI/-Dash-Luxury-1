import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResultadoVps } from "@/features/vps/modelo";
import {
  ConfirmacaoDigitada,
  RetornoDaOperacao,
} from "@/features/vps/servidores-painel";
import { useOperacao, type Operacao } from "@/features/vps/use-operacao";
import { ErroDoPainel } from "@/features/vps/vps-cliente";

/*
  useOperacao é o run() do painel VPS anterior: trava o segundo clique
  antes do React redesenhar, e toda saída vira uma frase em role="status"
  ou role="alert". Login antigo oferece "Entrar de novo".
*/

vi.mock("@/features/vps/actions", () => ({
  reentrarAction: vi.fn(async () => ({ ok: true, mensagem: "" })),
}));

afterEach(cleanup);

function Sonda({ onOperacao }: { onOperacao: (operacao: Operacao) => void }) {
  const operacao = useOperacao();
  onOperacao(operacao);
  return <RetornoDaOperacao operacao={operacao} destino="/servidor/x" />;
}

function montar() {
  let atual: Operacao | null = null;
  render(<Sonda onOperacao={(o) => (atual = o)} />);
  return () => atual!;
}

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => (resolver = r));
  return { promessa, resolver };
}

describe("useOperacao", () => {
  it("mostra o que está andando e depois a frase da action", async () => {
    const operacao = montar();
    const espera = adiada<ResultadoVps>();
    let fim: Promise<unknown>;
    act(() => {
      fim = operacao().executar("Gravando…", () => espera.promessa);
    });
    expect(screen.getByRole("status").textContent).toBe("Gravando…");
    await act(async () => {
      espera.resolver({ ok: true, mensagem: "IP gravado." });
      await fim;
    });
    expect(screen.getByRole("status").textContent).toBe("IP gravado.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("trava o segundo clique enquanto o primeiro não volta", async () => {
    const operacao = montar();
    const espera = adiada<ResultadoVps>();
    const acao = vi.fn(() => espera.promessa);
    let primeira: Promise<unknown>;
    let segunda: Promise<unknown>;
    act(() => {
      primeira = operacao().executar("Um", acao);
      segunda = operacao().executar("Dois", acao);
    });
    await expect(segunda!).resolves.toBeNull();
    expect(acao).toHaveBeenCalledTimes(1);
    await act(async () => {
      espera.resolver({ ok: true, mensagem: "ok" });
      await primeira;
    });
    // Destravou: a próxima passa.
    await act(async () => {
      await operacao().executar("Três", async () => ({
        ok: true,
        mensagem: "de novo",
      }));
    });
    expect(screen.getByRole("status").textContent).toBe("de novo");
  });

  it("recusa da action vira alerta, com os erros por campo", async () => {
    const operacao = montar();
    await act(async () => {
      await operacao().executar("Criando…", async () => ({
        ok: false,
        codigo: "dados_invalidos",
        mensagem: "Confira os campos destacados.",
        erros: { dominio: "Domínio inválido." },
      }));
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Confira os campos destacados.",
    );
    expect(operacao().erros).toEqual({ dominio: "Domínio inválido." });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("erro de rede no meio do caminho vira frase, sem estourar a tela", async () => {
    const operacao = montar();
    await act(async () => {
      await operacao().executar("Enviando…", async () => {
        throw new TypeError("Failed to fetch");
      });
    });
    expect(screen.getByRole("alert").textContent).toMatch(
      /Não foi possível falar com o painel/,
    );
  });

  it("login antigo oferece entrar de novo, voltando para a mesma tela", async () => {
    const operacao = montar();
    await act(async () => {
      await operacao().executar("Publicando…", async () => ({
        ok: false,
        codigo: "login_antigo",
        mensagem: "Entre de novo para confirmar que é você.",
      }));
    });
    const botao = screen.getByRole("button", { name: "Entrar de novo" });
    const formulario = botao.closest("form")!;
    expect(
      (formulario.querySelector("input[name=destino]") as HTMLInputElement)
        .value,
    ).toBe("/servidor/x");
  });

  it("sessão vencida (ErroDoPainel) também oferece entrar de novo", async () => {
    const operacao = montar();
    await act(async () => {
      await operacao().executar("Enviando…", async () => {
        throw new ErroDoPainel("sessao", "Sua sessão expirou. Entre de novo.");
      });
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Sua sessão expirou. Entre de novo.",
    );
    expect(screen.getByRole("button", { name: "Entrar de novo" })).toBeTruthy();
  });
});

describe("ConfirmacaoDigitada", () => {
  it("dois passos: abre, e o vermelho só acende com o nome exato", () => {
    const onConfirmar = vi.fn();
    render(
      <ConfirmacaoDigitada
        rotulo="Remover servidor"
        alvo="VPS da loja"
        confirmar="Remover do painel"
        explicacao="Some do painel."
        ocupado={false}
        onConfirmar={onConfirmar}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Remover do painel" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover servidor" }));
    const vermelho = screen.getByRole("button", { name: "Remover do painel" });
    expect(vermelho.hasAttribute("disabled")).toBe(true);
    const campo = screen.getByLabelText(/Digite VPS da loja para confirmar/);
    fireEvent.change(campo, { target: { value: "VPS da" } });
    expect(vermelho.hasAttribute("disabled")).toBe(true);
    fireEvent.change(campo, { target: { value: "VPS da loja" } });
    expect(vermelho.hasAttribute("disabled")).toBe(false);
    fireEvent.click(vermelho);
    expect(onConfirmar).toHaveBeenCalledWith("VPS da loja");
  });

  it("cancelar fecha e esquece o que foi digitado", () => {
    render(
      <ConfirmacaoDigitada
        rotulo="Remover site"
        alvo="loja.com.br"
        confirmar="Remover o site"
        explicacao="x"
        ocupado={false}
        onConfirmar={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remover site" }));
    fireEvent.change(screen.getByLabelText(/Digite/), {
      target: { value: "loja.com.br" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover site" }));
    expect((screen.getByLabelText(/Digite/) as HTMLInputElement).value).toBe(
      "",
    );
  });
});
