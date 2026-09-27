"use client";

import * as React from "react";

/*
  Velocímetro da página: testa a velocidade de um site/landing/loja usando
  a API pública do PageSpeed Insights (Google Lighthouse), direto do
  navegador. Mostra as notas 0–100, os Core Web Vitals de usuários reais,
  as métricas de laboratório e o que fazer para ficar mais rápido.
  Portado do velocimetro.html do dono para viver dentro do publicador.
*/

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CHAVE_LS = "vw_apikey";

type Estrategia = "mobile" | "desktop";

interface Metrica {
  percentile: number;
  category: string;
  distributions?: { proportion: number }[];
}
interface Auditoria {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  details?: { overallSavingsMs?: number; data?: string };
}
interface Resultado {
  id?: string;
  loadingExperience?: {
    overall_category?: string;
    metrics?: Record<string, Metrica>;
  };
  lighthouseResult?: {
    finalDisplayedUrl?: string;
    finalUrl?: string;
    fetchTime?: string;
    lighthouseVersion?: string;
    categories?: Record<
      string,
      { score?: number | null; auditRefs?: { id: string; group?: string }[] }
    >;
    audits?: Record<string, Auditoria>;
  };
}

function normalizarUrl(v: string): string {
  let t = (v || "").trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  try {
    new URL(t);
    return t;
  } catch {
    return "";
  }
}
function corNota(s?: number | null): string {
  if (s == null) return "var(--fn-muted)";
  if (s >= 0.9) return "#2bd975";
  if (s >= 0.5) return "#fbbf24";
  return "#fb7185";
}
function corCategoria(c?: string): string {
  if (c === "FAST" || c === "good") return "#2bd975";
  if (c === "AVERAGE" || c === "ni") return "#fbbf24";
  return "#fb7185";
}
function fmtMs(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000)
    return (ms / 1000).toFixed(ms >= 10000 ? 0 : 1).replace(".", ",") + " s";
  return Math.round(ms) + " ms";
}
function fmtCls(v: number): string {
  return (Math.round(v * 100) / 100).toString().replace(".", ",");
}
function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem storage */
  }
}

const CAMPO = [
  { k: "LARGEST_CONTENTFUL_PAINT_MS", nome: "LCP", desc: "Maior conteúdo visível", fmt: fmtMs },
  { k: "INTERACTION_TO_NEXT_PAINT", nome: "INP", desc: "Resposta à interação", fmt: fmtMs },
  { k: "CUMULATIVE_LAYOUT_SHIFT_SCORE", nome: "CLS", desc: "Estabilidade visual", fmt: (v: number) => fmtCls(v / 100) },
  { k: "FIRST_CONTENTFUL_PAINT_MS", nome: "FCP", desc: "Primeiro conteúdo", fmt: fmtMs },
  { k: "EXPERIENCE_TIME_TO_FIRST_BYTE", nome: "TTFB", desc: "Tempo do servidor", fmt: fmtMs },
];
const NOTAS = [
  { k: "performance", nome: "Desempenho" },
  { k: "accessibility", nome: "Acessibilidade" },
  { k: "best-practices", nome: "Práticas" },
  { k: "seo", nome: "SEO" },
];
const LAB = [
  { k: "first-contentful-paint", nome: "Primeiro conteúdo (FCP)" },
  { k: "largest-contentful-paint", nome: "Maior conteúdo (LCP)" },
  { k: "total-blocking-time", nome: "Tempo bloqueado (TBT)" },
  { k: "cumulative-layout-shift", nome: "Deslocamento visual (CLS)" },
  { k: "speed-index", nome: "Índice de velocidade" },
  { k: "interactive", nome: "Tempo até interativo" },
];

