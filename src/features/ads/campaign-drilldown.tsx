"use client";

import * as React from "react";

import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { cn } from "@/lib/utils";
import { CELULA_ESTADO } from "./campaign-preview-table";
import {
  STATUS_LABEL,
  derivadas,
  type AdMetrics,
  type AdRow,
  type AdSetRow,
  type AdStatus,
  type CampaignRow,
} from "./types";

/*
  As três faixas da campanha, no jeito do Gerenciador de Anúncios do
  Facebook, uma embaixo da outra e cada uma abrindo dentro de si mesma:

  Faixa 1 · Campanha — a linha da campanha; "Abrir conjuntos" mostra os
    conjuntos como linhas dentro da própria faixa.
  Faixa 2 · Conjuntos — um conjunto por linha; "Abrir conjunto" mostra os
    anúncios (criativos) daquele conjunto logo abaixo dele, na mesma faixa.
  Faixa 3 · Anúncios — todos os anúncios agrupados por conjunto, com o
    criativo de cada um. Um conjunto pode ter vários criativos.

  Cada linha é um bloco de nome à esquerda e, à direita, 12 métricas em
  quadrados do mesmo tamanho (rótulo em cima, valor embaixo), em linhas
  sempre completas: 6, 4, 3 ou 2 por linha conforme a largura.
*/

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) =>
  v === null ? "—" : formatCurrency(v / 100, v < 10_000 ? 2 : 0);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function metricas(m: AdMetrics): [string, string][] {
  const d = derivadas(m);
  return [
    ["Gasto", cents(m.spendCents)],
    ["Impressões", m.impressions ? formatInteger(m.impressions) : "—"],
    ["Cliques", m.clicks ? formatInteger(m.clicks) : "—"],
    ["CTR", d.ctr === null ? "—" : formatPercent(d.ctr, 2)],
    ["CPC", centsExatos(d.cpcCents)],
    ["Compras", m.purchases ? formatInteger(m.purchases) : "—"],
    ["CPA", centsExatos(d.cpaCents)],
    ["Receita", cents(m.revenueCents)],
    ["ROAS", d.roas === null ? "—" : formatRatio(d.roas)],
    ["Conversão", m.clicks > 0 ? formatPercent(m.purchases / m.clicks, 2) : "—"],
  ];
}

function Celula({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("campaign-drill-celula", className)}>
      <span>{rotulo}</span>
      <b>{children}</b>
    </div>
  );
}

function Celulas({ status, orcamento, m }: { status: AdStatus; orcamento: number | null | "nenhum"; m: AdMetrics }) {
  return (
    <div className="campaign-drill-celulas">
      <div className="campaign-drill-grade">
      <Celula rotulo="Estado">
        <span className={cn("campaign-drill-estado", CELULA_ESTADO[status])}>{STATUS_LABEL[status]}</span>
      </Celula>
      <Celula rotulo="Orç./dia">
        {orcamento === "nenhum" || orcamento === null ? "—" : formatCurrency(orcamento / 100)}
      </Celula>
      {metricas(m).map(([rotulo, valor]) => (
        <Celula key={rotulo} rotulo={rotulo}>{valor}</Celula>
      ))}
      </div>
    </div>
  );
}

function Criativo({ anuncio: a }: { anuncio: AdRow }) {
  if (!a.creative.title && !a.creative.body) return null;
  return (
    <span className="campaign-drill-criativo">
      <small>Criativo</small>
      {a.creative.title && <b>{a.creative.title}</b>}
      {a.creative.body && <em>{a.creative.body}</em>}
    </span>
  );
}

function Linha({
  tipo,
  sub,
  aberto,
  nome,
  detalhe,
  acao,
  criativo,
  status,
  orcamento,
  m,
}: {
  tipo: "campanha" | "conjunto" | "anuncio";
  sub?: boolean;
  aberto?: boolean;
  nome: string;
  detalhe: string;
  acao?: React.ReactNode;
  criativo?: React.ReactNode;
  status: AdStatus;
  orcamento: number | null | "nenhum";
  m: AdMetrics;
}) {
  return (
    <div className="campaign-drill-linha" data-tipo={tipo} data-sub={sub || undefined} data-aberto={aberto}>
      <div className="campaign-drill-nome">
        <b>{sub && <span aria-hidden className="campaign-drill-ramo">└ </span>}{nome}</b>
        <small>{detalhe}</small>
        {criativo}
        {acao}
      </div>
      <Celulas status={status} orcamento={orcamento} m={m} />
    </div>
  );
}

