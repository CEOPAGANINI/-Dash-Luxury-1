import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard, FAIXAS_POR_BLOCO, ORDEM_PILARES_KEY, faixasQueCabem, vagasDaGrade } from "@/features/ads/class-board";
import { resetDemoCampaignClasses } from "@/features/ads/campaign-class-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };

const pilares = () =>
  screen.getByRole("region", { name: "Quadro de classes" }).querySelectorAll(":scope > section");
const nomes = () => [...pilares()].map((s) => s.getAttribute("aria-label"));

const cabecalho = (nome: string) => screen.getByRole("region", { name: new RegExp(`^${nome}$`) }).querySelector("header") as HTMLElement;

function arrastarPilar(origem: string, destino: string) {
  const alca = cabecalho(origem);
  const alvo = screen.getByRole("region", { name: destino });
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(alca, { dataTransfer });
  fireEvent.dragOver(alvo, { dataTransfer });
  fireEvent.drop(alvo, { dataTransfer });
  fireEvent.dragEnd(alca, { dataTransfer });
}

describe("ordem dos pilares do quadro por classe", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("arrastar um bloco solto para cima de outro coloca-o antes dele e guarda no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    // Os cinco primeiros têm investimento (ordem do ROAS); os soltos começam no 6º.
    expect(nomes().slice(5, 7)).toEqual(["Teste de público", "Teste de página de vendas"]);

    arrastarPilar("Pré-escala", "Teste de público");
    expect(nomes().slice(5, 8)).toEqual(["Pré-escala", "Teste de público", "Teste de página de vendas"]);
    // A ordem guardada é a do usuário (a do ROAS é calculada na hora).
    expect(JSON.parse(localStorage.getItem(ORDEM_PILARES_KEY)!).slice(0, 3)).toEqual(["creative-test", "pre-scale", "audience-test"]);
    expect(screen.getByRole("status").textContent).toContain('Bloco "Pré-escala" movido');
  });

  it("os blocos com investimento ficam do maior ROAS para o menor e não se arrastam; os sem investimento vêm depois", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const roasDe = (nome: string) => {
      const s = screen.getByRole("region", { name: new RegExp(`^${nome}$`) });
      // O ROAS do bloco está no rótulo dos números (o semáforo não tem texto).
      const n = /ROAS ([\d.,]+)x/.exec(s.querySelector(".class-board-pilar-numeros")?.getAttribute("aria-label") ?? "")?.[1] ?? "";
      return n ? Number(n.replace(/\./g, "").replace(",", ".")) : null;
    };
    const lista = nomes().map((n) => roasDe(n!));
    const comRoas = lista.filter((r): r is number => r !== null);
    expect(comRoas.length).toBe(5);
    expect(lista.slice(0, 5)).toEqual(comRoas);
    for (let i = 1; i < comRoas.length; i++) expect(comRoas[i]).toBeLessThanOrEqual(comRoas[i - 1]);
    expect(lista.slice(5).every((r) => r === null)).toBe(true);
    const escala = screen.getByRole("region", { name: /^Escala$/ });
    expect(escala.getAttribute("data-pilar-ordenado")).toBe("true");
    expect(escala.querySelector("header")?.getAttribute("draggable")).toBe("false");
    expect(screen.getByRole("region", { name: /^Pré-escala$/ }).querySelector("header")?.getAttribute("draggable")).toBe("true");
    // Arrastar um bloco com ROAS não muda nada.
    const antes = nomes();
    arrastarPilar("Escala", "Teste de público");
    expect(nomes()).toEqual(antes);
    expect(localStorage.getItem(ORDEM_PILARES_KEY)).toBeNull();
  });

  it("mover um bloco anima os blocos da posição antiga para a nova; o aviso fica só para leitores de tela", () => {
    const animate = vi.fn(() => ({ cancel() {}, finished: Promise.resolve() }));
    const original = HTMLElement.prototype.animate;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    let chamada = 0;
    // Cada bloco "muda de lugar" a cada medição, como num reordenar real.
    rect.mockImplementation(() => ({ left: (chamada++ % 15) * 10, top: chamada * 3, width: 100, height: 100, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect);
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    try {
      render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
      expect(animate).not.toHaveBeenCalled();
      arrastarPilar("Pré-escala", "Teste de público");
      expect(animate).toHaveBeenCalled();
      const [quadros, opcoes] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
      expect(String(quadros[0].transform)).toMatch(/^translate\(/);
      expect(quadros[1].transform).toBe("none");
      expect(opcoes.duration).toBe(360);
      const status = screen.getByRole("status");
      expect(status.className).toContain("sr-only");
    } finally {
      HTMLElement.prototype.animate = original;
      rect.mockRestore();
    }
  });

  it("a ordem guardada volta ao abrir de novo e ignora valores inválidos", () => {
    localStorage.setItem(ORDEM_PILARES_KEY, JSON.stringify(["pre-scale", "banana", "checkout-test"]));
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {});
    // A ordem guardada vale entre os blocos sem investimento; os com ROAS vêm antes.
    expect(nomes().slice(5, 8)).toEqual(["Pré-escala", "Teste de checkout", "Teste de público"]);
    expect(nomes()).toHaveLength(15);
  });

  it("as setas no botão de mover trocam o pilar de posição", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const alca = cabecalho("Teste de página de vendas");
    fireEvent.keyDown(alca, { key: "ArrowLeft" });
    expect(nomes().slice(5, 7)).toEqual(["Teste de página de vendas", "Teste de público"]);
    fireEvent.keyDown(cabecalho("Teste de página de vendas"), { key: "ArrowRight" });
    expect(nomes().slice(5, 7)).toEqual(["Teste de público", "Teste de página de vendas"]);
    // O primeiro solto não sobe por cima dos blocos com ROAS.
    fireEvent.keyDown(cabecalho("Teste de público"), { key: "ArrowLeft" });
    expect(nomes().slice(5, 7)).toEqual(["Teste de público", "Teste de página de vendas"]);
  });

  it("arrastar um pilar não mexe nas campanhas nem nas classes delas", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const antes = within(screen.getByRole("region", { name: "Escala" })).getAllByRole("article").length;
    arrastarPilar("Pré-escala", "Teste de público");
    expect(within(screen.getByRole("region", { name: "Escala" })).getAllByRole("article")).toHaveLength(antes);
  });
});

