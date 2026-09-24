"use client";

import * as React from "react";

import {
  CORES_BASE,
  CORES_SEMANTICAS,
  ORBIT_TOKENS,
  variaveisDoOrbit,
  type OrbitColor,
} from "./orbit-tokens";
import styles from "./orbit.module.css";

/*
  A página do design system. Não é uma pele nova: é o catálogo do que já
  está na tela. Cada amostra, cada tamanho de letra e cada botão aqui usa
  as mesmas variáveis que o painel usa lá fora, por isso muda de roupa
  junto com ele quando se troca o tema.
*/

const SECOES = [
  { id: "cores", numero: "01", titulo: "Cores e superfícies" },
  { id: "tipografia", numero: "02", titulo: "Tipografia" },
  { id: "componentes", numero: "03", titulo: "Componentes" },
  { id: "estrutura", numero: "04", titulo: "Estrutura" },
] as const;

const ESCALA_DE_TEXTO: {
  chave: keyof typeof ORBIT_TOKENS.font.size;
  nome: string;
  uso: string;
  exemplo: string;
}[] = [
  {
    chave: "display",
    nome: "Display",
    uso: "Só o título de abertura",
    exemplo: "Orbit · Nebula",
  },
  {
    chave: "title",
    nome: "Título",
    uso: "O nome de cada seção",
    exemplo: "Desempenho por posicionamento",
  },
  {
    chave: "body",
    nome: "Corpo",
    uso: "O texto que se lê",
    exemplo: "O criativo com melhor retorno no período.",
  },
  {
    chave: "label",
    nome: "Rótulo",
    uso: "Botões, abas e campos",
    exemplo: "Ver detalhes do criativo",
  },
  {
    chave: "metadata",
    nome: "Metadado",
    uso: "Datas, unidades, notas de rodapé",
    exemplo: "ATUALIZADO HÁ 3 MINUTOS",
  },
];

/** As portas que ligam um bloco ao seguinte. A cor nunca anda sozinha. */
const PORTAS: { chave: OrbitColor; rotulo: string }[] = [
  { chave: "generator", rotulo: "Entrada" },
  { chave: "model", rotulo: "Modelo" },
  { chave: "positive", rotulo: "Saída boa" },
  { chave: "negative", rotulo: "Erro" },
];

function corDe(chave: OrbitColor) {
  return `var(--orbit-${chave})`;
}

