"use client";

/*
  A aba "Métricas" do painel da página: visitas, cliques no botão de
  compra, até onde as pessoas rolam (mapa de profundidade), funil da
  página, botões, aparelho e origem. Números de demonstração (Fase 1);
  o script de métricas da página manda os reais na Fase 2.
*/

import * as React from "react";
import {
  PERIODOS,
  metricasDemo,
  num,
  pctTxt,
  segundos,
  type DiaMetrica,
  type Periodo,
} from "./page-metrics";

export function MetricasAba({ seed }: { seed: string }) {
  const [example, setExample] = React.useState(false);
  if (!example)
    return (
      <div className="pub__campo">
        <span>Sem medição conectada</span>
        <p className="pub__hint">
          Ainda não recebemos visitas, cliques ou rolagem desta página. Os
          pixels configurados são enviados aos seus provedores após
          consentimento; não inventamos resultados do seu site aqui.
        </p>
        <button
          type="button"
          className="pub__btn"
          onClick={() => setExample(true)}
        >
          Ver exemplo fictício de relatório
        </button>
      </div>
    );
  return (
    <>
      <p role="status" className="pub__hint">
        Exemplo fictício — estes números não representam seu negócio.
      </p>
      <button
        type="button"
        className="pub__btn"
        onClick={() => setExample(false)}
      >
        Fechar exemplo
      </button>
      <MetricasExemplo seed={seed} />
    </>
  );
}