describe("o bloco Teste de criativos é uma lista só, sem abas", () => {
  beforeEach(() => {
    // Um teste que move uma campanha na simulação mudaria o ROAS (e a
    // ordem) dos blocos nos testes seguintes: cada um parte do zero.
    resetDemoCampaignClasses();
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("não tem abas de vídeo e imagem: as campanhas de criativos ficam juntas, sem título no bloco", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const pilar = screen.getByRole("region", { name: "Teste de criativos" });
    expect(within(pilar).queryAllByRole("tab")).toHaveLength(0);
    expect(within(pilar).queryByRole("tabpanel")).toBeNull();
    const video = tree.campanhas.find((c) => c.id === "demo-a2")!;
    expect(within(pilar).getByRole("article", { name: `Cartão ${video.name}` })).toBeTruthy();
    expect(within(pilar).queryByRole("button", { name: /Adicionar um cartão/ })).toBeNull();
    // Sem título: o cabeçalho só tem alfinete, tag (ícone), os números e a contagem.
    const cabecalho = pilar.querySelector("header")!;
    expect(cabecalho.querySelector(".class-board-pilar-contagem")?.textContent).toBe(String(within(pilar).getAllByRole("article").length));
    expect(cabecalho.querySelector(".class-board-pilar-nome")?.textContent?.trim()).toBe("");
    expect(within(cabecalho).getByRole("button", { name: "Tag do bloco Teste de criativos" }).textContent).toBe("");
  });

  it("soltar uma campanha no bloco de criativos dá a classe de criativos", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const cartao = screen.getByRole("button", { name: "Detalhes de Escala Produto A" });
    const pilar = screen.getByRole("region", { name: "Teste de criativos" });
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(cartao, { dataTransfer });
    fireEvent.dragOver(pilar, { dataTransfer });
    fireEvent.drop(pilar, { dataTransfer });
    expect(within(pilar).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain('"Escala Produto A" foi para Teste de criativos.');
  });

  it("o nome da campanha na faixa tem no máximo 20 caracteres, com reticências, e o nome inteiro no title", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const longa = tree.campanhas.find((c) => c.network === "meta" && c.name.length > 20)!;
    const cartao = screen.getByRole("article", { name: `Cartão ${longa.name}` });
    const nome = cartao.querySelector(".class-board-cartao-nome")!;
    expect(nome.textContent!.length).toBeLessThanOrEqual(20);
    expect(nome.textContent!.endsWith("…")).toBe(true);
    expect(nome.getAttribute("title")).toBe(longa.name);
  });

  it("cada página do bloco mostra só as faixas que cabem (sem altura medida, todas)", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} />);
    for (const s of pilares()) {
      const paginas = Number(s.querySelector(".class-board-lista")?.getAttribute("data-paginas"));
      const porPagina = Number(s.querySelector(".class-board-lista-cartoes")?.getAttribute("data-faixas"));
      const cartoes = within(s as HTMLElement).queryAllByRole("article").length;
      expect(porPagina).toBeGreaterThanOrEqual(1);
      expect(cartoes).toBeLessThanOrEqual(porPagina);
      expect(paginas).toBeGreaterThanOrEqual(1);
    }
    // A conta de quantas faixas cabem: altura da lista, altura da faixa e vão.
    expect(faixasQueCabem(195, 32, 6)).toBe(5);
    expect(faixasQueCabem(264, 32, 6)).toBe(7);
    expect(faixasQueCabem(20, 32, 6)).toBe(1);
    expect(faixasQueCabem(0, 32, 6)).toBe(FAIXAS_POR_BLOCO);
  });

  it("os quinze pilares: primeiro os com investimento (ROAS decrescente), depois os outros na ordem pedida", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    expect(nomes()).toEqual([
      "Aquecimento de pixel", "Teste de oferta", "Escala", "Teste de criativos", "Explosiva",
      "Teste de público", "Teste de página de vendas", "Teste de checkout", "Pré-escala", "Outras campanhas 1", "Outras campanhas 2",
      "Outras campanhas 3", "Outras campanhas 4", "Outras campanhas 5", "Outras campanhas 6",
    ]);
  });

  it("os seis blocos 'Outras campanhas' ficam fixos à esquerda em duas colunas de três; os outros nove preenchem o resto", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    expect(screen.getByRole("region", { name: "Quadro de classes" }).getAttribute("data-colunas")).toBe("5");
    const vaga = (nome: string) => (screen.getByRole("region", { name: nome }) as HTMLElement).getAttribute("data-area");
    expect([1, 2, 3, 4, 5, 6].map((n) => vaga(`Outras campanhas ${n}`))).toEqual(["1 / 1", "2 / 1", "3 / 1", "1 / 2", "2 / 2", "3 / 2"]);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const bloco = screen.getByRole("region", { name: `Outras campanhas ${n}` });
      expect(bloco.getAttribute("data-pilar-fixo")).toBe("true");
      expect(bloco.querySelector("header")?.getAttribute("draggable")).toBe("false");
    }
    // Os soltos preenchem as vagas livres fileira a fileira, na ordem: a
    // conta é a mesma que a grade desenha (cada bloco recebe a sua vaga).
    expect(vaga("Aquecimento de pixel")).toBe("1 / 3");
    expect(vaga("Teste de oferta")).toBe("1 / 4");
    expect(vaga("Escala")).toBe("1 / 5");
    expect(vaga("Teste de criativos")).toBe("2 / 3");
    expect(vaga("Teste de público")).toBe("2 / 5");
    expect(vaga("Pré-escala")).toBe("3 / 5");
    for (const nome of ["Teste de criativos", "Escala", "Explosiva"]) {
      expect(screen.getByRole("region", { name: nome }).getAttribute("data-pilar-fixo")).toBeNull();
    }
    // Grade cheia: três fileiras e nenhuma célula vazia (nenhum "+").
    expect(screen.getByRole("region", { name: "Quadro de classes" }).getAttribute("data-fileiras")).toBe("3");
    expect(screen.queryAllByRole("button", { name: /^Novo bloco na vaga/ })).toHaveLength(0);
    for (const s of pilares()) {
      expect(s.getAttribute("data-pilar-largo")).toBeNull();
      expect(s.getAttribute("data-pilar-grande")).toBeNull();
      expect(s.getAttribute("data-pilar-duplo")).toBeNull();
      expect(s.querySelectorAll('.class-board-lista-cartoes[data-colunas="2"]')).toHaveLength(0);
    }
    expect(pilares()).toHaveLength(15);
  });

  it("qualquer pilar de trabalho pode ser arrastado para qualquer posição, inclusive antes do de criativos", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    arrastarPilar("Pré-escala", "Teste de público");
    expect(nomes().slice(5, 7)).toEqual(["Pré-escala", "Teste de público"]);
  });

  it("o alfinete fixa o bloco na vaga exata em que ele está, solta qualquer bloco, e guarda no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const vaga = (nome: string) => (screen.getByRole("region", { name: new RegExp(`^${nome}$`) }) as HTMLElement).getAttribute("data-area");
    fireEvent.click(screen.getByRole("button", { name: "Desafixar bloco Outras campanhas 3" }));
    const solto = screen.getByRole("region", { name: /^Outras campanhas 3$/ });
    expect(solto.getAttribute("data-pilar-fixo")).toBeNull();
    expect(solto.querySelector("header")?.getAttribute("draggable")).toBe("true");
    // Solto, é o 10º bloco livre: vai para a última vaga que sobrou.
    expect(vaga("Outras campanhas 3")).toBe("3 / 5");
    // Os outros fixos não se mexem: cada um continua na sua vaga.
    expect(vaga("Outras campanhas 4")).toBe("1 / 2");
    // Escala é o 3º pelo ROAS: as vagas livres, fileira a fileira, são
    // (1,3) (1,4) (1,5) … — ele está em 1 / 5.
    fireEvent.click(screen.getByRole("button", { name: "Fixar bloco Escala" }));
    const escala = screen.getByRole("region", { name: /^Escala$/ });
    expect(escala.getAttribute("data-pilar-fixo")).toBe("true");
    expect(vaga("Escala")).toBe("1 / 5");
    expect(JSON.parse(localStorage.getItem("dash-luxury:pilares-fixos:v1")!)).toEqual({ unclassified: "1 / 1", "others-2": "2 / 1", "others-4": "1 / 2", "big-1": "2 / 2", "big-2": "3 / 2", scale: "1 / 5" });
    expect(screen.getByRole("status").textContent).toContain('"Escala" fixado');
  });

  it("fixar depois de mover prende o bloco na vaga nova; o formato antigo (lista) ainda é lido", () => {
    localStorage.setItem("dash-luxury:pilares-fixos:v1", JSON.stringify(["unclassified", "others-2"]));
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {});
    const vaga = (nome: string) => (screen.getByRole("region", { name: new RegExp(`^${nome}$`) }) as HTMLElement).getAttribute("data-area");
    expect(vaga("Outras campanhas 1")).toBe("1 / 1");
    expect(vaga("Outras campanhas 2")).toBe("2 / 1");
    expect(screen.getByRole("region", { name: /^Outras campanhas 3$/ }).getAttribute("data-pilar-fixo")).toBeNull();
    expect(vaga("Outras campanhas 3")).toBe("3 / 2");
    // Depois dos cinco com ROAS ((1,2) a (2,2)), Teste de público está em 2 / 3 e
    // Teste de página de vendas em 2 / 4.
    expect(vaga("Teste de página de vendas")).toBe("2 / 4");
    fireEvent.keyDown(cabecalho("Teste de página de vendas"), { key: "ArrowLeft" });
    // Agora é o 1º solto → 2 / 3.
    fireEvent.click(screen.getByRole("button", { name: "Fixar bloco Teste de página de vendas" }));
    expect(vaga("Teste de página de vendas")).toBe("2 / 3");
    expect(vagasDaGrade(["a", "b"] as never, new Map([["a" as never, "1 / 1"]])).get("b" as never)).toBe("1 / 2");
  });

  it("arrastar um bloco por cima de outro abre espaço ao vivo, antes de soltar (depois de pousar um instante)", async () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const alca = cabecalho("Pré-escala");
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const pousar = async (nome: string) => {
      const alvo = screen.getByRole("region", { name: nome });
      fireEvent.dragOver(alvo, { dataTransfer });
      // Só de passagem não troca: precisa pousar sobre o bloco por um instante.
      await new Promise((r) => setTimeout(r, 140));
      fireEvent.dragOver(alvo, { dataTransfer });
    };
    fireEvent.dragStart(alca, { dataTransfer });
    fireEvent.dragOver(screen.getByRole("region", { name: "Teste de público" }), { dataTransfer });
    expect(nomes()[5]).toBe("Teste de público");
    await pousar("Teste de público");
    // Ainda sem soltar, a ordem já mudou (Pré-escala entrou antes de Teste de público).
    expect(nomes().slice(5, 7)).toEqual(["Pré-escala", "Teste de público"]);
    expect(localStorage.getItem(ORDEM_PILARES_KEY)).toBeNull();
    await pousar("Teste de página de vendas");
    // Indo para a frente, entra depois do destino.
    expect(nomes().slice(5, 8)).toEqual(["Teste de público", "Teste de página de vendas", "Pré-escala"]);
    fireEvent.drop(screen.getByRole("region", { name: "Teste de página de vendas" }), { dataTransfer });
    fireEvent.dragEnd(alca, { dataTransfer });
    expect(JSON.parse(localStorage.getItem(ORDEM_PILARES_KEY)!).slice(0, 4)).toEqual(["creative-test", "audience-test", "sales-page-test", "pre-scale"]);
  });

  it("soltar rápido, sem pousar, ainda coloca o bloco no destino", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    arrastarPilar("Pré-escala", "Teste de público");
    expect(nomes().slice(5, 7)).toEqual(["Pré-escala", "Teste de público"]);
    expect(JSON.parse(localStorage.getItem(ORDEM_PILARES_KEY)!)[1]).toBe("pre-scale");
  });

  it("soltar um pilar sobre um bloco fixo não muda a ordem", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const antes = nomes();
    arrastarPilar("Pré-escala", "Outras campanhas 3");
    expect(nomes()).toEqual(antes);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("o primeiro bloco 'Outras campanhas' recebe o que sai das classes", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {
      localStorage.setItem("dash-luxury:campaign-classes:v1", JSON.stringify({ version: 1, assignments: { "demo:meta:demo-a1": "unclassified" } }));
      window.dispatchEvent(new StorageEvent("storage", { key: "dash-luxury:campaign-classes:v1" }));
    });
    expect(within(screen.getByRole("region", { name: "Outras campanhas 1" })).getByRole("article", { name: "Cartão Escala Produto A" })).toBeTruthy();
  });
});
