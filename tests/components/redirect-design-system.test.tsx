import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedirectPanel } from "@/features/funnel/redirect-panel";
import type {
  FunnelNode,
  RedirNode,
  RegraRedir,
} from "@/features/funnel/funnel-model";

afterEach(cleanup);

const destino: FunnelNode = {
  id: "checkout",
  type: "checkout",
  title: "Checkout principal",
  url: "/checkout",
  x: 300,
  y: 0,
};
const mobile: RegraRedir = {
  id: "mobile",
  tipo: "dispositivo",
  paises: [],
  dispositivos: ["mobile"],
  percentual: 50,
  destino: "/mobile",
  ativo: true,
};
const campanha: RegraRedir = {
  id: "campanha",
  tipo: "origem",
  paises: [],
  dispositivos: [],
  origens: ["facebook"],
  percentual: 50,
  destino: "/campanha",
  ativo: true,
};

function Harness({
  regras = [],
  fallback = "checkout",
  onChange = vi.fn(),
  onFechar = vi.fn(),
  onKeyDown,
}: {
  regras?: RegraRedir[];
  fallback?: string | null;
  onChange?: (redir: RedirNode) => void;
  onFechar?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}) {
  const [node, setNode] = React.useState<FunnelNode>({
    id: "router",
    type: "redirect",
    title: "Roteador principal",
    url: "/go",
    x: 0,
    y: 0,
    redir: { regras },
  });
  return (
    <div onKeyDown={onKeyDown}>
      <RedirectPanel
        node={node}
        nodes={[node, destino]}
        defaultNodeId={fallback ?? undefined}
        onNome={(title) => setNode((current) => ({ ...current, title }))}
        onChange={(redir) => {
          onChange(redir);
          setNode((current) => ({ ...current, redir }));
        }}
        onAddress={(url) => setNode((current) => ({ ...current, url }))}
        onFechar={onFechar}
      />
    </div>
  );
}

