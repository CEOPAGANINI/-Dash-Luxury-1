import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CheckoutEditor } from "@/features/checkout-editor/checkout-editor";
import { CHECKOUT_EDITOR_KEY } from "@/features/checkout-editor/checkout-editor-store";
import {
  CONFIG_PADRAO,
  camposVisiveis,
  completarCampos,
  completarConfig,
  passosDoCheckout,
  restoreCheckoutConfig,
} from "@/features/checkout-editor/checkout-config";

afterEach(cleanup);

describe("a configuração do checkout", () => {
  it("o que falta volta ao padrão e o lixo não passa", () => {
    expect(completarConfig(undefined)).toEqual(CONFIG_PADRAO);
    expect(completarConfig({ layout: "inventado" })).toEqual(CONFIG_PADRAO);
    expect(restoreCheckoutConfig("{")).toBeNull();
    // Uma cor inválida derruba a configuração toda para o padrão, em vez
    // de pintar o checkout de nada.
    expect(completarConfig({ cores: { fundo: "azul", texto: "#101014", destaque: "#1eb85c" } })).toEqual(CONFIG_PADRAO);
    // Um pedaço válido é aproveitado; o resto vem do padrão.
    const parcial = completarConfig({ textos: { botao: "Quero agora" } });
    expect(parcial.textos.botao).toBe("Quero agora");
    expect(parcial.textos.titulo).toBe(CONFIG_PADRAO.textos.titulo);
  });

  it("nome e e-mail voltam sempre ligados e obrigatórios; um campo novo entra no fim", () => {
    const campos = completarCampos([
      { id: "nome", ativo: false, obrigatorio: false },
      { id: "cupom", ativo: true, obrigatorio: false },
      { id: "cupom", ativo: false, obrigatorio: false },
      { id: "inventado", ativo: true, obrigatorio: true },
    ]);
    expect(campos[0]).toEqual({ id: "nome", ativo: true, obrigatorio: true });
    expect(campos[1].id).toBe("cupom");
    // Sem repetidos e com todos os campos conhecidos presentes.
    expect(new Set(campos.map((c) => c.id)).size).toBe(campos.length);
    expect(campos.map((c) => c.id).sort()).toEqual(["cupom", "documento", "email", "endereco", "nome", "telefone"]);
  });

  it("um checkout sem forma de pagamento nenhuma volta a ter Pix", () => {
    expect(completarConfig({ ...CONFIG_PADRAO, pagamentos: [] }).pagamentos).toEqual(["pix"]);
  });

  it("os passos acompanham o formato e o campo de endereço", () => {
    expect(passosDoCheckout(CONFIG_PADRAO)).toEqual(["Seus dados e pagamento"]);
    const emEtapas = { ...CONFIG_PADRAO, layout: "etapas" as const };
    expect(passosDoCheckout(emEtapas)).toEqual(["Seus dados", "Pagamento"]);
    const comEndereco = { ...emEtapas, campos: emEtapas.campos.map((c) => (c.id === "endereco" ? { ...c, ativo: true } : c)) };
    expect(passosDoCheckout(comEndereco)).toEqual(["Seus dados", "Entrega", "Pagamento"]);
  });
});

describe("o editor de checkout", () => {
  beforeEach(() => {
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: CHECKOUT_EDITOR_KEY }));
    });
  });

  it("mexer num controle muda a prévia na hora e guarda no navegador", () => {
    render(<CheckoutEditor />);
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.textContent).toContain(CONFIG_PADRAO.textos.botao);

    fireEvent.change(screen.getByLabelText("Texto do botão"), { target: { value: "Quero agora" } });
    expect(previa.textContent).toContain("Quero agora");
    expect(restoreCheckoutConfig(localStorage.getItem(CHECKOUT_EDITOR_KEY)!)?.textos.botao).toBe("Quero agora");
  });

  it("desligar um campo tira-o da prévia; nome e e-mail não se desligam", () => {
    render(<CheckoutEditor />);
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.querySelector('[data-campo="cupom"]')).toBeTruthy();

    const listaDeCampos = screen.getByRole("region", { name: "Campos do formulário" });
    const cupom = listaDeCampos.querySelector('[data-campo="cupom"]') as HTMLElement;
    fireEvent.click(within(cupom).getByRole("button", { name: "No formulário" }));
    expect(previa.querySelector('[data-campo="cupom"]')).toBeNull();

    // O campo do nome não tem botão de desligar: diz "Sempre".
    const campos = screen.getByRole("region", { name: "Campos do formulário" });
    const nome = campos.querySelector('[data-campo="nome"]') as HTMLElement;
    expect(nome.textContent).toContain("Sempre");
    expect(within(nome).queryByRole("button")).toBeNull();
  });

  it("não deixa apagar a última forma de pagamento", () => {
    render(<CheckoutEditor />);
    const pagamento = screen.getByRole("region", { name: "Formas de pagamento" });
    fireEvent.click(within(pagamento).getByRole("button", { name: /^Pix/ }));
    fireEvent.click(within(pagamento).getByRole("button", { name: /^Boleto/ }));
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.querySelectorAll(".dash-checkout-pagamentos > li")).toHaveLength(1);
    // O que sobrou fica travado.
    const cartao = within(pagamento).getByRole("button", { name: /^Cartão/ });
    expect(cartao.hasAttribute("disabled")).toBe(true);
    fireEvent.click(cartao);
    expect(previa.querySelectorAll(".dash-checkout-pagamentos > li")).toHaveLength(1);
  });

  it("o formato em etapas mostra os passos, e o endereço acrescenta a entrega", () => {
    render(<CheckoutEditor />);
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.querySelector(".dash-checkout-passos")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Em etapas/ }));
    expect([...previa.querySelectorAll(".dash-checkout-passos > li")].map((l) => l.textContent)).toEqual(["1Seus dados", "2Pagamento"]);

    const campos = screen.getByRole("region", { name: "Campos do formulário" });
    const endereco = campos.querySelector('[data-campo="endereco"]') as HTMLElement;
    fireEvent.click(within(endereco).getByRole("button", { name: "Escondido" }));
    expect([...previa.querySelectorAll(".dash-checkout-passos > li")].map((l) => l.textContent)).toEqual(["1Seus dados", "2Entrega", "3Pagamento"]);
  });

  it("order bump e contagem só aparecem na prévia quando são ligados", () => {
    render(<CheckoutEditor />);
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.querySelector(".dash-checkout-bump")).toBeNull();
    expect(previa.querySelector(".dash-checkout-contador")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Oferta no checkout/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Contagem regressiva/ }));
    expect(previa.querySelector(".dash-checkout-bump")).toBeTruthy();
    expect(previa.querySelector(".dash-checkout-contador")?.textContent).toContain("15:00");
  });

  it("voltar ao padrão desfaz tudo", () => {
    render(<CheckoutEditor />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Outro título" } });
    const previa = screen.getByRole("group", { name: "Prévia do checkout" });
    expect(previa.textContent).toContain("Outro título");
    fireEvent.click(screen.getByRole("button", { name: /Voltar ao padrão/ }));
    expect(previa.textContent).toContain(CONFIG_PADRAO.textos.titulo);
    expect(camposVisiveis(restoreCheckoutConfig(localStorage.getItem(CHECKOUT_EDITOR_KEY)!)!).length).toBe(
      camposVisiveis(CONFIG_PADRAO).length,
    );
  });
});
