import * as React from "react";

import styles from "./medidas.module.css";

/*
  As quatro formas de medida do painel, num sítio só: barra repartida,
  rosca, linha e colunas.

  O desenho vem do design system "Capital Overview Dashboard". A casca —
  superfície, borda, raio, texto — continua a ser a pele Orbit · PicGen;
  o que entra aqui é a paleta de séries e a gramática destas quatro
  formas.

  Antes delas o painel tinha 46 barras de porcentagem escritas à mão em
  20 ficheiros e 9 roscas com o seu próprio conic-gradient. A aparência
  vivia espalhada, e mudá-la era abrir vinte ficheiros e torcer.
*/

/** As sete séries, na ordem em que devem ser gastas. */
export const SERIES = [1, 2, 3, 4, 5, 6, 7] as const;
export type Serie = (typeof SERIES)[number];

function corDaSerie(s: Serie | undefined, i: number) {
  return `var(--serie-${s ?? ((i % 7) + 1)})`;
}

/** Prende a porcentagem entre 0 e 100 e arredonda a uma casa. */
export function porcentagem(parte: number, todo: number): number {
  if (!Number.isFinite(parte) || !Number.isFinite(todo) || todo <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((parte / todo) * 1000) / 10));
}

function pct(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export type Fatia = {
  chave: string;
  nome: string;
  valor: number;
  /** Fixa a série; sem isto, sai na ordem da lista. */
  serie?: Serie;
  /** O que aparece na legenda no lugar do número cru. */
  texto?: string;
};

function comFatias(fatias: Fatia[]) {
  const soma = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0);
  const partes = fatias.map((f, i) => ({
    ...f,
    cor: corDaSerie(f.serie, i),
    parte: porcentagem(f.valor, soma),
  }));
  /*
    A última fatia absorve o arredondamento.

    Arredondar cada uma por si dá somas como 100,1% — e numa fila de
    pedaços lado a lado isso empurra o último para fora do trilho. Quem
    fecha a conta é o último pedaço com valor, e não a soma de todos.
  */
  const ultimo = partes.map((p) => p.parte > 0).lastIndexOf(true);
  if (ultimo >= 0) {
    const resto = partes.reduce(
      (s, p, i) => (i === ultimo ? s : s + p.parte),
      0,
    );
    partes[ultimo].parte = Math.max(0, Math.round((100 - resto) * 10) / 10);
  }
  return partes;
}

/* ─── Barra repartida ────────────────────────────────────────────────── */

