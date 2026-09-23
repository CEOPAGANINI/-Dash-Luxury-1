import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Barra,
  Colunas,
  Grafico,
  Rosca,
  porcentagem,
} from "@/features/design/medidas";

afterEach(cleanup);

const RECEITA = [
  { chave: "produto", nome: "Produto", valor: 198, texto: "R$ 198 mil" },
  { chave: "servico", nome: "Serviços", valor: 144, texto: "R$ 144 mil" },
  { chave: "royalty", nome: "Royalties", valor: 70.8, texto: "R$ 70,8 mil" },
];

describe("porcentagem", () => {
  it("é a parte sobre o todo, com uma casa", () => {
    expect(porcentagem(1, 3)).toBe(33.3);
    expect(porcentagem(1, 4)).toBe(25);
  });

  it("nunca passa de 100 nem cai abaixo de zero", () => {
    expect(porcentagem(9, 4)).toBe(100);
    expect(porcentagem(-5, 4)).toBe(0);
  });

  it("um todo de zero dá zero, e não infinito", () => {
    expect(porcentagem(7, 0)).toBe(0);
    expect(porcentagem(7, Number.NaN)).toBe(0);
  });
});

describe("Barra", () => {
  it("reparte o trilho na proporção das fatias, e fecha em 100", () => {
    const { container } = render(<Barra nome="Receita" fatias={RECEITA} />);
    const larguras = [
      ...container.querySelectorAll<HTMLElement>("[style*='--cor'][style*='width']"),
    ].map((e) => parseFloat(e.style.width));
    expect(larguras).toEqual([48, 34.9, 17.1]);
    /* Exactamente 100, e não 100,1: a última fatia fecha a conta. */
    expect(larguras.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it("anuncia cada fatia para quem lê a tela", () => {
    render(<Barra nome="Receita" fatias={RECEITA} />);
    expect(
      screen.getByRole("img", {
        name: "Receita: Produto 48%, Serviços 34,9%, Royalties 17,1%",
      }),
    ).toBeTruthy();
  });

  it("sem movimento, mostra o trilho e diz isso", () => {
    render(
      <Barra
        nome="Receita"
        fatias={[{ chave: "a", nome: "Produto", valor: 0 }]}
      />,
    );
    expect(screen.getByRole("img", { name: "Receita: sem movimento" })).toBeTruthy();
  });

  it("a cor vem da série, e nunca por fora", () => {
    const { container } = render(<Barra nome="Receita" fatias={RECEITA} />);
    const primeiro = container.querySelector<HTMLElement>("[style*='--cor']")!;
    expect(primeiro.style.getPropertyValue("--cor")).toBe("var(--serie-1)");
  });

  it("o brilho de cada pedaço entra um atrás do outro", () => {
    const { container } = render(<Barra nome="Receita" fatias={RECEITA} />);
    const atrasos = [
      ...container.querySelectorAll<HTMLElement>("[style*='--atraso']"),
    ].map((e) => e.style.getPropertyValue("--atraso"));
    expect(atrasos).toEqual(["0ms", "100ms", "200ms"]);
  });
});

describe("Rosca", () => {
  it("escreve as fatias por acumulação, e o resto fica com o trilho", () => {
    const { container } = render(
      <Rosca
        nome="Custos"
        centro="145"
        fatias={[
          { chave: "a", nome: "Folha", valor: 35 },
          { chave: "b", nome: "Mídia", valor: 25 },
        ]}
      />,
    );
    const anel = container.querySelector<HTMLElement>("[style*='--fatias']")!;
    expect(anel.style.getPropertyValue("--fatias")).toBe(
      "var(--serie-1) 0% 58.3%, var(--serie-2) 58.3% 100%",
    );
  });

  it("quando os dados não fecham o círculo, o trilho fecha", () => {
    const { container } = render(
      <Rosca
        nome="Custos"
        centro="0"
        fatias={[{ chave: "a", nome: "Folha", valor: 0 }]}
      />,
    );
    const anel = container.querySelector<HTMLElement>("[style*='--fatias']")!;
    expect(anel.style.getPropertyValue("--fatias")).toBe("var(--trilho) 0% 100%");
    expect(screen.getByRole("img", { name: "Custos: sem movimento" })).toBeTruthy();
  });

  it("o número do centro fica fora da leitura de tela, que já tem a legenda", () => {
    render(
      <Rosca
        nome="Custos"
        centro="145"
        nota="lançamentos"
        fatias={[{ chave: "a", nome: "Folha", valor: 35 }]}
      />,
    );
    expect(screen.getByText("145").closest("[aria-hidden='true']")).toBeTruthy();
  });
});

describe("Grafico", () => {
  it("o maior valor fica no topo da caixa, e o menor no fundo", () => {
    const { container } = render(
      <Grafico
        nome="Trajetória"
        linhas={[{ chave: "e", nome: "Entrada", valores: [0, 5, 10] }]}
      />,
    );
    const d = container.querySelector("path[stroke]")!.getAttribute("d")!;
    expect(d).toBe("M0,40 L50,20 L100,0");
  });

  it("uma série de um ponto só não desenha caminho nenhum", () => {
    const { container } = render(
      <Grafico nome="Trajetória" linhas={[{ chave: "e", nome: "E", valores: [7] }]} />,
    );
    expect(container.querySelector("path[stroke]")).toBeNull();
  });

  it("uma série plana não divide por zero", () => {
    const { container } = render(
      <Grafico
        nome="Trajetória"
        linhas={[{ chave: "e", nome: "E", valores: [4, 4, 4] }]}
      />,
    );
    const d = container.querySelector("path[stroke]")!.getAttribute("d")!;
    expect(d).toBe("M0,40 L50,40 L100,40");
  });
});

describe("Colunas", () => {
  it("a coluna mais alta enche a caixa, e as outras são proporção dela", () => {
    const { container } = render(
      <Colunas
        nome="Semana"
        colunas={[
          { chave: "a", nome: "Seg", pilhas: [{ chave: "x", valor: 50 }] },
          { chave: "b", nome: "Ter", pilhas: [{ chave: "y", valor: 100 }] },
        ]}
      />,
    );
    const alturas = [
      ...container.querySelectorAll<HTMLElement>("[style*='height']"),
    ].map((e) => e.style.height);
    expect(alturas).toEqual(["50%", "100%"]);
  });
});
