import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClassBoard } from "@/features/ads/class-board";
import { CAMPANHAS_ROAS_KEY, INTERVALO_MINUTO_MS } from "@/features/ads/campaign-roas-history-store";
import { ORDEM_PAINEL_KEY, restoreCampaignPanelOrder } from "@/features/ads/campaign-panel-order-store";
import { demoCampaignRows } from "@/features/ads/demo-campaigns";
import { TAXAS_KEY } from "@/features/ads/fees-store";
import { GUARDRAILS_PADRAO } from "@/features/guardrails/rules";
import { formatCurrency } from "@/features/unified-dashboard/formatters";
import type { AdRow, CampaignRow, CampaignTree } from "@/features/ads/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const base = demoCampaignRows().find((c) => c.network === "meta")!;
const linha = (id: string, spend: number, revenue: number): CampaignRow => ({
  ...base,
  id,
  name: id,
  campaignClass: undefined,
  source: "manual",
  objective: "Vendas",
  status: "active",
  dailyBudgetCents: 200_00,
  syncedAt: "2026-09-20T12:00:00.000Z",
  metrics: { spendCents: spend, revenueCents: revenue, impressions: 100_000, clicks: 2_500, purchases: 50 },
});

const tree: CampaignTree = { modo: "banco", metaConectado: false, ultimaSync: null, campanhas: [linha("Alfa", 1000_00, 2500_00), linha("Beta", 500_00, 200_00)] };

/* A Alfa com anúncios: um vídeo e um estático, sempre novos a cada
   chamada (os testes mexem nos anúncios). Com `quantos` = 1 fica só o
   primeiro, para ver o carrossel de um criativo só. */
const comCriativos = (quantos = 2): CampaignTree => ({
  ...tree,
  campanhas: [
    {
      ...tree.campanhas[0],
      adSets: [
        {
          id: "s1", externalId: null, name: "Conjunto 1", status: "active", dailyBudgetCents: null,
          metrics: { spendCents: 300_00, revenueCents: 0, impressions: 0, clicks: 0, purchases: 0 },
          ads: ([
            { id: "a1", externalId: null, name: "Vídeo 30s", status: "active", creative: { title: "Olha isto", body: "Texto do anúncio" }, metrics: { spendCents: 100_00, revenueCents: 300_00, impressions: 1000, clicks: 50, purchases: 3 } },
            { id: "a2", externalId: null, name: "Estático", status: "active", creative: {}, metrics: { spendCents: 200_00, revenueCents: 100_00, impressions: 2000, clicks: 40, purchases: 1 } },
          ] as AdRow[]).slice(0, quantos),
        },
      ],
    },
    tree.campanhas[1],
  ],
});