export function Barra({
  nome,
  total,
  fatias,
  legenda = true,
  className,
}: {
  nome: string;
  /** O número grande ao lado do nome. */
  total?: string;
  fatias: Fatia[];
  legenda?: boolean;
  className?: string;
}) {
  const partes = comFatias(fatias);
  const vazia = partes.every((p) => p.parte === 0);

  return (
    <div className={className ? `${styles.barra} ${className}` : styles.barra}>
      <div className={styles.barraTopo}>
        <span className={styles.barraNome}>{nome}</span>
        {total && <b className={styles.barraValor}>{total}</b>}
      </div>
      <div
        className={vazia ? `${styles.trilho} ${styles.vazia}` : styles.trilho}
        role="img"
        aria-label={
          vazia
            ? `${nome}: sem movimento`
            : `${nome}: ${partes.map((p) => `${p.nome} ${pct(p.parte)}`).join(", ")}`
        }
      >
        {partes.map((p, i) =>
          p.parte === 0 ? null : (
            <span
              key={p.chave}
              className={styles.pedaco}
              style={
                {
                  width: `${p.parte}%`,
                  "--cor": p.cor,
                  "--atraso": `${i * 100}ms`,
                } as React.CSSProperties
              }
            />
          ),
        )}
      </div>
      {legenda && (
        <div className={styles.legendaGrelha}>
          {partes.map((p) => (
            <div key={p.chave}>
              <p className={styles.legendaNome}>
                <i
                  className={styles.ponto}
                  style={{ "--cor": p.cor } as React.CSSProperties}
                  aria-hidden="true"
                />
                {p.nome}
              </p>
              <p className={styles.legendaValor}>{p.texto ?? p.valor}</p>
              <p className={styles.legendaPct}>{pct(p.parte)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Rosca ──────────────────────────────────────────────────────────── */

export function Rosca({
  nome,
  fatias,
  centro,
  nota,
  tamanho,
  legenda = true,
  className,
}: {
  nome: string;
  fatias: Fatia[];
  /** O que fica no meio: um número, uma porcentagem, o que for. */
  centro: string;
  nota?: string;
  tamanho?: number;
  legenda?: boolean;
  className?: string;
}) {
  const partes = comFatias(fatias);
  /*
    O conic-gradient é escrito por acumulação: cada fatia começa onde a
    anterior acabou. O que sobra até 100% fica com o trilho — é o buraco
    da rosca quando os dados não fecham o círculo.
  */
  let cursor = 0;
  const paradas: string[] = [];
  for (const p of partes) {
    if (p.parte === 0) continue;
    paradas.push(`${p.cor} ${cursor}% ${cursor + p.parte}%`);
    cursor += p.parte;
  }
  if (cursor < 100) paradas.push(`var(--trilho) ${cursor}% 100%`);

  return (
    <div
      className={className ? `${styles.rosca} ${className}` : styles.rosca}
      style={
        tamanho ? ({ "--tamanho": `${tamanho}px` } as React.CSSProperties) : undefined
      }
    >
      <div
        className={styles.anel}
        role="img"
        aria-label={
          paradas.length <= 1
            ? `${nome}: sem movimento`
            : `${nome}: ${partes
                .filter((p) => p.parte > 0)
                .map((p) => `${p.nome} ${pct(p.parte)}`)
                .join(", ")}`
        }
      >
        <span
          className={styles.anelFatias}
          style={{ "--fatias": paradas.join(", ") } as React.CSSProperties}
          aria-hidden="true"
        />
        <span className={styles.anelMiolo} aria-hidden="true">
          <strong>{centro}</strong>
          {nota && <small>{nota}</small>}
        </span>
      </div>
      {legenda && (
        <div className={styles.legendaLista}>
          {partes.map((p) => (
            <div key={p.chave}>
              <span className={styles.legendaNome}>
                <i
                  className={styles.ponto}
                  style={{ "--cor": p.cor } as React.CSSProperties}
                  aria-hidden="true"
                />
                {p.nome}
              </span>
              <b>{p.texto ?? pct(p.parte)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Linha ──────────────────────────────────────────────────────────── */

export type Linha = {
  chave: string;
  nome: string;
  valores: number[];
  serie?: Serie;
  /** Pinta a área por baixo, em degradê até ao transparente. */
  area?: boolean;
};

/** Os pontos de uma série, na caixa 0–100 por 0–40 do desenho. */
function caminho(valores: number[], minimo: number, maximo: number) {
  if (valores.length < 2) return { d: "", pontos: [] as [number, number][] };
  const vao = maximo - minimo || 1;
  const pontos = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * 100;
    /* Y cresce para baixo no SVG: o maior valor tem de ficar em cima. */
    const y = 40 - ((v - minimo) / vao) * 40;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [
      number,
      number,
    ];
  });
  return { d: pontos.map(([x, y]) => `${x},${y}`).join(" L"), pontos };
}

export function Grafico({
  nome,
  linhas,
  altura,
  legenda = true,
  className,
}: {
  nome: string;
  linhas: Linha[];
  altura?: number;
  legenda?: boolean;
  className?: string;
}) {
  const id = React.useId();
  const todos = linhas.flatMap((l) => l.valores).filter(Number.isFinite);
  const minimo = todos.length ? Math.min(...todos) : 0;
  const maximo = todos.length ? Math.max(...todos) : 1;

  const desenhadas = linhas.map((l, i) => ({
    ...l,
    cor: corDaSerie(l.serie, i),
    ...caminho(l.valores, minimo, maximo),
  }));

  return (
    <div className={className ? `${styles.linha} ${className}` : styles.linha}>
      {legenda && (
        <p className={styles.linhaLegenda}>
          {desenhadas.map((l) => (
            <span key={l.chave}>
              <i
                className={styles.ponto}
                style={{ "--cor": l.cor } as React.CSSProperties}
                aria-hidden="true"
              />
              {l.nome}
            </span>
          ))}
        </p>
      )}
      <div
        className={styles.linhaTela}
        style={
          altura ? ({ "--altura": `${altura}px` } as React.CSSProperties) : undefined
        }
        role="img"
        aria-label={`${nome}: ${desenhadas
          .map((l) => `${l.nome}, de ${l.valores.at(0)} a ${l.valores.at(-1)}`)
          .join("; ")}`}
      >
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {desenhadas.map((l, i) => (
              <linearGradient
                key={l.chave}
                id={`${id}-${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={l.cor} />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            ))}
          </defs>
          {desenhadas.map((l, i) =>
            l.area && l.d ? (
              <path
                key={`a-${l.chave}`}
                d={`M${l.d} L100,40 L0,40 Z`}
                fill={`url(#${id}-${i})`}
                opacity="0.12"
              />
            ) : null,
          )}
          {desenhadas.map((l) =>
            l.d ? (
              <path
                key={`l-${l.chave}`}
                d={`M${l.d}`}
                fill="none"
                stroke={l.cor}
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
          {desenhadas.map((l) =>
            l.pontos.length
              ? (() => {
                  const [x, y] = l.pontos[l.pontos.length - 1];
                  return (
                    <circle
                      key={`p-${l.chave}`}
                      cx={x}
                      cy={y}
                      r="1.5"
                      fill={l.cor}
                    />
                  );
                })()
              : null,
          )}
        </svg>
      </div>
    </div>
  );
}

/* ─── Colunas ────────────────────────────────────────────────────────── */

export type Coluna = {
  chave: string;
  nome: string;
  /** Uma ou mais pilhas na mesma coluna, de baixo para cima. */
  pilhas: { chave: string; valor: number; serie?: Serie }[];
};

export function Colunas({
  nome,
  colunas,
  altura,
  className,
}: {
  nome: string;
  colunas: Coluna[];
  altura?: number;
  className?: string;
}) {
  const topo = Math.max(
    1,
    ...colunas.map((c) => c.pilhas.reduce((s, p) => s + Math.max(0, p.valor), 0)),
  );

  return (
    <div
      className={className ? `${styles.colunas} ${className}` : styles.colunas}
      style={
        altura ? ({ "--altura": `${altura}px` } as React.CSSProperties) : undefined
      }
      role="img"
      aria-label={`${nome}: ${colunas
        .map(
          (c) =>
            `${c.nome} ${c.pilhas.reduce((s, p) => s + Math.max(0, p.valor), 0)}`,
        )
        .join(", ")}`}
    >
      {colunas.map((c) => (
        <div key={c.chave} className={styles.coluna}>
          {c.pilhas.map((p, i) => (
            <span
              key={p.chave}
              className={styles.pilha}
              style={
                {
                  height: `${porcentagem(p.valor, topo)}%`,
                  "--cor": corDaSerie(p.serie, i),
                } as React.CSSProperties
              }
            />
          ))}
          <span className={styles.colunaRotulo}>{c.nome}</span>
        </div>
      ))}
    </div>
  );
}
