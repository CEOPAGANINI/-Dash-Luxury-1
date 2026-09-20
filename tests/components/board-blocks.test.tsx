import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard, FIXOS_KEY, ORDEM_PILARES_KEY, areaDaGrade, celulasLivres, fileirasDaGrade, vagasDaGrade } from "@/features/ads/class-board";
import { BLOCOS_KEY, restoreBoardBlocks } from "@/features/ads/board-blocks-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };

const quadro = () => screen.getByRole("region", { name: "Quadro de classes" });
const blocos = () => quadro().querySelectorAll(":scope > section");
const nomes = () => [...blocos()].map((s) => s.getAttribute("aria-label"));
const vaga = (nome: string) => (screen.getByRole("region", { name: new RegExp(`^${nome}$`) }) as HTMLElement).style.gridArea;

function abrirMenu(nome: string) {
  const bloco = screen.getByRole("region", { name: new RegExp(`^${nome}$`) });
  fireEvent.click(within(bloco).getByRole("button", { name: new RegExp(`^Tag do bloco ${nome}`) }));
  return screen.getByRole("dialog", { name: `Bloco ${nome}` });
}

function limparCofre() {
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: BLOCOS_KEY }));
  });
}

describe("a conta das vagas com blocos de vários tamanhos", () => {
  it("um bloco largo ou alto ocupa várias células; os seguintes entram na primeira vaga onde cabem", () => {
    const tamanho = (id: string) => (id === "a" ? { largura: 2, altura: 2 } : id === "d" ? { largura: 5, altura: 1 } : { largura: 1, altura: 1 });
    const vagas = vagasDaGrade(["a", "b", "c", "d", "e"], new Map(), tamanho);
    expect([...vagas]).toEqual([["a", "1 / 1"], ["b", "1 / 3"], ["c", "1 / 4"], ["d", "3 / 1"], ["e", "1 / 5"]]);
    expect(areaDaGrade("1 / 1", tamanho("a"))).toBe("1 / 1 / span 2 / span 2");
    expect(areaDaGrade("1 / 3", tamanho("b"))).toBe("1 / 3");
    expect(fileirasDaGrade(vagas, tamanho)).toBe(3);
    expect(celulasLivres(vagas, tamanho, 3)).toEqual(["2 / 3", "2 / 4", "2 / 5"]);
  });

  it("quando não cabe em três fileiras a grade ganha fileiras; um fixo largo demais encosta à esquerda", () => {
    const tamanho = (id: string) => (id === "f" ? { largura: 3, altura: 1 } : { largura: 1, altura: 1 });
    const ordem = Array.from({ length: 16 }, (_, i) => `b${i}`);
    const vagas = vagasDaGrade(ordem, new Map(), tamanho);
    expect(vagas.get("b15")).toBe("4 / 1");
    expect(fileirasDaGrade(vagas, tamanho)).toBe(4);
    expect(celulasLivres(vagas, tamanho, 4)).toEqual(["4 / 2", "4 / 3", "4 / 4", "4 / 5"]);
    // Fixo em "1 / 4" com 3 de largura não cabe: passa a começar em "1 / 3".
    const comFixo = vagasDaGrade(["f", "g"], new Map([["f", "1 / 4"]]), tamanho);
    expect(comFixo.get("f")).toBe("1 / 3");
    expect(comFixo.get("g")).toBe("1 / 1");
  });
});