function MetricasExemplo({ seed }: { seed: string }) {
  const [periodo, setPeriodo] = React.useState<Periodo>("30d");
  const m = React.useMemo(() => metricasDemo(seed, periodo), [seed, periodo]);
  const fimPct = m.profundidade[9];
  // Onde metade das pessoas já parou, e até onde quase todo mundo (80%+) vê.
  const metadeEm = m.profundidade.findIndex((p) => p < 50);
  const todosAte = m.profundidade.filter((p) => p >= 80).length;
  return (
    <>
      <div className="pmt__topo">
        <div className="pub__chips" role="radiogroup" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={periodo === p.id}
              className="pub__chip"
              data-on={periodo === p.id || undefined}
              onClick={() => setPeriodo(p.id)}
            >
              {p.nome}
            </button>
          ))}
        </div>
        <span className="pmt__demo">demonstração</span>
      </div>

      <div className="pmt__kpis">
        <Kpi
          rotulo="Visitas"
          valor={num(m.visitas)}
          sub={`${num(m.unicos)} pessoas · ${m.novosPct}% novas`}
        />
        <Kpi
          rotulo="Cliques no botão de compra"
          valor={num(m.cliquesCompra)}
          sub={`${pctTxt(m.ctrPct)} das visitas`}
          destaque
        />
        <Kpi
          rotulo="Rolaram até o fim"
          valor={pctTxt(fimPct)}
          sub={`${num(m.rolagem.p100)} pessoas`}
        />
        <Kpi
          rotulo="Tempo na página"
          valor={segundos(m.tempoMedioSeg)}
          sub={`${m.rejeicaoPct}% saem sem rolar`}
        />
      </div>

      <GraficoDias titulo="Visitas por dia" dados={m.porDia} chave="visitas" />
      <GraficoDias
        titulo="Cliques no botão de compra por dia"
        dados={m.porDia}
        chave="cliques"
      />

      {/* ── Até onde rolam: a página vista de cima, fatia por fatia ── */}
      <div className="pub__campo pmt__rolagem">
        <span>Até onde as pessoas rolam</span>
        <p className="pmt__frase">
          {metadeEm < 0
            ? "Mais da metade chega ao fim da página."
            : `Metade das pessoas para antes de ${metadeEm * 10}% da página.`}{" "}
          {todosAte > 0 &&
            `A parte mais vista vai do topo até ${todosAte * 10}%.`}{" "}
          Profundidade média: <b>{m.profundidadeMediaPct}%</b>.
        </p>
        <div
          className="pmt__mapa"
          role="img"
          aria-label={`Mapa de profundidade: ${m.profundidade.map((p, i) => `${i * 10}% da página vista por ${p}% das pessoas`).join("; ")}`}
        >
          {m.profundidade.map((p, i) => (
            <div
              key={i}
              className="pmt__fatia"
              data-botao={i === m.fatiaDoBotao || undefined}
            >
              <span className="pmt__fatia-pos">
                {i === 0 ? "topo" : i === 9 ? "fim" : `${i * 10}%`}
              </span>
              <span className="pmt__fatia-trilho">
                <i
                  style={{ width: `${p}%`, opacity: 0.35 + (p / 100) * 0.65 }}
                />
              </span>
              <span className="pmt__fatia-pct">{p}%</span>
              {i === m.fatiaDoBotao && (
                <span className="pmt__fatia-tag">🛒 botão de compra</span>
              )}
            </div>
          ))}
        </div>
        <div className="pmt__marcos">
          <Marco rotulo="25%" qtd={m.rolagem.p25} total={m.visitas} />
          <Marco rotulo="50%" qtd={m.rolagem.p50} total={m.visitas} />
          <Marco rotulo="75%" qtd={m.rolagem.p75} total={m.visitas} />
          <Marco rotulo="fim" qtd={m.rolagem.p100} total={m.visitas} />
        </div>
      </div>

      {/* ── Funil da página ─────────────────────────────────────── */}
      <div className="pub__campo pmt__funil">
        <span>Funil desta página</span>
        {m.funil.map((f, i) => {
          const pct = m.visitas ? Math.round((f.qtd / m.visitas) * 100) : 0;
          const ant = i > 0 ? m.funil[i - 1].qtd : 0;
          const passo = ant ? Math.round((f.qtd / ant) * 100) : 100;
          return (
            <div key={f.etapa} className="pmt__etapa">
              <span className="pmt__etapa-nome">{f.etapa}</span>
              <span className="pmt__etapa-trilho">
                <i style={{ width: `${pct}%` }} />
              </span>
              <span className="pmt__etapa-qtd">{num(f.qtd)}</span>
              <span className="pmt__etapa-pct">
                {i === 0 ? "100%" : `${passo}% da anterior`}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Botões de compra ────────────────────────────────────── */}
      <div className="pub__campo">
        <span>Botões de compra</span>
        {m.botoes.map((b) => (
          <div key={b.nome} className="pmt__botao">
            <span className="pmt__botao-nome">🛒 {b.nome}</span>
            <span className="pmt__botao-trilho">
              <i
                style={{
                  width: `${m.cliquesCompra ? (b.cliques / m.cliquesCompra) * 100 : 0}%`,
                }}
              />
            </span>
            <span className="pmt__botao-qtd">{num(b.cliques)}</span>
          </div>
        ))}
        <small className="pub__hint">
          Tempo médio até o primeiro clique:{" "}
          <b>{segundos(m.tempoAteCliqueSeg)}</b>.
        </small>
      </div>

      <Fatias titulo="Por aparelho" itens={m.porAparelho} />
      <Fatias titulo="De onde vieram" itens={m.porOrigem} />

      <small className="pub__hint">
        Números de exemplo. Na Fase 2 o script de métricas da página (aba
        Rastreio) envia visitas, cliques e rolagem de verdade.
      </small>
    </>
  );
}

function Kpi({
  rotulo,
  valor,
  sub,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sub: string;
  destaque?: boolean;
}) {
  return (
    <div className="pmt__kpi" data-destaque={destaque || undefined}>
      <span className="pmt__kpi-rotulo">{rotulo}</span>
      <b className="pmt__kpi-valor">{valor}</b>
      <span className="pmt__kpi-sub">{sub}</span>
    </div>
  );
}

function Marco({
  rotulo,
  qtd,
  total,
}: {
  rotulo: string;
  qtd: number;
  total: number;
}) {
  return (
    <span className="pmt__marco">
      <b>{total ? Math.round((qtd / total) * 100) : 0}%</b> chegam a {rotulo}
      <small>{num(qtd)} pessoas</small>
    </span>
  );
}

/** Barras por dia (uma série, um eixo), com dica ao passar o mouse. */
function GraficoDias({
  titulo,
  dados,
  chave,
}: {
  titulo: string;
  dados: DiaMetrica[];
  chave: "visitas" | "cliques";
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 400;
  const H = 120;
  const PAD = 4;
  const max = Math.max(1, ...dados.map((d) => d[chave]));
  const n = dados.length;
  const gap = n > 40 ? 1 : 2;
  const bw = (W - PAD * 2 - gap * (n - 1)) / n;
  const pico = dados.reduce(
    (a, d, i) => (d[chave] > dados[a][chave] ? i : a),
    0,
  );
  const total = dados.reduce((s, d) => s + d[chave], 0);
  const h = hover != null ? dados[hover] : null;
  return (
    <div className="pub__campo pmt__grafico">
      <span className="pmt__grafico-titulo">
        {titulo}
        <small>{num(total)} no período</small>
      </span>
      <div className="pmt__grafico-area" onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H + 18}`}
          className="pmt__svg"
          aria-label={`${titulo}: ${num(total)} no período; pico de ${num(dados[pico][chave])} em ${dados[pico].dia}`}
        >
          <line
            x1={PAD}
            x2={W - PAD}
            y1={H / 2}
            y2={H / 2}
            className="pmt__grade"
          />
          <line x1={PAD} x2={W - PAD} y1={H} y2={H} className="pmt__base" />
          {dados.map((d, i) => {
            const v = d[chave];
            const bh = Math.max(v > 0 ? 2 : 0, (v / max) * (H - 6));
            const x = PAD + i * (bw + gap);
            return (
              <g key={d.dia}>
                <rect
                  x={x}
                  y={H - bh}
                  width={bw}
                  height={bh}
                  rx={Math.min(3, bw / 2)}
                  className="pmt__barra"
                  data-hover={hover === i || undefined}
                />
                <rect
                  x={x - gap / 2}
                  y={0}
                  width={bw + gap}
                  height={H}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                />
                {i === pico && hover == null && (
                  <text
                    x={x + bw / 2}
                    y={H - bh - 4}
                    textAnchor="middle"
                    className="pmt__rotulo"
                  >
                    {num(v)}
                  </text>
                )}
              </g>
            );
          })}
          <text x={PAD} y={H + 13} className="pmt__eixo">
            {dados[0].dia}
          </text>
          <text x={W - PAD} y={H + 13} textAnchor="end" className="pmt__eixo">
            {dados[n - 1].dia}
          </text>
          <text x={PAD} y={H / 2 - 3} className="pmt__eixo pmt__eixo--halo">
            {num(Math.round(max / 2))}
          </text>
        </svg>
        {h && hover != null && (
          <div
            className="pmt__dica"
            style={{ left: `${((hover + 0.5) / n) * 100}%` }}
          >
            <b>{num(h[chave])}</b> {chave === "visitas" ? "visitas" : "cliques"}{" "}
            · {h.dia}
          </div>
        )}
      </div>
    </div>
  );
}

function Fatias({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { nome: string; pct: number }[];
}) {
  return (
    <div className="pub__campo pmt__fatias">
      <span>{titulo}</span>
      {itens.map((f) => (
        <div key={f.nome} className="pmt__botao">
          <span className="pmt__botao-nome">{f.nome}</span>
          <span className="pmt__botao-trilho">
            <i style={{ width: `${f.pct}%` }} />
          </span>
          <span className="pmt__botao-qtd">{f.pct}%</span>
        </div>
      ))}
    </div>
  );
}
