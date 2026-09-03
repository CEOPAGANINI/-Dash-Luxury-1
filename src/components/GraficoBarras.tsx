import { diaMes, reaisCurto } from "@/lib/format";
import type { PontoDia } from "@/lib/metrics";

const LARGURA = 720;
const ALTURA = 240;
const MARGEM = { topo: 14, direita: 8, base: 26, esquerda: 54 };

/**
 * Entradas e saidas por dia, barras lado a lado sobre a mesma escala.
 * Desenhado a mao em SVG para nao carregar biblioteca de grafico.
 */
export default function GraficoBarras({ pontos }: { pontos: PontoDia[] }) {
  const larguraPlot = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;

  const maximoReal = Math.max(
    ...pontos.map((p) => Math.max(p.entradas, p.saidas)),
    0,
  );
  const teto = maximoReal > 0 ? maximoReal : 100;
  const escalaY = (v: number) => alturaPlot - (v / teto) * alturaPlot;

  const passo = larguraPlot / Math.max(pontos.length, 1);
  const larguraBarra = Math.max(passo / 2 - 1, 1);

  const linhas = [0, 0.5, 1].map((f) => ({ f, valor: teto * f }));
  const rotulosX = pontos.filter(
    (_, i) => i === 0 || i === pontos.length - 1 || i === Math.floor(pontos.length / 2),
  );

  return (
    <div className="rolagem">
      <svg
        className="grafico"
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Entradas e saídas por dia nos últimos 30 dias"
        style={{ minWidth: 520 }}
      >
        <g transform={`translate(${MARGEM.esquerda}, ${MARGEM.topo})`}>
          {linhas.map(({ f, valor }) => (
            <g key={f}>
              <line
                x1={0}
                x2={larguraPlot}
                y1={escalaY(valor)}
                y2={escalaY(valor)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={-8}
                y={escalaY(valor)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--faint)"
                fontSize={11}
                fontFamily="var(--mono)"
              >
                {reaisCurto(valor)}
              </text>
            </g>
          ))}

          {pontos.map((p, i) => {
            const x = i * passo;
            return (
              <g key={p.data}>
                <rect
                  x={x + 0.5}
                  y={escalaY(p.entradas)}
                  width={larguraBarra}
                  height={Math.max(alturaPlot - escalaY(p.entradas), p.entradas > 0 ? 1.5 : 0)}
                  fill="var(--ok)"
                  rx={1}
                />
                <rect
                  x={x + larguraBarra + 1.5}
                  y={escalaY(p.saidas)}
                  width={larguraBarra}
                  height={Math.max(alturaPlot - escalaY(p.saidas), p.saidas > 0 ? 1.5 : 0)}
                  fill="var(--off)"
                  rx={1}
                />
                <title>
                  {diaMes(p.data)} · entradas {reaisCurto(p.entradas)} · saídas{" "}
                  {reaisCurto(p.saidas)}
                </title>
              </g>
            );
          })}

          <line
            x1={0}
            x2={larguraPlot}
            y1={alturaPlot}
            y2={alturaPlot}
            stroke="var(--line)"
            strokeWidth={1}
          />

          {rotulosX.map((p) => {
            const i = pontos.indexOf(p);
            return (
              <text
                key={p.data}
                x={i * passo + larguraBarra}
                y={alturaPlot + 17}
                textAnchor="middle"
                fill="var(--faint)"
                fontSize={11}
                fontFamily="var(--mono)"
              >
                {diaMes(p.data)}
              </text>
            );
          })}
        </g>
      </svg>

      <div className="legenda">
        <span>
          <i style={{ background: "var(--ok)" }} /> Entradas
        </span>
        <span>
          <i style={{ background: "var(--off)" }} /> Saídas
        </span>
      </div>
    </div>
  );
}