/** Uma faixa é só as linhas — sem bloco de título; o nome fica no
    aria-label para leitores de tela. */
function Faixa({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} className="sessao campaign-drill" data-sessao={String(numero).padStart(2, "0")}>
      <div className="sessao-corpo campaign-drill-linhas">{children}</div>
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="campaign-drill-vazio">{children}</p>;
}

export function CampaignDrilldown({ campanha: c, primeira = 1 }: { campanha: CampaignRow; primeira?: number }) {
  const [campanhaAberta, setCampanhaAberta] = React.useState(false);
  const [abertos, setAbertos] = React.useState<Set<string>>(() => new Set());

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const linhaAnuncio = (a: AdRow, s: AdSetRow, sub?: boolean) => (
    <Linha
      key={a.id}
      tipo="anuncio"
      sub={sub}
      nome={a.name}
      detalhe={`Anúncio · conjunto ${s.name}`}
      criativo={<Criativo anuncio={a} />}
      status={a.status}
      orcamento="nenhum"
      m={a.metrics}
    />
  );

  return (
    <>
      <Faixa numero={primeira} titulo="Campanha">
        <Linha
          tipo="campanha"
          aberto={campanhaAberta}
          nome={c.name}
          detalhe={`${c.objective ?? "Sem objetivo"} · ${plural(c.adSets.length, "conjunto", "conjuntos")}`}
          status={c.status}
          orcamento={c.dailyBudgetCents}
          m={c.metrics}
          acao={
            <button
              type="button"
              className="campaign-drill-abrir"
              aria-expanded={campanhaAberta}
              onClick={() => setCampanhaAberta((v) => !v)}
              aria-label={`${campanhaAberta ? "Fechar" : "Abrir"} conjuntos de ${c.name}`}
            >
              {campanhaAberta ? "Fechar conjuntos" : "Abrir conjuntos"}
            </button>
          }
        />
        {campanhaAberta &&
          c.adSets.map((s) => (
            <Linha
              key={s.id}
              tipo="conjunto"
              sub
              nome={s.name}
              detalhe={`Conjunto · ${plural(s.ads.length, "anúncio", "anúncios")}`}
              status={s.status}
              orcamento={s.dailyBudgetCents}
              m={s.metrics}
            />
          ))}
        {campanhaAberta && c.adSets.length === 0 && <Vazio>Nenhum conjunto ainda.</Vazio>}
      </Faixa>

      <Faixa numero={primeira + 1} titulo="Conjuntos de anúncios">
        {c.adSets.map((s) => {
          const aberto = abertos.has(s.id);
          return (
            <React.Fragment key={s.id}>
              <Linha
                tipo="conjunto"
                aberto={aberto}
                nome={s.name}
                detalhe={plural(s.ads.length, "anúncio", "anúncios")}
                status={s.status}
                orcamento={s.dailyBudgetCents}
                m={s.metrics}
                acao={
                  <button
                    type="button"
                    className="campaign-drill-abrir"
                    aria-expanded={aberto}
                    onClick={() => alternar(s.id)}
                    aria-label={`${aberto ? "Fechar" : "Abrir"} conjunto ${s.name}`}
                  >
                    {aberto ? "Fechar conjunto" : "Abrir conjunto"}
                  </button>
                }
              />
              {aberto && s.ads.map((a) => linhaAnuncio(a, s, true))}
              {aberto && s.ads.length === 0 && <Vazio>Nenhum anúncio neste conjunto.</Vazio>}
            </React.Fragment>
          );
        })}
        {c.adSets.length === 0 && <Vazio>Nenhum conjunto ainda.</Vazio>}
      </Faixa>

      <Faixa numero={primeira + 2} titulo="Anúncios">
        {c.adSets.map((s) => (
          <React.Fragment key={s.id}>
            <div className="campaign-drill-grupo" data-tipo="grupo" role="heading" aria-level={4}>
              <span>Conjunto</span>
              <b>{s.name}</b>
              <span>{plural(s.ads.length, "criativo", "criativos")}</span>
            </div>
            {s.ads.map((a) => linhaAnuncio(a, s))}
            {s.ads.length === 0 && <Vazio>Nenhum anúncio neste conjunto.</Vazio>}
          </React.Fragment>
        ))}
        {c.adSets.length === 0 && <Vazio>Nenhum anúncio ainda.</Vazio>}
      </Faixa>
    </>
  );
}