describe("a seta abre os dados da campanha num bloco à direita do quadro", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("clicar na seta põe os blocos à esquerda e abre o gráfico e todos os números à direita", () => {
    localStorage.setItem(TAXAS_KEY, JSON.stringify({ version: 1, gatewayPercentual: 10 }));
    const agora = Date.now();
    localStorage.setItem(CAMPANHAS_ROAS_KEY, JSON.stringify({ version: 1, campanhas: { "meta:Alfa": [1.8, 2.2, 2.5].map((roas, i) => ({ t: agora - (2 - i) * INTERVALO_MINUTO_MS, roas })) } }));
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const bloco = screen.getByRole("region", { name: "Outras campanhas 1" });
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);

    const seta = within(bloco).getByRole("button", { name: "Abrir campanha Alfa" });
    fireEvent.click(seta);

    // As duas campanhas continuam no bloco; os dados abrem fora da grade,
    // como uma coluna do quadro, ao lado dos blocos.
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);
    const grade = screen.getByRole("region", { name: "Quadro de classes" });
    const quadro = grade.parentElement!;
    const dados = within(quadro).getByRole("group", { name: "Dados de Alfa" });
    expect(dados.parentElement).toBe(quadro);
    expect(quadro.getAttribute("data-campanha-aberta")).toBe("true");
    // A grade dos blocos vem antes do painel (esquerda e direita).
    expect(grade.compareDocumentPosition(dados) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Os blocos ficam onde estavam: a fileira 1 continua na linha 2 da grade.
    expect(bloco.style.gridArea.startsWith("2 /")).toBe(true);
    expect(dados.getAttribute("data-faixa")).toBe("1");
    expect(within(bloco).getByRole("button", { name: "Fechar campanha Alfa" }).getAttribute("aria-expanded")).toBe("true");
    // O topo do painel diz de quem são os dados e onde ela está.
    expect(dados.querySelector(".class-board-dados-nome")?.textContent).toBe("Alfa");
    expect(dados.querySelector(".class-board-dados-onde")?.textContent).toBe("Faixa 1 · Outras campanhas 1");

    // O gráfico por minuto e o lucro com a taxa do gateway.
    expect(within(dados).getByRole("figure", { name: "ROAS de Alfa a cada 1 minuto" }).querySelector("svg")?.getAttribute("data-pontos")).toBe("3");
    // 2.500 − 10% (250) − 1.000 = 1.250.
    expect(dados.querySelector(".class-board-dados-lucro > b")?.textContent).toBe(formatCurrency(1250, 0));
    expect(dados.querySelector(".class-board-dados-lucro")?.getAttribute("data-lucro")).toBe("positivo");

    // Todos os números e as fichas da campanha.
    // Só os números da campanha: os de cada criativo vivem no cartão dele.
    const pares = Object.fromEntries(
      [...dados.querySelectorAll("dl:not(.class-board-criativo-metricas) > div")].map((d) => [
        d.querySelector("dt")!.textContent,
        d.querySelector("dd")!.textContent,
      ]),
    );
    expect(Object.keys(pares)).toEqual([
      "Investimento", "Retorno", "ROAS", "Margem", "Compras", "CPA", "Impressões", "Cliques", "CTR", "CPC", "CPM", "Orçamento diário",
      "Estado", "Rede", "Objetivo", "Conjuntos", "Origem", "Sincronizada",
    ]);
    expect(pares.ROAS).toBe("2,50x");
    expect(pares.Compras).toBe("50");
    expect(pares.CTR).toBe("2,50%");
    expect(pares.Estado).toBe("Ativa");
    expect(pares.Rede).toBe("Meta Ads");
    expect(pares.Objetivo).toBe("Vendas");
    // O atalho para a página inteira continua ali.
    expect(within(dados).getByRole("link", { name: "Abrir a página" }).getAttribute("href")).toBe("/campanhas/campanha/Alfa?modo=real");

    // O X do painel fecha a faixa.
    fireEvent.click(within(dados).getByRole("button", { name: "Fechar dados de Alfa" }));
    expect(screen.queryByRole("group", { name: "Dados de Alfa" })).toBeNull();
    expect(within(bloco).getAllByRole("article")).toHaveLength(2);
    // A seta também fecha.
    fireEvent.click(within(bloco).getByRole("button", { name: "Abrir campanha Alfa" }));
    fireEvent.click(within(bloco).getByRole("button", { name: "Fechar campanha Alfa" }));
    expect(screen.queryByRole("group", { name: "Dados de Alfa" })).toBeNull();
  });

  it("o painel traz o feed dos criativos, do que mais investiu para o que menos investiu", () => {
    render(<ClassBoard tree={comCriativos()} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    const feed = screen.getByRole("region", { name: "Criativos de Alfa" });
    expect(within(feed).getByRole("heading", { name: "Criativos" })).toBeTruthy();
    expect(feed.textContent).toContain("2 anúncios");
    // Quem mais investiu vem primeiro.
    const cartoes = [...feed.querySelectorAll("li.class-board-criativo")];
    expect(cartoes.map((li) => li.querySelector("b")?.textContent)).toEqual(["Estático", "Vídeo 30s"]);
    // Sem miniatura, o texto do criativo ocupa o lugar da arte.
    expect(cartoes[1].querySelector('[data-arte="texto"] p')?.textContent).toBe("Texto do anúncio");
    // As setas existem; com tudo à vista (jsdom não rola), ficam desligadas.
    expect(within(feed).getByRole("button", { name: "Criativos anteriores" }).hasAttribute("disabled")).toBe(true);
    expect(within(feed).getByRole("button", { name: "Próximos criativos" })).toBeTruthy();
    // Cada criativo mostra quantas vendas fez, com o CPA ao lado.
    const vendasDe = (li: Element) => (li.querySelector(".class-board-criativo-vendas")?.textContent ?? "").replace(/\u00a0/g, " ");
    expect(vendasDe(cartoes[0])).toBe("1vendaCPA R$ 200");
    expect(cartoes[0].querySelector(".class-board-criativo-vendas")?.getAttribute("data-vendeu")).toBe("true");
    expect(vendasDe(cartoes[1])).toBe("3vendasCPA R$ 33,33");
    // Cada criativo mostra o semáforo e as métricas dele — as do criativo,
    // não as da campanha inteira.
    expect(within(cartoes[0] as HTMLElement).getByRole("img", { name: /^Saúde do criativo Estático: / })).toBeTruthy();
    const metricasDe = (li: Element) =>
      Object.fromEntries(
        [...li.querySelectorAll(".class-board-criativo-metricas > div")].map((d) => [
          d.querySelector("dt")!.textContent,
          (d.querySelector("dd")!.textContent ?? "").replace(/ /g, " "),
        ]),
      );
    expect(metricasDe(cartoes[0]).ROAS).toBe("0,50x");
    expect(metricasDe(cartoes[1])).toMatchObject({
      ROAS: "3,00x",
      Investido: "R$ 100",
      Impressões: "1.000",
      Cliques: "50",
      CTR: "5,00%",
      CPC: "R$ 2,00",
      CPM: "R$ 100",
    });
  });

  it("o feed é um carrossel: um criativo de cada vez, com pontinhos que levam a cada um", () => {
    render(<ClassBoard tree={comCriativos()} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    const feed = screen.getByRole("region", { name: "Criativos de Alfa" });
    const fila = feed.querySelector(".class-board-dados-criativos-fila")!;
    // A fila encaixa num criativo inteiro e cada cartão diz onde está.
    expect(fila.getAttribute("aria-roledescription")).toBe("carrossel");
    const cartoes = [...fila.querySelectorAll("li.class-board-criativo")];
    expect(cartoes.map((li) => li.getAttribute("aria-label"))).toEqual(["1 de 2: Estático", "2 de 2: Vídeo 30s"]);
    // O topo conta em que criativo se está.
    expect(feed.querySelector(".class-board-dados-criativos-topo > span > i")?.textContent).toBe("1/2");
    // Um pontinho por criativo; o do criativo aberto vem marcado.
    const pontos = within(feed).getAllByRole("button", { name: /^Ver o criativo / });
    expect(pontos.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Ver o criativo 1 de 2: Estático",
      "Ver o criativo 2 de 2: Vídeo 30s",
    ]);
    expect(pontos[0].getAttribute("aria-current")).toBe("true");
    expect(pontos[1].hasAttribute("aria-current")).toBe(false);
    expect(cartoes[0].getAttribute("data-aberto")).toBe("true");
    // Clicar num pontinho e nas setas manda a fila andar um criativo
    // inteiro (jsdom não rola sozinho — o que se vê é o pedido).
    const rolagens: { left?: number }[] = [];
    Object.defineProperty(fila, "clientWidth", { value: 320, configurable: true });
    (fila as HTMLElement).scrollTo = ((o: { left?: number }) => rolagens.push(o)) as unknown as typeof fila.scrollTo;
    fireEvent.click(pontos[1]);
    expect(rolagens.at(-1)).toMatchObject({ left: 320, behavior: "smooth" });
    // As setas do teclado fazem o mesmo, sem rolar a página.
    fireEvent.keyDown(fila, { key: "ArrowRight" });
    expect(rolagens).toHaveLength(2);
    expect(rolagens.at(-1)).toMatchObject({ left: 320, behavior: "smooth" });
    // Uma tecla que não é seta não mexe na fila.
    fireEvent.keyDown(fila, { key: "Enter" });
    expect(rolagens).toHaveLength(2);
    // Com um criativo só não há pontinhos nem contador — nada para navegar.
    cleanup();
    render(<ClassBoard tree={comCriativos(1)} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    const sozinho = screen.getByRole("region", { name: "Criativos de Alfa" });
    expect(sozinho.querySelector(".class-board-dados-criativos-pontos")).toBeNull();
    expect(sozinho.querySelector(".class-board-dados-criativos-topo > span > i")).toBeNull();
  });

  it("cada criativo mostra as métricas de cada posicionamento onde vendeu", () => {
    const comPosicoes = comCriativos();
    // O "Vídeo 30s" fez 3 vendas: 2 no stories e 1 no feed.
    comPosicoes.campanhas[0].adSets[0].ads[0].placements = [
      { id: "stories", plataforma: "instagram", metrics: { spendCents: 75_00, revenueCents: 300_00, impressions: 7_500, clicks: 150, purchases: 2 } },
      { id: "feed", plataforma: "facebook", metrics: { spendCents: 25_00, revenueCents: 25_00, impressions: 5_000, clicks: 50, purchases: 1 } },
    ];
    render(<ClassBoard tree={comPosicoes} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    const feed = screen.getByRole("region", { name: "Criativos de Alfa" });
    const cartoes = [...feed.querySelectorAll("li.class-board-criativo")];
    // O "Estático", sem partição sincronizada, não inventa posições.
    expect(cartoes[0].querySelector("b")?.textContent).toBe("Estático");
    expect(cartoes[0].querySelector(".class-board-criativo-posicoes")).toBeNull();
    const posicoes = [...cartoes[1].querySelectorAll(".class-board-criativo-posicoes > li")];
    // A posição que mais vendeu vem primeiro.
    expect(posicoes.map((li) => li.getAttribute("data-posicao"))).toEqual(["stories", "feed"]);
    const linha = (li: Element) => (li.textContent ?? "").replace(/ /g, " ");
    // Stories: 2 vendas, R$ 75 investidos, ROAS 4x, CPA R$ 37,50, CTR 2%, CPM R$ 10.
    expect(linha(posicoes[0])).toContain("Stories");
    expect(linha(posicoes[0])).toContain("2vendas");
    expect(linha(posicoes[0])).toContain("4,00x");
    expect(linha(posicoes[0])).toContain("CPA R$ 37,50");
    expect(linha(posicoes[0])).toContain("CTR 2,00%");
    expect(linha(posicoes[0])).toContain("CPM R$ 10,00");
    expect(linha(posicoes[0])).toContain("7.500 impr.");
    // Feed: as mesmas contas, com os números dele — 1 venda, CTR 1%, ROAS 1x.
    expect(linha(posicoes[1])).toContain("1venda");
    expect(linha(posicoes[1])).toContain("CTR 1,00%");
    expect(linha(posicoes[1])).toContain("1,00x");
    // As 3 vendas do anúncio estão todas repartidas: nada de "sem posição".
    expect(posicoes.some((li) => li.getAttribute("data-posicao") === "sem")).toBe(false);
  });

  it("as secções e os quadradinhos do painel arrastam-se, e a arrumação fica guardada", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    const dados = screen.getByRole("group", { name: "Dados de Alfa" });
    const secoes = () => [...dados.querySelectorAll(".class-board-dados-secao")].map((s) => s.getAttribute("data-secao"));
    expect(secoes()).toEqual(["grafico", "lucro", "numeros", "fichas", "criativos"]);

    // As setas do teclado na pega descem a secção do gráfico.
    fireEvent.keyDown(within(dados).getByRole("button", { name: "Mover a secção Gráfico do ROAS" }), { key: "ArrowDown" });
    expect(secoes()).toEqual(["lucro", "grafico", "numeros", "fichas", "criativos"]);
    expect(restoreCampaignPanelOrder(localStorage.getItem(ORDEM_PAINEL_KEY)!)?.secoes).toEqual(["lucro", "grafico", "numeros", "fichas", "criativos"]);

    // Arrastar um quadradinho para cima de outro troca a ordem dos números.
    const numeros = within(dados).getByRole("group", { name: "Números da campanha" });
    const ordemDosNumeros = () => [...numeros.querySelectorAll("[data-item]")].map((x) => x.getAttribute("data-item"));
    expect(ordemDosNumeros().slice(0, 3)).toEqual(["investimento", "retorno", "roas"]);
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: () => {}, getData: () => "investimento" };
    const investimento = numeros.querySelector('[data-item="investimento"]')!;
    const roas = numeros.querySelector('[data-item="roas"]')!;
    fireEvent.dragStart(investimento, { dataTransfer });
    fireEvent.dragOver(roas, { dataTransfer });
    fireEvent.drop(roas, { dataTransfer });
    expect(ordemDosNumeros().slice(0, 3)).toEqual(["retorno", "roas", "investimento"]);
    expect(restoreCampaignPanelOrder(localStorage.getItem(ORDEM_PAINEL_KEY)!)?.numeros.slice(0, 3)).toEqual(["retorno", "roas", "investimento"]);

    // Meia linha e linha inteira: é assim que duas secções ficam lado a lado.
    const largura = (id: string) => dados.querySelector(`[data-secao="${id}"]`)?.getAttribute("data-largura");
    const escolhida = (id: string) => dados.querySelector(`[data-secao="${id}"]`)?.getAttribute("data-escolhida");
    expect(largura("grafico")).toBe("2");
    // Uma meia sozinha continua a ocupar a linha toda: senão ficava
    // metade da linha em branco ao lado dela.
    fireEvent.click(within(dados).getByRole("button", { name: "Largura da secção Gráfico do ROAS: linha inteira" }));
    expect(escolhida("grafico")).toBe("1");
    expect(largura("grafico")).toBe("2");
    expect(restoreCampaignPanelOrder(localStorage.getItem(ORDEM_PAINEL_KEY)!)?.larguras.grafico).toBe(1);
    // Com a secção seguinte também em meia linha, as duas partilham a linha.
    fireEvent.click(within(dados).getByRole("button", { name: "Largura da secção Lucro: linha inteira" }));
    expect(largura("grafico")).toBe("1");
    expect(largura("lucro")).toBe("1");
    // As setas ← e → na pega fazem o mesmo.
    fireEvent.keyDown(within(dados).getByRole("button", { name: "Mover a secção Gráfico do ROAS" }), { key: "ArrowRight" });
    expect(escolhida("grafico")).toBe("2");
    expect(largura("lucro")).toBe("2");

    // Uma arrumação estragada volta ao padrão, sem quebrar.
    expect(restoreCampaignPanelOrder("{")).toBeNull();
    expect(restoreCampaignPanelOrder(JSON.stringify({ version: 1, secoes: ["inventada", "lucro"] }))?.secoes).toEqual(["lucro", "grafico", "numeros", "fichas", "criativos"]);
    // Uma largura inválida volta ao padrão em vez de virar uma coluna zero.
    expect(restoreCampaignPanelOrder(JSON.stringify({ version: 1, larguras: { grafico: 7, lucro: 1 } }))?.larguras).toEqual({
      grafico: 2, lucro: 1, numeros: 2, fichas: 2, criativos: 2,
    });
  });

  it("à esquerda fica uma faixa de cada vez, trocada pelos botões — sem rolagem", () => {
    render(<ClassBoard tree={tree} regras={GUARDRAILS_PADRAO} network="meta" />);
    const grade = screen.getByRole("region", { name: "Quadro de classes" });
    // Fechada, a grade mostra as três faixas.
    expect(within(grade).getAllByRole("group", { name: /^Faixa \d$/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    // Aberta, só a faixa da campanha (a 1) fica na seção da esquerda.
    const faixas = () => within(grade).getAllByRole("group", { name: /^Faixa \d$/ });
    expect(faixas().map((f) => f.getAttribute("data-faixa"))).toEqual(["1"]);
    expect(within(grade).getByRole("region", { name: "Outras campanhas 1" })).toBeTruthy();

    // Os botões trocam de faixa: um por faixa, mais as duas setas.
    const pager = screen.getByRole("navigation", { name: "Trocar de faixa" });
    expect(within(pager).getByRole("button", { name: "Faixa anterior" }).hasAttribute("disabled")).toBe(true);
    expect(within(pager).getByRole("button", { name: "Mostrar a faixa 1" }).getAttribute("aria-current")).toBe("true");

    fireEvent.click(within(pager).getByRole("button", { name: "Mostrar a faixa 3" }));
    expect(faixas().map((f) => f.getAttribute("data-faixa"))).toEqual(["3"]);
    expect(within(grade).queryByRole("region", { name: "Outras campanhas 1" })).toBeNull();
    expect(within(pager).getByRole("button", { name: "Próxima faixa" }).hasAttribute("disabled")).toBe(true);

    // A seta anterior volta uma faixa; os dados da campanha continuam abertos.
    fireEvent.click(within(pager).getByRole("button", { name: "Faixa anterior" }));
    expect(faixas().map((f) => f.getAttribute("data-faixa"))).toEqual(["2"]);
    expect(screen.getByRole("group", { name: "Dados de Alfa" })).toBeTruthy();

    // Ao fechar, a grade volta a mostrar tudo e o seletor some.
    fireEvent.click(screen.getByRole("button", { name: "Fechar dados de Alfa" }));
    expect(screen.queryByRole("navigation", { name: "Trocar de faixa" })).toBeNull();
    expect(faixas()).toHaveLength(3);
  });

  it("abrir uma campanha de outro bloco fecha a anterior: uma de cada vez no quadro", () => {
    // Alfa no bloco Escala, Beta no bloco das outras: blocos diferentes.
    const emBlocos: CampaignTree = { ...tree, campanhas: [{ ...tree.campanhas[0], campaignClass: "scale" }, tree.campanhas[1]] };
    render(<ClassBoard tree={emBlocos} regras={GUARDRAILS_PADRAO} network="meta" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Alfa" }));
    expect(screen.getByRole("group", { name: "Dados de Alfa" })).toBeTruthy();
    // A outra campanha continua visível no bloco dela.
    fireEvent.click(screen.getByRole("button", { name: "Abrir campanha Beta" }));
    expect(screen.queryByRole("group", { name: "Dados de Alfa" })).toBeNull();
    const dados = screen.getByRole("group", { name: "Dados de Beta" });
    // Beta perde dinheiro: o lucro fica negativo e em vermelho.
    expect(dados.querySelector(".class-board-dados-lucro")?.getAttribute("data-lucro")).toBe("negativo");
    expect(dados.querySelector(".class-board-dados-lucro > b")?.textContent).toMatch(/^−R\$\s/);
  });
});
