import * as React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { BLOCK_TAGS_KEY, restoreBlockTags } from "@/features/ads/block-tags-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import type { CampaignTree } from "@/features/ads/types";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };

describe("tags dos blocos do quadro por classe", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  function limpar() {
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: BLOCK_TAGS_KEY }));
    });
  }

  it("cria uma tag pelo título do bloco, usa nela e guarda no navegador", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    limpar();
    const bloco = screen.getByRole("region", { name: /^Escala$/ });
    fireEvent.click(within(bloco).getByRole("button", { name: "Tag do bloco Escala" }));
    const painel = screen.getByRole("dialog", { name: "Bloco Escala" });
    expect(within(within(painel).getByRole("radiogroup", { name: "Cor da tag" })).getAllByRole("radio")).toHaveLength(15);
    fireEvent.change(within(painel).getByLabelText("Nome da nova tag"), { target: { value: "Produto A" } });
    fireEvent.click(within(painel).getByRole("radio", { name: "Vermelho" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Criar e usar" }));

    expect(screen.queryByRole("dialog", { name: /^Bloco / })).toBeNull();
    const titulo = within(bloco).getByRole("button", { name: "Tag do bloco Escala: Produto A" });
    expect(titulo.textContent).toBe("Produto A");
    // A faixa inteira do cabeçalho fica no neon da tag.
    const cabecalho = bloco.querySelector("header")!;
    expect(cabecalho.getAttribute("data-tag")).toBe("true");
    expect(cabecalho.style.getPropertyValue("--tag-neon")).toBe("#ff3b3b");
    const guardado = restoreBlockTags(localStorage.getItem(BLOCK_TAGS_KEY)!)!;
    expect(guardado.tags).toEqual([{ id: "produto-a", nome: "Produto A", cor: "vermelho" }]);
    expect(guardado.porPilar).toEqual({ scale: "produto-a" });
  });

  it("a mesma tag pode ir para outro bloco; 'Sem tag' deixa o bloco sem título; apagar a tag limpa os blocos", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {
      localStorage.setItem(BLOCK_TAGS_KEY, JSON.stringify({ version: 1, tags: [{ id: "lancamento", nome: "Lançamento", cor: "amarelo" }], porPilar: { scale: "lancamento" } }));
      window.dispatchEvent(new StorageEvent("storage", { key: BLOCK_TAGS_KEY }));
    });
    const escala = screen.getByRole("region", { name: /^Escala$/ });
    const explosiva = screen.getByRole("region", { name: /^Explosiva$/ });
    expect(within(escala).getByRole("button", { name: /^Tag do bloco Escala/ }).textContent).toBe("Lançamento");

    fireEvent.click(within(explosiva).getByRole("button", { name: "Tag do bloco Explosiva" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar tag Lançamento" }));
    expect(within(explosiva).getByRole("button", { name: /^Tag do bloco Explosiva/ }).textContent).toBe("Lançamento");

    fireEvent.click(within(escala).getByRole("button", { name: /^Tag do bloco Escala/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Sem tag/ }));
    expect(within(escala).getByRole("button", { name: "Tag do bloco Escala" }).textContent).toBe("");
    expect(escala.querySelector("header")?.getAttribute("data-tag")).toBeNull();

    fireEvent.click(within(explosiva).getByRole("button", { name: /^Tag do bloco Explosiva/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apagar tag Lançamento" }));
    expect(within(explosiva).getByRole("button", { name: "Tag do bloco Explosiva" }).textContent).toBe("");
    expect(restoreBlockTags(localStorage.getItem(BLOCK_TAGS_KEY)!)).toEqual({ tags: [], porPilar: {} });
  });

  it("não cria tag sem nome nem com nome repetido, e ignora dados inválidos guardados", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    act(() => {
      localStorage.setItem(BLOCK_TAGS_KEY, JSON.stringify({ version: 1, tags: [{ id: "vip", nome: "VIP", cor: "roxo" }], porPilar: {} }));
      window.dispatchEvent(new StorageEvent("storage", { key: BLOCK_TAGS_KEY }));
    });
    const bloco = screen.getByRole("region", { name: /^Pré-escala$/ });
    fireEvent.click(within(bloco).getByRole("button", { name: "Tag do bloco Pré-escala" }));
    const painel = screen.getByRole("dialog", { name: "Bloco Pré-escala" });
    expect(painel.parentElement).toBe(document.body);
    fireEvent.click(within(painel).getByRole("button", { name: "Criar e usar" }));
    expect(within(painel).getByRole("alert").textContent).toContain("Escreva o nome");
    fireEvent.change(within(painel).getByLabelText("Nome da nova tag"), { target: { value: "vip" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar e usar" }));
    expect(within(painel).getByRole("alert").textContent).toContain("Já existe");

    expect(restoreBlockTags(JSON.stringify({ version: 1, tags: [{ id: "x", nome: "", cor: "roxo" }], porPilar: {} }))).toBeNull();
    expect(restoreBlockTags(JSON.stringify({ version: 1, tags: [{ id: "x", nome: "Ok", cor: "verde-limao" }], porPilar: {} }))).toBeNull();
    // Um bloco apontando para tag que não existe perde a ligação, sem quebrar.
    expect(restoreBlockTags(JSON.stringify({ version: 1, tags: [], porPilar: { scale: "sumiu" } }))).toEqual({ tags: [], porPilar: {} });
  });
});
