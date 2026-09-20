import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard, FAIXAS_ROAS, estadoDoRoas, numerosDoBloco } from "@/features/ads/class-board";
import { INTERVALO_AMOSTRA_MS, ROAS_HISTORICO_KEY, restoreRoasHistory } from "@/features/ads/roas-history-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { campaignClass, pilarDaClasse } from "@/features/ads/campaign-classes";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { derivadas, somarMetricas, type CampaignRow, type CampaignTree } from "@/features/ads/types";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { formatCompactCurrency, formatRatio } from "@/features/unified-dashboard/formatters";

afterEach(cleanup);

const tree: CampaignTree = { campanhas: demoCampaignRows(), modo: "demo", metaConectado: false, ultimaSync: null };
const meta = tree.campanhas.filter((c) => c.network === "meta");
const doBloco = (pilar: string) => meta.filter((c) => pilarDaClasse(campaignClass(c)) === pilar);

function linha(id: string, spend: number, revenue: number): CampaignRow {
  // Sem classe e com id fora dos exemplos: cai em "Outras campanhas 1".
  return { ...meta[0], id, name: id, campaignClass: undefined, source: "manual", metrics: { ...meta[0].metrics, spendCents: spend, revenueCents: revenue } };
}

describe("os números de cada bloco do quadro por classe", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("soma investimento e receita das campanhas do bloco e classifica o ROAS: ruim < 1,5x, mediano até 2x, ótimo de 2x para cima", () => {
    expect(numerosDoBloco([linha("a", 100_00, 300_00), linha("b", 100_00, 200_00)])).toEqual({ investimentoCents: 200_00, receitaCents: 500_00, roas: 2.5, estado: "otimo" });
    expect(numerosDoBloco([linha("a", 100_00, 150_00)]).estado).toBe("mediano");
    expect(numerosDoBloco([linha("a", 100_00, 120_00)]).estado).toBe("ruim");
    expect(numerosDoBloco([linha("a", 0, 0)])).toEqual({ investimentoCents: 0, receitaCents: 0, roas: null, estado: "sem" });
    expect(numerosDoBloco([]).estado).toBe("sem");
    expect(FAIXAS_ROAS).toEqual({ mediano: 1.5, otimo: 2 });
    expect([null, 0, 1.2, 1.49, 1.5, 1.99, 2, 3].map(estadoDoRoas)).toEqual(["sem", "ruim", "ruim", "ruim", "mediano", "mediano", "otimo", "otimo"]);
  });

  it("o cabeçalho mostra o investimento somado e o ROAS do bloco; sem investimento, nada", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const escala = screen.getByRole("region", { name: "Escala" });
    const campanhas = doBloco("scale");
    expect(campanhas.length).toBeGreaterThan(0);
    const soma = somarMetricas(campanhas.map((c) => c.metrics));
    const roas = derivadas(soma).roas!;
    const numeros = within(escala.querySelector("header")!).getByRole("button", { name: /^Números do bloco/ });
    // O número é só o investimento; o ROAS fica no rótulo e no lugar dele
    // entra o semáforo (três bolinhas, uma acesa).
    expect(numeros.textContent).toBe(formatCompactCurrency(soma.spendCents / 100));
    expect(numeros.getAttribute("aria-label")).toContain(`ROAS ${formatRatio(roas)}`);
    const semaforo = numeros.querySelector(".class-board-semaforo")!;
    expect([...semaforo.querySelectorAll("i")].map((i) => i.getAttribute("data-cor"))).toEqual(["vermelha", "laranja", "verde"]);
    expect(semaforo.querySelectorAll('i[data-acesa="true"]')).toHaveLength(1);
    expect(numeros.getAttribute("data-saude")).toBe(semaforo.getAttribute("data-saude"));
    const esperado = estadoDoRoas(roas);
    expect(numeros.getAttribute("data-roas")).toBe(esperado);
    expect(escala.getAttribute("data-roas")).toBe(esperado);
    // A contagem continua ao lado, por último.
    const filhos = [...escala.querySelector("header")!.children];
    expect(filhos.at(-1)?.className).toContain("class-board-pilar-contagem");
    expect(filhos.at(-2)).toBe(numeros);

    // Um bloco sem campanhas: sem números e sem traço.
    const vazio = screen.getByRole("region", { name: "Outras campanhas 4" });
    expect(within(vazio).queryByRole("button", { name: /^Números do bloco/ })).toBeNull();
    expect(vazio.getAttribute("data-roas")).toBe("sem");
  });

  it("ROAS ruim: o bloco ganha o traço (data-roas) e o rótulo diz a faixa", () => {
    // Em modo banco o quadro usa as campanhas recebidas (na demonstração usa a simulação).
    const tree2: CampaignTree = { ...tree, modo: "banco", campanhas: [linha("x1", 100_00, 150_00), linha("x2", 100_00, 30_00)] };
    render(<ClassBoard tree={tree2} regras={GUARDRAILS_PADRAO} network="meta" />);
    const bloco = screen.getByRole("region", { name: "Outras campanhas 1" });
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);
    const numeros = within(bloco.querySelector("header")!).getByRole("button", { name: /^Números do bloco/ });
    expect(numeros.getAttribute("aria-label")).toMatch(/ROAS 0,90x, ruim, prejuízo$/);
    expect(numeros.getAttribute("aria-label")).toMatch(/investimento R\$\s200,/);
    expect(numeros.getAttribute("title")).toContain("Semáforo: verde = lucro");
    expect(bloco.getAttribute("data-roas")).toBe("ruim");
    expect(numeros.textContent).toBe(formatCompactCurrency(200));
    // Retorno 180 − tráfego 200 = −20 (10% do investimento): vermelha acesa.
    expect(numeros.querySelector('.class-board-semaforo > i[data-acesa="true"]')?.getAttribute("data-cor")).toBe("vermelha");
  });

  it("clicar nos números abre o painel com todas as métricas somadas do bloco e o gráfico do ROAS ao vivo", () => {
    localStorage.clear();
    const tree2: CampaignTree = { ...tree, modo: "banco", campanhas: [linha("x1", 100_00, 150_00), linha("x2", 100_00, 300_00)] };
    render(<ClassBoard tree={tree2} regras={GUARDRAILS_PADRAO} network="meta" />);
    const bloco = screen.getByRole("region", { name: "Outras campanhas 1" });
    const botao = within(bloco).getByRole("button", { name: /^Números do bloco/ });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(botao);
    const painel = screen.getByRole("dialog", { name: "Números do bloco Outras campanhas 1" });
    expect(painel.parentElement).toBe(document.body);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(painel.querySelector(".class-board-bloco-numeros-titulo")?.textContent).toContain("2 campanhas somadas");
    const metricas = painel.querySelector("dl")!;
    const pares = Object.fromEntries([...metricas.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(Object.keys(pares)).toEqual(["Investimento", "Receita", "ROAS · ótimo", "Lucro", "Margem", "Compras", "CPA", "Impressões", "Cliques", "CTR", "CPC", "CPM"]);
    // O gráfico vem antes das métricas.
    expect(painel.querySelector("figure")!.compareDocumentPosition(metricas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pares.Investimento).toMatch(/^R\$\s200$/);
    expect(pares.Receita).toMatch(/^R\$\s450$/);
    expect(pares["ROAS · ótimo"]).toBe("2,25x");
    // A primeira leitura entrou ao abrir a página: o gráfico já tem um ponto.
    const figura = within(painel).getByRole("figure", { name: /^ROAS de Outras campanhas 1/ });
    expect(figura.querySelector("svg")?.getAttribute("data-pontos")).toBe("1");
    expect(figura.textContent).toContain("ROAS a cada 5 minutos");
    const guardado = restoreRoasHistory(localStorage.getItem(ROAS_HISTORICO_KEY)!)!;
    expect(guardado["meta:unclassified"]).toHaveLength(1);
    expect(guardado["meta:unclassified"][0].roas).toBe(2.25);
    // Esc fecha; clicar de novo reabre.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /^Números do bloco/ })).toBeNull();
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("o gráfico mostra as leituras guardadas (uma por cinco minutos) e a mais nova marcada com a faixa", () => {
    const agora = Date.now();
    const leituras = [0, 1, 2, 3].map((i) => ({ t: agora - (3 - i) * INTERVALO_AMOSTRA_MS, roas: [1.2, 1.6, 1.9, 2.4][i] }));
    localStorage.setItem(ROAS_HISTORICO_KEY, JSON.stringify({ version: 1, blocos: { "meta:unclassified": leituras } }));
    const tree2: CampaignTree = { ...tree, modo: "banco", campanhas: [linha("x1", 100_00, 240_00)] };
    // Ao montar, o cofre relê o histórico guardado; a leitura de agora cai na
    // mesma fatia da última (mesmo valor), então nada muda.
    render(<ClassBoard tree={tree2} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(within(screen.getByRole("region", { name: "Outras campanhas 1" })).getByRole("button", { name: /^Números do bloco/ }));
    const painel = screen.getByRole("dialog", { name: /^Números do bloco/ });
    const svg = painel.querySelector("svg")!;
    expect(svg.getAttribute("data-pontos")).toBe("4");
    // Linha em neon com a sombra em degradê; um ponto só, na leitura mostrada.
    expect(svg.querySelector("path.class-board-grafico-linha")).toBeTruthy();
    expect(svg.querySelector("path.class-board-grafico-sombra")?.getAttribute("fill")).toMatch(/^url\(#/);
    expect(svg.querySelectorAll(".class-board-grafico-faixa")).toHaveLength(2);
    // Sem mouse: só a linha, sem ponto, sem cursor, sem cartão, sem título visível.
    expect(svg.querySelectorAll("circle")).toHaveLength(0);
    expect(within(painel).queryByRole("status")).toBeNull();
    expect(painel.querySelector("figcaption")?.className).toContain("sr-only");
    expect(painel.querySelector(".class-board-bloco-numeros-titulo")?.textContent).not.toContain("ROAS");
    // Com o mouse sobre a linha: cursor, ponto e o cartão da leitura mais próxima (a primeira, aqui), com a variação e o máximo e o mínimo.
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 0 });
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("line.class-board-grafico-cursor")).toBeTruthy();
    const cartao = within(painel).getByRole("status");
    expect(cartao.querySelector(".class-board-grafico-cartao-valor")?.textContent).toBe("1,20x");
    expect(cartao.textContent).toContain("0,00% vs 24h atrás");
    expect(cartao.textContent).toContain("Máx: 2,40x");
    expect(cartao.textContent).toContain("Mín: 1,20x");
    fireEvent.pointerLeave(svg);
    expect(within(painel).queryByRole("status")).toBeNull();
    // A figura leva a cor da faixa da leitura mais nova (verde, ótimo).
    const figura = painel.querySelector("figure")!;
    expect(figura.getAttribute("data-faixa")).toBe("otimo");
    expect(figura.style.getPropertyValue("--serie")).toBe("#3dff6a");
    // Eixo apertado em volta dos valores (1,2x a 2,4x), à esquerda, em passos redondos.
    const eixo = [...svg.querySelectorAll("text.class-board-grafico-eixo")].map((t) => t.textContent).filter((t) => t?.endsWith("x"));
    expect(eixo).toEqual(["1,0x", "1,5x", "2,0x", "2,5x", "3,0x"]);
    // As pílulas de período: 24h por padrão; 1h mostra só as leituras da última hora (todas, aqui).
    const periodo = within(painel).getByRole("group", { name: "Período do gráfico" });
    expect(within(periodo).getAllByRole("button").map((b) => b.textContent)).toEqual(["1h", "3h", "12h", "24h"]);
    expect(within(periodo).getByRole("button", { name: "24h" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(periodo).getByRole("button", { name: "1h" }));
    expect(within(periodo).getByRole("button", { name: "1h" }).getAttribute("aria-pressed")).toBe("true");
    expect(painel.querySelector("svg")?.getAttribute("data-pontos")).toBe("4");
    fireEvent.pointerMove(painel.querySelector("svg")!, { clientX: 0, clientY: 0 });
    expect(within(painel).getByRole("status").textContent).toContain("vs 1h atrás");
    // A tabela das leituras existe para leitores de tela.
    expect(painel.querySelectorAll("table tbody tr")).toHaveLength(4);
  });
});
