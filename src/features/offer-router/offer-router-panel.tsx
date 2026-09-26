"use client";

import * as React from "react";

import {
  DISPOSITIVOS,
  PAISES,
  nomeDoDispositivo,
  nomeDoPais,
} from "@/features/access-filter/access-filter-model";
import {
  DeviceKind,
  MatchKind,
  NetworkKind,
  OfferPage,
  REDES,
  RouterVisitor,
  TrafficKind,
  SISTEMAS,
  SystemKind,
  PAGINAS_EXEMPLO,
  ORIGENS,
  POR_DISPOSITIVO,
  POR_ORIGEM,
  POR_REGIAO,
  REDIRECIONADOS_EXEMPLO,
  RedirectRule,
  decidirDestino,
  descreverRegra,
  nomeDaOrigem,
  nomeDaRede,
  nomeDoSistema,
  paginasComRedirecionamento,
  regraNova,
  totalDeRedirecionamentos,
  totalRedirecionados,
} from "./offer-router-model";
import { CountryFlag } from "@/features/access-filter/country-flag";

/*
  A tela do Roteador de ofertas — só a interface, a pedido do dono. Quatro
  partes: configurar as regras de uma página (mandar parte dos visitantes
  para outra página), a lista só das páginas que têm redirecionamento, de
  onde vêm os visitantes (aparelho e região) e quem foi redirecionado.
  Nada roteia de verdade; é demonstração.
*/

const NAV_QUADRO: { id: string; nome: string; d: string }[] = [
  { id: "cfg", nome: "Configurar", d: "M4 7h16M4 12h16M4 17h16" },
  {
    id: "pgs",
    nome: "Páginas com redirecionamento",
    d: "M6 3h9l3 3v15H6z M15 3v3h3",
  },
  {
    id: "onde",
    nome: "De onde vêm",
    d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c2.8 2.8 2.8 15.2 0 18 M12 3c-2.8 2.8-2.8 15.2 0 18",
  },
  {
    id: "redir",
    nome: "Redirecionados",
    d: "M5 9h10M12 6l3 3-3 3 M19 15H9M12 18l-3-3 3-3",
  },
];

const TIPOS: { id: MatchKind; nome: string }[] = [
  { id: "regiao", nome: "Por região" },
  { id: "dispositivo", nome: "Por aparelho" },
  { id: "sistema", nome: "Por sistema" },
  { id: "rede", nome: "Por rede" },
  { id: "origem", nome: "Por origem" },
  { id: "fatia", nome: "Por fatia %" },
];

