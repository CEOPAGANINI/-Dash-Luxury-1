import * as React from "react";

import styles from "./medidas.module.css";

/*
  As três formas de medida do painel, num sítio só.

  Antes destas, cada barra de porcentagem era um `style={{ width }}`
  escrito à mão — 46 delas, em 20 ficheiros — e cada rosca era um
  `conic-gradient` próprio, 9 ao todo. A aparência vivia espalhada, e
  mudá-la era abrir vinte ficheiros e torcer.

  A cor vem do tom, e o tom vem do significado: nunca se passa uma cor
  por fora. É o que impede a mesma ideia de sair verde numa tela e âmbar
  na seguinte.
*/

export type Tom =
  | "neutro"
  | "positivo"
  | "negativo"
  | "atencao"
  | "informativo";

const COR_DO_TOM: Record<Tom, string> = {
  neutro: "var(--foreground)",
  positivo: "var(--success)",
  negativo: "var(--destructive)",
  atencao: "var(--warning)",
  informativo: "var(--info)",
};

/** Prende a porcentagem entre 0 e 100 e arredonda a uma casa. */
export function porcentagem(parte: number, todo: number): number {
  if (!Number.isFinite(parte) || !Number.isFinite(todo) || todo <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((parte / todo) * 1000) / 10));
}

function rotulo(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export type Pedaco = {
  chave: string;
  nome: string;
  valor: number;
  tom?: Tom;
};

export function Barra({
  nome,
  valor,
  total = 100,
  tom = "neutro",
  textoDoValor,
  pedacos,
  legenda = true,
  className,
}: {
  /** O que a barra mede. Some da tela se não houver, mas continua no rótulo. */
  nome: string;
  valor?: number;
  total?: number;
  tom?: Tom;
  /** Substitui o "42%" por um texto próprio — "R$ 1.485,00", por exemplo. */
  textoDoValor?: string;
  /** Barra repartida: cada pedaço com a sua fatia e o seu tom. */
  pedacos?: Pedaco[];
  legenda?: boolean;
  className?: string;
}) {
  const repartida = pedacos && pedacos.length > 0;
  const soma = repartida
    ? pedacos.reduce((s, p) => s + Math.max(0, p.valor), 0)
    : 0;
  const pct = repartida ? 100 : porcentagem(valor ?? 0, total);

  return (
    <div
      className={className ? `${styles.barra} ${className}` : styles.barra}
      role="img"
      aria-label={
        repartida
          ? `${nome}: ${pedacos
              .map((p) => `${p.nome} ${rotulo(porcentagem(p.valor, soma))}`)
              .join(", ")}`
          : `${nome}: ${textoDoValor ?? rotulo(pct)}`
      }
    >
      <p className={styles.barraTopo}>
        <span className={styles.barraNome}>{nome}</span>
        <b className={styles.barraValor}>{textoDoValor ?? rotulo(pct)}</b>
      </p>
      <span className={styles.trilho}>
        {repartida ? (
          <span className={styles.pedacos}>
            {pedacos.map((p) => (
              <i
                key={p.chave}
                className={styles.pedaco}
                style={
                  {
                    width: `${porcentagem(p.valor, soma)}%`,
                    "--cor": COR_DO_TOM[p.tom ?? "neutro"],
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        ) : (
          <span
            className={styles.preenchido}
            style={
              {
                width: `${pct}%`,
                "--preenchido": COR_DO_TOM[tom],
              } as React.CSSProperties
            }
          />
        )}
      </span>
      {repartida && legenda && (
        <p className={styles.legenda}>
          {pedacos.map((p) => (
            <span
              key={p.chave}
              style={
                { "--cor": COR_DO_TOM[p.tom ?? "neutro"] } as React.CSSProperties
              }
            >
              <i aria-hidden="true" />
              {p.nome} {rotulo(porcentagem(p.valor, soma))}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function Rosca({
  nome,
  valor,
  total = 100,
  tom = "neutro",
  textoDoValor,
  nota,
  tamanho,
  className,
}: {
  nome: string;
  valor: number;
  total?: number;
  tom?: Tom;
  textoDoValor?: string;
  /** A linha pequena por baixo do número. */
  nota?: string;
  tamanho?: number;
  className?: string;
}) {
  const pct = porcentagem(valor, total);
  return (
    <div
      className={
        className ? `${styles.roscaCaixa} ${className}` : styles.roscaCaixa
      }
      style={tamanho ? ({ "--tamanho": `${tamanho}px` } as React.CSSProperties) : undefined}
      role="img"
      aria-label={`${nome}: ${textoDoValor ?? rotulo(pct)}`}
    >
      <span
        className={styles.rosca}
        style={
          {
            "--parte": `${pct}%`,
            "--preenchido": COR_DO_TOM[tom],
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
      <span className={styles.roscaCentro} aria-hidden="true">
        <strong>{textoDoValor ?? rotulo(pct)}</strong>
        {nota && <small>{nota}</small>}
      </span>
    </div>
  );
}
