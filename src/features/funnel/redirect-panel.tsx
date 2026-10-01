"use client";

/*
  O painel do bloco Redirecionador — o Roteador de ofertas dentro do quadro
  do funil. Abre à direita, como o publicador da página, com quatro abas:
  Regras (quem vai para onde), Testar (simula um visitante), De onde vêm e
  Redirecionados (números de demonstração). Só a interface — nada roteia.
*/

import * as React from "react";
import {
  ArrowRightLeft,
  FlaskConical,
  Globe,
  ListOrdered,
  Plus,
} from "lucide-react";

import { CountryFlag } from "@/features/access-filter/country-flag";
import {
  DISPOSITIVOS,
  PAISES,
  nomeDoDispositivo,
  nomeDoPais,
  type DeviceKind,
} from "@/features/access-filter/access-filter-model";
import {
  ORIGENS,
  POR_DISPOSITIVO,
  POR_ORIGEM,
  POR_REGIAO,
  REDES,
  REDIRECIONADOS_EXEMPLO,
  SISTEMAS,
  decidirDestino,
  descreverRegra,
  nomeDaOrigem,
  nomeDaRede,
  nomeDoSistema,
  totalRedirecionados,
  type NetworkKind,
  type RouterVisitor,
  type SystemKind,
  type TrafficKind,
} from "@/features/offer-router/offer-router-model";
import {
  ROTULO_CATEGORIA,
  destinosDosNos,
  destinosPorCategoria,
} from "@/features/offer-router/funnel-link";
import type { FunnelNode, RedirNode, RegraRedir } from "./funnel-model";
import {
  GLIFO_REGRA,
  TIPOS_REGRA,
  nomeDoDestino,
  nomesDosNos,
  regraComDestino,
  regraRedirNova,
  rotuloDaRegra,
} from "./redirect-rules";

type Aba = "regras" | "testar" | "origem" | "redirecionados";

const ABAS: {
  id: Aba;
  rotulo: string;
  sub: string;
  cor: string;
  Icone: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  {
    id: "regras",
    rotulo: "Regras",
    sub: "Quem vai para onde — a primeira que bate decide",
    cor: "#00e559",
    Icone: ListOrdered,
  },
  {
    id: "testar",
    rotulo: "Testar",
    sub: "Simule um visitante e veja para onde ele vai",
    cor: "#38bdf8",
    Icone: FlaskConical,
  },
  {
    id: "origem",
    rotulo: "De onde vêm",
    sub: "Aparelho, região e anúncio (demonstração)",
    cor: "#a78bfa",
    Icone: Globe,
  },
  {
    id: "redirecionados",
    rotulo: "Registro",
    sub: "Quem foi redirecionado para outra página (demonstração)",
    cor: "#f59e0b",
    Icone: ArrowRightLeft,
  },
];