export function OfferRouterPanel() {
  const [paginas, setPaginas] = React.useState<OfferPage[]>(PAGINAS_EXEMPLO);
  const [selId, setSelId] = React.useState(PAGINAS_EXEMPLO[0].id);
  const [visitante, setVisitante] = React.useState<RouterVisitor>({
    pais: "RU",
    dispositivo: "mobile",
    sistema: "android",
    rede: "cel4g",
    origem: "facebook",
  });
  const [sorteio, setSorteio] = React.useState(20);
  const [filtroPais, setFiltroPais] = React.useState<Record<string, string>>({});
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [fios, setFios] = React.useState<string[]>([]);
  const [navAtivo, setNavAtivo] = React.useState("cfg");

  const irPara = (id: string) => {
    setNavAtivo(id);
    if (typeof document !== "undefined")
      document
        .getElementById(`nav-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const seq = React.useRef(100);

  const pagina = paginas.find((p) => p.id === selId) ?? paginas[0];
  const decisao = decidirDestino(pagina, visitante, sorteio);
  const comRedir = paginasComRedirecionamento(paginas);

  const mudarPagina = (id: string, updater: (p: OfferPage) => OfferPage) =>
    setPaginas((ps) => ps.map((p) => (p.id === id ? updater(p) : p)));

  const setRegra = (ruleId: string, patch: Partial<RedirectRule>) =>
    mudarPagina(selId, (p) => ({
      ...p,
      regras: p.regras.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    }));

  const addRegra = () =>
    mudarPagina(selId, (p) => ({
      ...p,
      regras: [...p.regras, regraNova(`r${seq.current++}`, "regiao")],
    }));

  const removeRegra = (ruleId: string) =>
    mudarPagina(selId, (p) => ({
      ...p,
      regras: p.regras.filter((r) => r.id !== ruleId),
    }));

  const togglePais = (ruleId: string, code: string, atual: string[]) =>
    setRegra(ruleId, {
      paises: atual.includes(code)
        ? atual.filter((c) => c !== code)
        : [...atual, code],
    });

  const toggleDisp = (ruleId: string, id: DeviceKind, atual: DeviceKind[]) =>
    setRegra(ruleId, {
      dispositivos: atual.includes(id)
        ? atual.filter((d) => d !== id)
        : [...atual, id],
    });

  const toggleSis = (ruleId: string, id: SystemKind, atual: SystemKind[]) =>
    setRegra(ruleId, {
      sistemas: atual.includes(id)
        ? atual.filter((x) => x !== id)
        : [...atual, id],
    });

  const toggleRede = (ruleId: string, id: NetworkKind, atual: NetworkKind[]) =>
    setRegra(ruleId, {
      redes: atual.includes(id)
        ? atual.filter((x) => x !== id)
        : [...atual, id],
    });

  const toggleOrigem = (
    ruleId: string,
    id: TrafficKind,
    atual: TrafficKind[],
  ) =>
    setRegra(ruleId, {
      origens: atual.includes(id)
        ? atual.filter((x) => x !== id)
        : [...atual, id],
    });

  // Os países mostrados numa regra: os já escolhidos sempre, e os que
  // batem com a busca (são ~230, não cabem todos de uma vez).
  const paisesDaRegra = (r: RedirectRule) => {
    const q = (filtroPais[r.id] ?? "").trim().toLowerCase();
    return PAISES.filter(
      (p) =>
        r.paises.includes(p.code) ||
        (q.length > 0 &&
          (p.nome.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q))),
    );
  };

  // Mede as portas dos nós e desenha os conectores verdes (Fonte → Regras
  // → Hub → Saída). Recalcula quando o layout muda (regras, busca, tamanho).
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const medir = () => {
      const cr = canvas.getBoundingClientRect();
      const rel = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { l: r.left - cr.left, r: r.right - cr.left, cy: r.top - cr.top + r.height / 2 };
      };
      const curva = (x1: number, y1: number, x2: number, y2: number) => {
        const dx = Math.max(28, Math.abs(x2 - x1) / 2);
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      };
      const fonte = canvas.querySelector(".wf__fonte");
      const hub = canvas.querySelector(".wf__hub");
      const saida = canvas.querySelector(".wf__saida");
      const paths: string[] = [];
      if (fonte && hub && saida) {
        const F = rel(fonte);
        const H = rel(hub);
        const S = rel(saida);
        const regras = Array.from(canvas.querySelectorAll(".ofr__rule"));
        if (regras.length === 0) {
          paths.push(curva(F.r, F.cy, H.l, H.cy));
        } else {
          for (const el of regras) {
            const R = rel(el);
            paths.push(curva(F.r, F.cy, R.l, R.cy));
            paths.push(curva(R.r, R.cy, H.l, H.cy));
          }
        }
        paths.push(curva(H.r, H.cy, S.l, S.cy));
      }
      setFios(paths);
    };
    medir();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(canvas);
    window.addEventListener("resize", medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [paginas, selId, filtroPais, visitante]);

  return (
    <div className="ofr">
      <div className="ofr__stage">
        <header className="ofr__head">
          <div className="ofr__brand">
            <span className="ofr__mark" aria-hidden>
              ⤳
            </span>
            <div>
              <div className="ofr__title">Roteador de ofertas</div>
              <div className="ofr__sub">
                {totalDeRedirecionamentos(paginas)} redirecionamento(s) ·{" "}
                {comRedir.length} página(s)
              </div>
            </div>
          </div>
          <span className="ofr__demo-chip">demonstração</span>
        </header>

        <p className="ofr__lead">
          Escolha a página que recebe o tráfego e mande uma parte dos
          visitantes para outra página — por <b>região</b>, <b>aparelho</b>,{" "}
          <b>sistema</b>, <b>rede</b> ou uma <b>fatia</b> do tráfego. Abaixo,
          veja só as páginas com
          redirecionamento, de onde vêm os visitantes e quem foi redirecionado.
        </p>

        {/* ── 1) Configurar ─────────────────────────────────────────── */}
        <section id="nav-cfg" className="wf" aria-label="Configurar redirecionador">
          <nav className="wf__rail" aria-label="Navegação do quadro">
            {NAV_QUADRO.map((n) => (
              <button
                key={n.id}
                type="button"
                className="wf__rail-btn"
                title={n.nome}
                aria-label={n.nome}
                data-on={navAtivo === n.id}
                onClick={() => irPara(n.id)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={n.d} />
                </svg>
              </button>
            ))}
          </nav>
          <div className="wf__main">
            <header className="wf__top">
              <span className="wf__top-title">
                redirecionador.fluxo — Configurar oferta
              </span>
              <span className="wf__status">
                <i />
                fluxo ativo
              </span>
            </header>
            <div className="wf__canvas" ref={canvasRef}>
              <svg className="wf__wires" aria-hidden>
                {fios.map((d, i) => (
                  <path key={i} className="wf__wire" d={d} />
                ))}
              </svg>

              <div className="wf__node wf__fonte">
                <header className="wf__node-head">
                  <span className="wf__node-ico" aria-hidden>
                    ◈
                  </span>
                  <span className="wf__node-title">Fonte</span>
                  <span className="wf__node-dot" aria-hidden />
                </header>
                <div className="wf__node-body">
          <div className="ofr__field">
            <span className="ofr__label">Página que recebe o tráfego</span>
            <div className="ofr__pills">
              {paginas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="ofr__pill"
                  data-on={p.id === selId}
                  onClick={() => setSelId(p.id)}
                >
                  {p.nome}
                </button>
              ))}
            </div>
            <small className="ofr__hint">
              Origem: {pagina.url} — quem não bater em regra nenhuma fica aqui.
            </small>
          </div>
                </div>
              </div>

              <div className="wf__regras">
          <div className="ofr__rules">
            {pagina.regras.length === 0 && (
              <p className="ofr__empty">
                Sem regras ainda — todo visitante fica na página de origem.
              </p>
            )}
            {pagina.regras.map((r, i) => (
              <div className="ofr__rule" key={r.id} data-off={!r.ativo}>
                <div className="ofr__rule-head">
                  <span className="ofr__rule-n">{i + 1}</span>
                  <div className="ofr__seg" role="group" aria-label="Tipo da regra">
                    {TIPOS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="ofr__seg-btn"
                        data-on={r.tipo === t.id}
                        onClick={() => setRegra(r.id, { tipo: t.id })}
                      >
                        {t.nome}
                      </button>
                    ))}
                  </div>
                  <label className="ofr__switch">
                    <input
                      type="checkbox"
                      checked={r.ativo}
                      onChange={(e) => setRegra(r.id, { ativo: e.target.checked })}
                    />
                    <span>{r.ativo ? "Ativa" : "Pausada"}</span>
                  </label>
                  <button
                    type="button"
                    className="ofr__rule-del"
                    aria-label={`Remover regra ${i + 1}`}
                    onClick={() => removeRegra(r.id)}
                  >
                    ✕
                  </button>
                </div>

                {r.tipo === "regiao" && (
                  <div className="ofr__region">
                    <input
                      className="ofr__input ofr__search"
                      value={filtroPais[r.id] ?? ""}
                      placeholder="Buscar país… (ex.: Japão, BR, Alemanha)"
                      aria-label="Buscar país"
                      onChange={(e) =>
                        setFiltroPais((f) => ({ ...f, [r.id]: e.target.value }))
                      }
                    />
                    <div className="ofr__chips">
                      {paisesDaRegra(r).map((p) => (
                        <button
                          key={p.code}
                          type="button"
                          className="ofr__chip"
                          data-on={r.paises.includes(p.code)}
                          aria-pressed={r.paises.includes(p.code)}
                          onClick={() => togglePais(r.id, p.code, r.paises)}
                        >
                          <CountryFlag code={p.code} /> {p.nome}
                        </button>
                      ))}
                      {paisesDaRegra(r).length === 0 && (
                        <span className="ofr__hint">
                          Digite acima para achar um país (são todos do mundo).
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {r.tipo === "dispositivo" && (
                  <div className="ofr__chips">
                    {DISPOSITIVOS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="ofr__chip"
                        data-on={r.dispositivos.includes(d.id)}
                        aria-pressed={r.dispositivos.includes(d.id)}
                        onClick={() => toggleDisp(r.id, d.id, r.dispositivos)}
                      >
                        {d.nome}
                      </button>
                    ))}
                  </div>
                )}
                {r.tipo === "sistema" && (
                  <div className="ofr__chips">
                    {SISTEMAS.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className="ofr__chip"
                        data-on={(r.sistemas ?? []).includes(x.id)}
                        aria-pressed={(r.sistemas ?? []).includes(x.id)}
                        onClick={() => toggleSis(r.id, x.id, r.sistemas ?? [])}
                      >
                        {x.nome}
                      </button>
                    ))}
                  </div>
                )}
                {r.tipo === "rede" && (
                  <div className="ofr__chips">
                    {REDES.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className="ofr__chip"
                        data-on={(r.redes ?? []).includes(x.id)}
                        aria-pressed={(r.redes ?? []).includes(x.id)}
                        onClick={() => toggleRede(r.id, x.id, r.redes ?? [])}
                      >
                        {x.nome}
                      </button>
                    ))}
                  </div>
                )}
                {r.tipo === "origem" && (
                  <div className="ofr__chips">
                    {ORIGENS.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        className="ofr__chip"
                        data-on={(r.origens ?? []).includes(x.id)}
                        aria-pressed={(r.origens ?? []).includes(x.id)}
                        onClick={() =>
                          toggleOrigem(r.id, x.id, r.origens ?? [])
                        }
                      >
                        <span
                          className="ofr__dot"
                          style={{ background: x.cor }}
                          aria-hidden
                        />
                        {x.nome}
                      </button>
                    ))}
                  </div>
                )}
                {r.tipo === "fatia" && (
                  <label className="ofr__slider">
                    <span className="ofr__label">
                      Fatia do tráfego: <b>{r.percentual}%</b>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={r.percentual}
                      onChange={(e) =>
                        setRegra(r.id, { percentual: Number(e.target.value) })
                      }
                    />
                  </label>
                )}

                <label className="ofr__dest">
                  <span className="ofr__label">Mandar para</span>
                  <input
                    className="ofr__input"
                    value={r.destino}
                    maxLength={2048}
                    placeholder="/outra-pagina ou https://…"
                    onChange={(e) => setRegra(r.id, { destino: e.target.value })}
                  />
                </label>
                <p className="ofr__rule-resumo">
                  {descreverRegra(r)} →{" "}
                  <b>{r.destino.trim() || "(defina o destino)"}</b>
                </p>
              </div>
            ))}
            <button type="button" className="ofr__add" onClick={addRegra}>
              + Adicionar regra
            </button>
          </div>
              </div>

              <div className="wf__hub" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="5" cy="12" r="2.4" fill="currentColor" />
                  <circle cx="19" cy="5" r="2.4" fill="currentColor" />
                  <circle cx="19" cy="19" r="2.4" fill="currentColor" />
                  <path d="M7 12h4M13 8l4-2M13 16l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>

              <div className="wf__node wf__saida">
                <header className="wf__node-head">
                  <span className="wf__node-ico" aria-hidden>
                    ▣
                  </span>
                  <span className="wf__node-title">Saída</span>
                  <span className="wf__node-dot" aria-hidden />
                </header>
          {/* Simulador */}
          <div className="ofr__sim">
            <div className="ofr__card-head">Simular um visitante</div>
            <div className="ofr__sim-controls">
              <label className="ofr__inline">
                <span className="ofr__label">Região</span>
                <select
                  className="ofr__select"
                  value={visitante.pais}
                  onChange={(e) =>
                    setVisitante((v) => ({ ...v, pais: e.target.value }))
                  }
                >
                  {PAISES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ofr__inline">
                <span className="ofr__label">Aparelho</span>
                <select
                  className="ofr__select"
                  value={visitante.dispositivo}
                  onChange={(e) =>
                    setVisitante((v) => ({
                      ...v,
                      dispositivo: e.target.value as DeviceKind,
                    }))
                  }
                >
                  {DISPOSITIVOS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ofr__inline">
                <span className="ofr__label">Sistema</span>
                <select
                  className="ofr__select"
                  value={visitante.sistema}
                  onChange={(e) =>
                    setVisitante((v) => ({
                      ...v,
                      sistema: e.target.value as SystemKind,
                    }))
                  }
                >
                  {SISTEMAS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ofr__inline">
                <span className="ofr__label">Rede</span>
                <select
                  className="ofr__select"
                  value={visitante.rede}
                  onChange={(e) =>
                    setVisitante((v) => ({
                      ...v,
                      rede: e.target.value as NetworkKind,
                    }))
                  }
                >
                  {REDES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ofr__inline">
                <span className="ofr__label">Origem do anúncio</span>
                <select
                  className="ofr__select"
                  value={visitante.origem}
                  onChange={(e) =>
                    setVisitante((v) => ({
                      ...v,
                      origem: e.target.value as TrafficKind,
                    }))
                  }
                >
                  {ORIGENS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ofr__inline">
                <span className="ofr__label">
                  Roleta do tráfego: <b>{sorteio}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={99}
                  value={sorteio}
                  aria-label="Roleta do tráfego"
                  onChange={(e) => setSorteio(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="ofr__verdict" data-ficou={decisao.ficou}>
              <span className="ofr__verdict-mark" aria-hidden>
                {decisao.ficou ? "=" : "⤳"}
              </span>
              <div className="ofr__verdict-body">
                <b>
                  {decisao.ficou
                    ? "Fica na página de origem"
                    : "Redirecionado"}
                </b>
                <span>
                  {nomeDoPais(visitante.pais)} ·{" "}
                  {nomeDoDispositivo(visitante.dispositivo)} ·{" "}
                  {nomeDoSistema(visitante.sistema ?? "windows")} ·{" "}
                  {nomeDaRede(visitante.rede ?? "wifi")} ·{" "}
                  {nomeDaOrigem(visitante.origem ?? "facebook")} · roleta{" "}
                  {sorteio}
                </span>
                <span className="ofr__verdict-dest">→ {decisao.destino}</span>
                {decisao.regra && (
                  <span className="ofr__verdict-why">
                    pela regra: {descreverRegra(decisao.regra)}
                  </span>
                )}
              </div>
            </div>
          </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2) Páginas com redirecionamento ───────────────────────── */}
        <section id="nav-pgs" className="ofr__card">
          <div className="ofr__card-head">Páginas com redirecionamento</div>
          {comRedir.length === 0 ? (
            <p className="ofr__empty">Nenhuma página tem redirecionamento.</p>
          ) : (
            <div className="ofr__pages">
              {comRedir.map((p) => (
                <div className="ofr__page" key={p.id}>
                  <div className="ofr__page-head">
                    <b>{p.nome}</b>
                    <span className="ofr__page-url">{p.url}</span>
                  </div>
                  <ul className="ofr__page-rules">
                    {p.regras
                      .filter((r) => r.ativo && r.destino.trim())
                      .map((r) => (
                        <li key={r.id}>
                          {descreverRegra(r)} <span aria-hidden>→</span>{" "}
                          <b>{r.destino}</b>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 3) De onde vêm ────────────────────────────────────────── */}
        <section id="nav-onde" className="ofr__card">
          <div className="ofr__card-head">
            De onde vêm — página principal
          </div>
          <p className="ofr__sim-lead">
            Aparelho e região de quem entra (demonstração).
          </p>
          <div className="ofr__bars-grid">
            <div>
              <div className="ofr__bars-title">Por aparelho</div>
              {POR_DISPOSITIVO.map((f) => (
                <Barra key={f.rotulo} rotulo={f.rotulo} pct={f.pct} />
              ))}
            </div>
            <div>
              <div className="ofr__bars-title">Por região</div>
              {POR_REGIAO.map((f) => (
                <Barra key={f.rotulo} rotulo={f.rotulo} pct={f.pct} />
              ))}
            </div>
            <div>
              <div className="ofr__bars-title">Por origem de anúncio</div>
              {POR_ORIGEM.map((f) => (
                <Barra key={f.rotulo} rotulo={f.rotulo} pct={f.pct} />
              ))}
            </div>
          </div>
        </section>

        {/* ── 4) Redirecionados ─────────────────────────────────────── */}
        <section id="nav-redir" className="ofr__card">
          <div className="ofr__card-head">
            Redirecionados — região e aparelho
          </div>
          <p className="ofr__sim-lead">
            Quem tentou entrar e foi mandado para outra página —{" "}
            {totalRedirecionados(REDIRECIONADOS_EXEMPLO)} no total (demonstração).
          </p>
          <div className="ofr__matrix-wrap">
            <table className="ofr__table">
              <thead>
                <tr>
                  <th scope="col">Região</th>
                  <th scope="col">Aparelho</th>
                  <th scope="col">Foi para</th>
                  <th scope="col">Visitantes</th>
                </tr>
              </thead>
              <tbody>
                {REDIRECIONADOS_EXEMPLO.map((l, i) => (
                  <tr key={i}>
                    <th scope="row">{l.regiao}</th>
                    <td>{l.dispositivo}</td>
                    <td className="ofr__mono">{l.destino}</td>
                    <td className="ofr__num">{l.qtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="ofr__note">
          <b>Demonstração:</b> esta tela é só a interface — o roteamento não
          está ligado em nenhum servidor, e os números são de exemplo. Todas as
          configurações estão aqui; nada redireciona de verdade.
        </p>
      </div>
    </div>
  );
}

function Barra({ rotulo, pct }: { rotulo: string; pct: number }) {
  return (
    <div className="ofr__bar-row">
      <span className="ofr__bar-label">{rotulo}</span>
      <span className="ofr__bar-track">
        <span className="ofr__bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="ofr__bar-pct">{pct}%</span>
    </div>
  );
}