export function SpeedTest({ urlInicial }: { urlInicial?: string }) {
  const [url, setUrl] = React.useState(urlInicial ?? "");
  // Estado derivado de props: se o endereço da página mudar e o dono não
  // tiver digitado outro, acompanha o novo.
  const [urlBase, setUrlBase] = React.useState(urlInicial ?? "");
  if ((urlInicial ?? "") !== urlBase) {
    setUrlBase(urlInicial ?? "");
    if (!url || url === urlBase) setUrl(urlInicial ?? "");
  }
  const [estrategia, setEstrategia] = React.useState<Estrategia>("mobile");
  const [chave, setChave] = React.useState(() =>
    typeof window === "undefined" ? "" : lsGet(CHAVE_LS),
  );
  const [mostrarChave, setMostrarChave] = React.useState(false);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<{ titulo: string; texto: string } | null>(null);
  const [res, setRes] = React.useState<Resultado | null>(null);
  const [animar, setAnimar] = React.useState(false);

  const rodar = async () => {
    const u = normalizarUrl(url);
    if (!u) {
      setErro({
        titulo: "Endereço inválido",
        texto: "Confira o site digitado. Ex.: minhaloja.com.br ou https://exemplo.com/pagina.",
      });
      return;
    }
    setUrl(u);
    const params = new URLSearchParams();
    params.set("url", u);
    params.set("strategy", estrategia);
    for (const c of ["performance", "accessibility", "best-practices", "seo"])
      params.append("category", c);
    params.set("locale", "pt_BR");
    if (chave.trim()) params.set("key", chave.trim());
    setCarregando(true);
    setErro(null);
    setRes(null);
    setAnimar(false);
    try {
      const r = await fetch(API + "?" + params.toString());
      const body = (await r.json()) as Resultado & {
        error?: { message?: string };
      };
      if (!r.ok || body.error) {
        const msg = body.error?.message ?? "";
        if (r.status === 429)
          setErro({
            titulo: "Limite de consultas atingido",
            texto: "Muitas análises seguidas sem chave. Aguarde um pouco ou adicione uma chave de API gratuita (botão \"Chave de API\").",
          });
        else if (/Unable to process request|Lighthouse returned error|FAILED_DOCUMENT_REQUEST|DNS/i.test(msg))
          setErro({
            titulo: "O Google não conseguiu carregar este site",
            texto: msg + " Confira se o endereço está no ar e acessível publicamente (sites em manutenção, atrás de login ou bloqueando robôs não podem ser analisados).",
          });
        else
          setErro({
            titulo: `Ocorreu um erro (${r.status})`,
            texto: msg || "Tente novamente em instantes.",
          });
        return;
      }
      setRes(body);
      requestAnimationFrame(() => setAnimar(true));
    } catch {
      setErro({
        titulo: "Não foi possível conectar",
        texto: "Verifique sua internet e tente de novo. Se persistir, o site pode estar inacessível para o robô do Google.",
      });
    } finally {
      setCarregando(false);
    }
  };

  const lh = res?.lighthouseResult ?? {};
  const cats = lh.categories ?? {};
  const audits = lh.audits ?? {};
  const le = res?.loadingExperience;
  const metricas = le?.metrics ?? {};
  const temCampo = Boolean(le?.overall_category && Object.keys(metricas).length);

  const recomendacoes = React.useMemo(() => {
    const refs = cats.performance?.auditRefs ?? [];
    const pega = (grupo: string) =>
      refs
        .filter((r) => r.group === grupo)
        .map((r) => audits[r.id])
        .filter(
          (a): a is Auditoria =>
            Boolean(a) &&
            a!.score != null &&
            a!.score < 0.9 &&
            a!.scoreDisplayMode !== "informative" &&
            a!.scoreDisplayMode !== "notApplicable",
        )
        .map((a) => ({ a, ms: a.details?.overallSavingsMs ?? 0 }))
        .sort((x, y) => y.ms - x.ms);
    return [...pega("load-opportunities"), ...pega("diagnostics")];
    // cats/audits derivam de res; depender de res evita recomputar à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);

  const R = 30;
  const C = 2 * Math.PI * R;

  return (
    <div className="spd">
      <form
        className="spd__form"
        onSubmit={(e) => {
          e.preventDefault();
          void rodar();
        }}
      >
        <div className="pub__linha">
          <input
            className="pub__input"
            value={url}
            placeholder="minhaloja.com.br ou https://…"
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Endereço para testar"
          />
          <button type="submit" className="pub__btn spd__go" disabled={carregando}>
            {carregando ? "Medindo…" : "Analisar"}
          </button>
        </div>
        <div className="spd__opts">
          <div className="spd__seg" role="group" aria-label="Dispositivo">
            <button
              type="button"
              aria-pressed={estrategia === "mobile"}
              onClick={() => setEstrategia("mobile")}
            >
              📱 Celular
            </button>
            <button
              type="button"
              aria-pressed={estrategia === "desktop"}
              onClick={() => setEstrategia("desktop")}
            >
              🖥️ Computador
            </button>
          </div>
          <button
            type="button"
            className="spd__link"
            onClick={() => setMostrarChave((v) => !v)}
          >
            {mostrarChave ? "Ocultar chave" : "Chave de API"}
          </button>
        </div>
        {mostrarChave && (
          <div className="spd__chave">
            <input
              className="pub__input"
              value={chave}
              placeholder="Chave de API do Google (opcional — libera o limite)"
              onChange={(e) => {
                setChave(e.target.value);
                lsSet(CHAVE_LS, e.target.value.trim());
              }}
            />
            <small className="pub__hint">
              Fica salva só neste navegador. Sem chave funciona, com limite de
              consultas por hora.
            </small>
          </div>
        )}
      </form>

      {carregando && (
        <div className="spd__status">
          <span className="spd__spinner" aria-hidden />
          <b>Analisando {url.replace(/^https?:\/\//, "")}</b>
          <span>
            Leva de 15 a 40 segundos — o Google carrega e mede a página de
            verdade.
          </span>
        </div>
      )}
      {erro && (
        <div className="spd__erro">
          <b>{erro.titulo}</b>
          <p>{erro.texto}</p>
        </div>
      )}

      {res && (
        <div className="spd__res">
          {/* Notas 0–100 */}
          <div className="spd__sec">
            <b>Diagnóstico (laboratório)</b>
            <span>Ambiente controlado do Google · 0–100</span>
          </div>
          <div className="spd__gauges">
            {NOTAS.map((n) => {
              const s = cats[n.k]?.score;
              if (s == null) return null;
              const cor = corNota(s);
              return (
                <div className="spd__gauge" key={n.k}>
                  <div className="spd__gauge-box">
                    <svg viewBox="0 0 76 76">
                      <circle className="spd__track" cx="38" cy="38" r={R} />
                      <circle
                        className="spd__arc"
                        cx="38"
                        cy="38"
                        r={R}
                        stroke={cor}
                        strokeDasharray={C.toFixed(1)}
                        strokeDashoffset={(animar ? C * (1 - s) : C).toFixed(1)}
                      />
                    </svg>
                    <b style={{ color: cor }}>{Math.round(s * 100)}</b>
                  </div>
                  <span>{n.nome}</span>
                </div>
              );
            })}
          </div>

          {/* Usuários reais */}
          <div className="spd__sec">
            <b>Dados de usuários reais</b>
            <span>Core Web Vitals · últimos 28 dias</span>
          </div>
          {!temCampo ? (
            <div className="spd__nota">
              Sem dados de campo suficientes — este site ainda não tem visitas
              reais bastantes no Chrome. Use o laboratório abaixo.
            </div>
          ) : (
            <>
              <div
                className="spd__veredito"
                data-v={
                  le?.overall_category === "FAST"
                    ? "ok"
                    : le?.overall_category === "SLOW"
                      ? "ruim"
                      : "meio"
                }
              >
                {le?.overall_category === "FAST"
                  ? "✓ Aprovado nos Core Web Vitals"
                  : le?.overall_category === "SLOW"
                    ? "! Reprovado nos Core Web Vitals"
                    : "• Avaliação parcial dos Core Web Vitals"}
              </div>
              <div className="spd__cwv">
                {CAMPO.map((m) => {
                  const d = metricas[m.k];
                  if (!d) return null;
                  const cor = corCategoria(d.category);
                  return (
                    <div className="spd__cwv-cel" key={m.k}>
                      <div className="spd__cwv-cap">
                        <i style={{ background: cor }} />
                        {m.nome}
                      </div>
                      <div className="spd__cwv-val" style={{ color: cor }}>
                        {m.fmt(d.percentile)}
                      </div>
                      <div className="spd__cwv-nome">{m.desc}</div>
                      <div className="spd__bar">
                        {(d.distributions ?? []).map((seg, i) => (
                          <i
                            key={i}
                            style={{
                              width: `${(seg.proportion * 100).toFixed(1)}%`,
                              background:
                                i === 0 ? "#2bd975" : i === 1 ? "#fbbf24" : "#fb7185",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Laboratório */}
          <div className="spd__sec">
            <b>Métricas de laboratório</b>
            <span>Rede e aparelho padronizados</span>
          </div>
          <ul className="spd__lab">
            {LAB.map((m) => {
              const a = audits[m.k];
              if (!a) return null;
              const cor = corNota(a.score);
              return (
                <li key={m.k}>
                  <i style={{ background: cor }} />
                  <span>{m.nome}</span>
                  <b style={{ color: cor }}>{a.displayValue ?? "—"}</b>
                </li>
              );
            })}
          </ul>
          {audits["final-screenshot"]?.details?.data && (
            <div className="spd__shot">
              {/* eslint-disable-next-line @next/next/no-img-element -- captura em data URL vinda da API */}
              <img
                src={audits["final-screenshot"]!.details!.data}
                alt="Como o Google carregou a página"
              />
              <span>Como o Google carregou a página</span>
            </div>
          )}

          {/* Como melhorar */}
          <div className="spd__sec">
            <b>Como deixar mais rápido</b>
            <span>
              {recomendacoes.length}{" "}
              {recomendacoes.length === 1 ? "recomendação" : "recomendações"}
            </span>
          </div>
          {recomendacoes.length === 0 ? (
            <div className="spd__nota">
              Nenhuma oportunidade relevante — a página já está bem otimizada
              nos pontos que o Lighthouse verifica. 🎉
            </div>
          ) : (
            <div className="spd__opps">
              {recomendacoes.map(({ a, ms }, i) => (
                <details className="spd__opp" key={a.id ?? i}>
                  <summary>
                    <i style={{ background: corNota(a.score) }} />
                    <span>{a.title}</span>
                    {ms >= 50 ? (
                      <em>−{fmtMs(ms)}</em>
                    ) : a.displayValue ? (
                      <em>{a.displayValue}</em>
                    ) : null}
                  </summary>
                  <p>
                    {(a.description ?? "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}
                  </p>
                </details>
              ))}
            </div>
          )}

          <div className="spd__meta">
            {lh.finalDisplayedUrl ?? lh.finalUrl ?? res.id ?? ""} ·{" "}
            {estrategia === "mobile" ? "Celular (emulado)" : "Computador"}
            {lh.fetchTime
              ? " · " + new Date(lh.fetchTime).toLocaleString("pt-BR")
              : ""}
            {lh.lighthouseVersion ? " · Lighthouse " + lh.lighthouseVersion : ""}
          </div>
        </div>
      )}
    </div>
  );
}
