import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { CARD_NOTES_KEY, restoreCardNotes } from "@/features/ads/card-notes-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };
const campanha = tree.campanhas.find((c) => c.id === "demo-a1")!;

function limpar() {
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: CARD_NOTES_KEY }));
  });
}

describe("faixa da campanha: neon colorido, edição ao clicar e sem lápis", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nasce sem neon, troca de cor pelo painel do neon e guarda no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limpar();
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    expect(cartao.getAttribute("data-neon")).toBe("nenhum");
    expect(within(cartao).queryByRole("button", { name: /Editar cartão/ })).toBeNull();

    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    const painel = screen.getByRole("dialog", { name: `Neon de ${campanha.name}` });
    expect(painel.parentElement).toBe(document.body);
    const cores = within(painel).getByRole("radiogroup", { name: "Cor do neon" });
    expect(within(cores).getAllByRole("radio")).toHaveLength(5);
    expect(within(cores).getByRole("radio", { name: "Sem cor" }).getAttribute("aria-checked")).toBe("true");
    expect(within(cores).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    // A descrição é o último campo do painel.
    const campos = [...painel.querySelectorAll(".class-board-editor-campo > span")].map((e) => e.textContent);
    expect(campos).toEqual(["Nome", "Etiquetas", "Descrição"]);

    fireEvent.click(within(cores).getByRole("radio", { name: "Vermelho" }));
    expect(screen.queryByRole("dialog", { name: `Neon de ${campanha.name}` })).toBeNull();
    expect(cartao.getAttribute("data-neon")).toBe("vermelho");
    expect(cartao.style.getPropertyValue("--neon")).toBe("#ff3b3b");
    expect(restoreCardNotes(localStorage.getItem(CARD_NOTES_KEY)!)![campanha.id]).toEqual({ etiquetas: [], texto: "", neon: "vermelho" });

    // O branco também é uma escolha: pinta a faixa de branco e fica guardado.
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Cor do neon" })).getByRole("radio", { name: "Branco" }));
    expect(cartao.getAttribute("data-neon")).toBe("branco");
    expect(cartao.style.getPropertyValue("--neon")).toBe("#f4f4f5");
    expect(restoreCardNotes(localStorage.getItem(CARD_NOTES_KEY)!)![campanha.id]).toEqual({ etiquetas: [], texto: "", neon: "branco" });

    // "Sem cor" tira o neon: a faixa volta a ficar escura e a anotação some.
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Cor do neon" })).getByRole("radio", { name: "Sem cor" }));
    expect(cartao.getAttribute("data-neon")).toBe("nenhum");
    expect(cartao.style.getPropertyValue("--neon")).toBe("");
    expect(restoreCardNotes(localStorage.getItem(CARD_NOTES_KEY)!)![campanha.id]).toBeUndefined();
  });

  it("o painel do neon fecha com Esc e ao clicar fora, e não abre junto com o card dos números", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limpar();
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    // Clicar na própria campanha (o nome) também abre o painel de edição.
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    expect(screen.getByRole("dialog", { name: /^Neon de/ })).toBeTruthy();
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    expect(screen.queryByRole("dialog", { name: /^Neon de/ })).toBeNull();
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /^Neon de/ })).toBeNull();

    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: /^Neon de/ })).toBeNull();

    fireEvent.click(within(cartao).getByRole("button", { name: `Detalhes de ${campanha.name}` }));
    expect(screen.getByRole("dialog", { name: /^Detalhes da campanha/ })).toBeTruthy();
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    expect(screen.queryByRole("dialog", { name: /^Detalhes da campanha/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: /^Neon de/ })).toBeTruthy();
  });

  it("anotações guardadas (etiquetas, texto e neon) voltam na faixa e no card dos números", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {
      localStorage.setItem(CARD_NOTES_KEY, JSON.stringify({ version: 1, notas: { [campanha.id]: { etiquetas: [{ texto: "A", cor: "azul" }, { texto: "B", cor: "verde" }], texto: "Escalar 20% na sexta", neon: "amarelo" } } }));
      window.dispatchEvent(new StorageEvent("storage", { key: CARD_NOTES_KEY }));
    });
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    expect(cartao.getAttribute("data-neon")).toBe("amarelo");
    expect(within(within(cartao).getByRole("list", { name: "Etiquetas" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["A", "B"]);
    expect(within(cartao).getByText("Escalar 20% na sexta")).toBeTruthy();
    fireEvent.click(within(cartao).getByRole("button", { name: `Detalhes de ${campanha.name}` }));
    const card = screen.getByRole("dialog", { name: /^Detalhes da campanha/ });
    expect(card.textContent).toContain("Escalar 20% na sexta");
  });

  it("etiquetas e texto são editados dentro do painel do neon e guardados no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limpar();
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    const editor = screen.getByRole("form", { name: `Anotações de ${campanha.name}` });
    fireEvent.change(within(editor).getByPlaceholderText(/Descrição/), { target: { value: "Escalar 20% na sexta" } });
    fireEvent.click(within(editor).getByRole("radio", { name: "Vermelho" }));
    fireEvent.change(within(editor).getByLabelText("Texto da nova etiqueta"), { target: { value: "Prioridade" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Adicionar" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Remover etiqueta Prioridade" }));
    fireEvent.change(within(editor).getByLabelText("Texto da nova etiqueta"), { target: { value: "Vídeo" } });
    fireEvent.keyDown(within(editor).getByLabelText("Texto da nova etiqueta"), { key: "Enter" });
    fireEvent.click(within(editor).getByRole("button", { name: "Salvar" }));

    expect(screen.queryByRole("dialog", { name: /^Neon de/ })).toBeNull();
    expect(within(within(cartao).getByRole("list", { name: "Etiquetas" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Vídeo"]);
    expect(within(cartao).getByText("Escalar 20% na sexta")).toBeTruthy();
    expect(restoreCardNotes(localStorage.getItem(CARD_NOTES_KEY)!)![campanha.id]).toEqual({ etiquetas: [{ texto: "Vídeo", cor: "vermelho" }], texto: "Escalar 20% na sexta" });

    // Trocar o neon depois mantém as etiquetas e o texto.
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Cor do neon" })).getByRole("radio", { name: "Amarelo" }));
    expect(restoreCardNotes(localStorage.getItem(CARD_NOTES_KEY)!)![campanha.id]).toEqual({ etiquetas: [{ texto: "Vídeo", cor: "vermelho" }], texto: "Escalar 20% na sexta", neon: "amarelo" });
  });

  it("o nome da campanha se edita no painel: ao salvar, a campanha é renomeada (demonstração)", async () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limpar();
    const cartao = screen.getByRole("article", { name: `Cartão ${campanha.name}` });
    fireEvent.click(within(cartao).getByRole("button", { name: `Editar ${campanha.name}` }));
    const editor = screen.getByRole("form", { name: `Anotações de ${campanha.name}` });
    const campo = within(editor).getByLabelText("Nome da campanha") as HTMLInputElement;
    expect(campo.value).toBe(campanha.name);
    // Primeiro o campo é o nome; depois etiquetas; a descrição por último.
    expect([...editor.querySelectorAll(".class-board-editor-campo > span")].map((e) => e.textContent)).toEqual(["Nome", "Etiquetas", "Descrição"]);
    fireEvent.change(campo, { target: { value: "Escala Produto A · Setembro" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("article", { name: "Cartão Escala Produto A · Setembro" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /^Neon de/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain('renomeada para "Escala Produto A · Setembro"');

    // Nome vazio não passa: o painel fica aberto com o aviso.
    const renomeado = screen.getByRole("article", { name: "Cartão Escala Produto A · Setembro" });
    fireEvent.click(within(renomeado).getByRole("button", { name: /^Editar / }));
    const editor2 = screen.getByRole("form", { name: /^Anotações de/ });
    fireEvent.change(within(editor2).getByLabelText("Nome da campanha"), { target: { value: "   " } });
    fireEvent.click(within(editor2).getByRole("button", { name: "Salvar" }));
    expect((await within(editor2).findByRole("alert")).textContent).toContain("não pode ficar vazio");
    expect(screen.getByRole("dialog", { name: /^Neon de/ })).toBeTruthy();
  });

  it("ignora anotações inválidas guardadas", () => {
    expect(restoreCardNotes(JSON.stringify({ version: 1, notas: { x: { etiquetas: [{ texto: "", cor: "azul" }], texto: "" } } }))).toBeNull();
    expect(restoreCardNotes(JSON.stringify({ version: 1, notas: { x: { etiquetas: [{ texto: "ok", cor: "rosa-choque" }], texto: "" } } }))).toBeNull();
    expect(restoreCardNotes(JSON.stringify({ version: 1, notas: { x: { etiquetas: [], texto: "", neon: "verde-limao" } } }))).toBeNull();
    expect(restoreCardNotes("nada")).toBeNull();
  });
});
