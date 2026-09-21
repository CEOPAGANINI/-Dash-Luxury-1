import { describe, expect, it } from "vitest";

import {
  campanhaFalaDaOferta,
  numerosDaOferta,
  ordenarOfertas,
  palavrasDe,
  recebeTrafego,
  resumoDaLoja,
  sinalDaOferta,
  type Oferta,
} from "@/features/stores/offer-traffic";

const oferta = (dados: Partial<Oferta> & { id: string }): Oferta => ({
  nome: dados.id,
  slug: dados.id,
  precoCents: 100_00,
  ativa: true,
  visitas: 0,
  pedidos: 0,
  receitaCents: 0,
  campanhas: [],
  ...dados,
});

const campanha = (dados: Partial<Oferta["campanhas"][number]> & { id: string }) => ({
  nome: dados.id,
  rede: "meta",
  status: "active",
  spendCents: 0,
  revenueCents: 0,
  ...dados,
});

describe("as ofertas de uma loja e quem recebe tráfego", () => {
  it("o sinal mais forte manda: campanha, depois vendas, depois visitas", () => {
    const comCampanha = oferta({ id: "a", campanhas: [campanha({ id: "c", spendCents: 100_00 })], visitas: 5, pedidos: 2 });
    expect(sinalDaOferta(comCampanha)).toBe("campanha");
    expect(sinalDaOferta(oferta({ id: "b", visitas: 3, pedidos: 1 }))).toBe("visitas");
    expect(sinalDaOferta(oferta({ id: "c", pedidos: 1 }))).toBe("vendas");
    expect(sinalDaOferta(oferta({ id: "d" }))).toBe("nenhum");
  });

  it("campanha pausada ou sem gasto não conta como tráfego", () => {
    const pausada = oferta({ id: "a", campanhas: [campanha({ id: "c", status: "paused", spendCents: 500_00 })] });
    expect(sinalDaOferta(pausada)).toBe("nenhum");
    const semGasto = oferta({ id: "b", campanhas: [campanha({ id: "c", spendCents: 0 })] });
    expect(sinalDaOferta(semGasto)).toBe("nenhum");
    expect(recebeTrafego(pausada)).toBe(false);
  });

  it("uma oferta despublicada nunca entra na lista, mesmo com campanha a gastar", () => {
    const fora = oferta({ id: "a", ativa: false, campanhas: [campanha({ id: "c", spendCents: 100_00 })] });
    expect(sinalDaOferta(fora)).toBe("campanha");
    expect(recebeTrafego(fora)).toBe(false);
  });

  it("os números somam só as campanhas acesas, e o ROAS não divide por zero", () => {
    const o = oferta({
      id: "a",
      campanhas: [
        campanha({ id: "c1", spendCents: 100_00, revenueCents: 300_00 }),
        campanha({ id: "c2", spendCents: 100_00, revenueCents: 100_00 }),
        campanha({ id: "c3", status: "paused", spendCents: 900_00, revenueCents: 900_00 }),
      ],
    });
    const n = numerosDaOferta(o);
    expect(n.campanhas).toBe(2);
    expect(n.spendCents).toBe(200_00);
    expect(n.revenueCents).toBe(400_00);
    expect(n.roas).toBe(2);
    expect(numerosDaOferta(oferta({ id: "b" })).roas).toBeNull();
  });

  it("liga a campanha à oferta pelo nome, ignorando palavras de toda a campanha", () => {
    const o = { nome: "Sérum Anti-Idade 30ml", slug: "serum-anti-idade" };
    expect(campanhaFalaDaOferta("Escala — Serum Anti Idade — CBO", o)).toBe(true);
    expect(campanhaFalaDaOferta("[TESTE] serum-anti-idade criativo 4", o)).toBe(true);
    // "Escala" e "teste" sozinhas não ligam nada.
    expect(campanhaFalaDaOferta("Escala geral — teste de criativos", o)).toBe(false);
    expect(campanhaFalaDaOferta("Kit Shampoo — escala", o)).toBe(false);
    expect(campanhaFalaDaOferta("", o)).toBe(false);
    // Acentos não atrapalham.
    expect(palavrasDe("Sérum Anti-Idade 30ml")).toEqual(["serum", "anti", "idade", "30ml"]);
  });

  it("a ordem é a de um painel: quem gasta mais primeiro, depois quem vende", () => {
    const lista = [
      oferta({ id: "so-visitas", visitas: 100 }),
      oferta({ id: "vende", pedidos: 3, receitaCents: 900_00 }),
      oferta({ id: "gasta-pouco", campanhas: [campanha({ id: "c", spendCents: 50_00 })] }),
      oferta({ id: "gasta-muito", campanhas: [campanha({ id: "c", spendCents: 500_00 })] }),
    ];
    expect(ordenarOfertas(lista).map((o) => o.id)).toEqual(["gasta-muito", "gasta-pouco", "vende", "so-visitas"]);
  });

  it("o resumo da loja conta as ativas, as com tráfego e soma o que elas moveram", () => {
    const loja = {
      id: "l1",
      nome: "Loja",
      slug: "loja",
      ativa: true,
      moeda: "BRL",
      ofertas: [
        oferta({ id: "a", campanhas: [campanha({ id: "c", spendCents: 200_00, revenueCents: 600_00 })], receitaCents: 600_00 }),
        oferta({ id: "b", visitas: 10, receitaCents: 0 }),
        oferta({ id: "c", ativa: false, campanhas: [campanha({ id: "c", spendCents: 900_00 })] }),
        oferta({ id: "d" }),
      ],
    };
    expect(resumoDaLoja(loja)).toEqual({ ofertas: 4, ativas: 3, comTrafego: 2, spendCents: 200_00, receitaCents: 600_00 });
  });
});
