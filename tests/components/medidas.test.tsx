import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Barra, Rosca, porcentagem } from "@/features/design/medidas";

afterEach(cleanup);

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
  it("diz o que mede e quanto, para quem lê a tela", () => {
    render(<Barra nome="Caixa recebido" valor={42} />);
    expect(screen.getByRole("img", { name: "Caixa recebido: 42%" })).toBeTruthy();
  });

  it("aceita um texto próprio no lugar da porcentagem", () => {
    render(<Barra nome="Receita" valor={30} textoDoValor="R$ 1.485,00" />);
    expect(screen.getByText("R$ 1.485,00")).toBeTruthy();
  });

  it("reparte o trilho, e a soma dos pedaços fecha em 100", () => {
    const { container } = render(
      <Barra
        nome="Pagamentos"
        pedacos={[
          { chave: "a", nome: "Aprovado", valor: 70, tom: "positivo" },
          { chave: "p", nome: "Pendente", valor: 20, tom: "atencao" },
          { chave: "r", nome: "Recusado", valor: 10, tom: "negativo" },
        ]}
      />,
    );
    const larguras = [...container.querySelectorAll<HTMLElement>("i[style*='width']")]
      .map((e) => parseFloat(e.style.width))
      .filter((n) => Number.isFinite(n));
    expect(larguras).toEqual([70, 20, 10]);
    expect(larguras.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it("a cor nunca entra por fora: vem do tom", () => {
    const { container } = render(<Barra nome="Lucro" valor={50} tom="positivo" />);
    const cheio = container.querySelector<HTMLElement>("[style*='--preenchido']")!;
    expect(cheio.style.getPropertyValue("--preenchido")).toBe("var(--success)");
  });
});

describe("Rosca", () => {
  it("vira ângulo a porcentagem, e anuncia o valor", () => {
    const { container } = render(<Rosca nome="Margem" valor={64} nota="líquida" />);
    expect(screen.getByRole("img", { name: "Margem: 64%" })).toBeTruthy();
    const anel = container.querySelector<HTMLElement>("[style*='--parte']")!;
    expect(anel.style.getPropertyValue("--parte")).toBe("64%");
  });

  it("um todo de zero desenha o anel vazio, e não quebra", () => {
    const { container } = render(<Rosca nome="Margem" valor={5} total={0} />);
    const anel = container.querySelector<HTMLElement>("[style*='--parte']")!;
    expect(anel.style.getPropertyValue("--parte")).toBe("0%");
  });
});