export function OrbitDesignSystem() {
  const [copiado, setCopiado] = React.useState<string | null>(null);
  const relogio = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  /*
    Clicar numa amostra copia o nome da variável, e não o hexadecimal: é a
    variável que se escreve no CSS. O hexadecimal muda com o tema; o nome,
    não.
  */
  function copiar(chave: OrbitColor) {
    const variavel = ORBIT_TOKENS.color[chave].variavel;
    void navigator.clipboard?.writeText(`var(${variavel})`).catch(() => {});
    setCopiado(chave);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setCopiado(null), 1600);
  }

  return (
    <div className={styles.page} style={variaveisDoOrbit() as React.CSSProperties}>
      <header className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>DESIGN SYSTEM</span>
          <h2>
            Orbit <span>· Nebula</span>
          </h2>
          <p>
            Dois sistemas fundidos num só. Do Orbit ficou a estrutura — a
            escala de tipos, os respiros, os raios com nome e os blocos
            ligados por fios. Do Nebula ficou a cor: preto e branco, com três
            exceções que querem dizer alguma coisa.
          </p>
        </div>
        <p className={styles.stamp}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="30" />
            <ellipse cx="50" cy="50" rx="46" ry="18" />
          </svg>
          <span>
            Nenhuma cor aqui é escrita à mão.
            <br />
            Tudo sai das variáveis do painel.
          </span>
        </p>
      </header>

      <nav className={styles.nav} aria-label="Seções do design system">
        {SECOES.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.numero} {s.titulo}
          </a>
        ))}
      </nav>

      <section className={styles.section} id="cores" aria-labelledby="t-cores">
        <div className={styles.sectionTitle}>
          <span>01</span>
          <h2 id="t-cores">Cores e superfícies</h2>
          <p>
            Clique numa amostra para copiar a variável. As oito primeiras são
            neutras: fazem o fundo, as bordas e o texto.
          </p>
        </div>
        <div className={styles.swatches}>
          {CORES_BASE.map((cor) => (
            <button
              key={cor.chave}
              type="button"
              className={styles.swatch}
              onClick={() => copiar(cor.chave)}
            >
              <span
                className={styles.swatchChip}
                style={{ background: corDe(cor.chave) }}
              />
              <span className={styles.swatchInfo}>
                <b>{cor.nome}</b>
                <code>
                  {copiado === cor.chave
                    ? "copiado"
                    : ORBIT_TOKENS.color[cor.chave].variavel}
                </code>
                <small>{cor.uso}</small>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.semantic}>
          {CORES_SEMANTICAS.map((cor) => (
            <button
              key={cor.chave}
              type="button"
              onClick={() => copiar(cor.chave)}
            >
              <span
                className={styles.semanticDot}
                style={{ background: corDe(cor.chave) }}
              />
              <span className={styles.semanticInfo}>
                <b>{cor.nome}</b>
                <small>
                  {copiado === cor.chave ? "copiado" : cor.uso}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className={styles.section}
        id="tipografia"
        aria-labelledby="t-tipografia"
      >
        <div className={styles.sectionTitle}>
          <span>02</span>
          <h2 id="t-tipografia">Tipografia</h2>
          <p>
            Uma família só, cinco tamanhos, três pesos. Quem precisa de um
            sexto tamanho está a resolver outro problema.
          </p>
        </div>
        <div className={styles.typeGrid}>
          <div className={styles.typeFeature}>
            <span className={styles.bigAa}>Aa</span>
            <p>
              {ORBIT_TOKENS.font.family}
              <br />
              Pesos {ORBIT_TOKENS.font.weight.join(" · ")}
            </p>
          </div>
          <div className={styles.typeScale}>
            {ESCALA_DE_TEXTO.map((linha) => {
              const px = ORBIT_TOKENS.font.size[linha.chave];
              return (
                <div key={linha.chave}>
                  <span>
                    {linha.nome.toUpperCase()} · {px}px · {linha.uso}
                  </span>
                  <strong style={{ fontSize: `${px}px` }}>
                    {linha.exemplo}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className={styles.section}
        id="componentes"
        aria-labelledby="t-componentes"
      >
        <div className={styles.sectionTitle}>
          <span>03</span>
          <h2 id="t-componentes">Componentes</h2>
          <p>
            Cada estado ao lado do outro, para se ver a diferença sem ter de
            passar o rato.
          </p>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <h3>Botões</h3>
            <p>
              O principal é sólido e só existe um por bloco. O resto é
              contorno.
            </p>
            <div className={styles.demo}>
              <button type="button" className={`${styles.button} ${styles.primary}`}>
                Gerar
              </button>
              <button type="button" className={styles.button}>
                Secundário
              </button>
              <button type="button" className={styles.button} disabled>
                Desativado
              </button>
            </div>
          </article>

          <article className={styles.card}>
            <h3>Campo</h3>
            <p>O foco é um anel, nunca só uma mudança de cor da borda.</p>
            <div className={styles.demo}>
              <label className={styles.fieldLabel} htmlFor="orbit-exemplo">
                Nome da campanha
              </label>
              <input
                id="orbit-exemplo"
                className={styles.field}
                defaultValue="Black Friday · aquecimento"
              />
            </div>
          </article>

          <article className={styles.card}>
            <h3>Portas e fios</h3>
            <p>
              A cor diz o tipo de ligação e anda sempre com o rótulo ao lado.
            </p>
            <div className={`${styles.demo} ${styles.ports}`}>
              {PORTAS.map((porta) => (
                <span
                  key={porta.chave}
                  style={{ "--porta": corDe(porta.chave) } as React.CSSProperties}
                >
                  <i className={styles.port} aria-hidden="true" />
                  {porta.rotulo}
                </span>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <h3>Pílulas</h3>
            <p>Etiqueta de estado. Raio de {ORBIT_TOKENS.radius.tag}px.</p>
            <div className={styles.demo}>
              <span className={styles.pill}>Ativo</span>
              <span className={styles.pill}>Em revisão</span>
              <span className={styles.pill}>Pausado</span>
            </div>
          </article>
        </div>
      </section>

      <section
        className={styles.section}
        id="estrutura"
        aria-labelledby="t-estrutura"
      >
        <div className={styles.sectionTitle}>
          <span>04</span>
          <h2 id="t-estrutura">Estrutura</h2>
          <p>
            Respiro, raio, elevação e tempo. É o que mantém duas telas
            diferentes com o mesmo ritmo.
          </p>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <h3>Espaçamento</h3>
            <p>Base 4. Tudo é múltiplo dela, sem exceção.</p>
            <div className={styles.demo}>
              <div className={styles.spacing}>
                {ORBIT_TOKENS.spacing.map((s) => (
                  <div key={s} style={{ "--s": `${s}px` } as React.CSSProperties} />
                ))}
              </div>
              <p className={styles.spacingRotulo}>
                {ORBIT_TOKENS.spacing.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </p>
            </div>
          </article>

          <article className={styles.card}>
            <h3>Raios</h3>
            <p>Três nomes, três usos. O do bloco é o mesmo nos dois sistemas.</p>
            <div className={`${styles.demo} ${styles.radii}`}>
              {(
                [
                  ["tag", "Etiqueta"],
                  ["control", "Controlo"],
                  ["node", "Bloco"],
                  ["panel", "Painel"],
                ] as const
              ).map(([chave, nome]) => (
                <span
                  key={chave}
                  style={
                    {
                      "--r": `${ORBIT_TOKENS.radius[chave]}px`,
                    } as React.CSSProperties
                  }
                >
                  {nome}
                  <small>{ORBIT_TOKENS.radius[chave]}px</small>
                </span>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <h3>Elevação</h3>
            <p>Três superfícies: o fundo, o bloco e o que flutua por cima.</p>
            <div className={`${styles.demo} ${styles.elevation}`}>
              <span>
                Canvas <code>{ORBIT_TOKENS.color.canvas.variavel}</code>
              </span>
              <span>
                Superfície <code>{ORBIT_TOKENS.color.surface.variavel}</code>
              </span>
              <span>
                Elevada <code>{ORBIT_TOKENS.color.raised.variavel}</code>
              </span>
            </div>
          </article>

          <article className={styles.card}>
            <h3>Movimento</h3>
            <p>
              Duas durações, {ORBIT_TOKENS.motion.easing}. Passe o rato para
              ver a diferença — e nada se mexe para quem pediu menos
              movimento.
            </p>
            <div className={`${styles.demo} ${styles.motion}`}>
              <span
                style={
                  { "--duracao": ORBIT_TOKENS.motion.fast } as React.CSSProperties
                }
              >
                Rápido <code>{ORBIT_TOKENS.motion.fast}</code>
              </span>
              <span
                style={
                  { "--duracao": ORBIT_TOKENS.motion.normal } as React.CSSProperties
                }
              >
                Normal <code>{ORBIT_TOKENS.motion.normal}</code>
              </span>
            </div>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>
          Orbit · Nebula — o catálogo do que já está no painel, não uma pele
          nova.
        </span>
        <a className={styles.button} href="/orbit-tokens.json" download>
          Baixar tokens JSON
        </a>
      </footer>
    </div>
  );
}