describe("roteador do quadro: edição acessível e resultados verificáveis", () => {
  it("navega entre abas com setas, Home e End, mantendo seleção e foco", () => {
    render(<Harness />);
    const regras = screen.getByRole("tab", { name: "Regras" });
    expect(document.activeElement).toBe(regras);
    expect(regras.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(regras, { key: "ArrowDown" });
    const testar = screen.getByRole("tab", { name: "Testar" });
    expect(document.activeElement).toBe(testar);
    expect(testar.getAttribute("aria-selected")).toBe("true");
    expect(regras.tabIndex).toBe(-1);
    const painel = screen.getByRole("tabpanel", { name: "Testar" });
    expect(painel.id).toBe(testar.getAttribute("aria-controls"));
    fireEvent.keyDown(testar, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Registro" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(regras);
  });

  it("persiste a nova prioridade e altera a primeira correspondência no simulador", () => {
    const change = vi.fn();
    render(<Harness regras={[mobile, campanha]} onChange={change} />);
    fireEvent.click(screen.getByRole("tab", { name: "Testar" }));
    expect(screen.getByText("→ /mobile")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Regras" }));
    fireEvent.click(screen.getByRole("button", { name: "Descer regra 1" }));
    expect(
      change.mock.calls.at(-1)?.[0].regras.map((regra: RegraRedir) => regra.id),
    ).toEqual(["campanha", "mobile"]);
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "Regra 2" }),
    );
    expect(
      screen.getByText("Regra movida da prioridade 1 para 2."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Testar" }));
    expect(screen.getByText("→ /campanha")).toBeTruthy();
    expect(
      screen.getByText(/Prioridade 1: Quem veio de Facebook/),
    ).toBeTruthy();
  });

  it("identifica bloco removido e não apresenta uma simulação inválida como redirecionamento concluído", () => {
    render(
      <Harness
        regras={[{ ...mobile, destino: "", destinoNoId: "removido" }]}
      />,
    );
    expect(
      screen.getByText(/Destino não encontrado: o bloco foi removido/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("textbox", { name: "Endereço de destino da regra 1" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Testar" }));
    expect(screen.getByText("Destino precisa de correção")).toBeTruthy();
    expect(
      screen.getByText(/Destino não encontrado: o bloco foi removido/),
    ).toBeTruthy();
    expect(screen.queryByText("Redirecionado")).toBeNull();
  });

  it("reordena pela alça de arraste usando a mesma prioridade persistida", () => {
    const change = vi.fn();
    render(
      <Harness
        regras={[
          mobile,
          campanha,
          { ...mobile, id: "terceira", destino: "/terceira" },
        ]}
        onChange={change}
      />,
    );
    const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(
      screen.getByRole("button", { name: "Arrastar regra 3" }),
      { dataTransfer: transfer },
    );
    const target = screen.getByRole("region", { name: "Regra 1" });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    expect(target.getAttribute("data-drag-over")).toBe("true");
    fireEvent.drop(target, { dataTransfer: transfer });
    expect(
      change.mock.calls.at(-1)?.[0].regras.map((regra: RegraRedir) => regra.id),
    ).toEqual(["terceira", "mobile", "campanha"]);
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "Regra 1" }),
    );
  });

  it("apresenta validação de endereço que usa as mesmas restrições da exportação", () => {
    render(
      <Harness regras={[{ ...mobile, destino: "javascript:alert(1)" }]} />,
    );
    const address = screen.getByRole("textbox", {
      name: "Endereço de destino da regra 1",
    });
    expect(address.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Endereço inválido. Use um caminho/)).toBeTruthy();
    fireEvent.change(address, { target: { value: "/oferta" } });
    expect(address.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText(/Endereço inválido. Use um caminho/)).toBeNull();
  });

  it("explica incompatibilidade ativa de região e retira o impedimento quando pausada", () => {
    const region: RegraRedir = {
      ...mobile,
      id: "region",
      tipo: "regiao",
      paises: ["BR"],
      dispositivos: [],
    };
    render(<Harness regras={[region]} />);
    expect(
      screen.getByText(/Esta regra bloqueia a exportação do ZIP único/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Regra 1 ativa/ }));
    expect(
      screen.queryByText(/Esta regra bloqueia a exportação do ZIP único/),
    ).toBeNull();
    expect(
      screen
        .getByRole("switch", { name: /Regra 1 pausada/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("mostra o destino padrão real e explica sua ausência sem regras", () => {
    const view = render(<Harness />);
    expect(screen.getByText("Crie sua primeira regra")).toBeTruthy();
    expect(screen.getByText("Checkout principal")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Testar" }));
    expect(screen.getByText("→ Checkout principal")).toBeTruthy();
    expect(
      screen.getByText(/Nenhuma regra ativa com destino definido correspondeu/),
    ).toBeTruthy();
    view.unmount();
    render(<Harness fallback={null} />);
    expect(screen.getByText("Não conectado")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Testar" }));
    expect(screen.getByText(/Nenhuma saída padrão conectada/)).toBeTruthy();
  });

  it("permite escolher o tipo por teclado e mantém as teclas de edição fora do canvas", () => {
    const canvasKey = vi.fn();
    const close = vi.fn();
    render(
      <Harness regras={[mobile]} onKeyDown={canvasKey} onFechar={close} />,
    );
    const grupo = screen.getByRole("radiogroup", { name: "Tipo da regra 1" });
    const aparelho = within(grupo).getByRole("radio", { name: "Por aparelho" });
    fireEvent.keyDown(aparelho, { key: "ArrowRight" });
    const sistema = within(grupo).getByRole("radio", { name: "Por sistema" });
    expect(sistema.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(sistema);
    const nome = screen.getByRole("textbox", {
      name: "Nome do redirecionador",
    });
    fireEvent.keyDown(nome, { key: "Delete" });
    expect(canvasKey).not.toHaveBeenCalled();
    fireEvent.keyDown(nome, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("identifica métricas e registro como demonstração antes dos números", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "De onde vêm" }));
    expect(screen.getByText("Demonstração — não são dados reais")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Registro" }));
    expect(screen.getByText("Demonstração — não são dados reais")).toBeTruthy();
    expect(
      screen.getByRole("table", {
        name: "Registro de redirecionamentos de demonstração",
      }),
    ).toBeTruthy();
  });
});