describe("criar, apagar e redimensionar os blocos do quadro", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("o menu do bloco cria um bloco novo no fim (a grade ganha uma fileira) e guarda no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    expect(blocos()).toHaveLength(15);
    const menu = abrirMenu("Escala");
    fireEvent.click(within(menu).getByRole("button", { name: "Novo bloco" }));
    expect(screen.queryByRole("dialog", { name: /^Bloco / })).toBeNull();
    expect(blocos()).toHaveLength(16);
    expect(nomes()[15]).toBe("Bloco 1");
    const novo = screen.getByRole("region", { name: "Bloco 1" });
    expect(novo.getAttribute("data-pilar")).toBe("bloco-1");
    expect(novo.style.gridArea).toBe("4 / 1");
    expect(quadro().getAttribute("data-fileiras")).toBe("4");
    // As quatro células que sobraram na fileira nova são um "+".
    expect(screen.getAllByRole("button", { name: /^Novo bloco na vaga/ })).toHaveLength(4);
    expect(JSON.parse(localStorage.getItem(ORDEM_PILARES_KEY)!).at(-1)).toBe("bloco-1");
    const guardado = restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!;
    expect(guardado.blocos["bloco-1"]).toEqual({ nome: "Bloco 1", largura: 1, altura: 1 });
    expect(screen.getByRole("status").textContent).toContain("Bloco novo criado");
  });

  it("largura e altura mudam com − e +, dentro dos limites; o bloco ocupa as células e os outros se ajustam", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    let menu = abrirMenu("Teste de criativos");
    expect((within(menu).getByRole("button", { name: "Menos largo" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole("button", { name: "Mais largo" }));
    expect(within(menu).getByRole("group", { name: "Largura do bloco" }).textContent).toContain("Largura · 2");
    fireEvent.click(within(menu).getByRole("button", { name: "Mais alto" }));
    const criativos = screen.getByRole("region", { name: "Teste de criativos" });
    expect(criativos.getAttribute("data-largura")).toBe("2");
    expect(criativos.getAttribute("data-altura")).toBe("2");
    // Pelo ROAS, Teste de criativos é o 4º: (1,3) (1,4) (1,5) já ocupadas, o
    // 2×2 cabe a partir de (2,3).
    expect(vaga("Teste de criativos")).toBe("2 / 3 / span 2 / span 2");
    expect(vaga("Explosiva")).toBe("2 / 5");
    expect(vaga("Teste de público")).toBe("3 / 5");
    // Sem vaga nas três fileiras, os seguintes descem para a quarta.
    expect(vaga("Teste de página de vendas")).toBe("4 / 1");
    expect(quadro().getAttribute("data-fileiras")).toBe("4");
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.blocos["creative-test"]).toEqual({ largura: 2, altura: 2 });

    // Até 5 de largura e 3 de altura, e nunca menos de 1.
    for (let i = 0; i < 6; i++) {
      const mais = within(menu).getByRole("button", { name: "Mais largo" });
      if (!(mais as HTMLButtonElement).disabled) fireEvent.click(mais);
    }
    expect((within(menu).getByRole("button", { name: "Mais largo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(criativos.getAttribute("data-largura")).toBe("5");
    // Os seis fixos da esquerda ocupam as três fileiras: um bloco com a
    // largura toda só cabe numa fileira nova.
    expect(vaga("Teste de criativos")).toBe("4 / 1 / span 2 / span 5");
    expect(quadro().getAttribute("data-fileiras")).toBe("5");
    fireEvent.keyDown(document, { key: "Escape" });
    menu = abrirMenu("Teste de criativos");
    fireEvent.click(within(menu).getByRole("button", { name: "Menos alto" }));
    expect(criativos.getAttribute("data-altura")).toBe("1");
    expect((within(menu).getByRole("button", { name: "Menos alto" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("apagar um bloco de fábrica esconde-o (as campanhas dele aparecem no primeiro bloco) e ele pode ser restaurado", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    expect(within(screen.getByRole("region", { name: "Escala" })).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    const menu = abrirMenu("Escala");
    fireEvent.click(within(menu).getByRole("button", { name: "Apagar bloco" }));
    expect(screen.queryByRole("region", { name: "Escala" })).toBeNull();
    expect(blocos()).toHaveLength(14);
    // A campanha não perde a classe: só aparece no primeiro bloco do quadro.
    expect(within(screen.getByRole("region", { name: "Teste de criativos" })).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(localStorage.getItem("dash-luxury:campaign-classes:v1")).toBeNull();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.removidos).toEqual(["scale"]);
    // Sobrou uma célula vazia: o "+" cria um bloco fixado ali.
    expect(screen.getAllByRole("button", { name: /^Novo bloco na vaga/ })).toHaveLength(1);

    const outro = abrirMenu("Explosiva");
    fireEvent.click(within(outro).getByRole("button", { name: "Restaurar bloco Escala" }));
    expect(blocos()).toHaveLength(15);
    expect(within(screen.getByRole("region", { name: "Escala" })).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.removidos).toEqual([]);
  });

  it("o '+' de uma célula vazia cria um bloco fixado nela; uma campanha solta num bloco criado fica ligada a ele sem mudar de classe", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    fireEvent.click(within(abrirMenu("Explosiva")).getByRole("button", { name: "Apagar bloco" }));
    const livre = screen.getByRole("button", { name: "Novo bloco na vaga 3, 5" });
    fireEvent.click(livre);
    const novo = screen.getByRole("region", { name: "Bloco 1" });
    expect(novo.style.gridArea).toBe("3 / 5");
    expect(novo.getAttribute("data-pilar-fixo")).toBe("true");
    expect(JSON.parse(localStorage.getItem(FIXOS_KEY)!)["bloco-1"]).toBe("3 / 5");

    const cartao = screen.getByRole("button", { name: "Detalhes de Escala Produto A" });
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(cartao, { dataTransfer });
    fireEvent.dragOver(novo, { dataTransfer });
    fireEvent.drop(novo, { dataTransfer });
    expect(within(novo).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(localStorage.getItem("dash-luxury:campaign-classes:v1")).toBeNull();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.campanhas).toEqual({ "demo:meta:demo-a1": "bloco-1" });
    expect(screen.getByRole("status").textContent).toContain("foi para o bloco Bloco 1");

    // De volta a um bloco de fábrica: recebe a classe dele e deixa o bloco criado.
    const oferta = screen.getByRole("region", { name: "Teste de oferta" });
    fireEvent.dragStart(screen.getByRole("button", { name: "Detalhes de Escala Produto A" }), { dataTransfer });
    fireEvent.dragOver(oferta, { dataTransfer });
    fireEvent.drop(oferta, { dataTransfer });
    expect(within(oferta).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.campanhas).toEqual({});

    // Apagar o bloco criado: some de vez, e o que estava nele volta para a classe.
    fireEvent.dragStart(screen.getByRole("button", { name: "Detalhes de Escala Produto A" }), { dataTransfer });
    fireEvent.dragOver(novo, { dataTransfer });
    fireEvent.drop(novo, { dataTransfer });
    fireEvent.click(within(abrirMenu("Bloco 1")).getByRole("button", { name: "Apagar bloco" }));
    expect(screen.queryByRole("region", { name: "Bloco 1" })).toBeNull();
    expect(within(oferta).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!.blocos["bloco-1"]).toBeUndefined();
  });

  it("soltar uma campanha numa célula vazia cria um bloco ali já com ela dentro", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    fireEvent.click(within(abrirMenu("Explosiva")).getByRole("button", { name: "Apagar bloco" }));
    const livre = screen.getByRole("button", { name: "Novo bloco na vaga 3, 5" });
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(screen.getByRole("button", { name: "Detalhes de Escala Produto A" }), { dataTransfer });
    fireEvent.dragOver(livre, { dataTransfer });
    fireEvent.drop(livre, { dataTransfer });
    const novo = screen.getByRole("region", { name: "Bloco 1" });
    expect(novo.style.gridArea).toBe("3 / 5");
    expect(within(novo).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
  });

  it("o que está guardado volta ao abrir; dados inválidos são ignorados; o último bloco não pode ser apagado", () => {
    localStorage.setItem(BLOCOS_KEY, JSON.stringify({
      version: 1,
      blocos: { "bloco-3": { nome: "Lançamentos", largura: 2, altura: 1 }, scale: { largura: 1, altura: 3 }, "bloco-9": { largura: 1, altura: 1 } },
      removidos: ["explosive", "bloco-3", "banana"],
      campanhas: { "demo:meta:demo-a1": "bloco-3", "demo:meta:demo-a3": "bloco-9" },
    }));
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    // O cofre é um só por módulo: nos testes, avisa-o de que o storage mudou.
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: BLOCOS_KEY })));
    expect(screen.queryByRole("region", { name: "Explosiva" })).toBeNull();
    const lancamentos = screen.getByRole("region", { name: "Lançamentos" });
    expect(lancamentos.getAttribute("data-largura")).toBe("2");
    expect(within(lancamentos).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Escala" }).getAttribute("data-altura")).toBe("3");
    // "bloco-9" não tem nome: não existe; a campanha dele fica na classe dela.
    expect(screen.queryByRole("region", { name: "Bloco 9" })).toBeNull();
    expect(restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)).toEqual({
      blocos: { "bloco-3": { nome: "Lançamentos", largura: 2, altura: 1 }, scale: { largura: 1, altura: 3 } },
      removidos: ["explosive"],
      campanhas: { "demo:meta:demo-a1": "bloco-3" },
    });
    expect(restoreBoardBlocks(JSON.stringify({ version: 1, blocos: { scale: { largura: 9, altura: 1 } }, removidos: [], campanhas: {} }))).toBeNull();
    expect(restoreBoardBlocks("{")).toBeNull();

    // Apaga tudo menos um: o último fica.
    for (const nome of nomes().slice(1)) {
      fireEvent.click(within(abrirMenu(nome!)).getByRole("button", { name: "Apagar bloco" }));
    }
    expect(blocos()).toHaveLength(1);
    const ultimo = abrirMenu(nomes()[0]!);
    expect((within(ultimo).getByRole("button", { name: "Apagar bloco" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("'Nova faixa' cria uma fileira nova com cinco blocos fixados; 'Apagar faixa' apaga os cinco e sobe as fileiras de baixo", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limparCofre();
    fireEvent.click(within(abrirMenu("Escala")).getByRole("button", { name: "Nova faixa" }));
    expect(blocos()).toHaveLength(20);
    expect(quadro().getAttribute("data-fileiras")).toBe("4");
    for (let c = 1; c <= 5; c++) {
      const bloco = screen.getByRole("region", { name: `Bloco ${c}` });
      expect(bloco.style.gridArea).toBe(`4 / ${c}`);
      expect(bloco.getAttribute("data-pilar-fixo")).toBe("true");
    }
    expect(screen.queryAllByRole("button", { name: /^Novo bloco na vaga/ })).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toContain("Faixa 4 criada com 5 blocos");

    // Mais uma faixa: fileira 5.
    fireEvent.click(within(abrirMenu("Bloco 3")).getByRole("button", { name: "Nova faixa" }));
    expect(blocos()).toHaveLength(25);
    expect(screen.getByRole("region", { name: "Bloco 8" }).style.gridArea).toBe("5 / 3");

    // Apagar a faixa 4 pelo menu de um bloco dela: somem os cinco, e a faixa 5 vira 4.
    const menu = abrirMenu("Bloco 2");
    expect(within(menu).getByRole("button", { name: "Apagar faixa 4" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("button", { name: "Apagar faixa 4" }));
    expect(blocos()).toHaveLength(20);
    expect(screen.queryByRole("region", { name: "Bloco 2" })).toBeNull();
    expect(screen.getByRole("region", { name: "Bloco 8" }).style.gridArea).toBe("4 / 3");
    expect(quadro().getAttribute("data-fileiras")).toBe("4");
    expect(JSON.parse(localStorage.getItem(FIXOS_KEY)!)["bloco-8"]).toBe("4 / 3");

    // Apagar a faixa 1 (pilares de fábrica): os cinco somem (de fábrica ficam restauráveis) e a fileira 2 sobe.
    const primeira = [...blocos()].filter((s) => (s as HTMLElement).style.gridArea.startsWith("1 /")).map((s) => s.getAttribute("aria-label"));
    expect(primeira).toHaveLength(5);
    fireEvent.click(within(abrirMenu(primeira[0]!)).getByRole("button", { name: "Apagar faixa 1" }));
    for (const nome of primeira) expect(screen.queryByRole("region", { name: nome! })).toBeNull();
    expect(blocos()).toHaveLength(15);
    expect(screen.getByRole("region", { name: "Outras campanhas 2" }).style.gridArea).toBe("1 / 1");
    const guardado = restoreBoardBlocks(localStorage.getItem(BLOCOS_KEY)!)!;
    expect(guardado.removidos.length).toBeGreaterThan(0);
    expect(within(abrirMenu("Outras campanhas 2")).getAllByRole("button", { name: /^Restaurar bloco/ }).length).toBe(guardado.removidos.length);
  });
});