export function RedirectPanel({
  node,
  nodes,
  onNome,
  onChange,
  onFechar,
  onIrPara,
  onAddress,
  onPublicarSite,
}: {
  node: FunnelNode;
  /** Todos os blocos do quadro (para escolher o destino de cada regra). */
  nodes: FunnelNode[];
  onNome: (n: string) => void;
  onChange: (r: RedirNode) => void;
  onFechar: () => void;
  /** Leva o quadro até um bloco (o destino de uma regra). */
  onIrPara?: (nodeId: string) => void;
  onAddress?: (url: string) => void;
  onPublicarSite?: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>("regras");
  const [filtroPais, setFiltroPais] = React.useState<Record<string, string>>(
    {},
  );
  const [visitante, setVisitante] = React.useState<RouterVisitor>({
    pais: "BR",
    dispositivo: "mobile",
    sistema: "android",
    rede: "cel4g",
    origem: "facebook",
  });
  const [sorteio, setSorteio] = React.useState(20);
  const seq = React.useRef(1);

  const regras = React.useMemo(() => node.redir?.regras ?? [], [node.redir]);
  const nomes = React.useMemo(() => nomesDosNos(nodes), [nodes]);
  const grupos = React.useMemo(
    () =>
      destinosPorCategoria(
        destinosDosNos(nodes.filter((n) => n.id !== node.id)),
      ),
    [nodes, node.id],
  );
  const setRegras = (rs: RegraRedir[]) =>
    onChange({ ...node.redir, regras: rs });
  const setRegra = (id: string, patch: Partial<RegraRedir>) =>
    setRegras(regras.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const novoId = () => {
    let id = "";
    do id = `r${seq.current++}`;
    while (regras.some((r) => r.id === id));
    return id;
  };
  const addRegra = () =>
    setRegras([...regras, regraRedirNova(novoId(), "regiao")]);
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= regras.length) return;
    const rs = [...regras];
    [rs[i], rs[j]] = [rs[j], rs[i]];
    setRegras(rs);
  };
  const remover = (id: string) => setRegras(regras.filter((r) => r.id !== id));
  const alternar = <T,>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const ativas = regras.filter((r) => r.ativo && regraComDestino(r)).length;

  // O simulador reaproveita o motor do roteador: as regras viram uma
  // "página" e o destino que é bloco vira "#id" (traduzido de volta abaixo).
  const decisao = decidirDestino(
    {
      id: node.id,
      nome: node.title,
      url: "",
      regras: regras.map((r) => ({
        ...r,
        destino: r.destinoNoId ? `#${r.destinoNoId}` : r.destino,
      })),
    },
    visitante,
    sorteio,
  );
  const destinoDecisao = decisao.ficou
    ? "segue a linha de saída do bloco"
    : decisao.destino.startsWith("#")
      ? (nomes[decisao.destino.slice(1)] ?? "(bloco removido)")
      : decisao.destino;

  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  // Os países mostrados numa regra: os já escolhidos e os que batem com a
  // busca (são ~230, não cabem todos de uma vez).
  const paisesDaRegra = (r: RegraRedir) => {
    const q = (filtroPais[r.id] ?? "").trim().toLowerCase();
    return PAISES.filter(
      (p) =>
        r.paises.includes(p.code) ||
        (q.length > 0 &&
          (p.nome.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q))),
    );
  };

  return (
    <aside
      className="pub pub--redir"
      aria-label="Redirecionador"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="pub__head">
        <div className="pub__head-id">
          <span className="pub__badge" data-on={ativas > 0 || undefined}>
            {ativas} {ativas === 1 ? "ativa" : "ativas"}
          </span>
          <input
            className="pub__nome"
            value={node.title}
            aria-label="Nome do redirecionador"
            onChange={(e) => onNome(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="pub__x"
          aria-label="Fechar"
          onClick={onFechar}
        >
          ✕
        </button>
      </header>
      <div className="pub__url">
        {regras.length === 0
          ? "Sem regras — todo mundo segue a linha de saída"
          : `${regras.length} ${regras.length === 1 ? "regra" : "regras"} · a primeira que bate decide`}
      </div>

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Abas do redirecionador">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="pub__rail-btn"
              data-on={aba === a.id || undefined}
              style={{ "--aba-cor": a.cor } as React.CSSProperties}
              onClick={() => setAba(a.id)}
              title={a.rotulo}
              aria-label={a.rotulo}
            >
              <span className="pub__rail-ic" aria-hidden>
                <a.Icone size={16} strokeWidth={2} />
              </span>
              <span className="pub__rail-lbl">{a.rotulo}</span>
            </button>
          ))}
        </nav>

        <div className="pub__corpo">
          <div
            className="pub__sec"
            style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}
          >
            <span className="pub__sec-badge" aria-hidden>
              <abaAtual.Icone size={18} strokeWidth={2} />
            </span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

          {/* ── Regras ─────────────────────────────────────────────── */}
          {aba === "regras" && (
            <>
              <label className="pub__campo">
                <span>Caminho público do redirecionador</span>
                <input
                  className="pub__input"
                  value={node.url ?? ""}
                  placeholder="/go"
                  onChange={(event) => onAddress?.(event.target.value)}
                />
                <small className="pub__hint">
                  No ZIP único, fatias percentuais, aparelho, sistema e
                  utm_source rodam no navegador. Região/IP e rede não são
                  suportados; com essas regras ativas, a exportação é bloqueada.
                  Isso não é controle de acesso.
                </small>
              </label>
              <div className="rdp__topo">
                <span className="pub__hint">
                  Quem não bate em nenhuma regra segue a linha de saída do
                  bloco.
                </span>
                <button
                  type="button"
                  className="pub__btn rdp__add"
                  onClick={addRegra}
                >
                  <Plus size={14} strokeWidth={2.4} /> Regra
                </button>
              </div>
              {regras.length === 0 && (
                <div className="pub__vazio">
                  Nenhuma regra ainda. Crie a primeira: por região, aparelho,
                  sistema, rede, origem do anúncio ou fatia do tráfego.
                </div>
              )}
              {regras.map((r, i) => (
                <section
                  key={r.id}
                  className="pub__campo rdp__regra"
                  data-off={!r.ativo || undefined}
                  aria-label={`Regra ${i + 1}`}
                >
                  <header className="rdp__regra-head">
                    <span className="rdp__num">{i + 1}</span>
                    <span className="rdp__quem">
                      <span aria-hidden>{GLIFO_REGRA[r.tipo]}</span>{" "}
                      {rotuloDaRegra(r)}{" "}
                      <span className="rdp__seta" aria-hidden>
                        →
                      </span>{" "}
                      <b>{nomeDoDestino(r, nomes)}</b>
                    </span>
                    <span className="rdp__acoes">
                      <button
                        type="button"
                        aria-label="Subir regra"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Descer regra"
                        disabled={i === regras.length - 1}
                        onClick={() => mover(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remover regra ${i + 1}`}
                        onClick={() => remover(r.id)}
                      >
                        ✕
                      </button>
                    </span>
                  </header>

                  <div
                    className="pub__chips rdp__tipos"
                    role="radiogroup"
                    aria-label="Tipo da regra"
                  >
                    {TIPOS_REGRA.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={r.tipo === t.id}
                        className="pub__chip"
                        data-on={r.tipo === t.id || undefined}
                        onClick={() => setRegra(r.id, { tipo: t.id })}
                      >
                        <span aria-hidden>{t.glifo}</span> {t.nome}
                      </button>
                    ))}
                  </div>

                  {r.tipo === "regiao" && (
                    <>
                      <input
                        className="pub__input"
                        value={filtroPais[r.id] ?? ""}
                        placeholder="Buscar país… (ex.: Japão, BR, Alemanha)"
                        aria-label="Buscar país"
                        onChange={(e) =>
                          setFiltroPais((f) => ({
                            ...f,
                            [r.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="pub__chips">
                        {paisesDaRegra(r).map((p) => (
                          <button
                            key={p.code}
                            type="button"
                            className="pub__chip"
                            data-on={r.paises.includes(p.code) || undefined}
                            aria-pressed={r.paises.includes(p.code)}
                            onClick={() =>
                              setRegra(r.id, {
                                paises: alternar(r.paises, p.code),
                              })
                            }
                          >
                            <CountryFlag code={p.code} size={16} /> {p.nome}
                          </button>
                        ))}
                        {paisesDaRegra(r).length === 0 && (
                          <span className="pub__hint">
                            Digite acima para achar um país (são todos do
                            mundo).
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {r.tipo === "dispositivo" && (
                    <div className="pub__chips">
                      {DISPOSITIVOS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="pub__chip"
                          data-on={r.dispositivos.includes(d.id) || undefined}
                          aria-pressed={r.dispositivos.includes(d.id)}
                          onClick={() =>
                            setRegra(r.id, {
                              dispositivos: alternar(r.dispositivos, d.id),
                            })
                          }
                        >
                          {d.nome}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.tipo === "sistema" && (
                    <div className="pub__chips">
                      {SISTEMAS.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="pub__chip"
                          data-on={
                            (r.sistemas ?? []).includes(x.id) || undefined
                          }
                          aria-pressed={(r.sistemas ?? []).includes(x.id)}
                          onClick={() =>
                            setRegra(r.id, {
                              sistemas: alternar(r.sistemas ?? [], x.id),
                            })
                          }
                        >
                          {x.nome}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.tipo === "rede" && (
                    <div className="pub__chips">
                      {REDES.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="pub__chip"
                          data-on={(r.redes ?? []).includes(x.id) || undefined}
                          aria-pressed={(r.redes ?? []).includes(x.id)}
                          onClick={() =>
                            setRegra(r.id, {
                              redes: alternar(r.redes ?? [], x.id),
                            })
                          }
                        >
                          {x.nome}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.tipo === "origem" && (
                    <div className="pub__chips">
                      {ORIGENS.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="pub__chip"
                          data-on={
                            (r.origens ?? []).includes(x.id) || undefined
                          }
                          aria-pressed={(r.origens ?? []).includes(x.id)}
                          onClick={() =>
                            setRegra(r.id, {
                              origens: alternar(r.origens ?? [], x.id),
                            })
                          }
                        >
                          <span
                            className="pub__chip-dot"
                            style={{ background: x.cor }}
                            aria-hidden
                          />
                          {x.nome}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.tipo === "fatia" && (
                    <label className="rdp__slider">
                      <span>
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

                  <div className="rdp__dest">
                    <span className="rdp__lbl">Mandar para</span>
                    {grupos.length > 0 ? (
                      grupos.map((g) => (
                        <div key={g.categoria} className="rdp__grupo">
                          <span className="rdp__grupo-nome">
                            {ROTULO_CATEGORIA[g.categoria]}
                          </span>
                          <div className="pub__chips">
                            {g.itens.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                className="pub__chip"
                                data-on={r.destinoNoId === d.id || undefined}
                                aria-pressed={r.destinoNoId === d.id}
                                title={`${d.nome} — ${d.url}`}
                                onClick={() =>
                                  setRegra(r.id, {
                                    destinoNoId: d.id,
                                    destino: "",
                                  })
                                }
                              >
                                {d.nome}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="pub__hint">
                        Crie uma página, checkout ou link no quadro para
                        escolher aqui.
                      </span>
                    )}
                    <input
                      className="pub__input"
                      value={r.destinoNoId ? "" : r.destino}
                      maxLength={2048}
                      placeholder="ou um endereço: /outra-pagina ou https://…"
                      aria-label="Endereço de destino"
                      onChange={(e) =>
                        setRegra(r.id, {
                          destino: e.target.value,
                          destinoNoId: undefined,
                        })
                      }
                    />
                    {r.destinoNoId && onIrPara && nomes[r.destinoNoId] && (
                      <button
                        type="button"
                        className="rdp__ver"
                        onClick={() => onIrPara(r.destinoNoId!)}
                      >
                        Ver o bloco no quadro ↗
                      </button>
                    )}
                  </div>

                  <Toggle
                    rotulo={r.ativo ? "Regra ativa" : "Regra pausada"}
                    dica="Pausada: fica aqui, mas não redireciona ninguém."
                    on={r.ativo}
                    onToggle={(v) => setRegra(r.id, { ativo: v })}
                  />
                </section>
              ))}
            </>
          )}

          {/* ── Testar ─────────────────────────────────────────────── */}
          {aba === "testar" && (
            <>
              <div className="pub__campo rdp__sim">
                <span>Simular um visitante</span>
                <div className="rdp__sim-grid">
                  <label>
                    <span>Região</span>
                    <select
                      className="pub__input"
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
                  <label>
                    <span>Aparelho</span>
                    <select
                      className="pub__input"
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
                  <label>
                    <span>Sistema</span>
                    <select
                      className="pub__input"
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
                  <label>
                    <span>Rede</span>
                    <select
                      className="pub__input"
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
                  <label>
                    <span>Origem do anúncio</span>
                    <select
                      className="pub__input"
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
                  <label className="rdp__slider">
                    <span>
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
              </div>
              <div
                className="rdp__veredito"
                data-ficou={decisao.ficou || undefined}
              >
                <span className="rdp__veredito-mark" aria-hidden>
                  {decisao.ficou ? "=" : "⤳"}
                </span>
                <div className="rdp__veredito-body">
                  <b>{decisao.ficou ? "Fica no fluxo" : "Redirecionado"}</b>
                  <span>
                    {nomeDoPais(visitante.pais)} ·{" "}
                    {nomeDoDispositivo(visitante.dispositivo)} ·{" "}
                    {nomeDoSistema(visitante.sistema ?? "windows")} ·{" "}
                    {nomeDaRede(visitante.rede ?? "wifi")} ·{" "}
                    {nomeDaOrigem(visitante.origem ?? "facebook")} · roleta{" "}
                    {sorteio}
                  </span>
                  <span className="rdp__veredito-dest">→ {destinoDecisao}</span>
                  {decisao.regra && (
                    <span className="rdp__veredito-why">
                      pela regra: {descreverRegra(decisao.regra)}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── De onde vêm ────────────────────────────────────────── */}
          {aba === "origem" && (
            <>
              <Barras titulo="Por aparelho" itens={POR_DISPOSITIVO} />
              <Barras titulo="Por região" itens={POR_REGIAO} />
              <Barras titulo="Por origem do anúncio" itens={POR_ORIGEM} />
              <small className="pub__hint">
                Números de demonstração. Os reais chegam quando a VPS estiver
                ligada (Fase 2).
              </small>
            </>
          )}

          {/* ── Redirecionados ─────────────────────────────────────── */}
          {aba === "redirecionados" && (
            <>
              <div className="pub__campo">
                <span>
                  Total redirecionados:{" "}
                  <b>{totalRedirecionados(REDIRECIONADOS_EXEMPLO)}</b>
                </span>
                <table className="rdp__tabela">
                  <thead>
                    <tr>
                      <th>Região</th>
                      <th>Aparelho</th>
                      <th>Destino</th>
                      <th>Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REDIRECIONADOS_EXEMPLO.map((l, i) => (
                      <tr key={i}>
                        <td>{l.regiao}</td>
                        <td>{l.dispositivo}</td>
                        <td>{l.destino}</td>
                        <td>{l.qtd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small className="pub__hint">
                Registro de demonstração. Numa versão ligada, viria do log real
                da VPS.
              </small>
            </>
          )}
        </div>
      </div>

      <footer className="pub__foot">
        <span className="pub__foot-vps">
          <span className="pub__vps-dot" aria-hidden />
          Regras estáticas suportadas são incluídas no ZIP único
        </span>
        <button
          type="button"
          className="pub__publicar"
          onClick={onPublicarSite}
          disabled={!onPublicarSite}
        >
          Publicar site e regras
        </button>
      </footer>
    </aside>
  );
}

function Barras({
  titulo,
  itens,
}: {
  titulo: string;
  itens: { rotulo: string; pct: number }[];
}) {
  return (
    <div className="pub__campo rdp__barras">
      <span>{titulo}</span>
      {itens.map((f) => (
        <div key={f.rotulo} className="rdp__barra">
          <span className="rdp__barra-rotulo">{f.rotulo}</span>
          <span className="rdp__barra-trilho" aria-hidden>
            <i style={{ width: `${f.pct}%` }} />
          </span>
          <span className="rdp__barra-pct">{f.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function Toggle({
  rotulo,
  dica,
  on,
  onToggle,
}: {
  rotulo: string;
  dica?: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="pub__toggle"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
    >
      <span className="pub__toggle-track" data-on={on || undefined}>
        <span className="pub__toggle-knob" />
      </span>
      <span className="pub__toggle-txt">
        {rotulo}
        {dica && <small>{dica}</small>}
      </span>
    </button>
  );
}
