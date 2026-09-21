"use client";

import * as React from "react";
import { Megaphone, Store } from "lucide-react";

import { formatCurrency, formatInteger, formatRatio } from "@/features/unified-dashboard/formatters";

import {
  ROTULO_DO_SINAL,
  numerosDaOferta,
  ordenarOfertas,
  recebeTrafego,
  resumoDaLoja,
  sinalDaOferta,
  type LojaComOfertas,
} from "./offer-traffic";
import type { PanoramaDasLojas } from "./queries";

/*
  As lojas ligadas ao painel e, dentro de cada uma, as ofertas ativas que
  estão a receber tráfego. Cada oferta diz por que está nesta lista —
  campanha ligada, visitas ou vendas — e mostra o que a campanha
  investiu e devolveu. Quem não recebe tráfego fica numa lista à parte,
  fechada, para a página não ser um catálogo.
*/

const dinheiro = (cents: number) => formatCurrency(cents / 100, Math.abs(cents) < 10_000 ? 2 : 0);

export function StoresPanel({ panorama }: { panorama: PanoramaDasLojas }) {
  if (!panorama.bancoConfigurado) {
    return (
      <p className="dash-lojas-vazio">
        Sem banco ligado não há loja para mostrar. Assim que o banco estiver conectado, as lojas e as ofertas aparecem
        aqui, com o tráfego que cada uma recebe.
      </p>
    );
  }
  if (panorama.lojas.length === 0) {
    return <p className="dash-lojas-vazio">Nenhuma loja ligada a este painel ainda.</p>;
  }
  return (
    <div className="dash-lojas">
      {panorama.lojas.map((loja) => (
        <LojaNoPainel key={loja.id} loja={loja} dias={panorama.dias} />
      ))}
    </div>
  );
}

function LojaNoPainel({ loja, dias }: { loja: LojaComOfertas; dias: number }) {
  const [verParadas, setVerParadas] = React.useState(false);
  const resumo = resumoDaLoja(loja);
  const ativas = loja.ofertas.filter((o) => o.ativa);
  const comTrafego = ordenarOfertas(ativas.filter(recebeTrafego));
  const paradas = ordenarOfertas(ativas.filter((o) => !recebeTrafego(o)));

  return (
    <section className="dash-loja" aria-label={`Loja ${loja.nome}`}>
      <header>
        <Store aria-hidden="true" />
        <h2>{loja.nome}</h2>
        {!loja.ativa && <span className="dash-loja-selo">Desligada</span>}
        <span className="dash-loja-conta">
          {resumo.comTrafego} de {resumo.ativas} {resumo.ativas === 1 ? "oferta ativa" : "ofertas ativas"} a receber tráfego
        </span>
      </header>

      <dl className="dash-loja-numeros">
        <div>
          <dt>Investido nas ofertas</dt>
          <dd>{dinheiro(resumo.spendCents)}</dd>
        </div>
        <div>
          <dt>Receita das ofertas</dt>
          <dd>{dinheiro(resumo.receitaCents)}</dd>
        </div>
        <div>
          <dt>Ofertas no catálogo</dt>
          <dd>{formatInteger(resumo.ofertas)}</dd>
        </div>
        <div>
          <dt>Período</dt>
          <dd>{dias} dias</dd>
        </div>
      </dl>

      <h3 className="dash-loja-titulo">Ofertas a receber tráfego</h3>
      {comTrafego.length === 0 ? (
        <p className="dash-lojas-vazio">Nenhuma oferta desta loja está a receber tráfego no período.</p>
      ) : (
        <ul className="dash-ofertas">
          {comTrafego.map((o) => {
            const n = numerosDaOferta(o);
            const sinal = sinalDaOferta(o);
            return (
              <li key={o.id} className="dash-oferta" data-sinal={sinal}>
                <div className="dash-oferta-topo">
                  <b title={o.nome}>{o.nome}</b>
                  <span className="dash-oferta-sinal" data-sinal={sinal}>{ROTULO_DO_SINAL[sinal]}</span>
                </div>
                <span className="dash-oferta-preco">{dinheiro(o.precoCents)}</span>
                <dl className="dash-oferta-numeros">
                  <div>
                    <dt>Investido</dt>
                    <dd>{dinheiro(n.spendCents)}</dd>
                  </div>
                  <div>
                    <dt>Retorno</dt>
                    <dd>{dinheiro(n.revenueCents)}</dd>
                  </div>
                  <div>
                    <dt>ROAS</dt>
                    <dd>{n.roas === null ? "—" : formatRatio(n.roas)}</dd>
                  </div>
                  <div>
                    <dt>Visitas</dt>
                    <dd>{formatInteger(o.visitas)}</dd>
                  </div>
                  <div>
                    <dt>Pedidos</dt>
                    <dd>{formatInteger(o.pedidos)}</dd>
                  </div>
                  <div>
                    <dt>Receita</dt>
                    <dd>{dinheiro(o.receitaCents)}</dd>
                  </div>
                </dl>
                {n.campanhas > 0 && (
                  <ul className="dash-oferta-campanhas" aria-label={`Campanhas de ${o.nome}`}>
                    {o.campanhas
                      .filter((c) => c.status === "active" && c.spendCents > 0)
                      .map((c) => (
                        <li key={c.id}>
                          <Megaphone aria-hidden="true" />
                          <span title={c.nome}>{c.nome}</span>
                          <i>{c.rede}</i>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {paradas.length > 0 && (
        <div className="dash-loja-paradas">
          <button type="button" aria-expanded={verParadas} onClick={() => setVerParadas((v) => !v)}>
            {verParadas ? "Esconder" : "Ver"} as {paradas.length} {paradas.length === 1 ? "oferta parada" : "ofertas paradas"}
          </button>
          {verParadas && (
            <ul className="dash-ofertas">
              {paradas.map((o) => (
                <li key={o.id} className="dash-oferta" data-sinal="nenhum">
                  <div className="dash-oferta-topo">
                    <b title={o.nome}>{o.nome}</b>
                    <span className="dash-oferta-sinal" data-sinal="nenhum">{ROTULO_DO_SINAL.nenhum}</span>
                  </div>
                  <span className="dash-oferta-preco">{dinheiro(o.precoCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
