"use client";

/*
  O inspetor de estilo do quadro (Parte 2): NÓ, LINHA, TEXTO e MAPA, com
  Reset por aba. Mesma casca do publicador. Mexe só na aparência — nada
  publica nem roda (Fase 1).
*/

import * as React from "react";
import { Map as MapIcon, Minus, Square, Type } from "lucide-react";

import type { EstiloLinha, EstiloMapa, EstiloNo, FunnelEdge, FunnelNode } from "./funnel-model";

type Aba = "no" | "linha" | "texto" | "mapa";

export const CORES_NO = ["#00e559", "#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#f87171", "#ffffff"];
const CORES_LINHA = ["#b1b1b7", "#00e559", "#38bdf8", "#a78bfa", "#f472b6", "#f59e0b", "#f87171", "#ffffff"];

const ABAS: { id: Aba; rotulo: string; sub: string; cor: string; Icone: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: "no", rotulo: "Nó", sub: "Cor e borda do bloco selecionado", cor: "#00e559", Icone: Square },
  { id: "linha", rotulo: "Linha", sub: "Forma, setas, traço e cor da linha", cor: "#38bdf8", Icone: Minus },
  { id: "texto", rotulo: "Texto", sub: "Tamanho e peso do nome do bloco", cor: "#f59e0b", Icone: Type },
  { id: "mapa", rotulo: "Mapa", sub: "Fundo do quadro e padrão das linhas", cor: "#a78bfa", Icone: MapIcon },
];

function Chip({ on, children, onClick, title }: { on: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" className="pub__chip" data-on={on || undefined} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function StylePanel({
  node,
  edge,
  mapa,
  fluxoGlobal,
  onNode,
  onEdge,
  onEdgeReset,
  onRotulo,
  onMapa,
  onFluxoGlobal,
  onEnquadrar,
  onFechar,
}: {
  node?: FunnelNode;
  edge?: FunnelEdge;
  mapa: EstiloMapa;
  fluxoGlobal: boolean;
  onNode: (id: string, patch: Partial<EstiloNo> | null) => void;
  onEdge: (id: string, patch: Partial<EstiloLinha>) => void;
  onEdgeReset: (id: string) => void;
  /** Nome da saída (texto no meio da linha). */
  onRotulo: (id: string, rotulo: string) => void;
  onMapa: (patch: EstiloMapa | null) => void;
  onFluxoGlobal: (v: boolean) => void;
  onEnquadrar: () => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = React.useState<Aba>(edge ? "linha" : "no");
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const e = edge?.estilo ?? {};
  const n = node?.estilo ?? {};
  const reset = () => {
    if (aba === "no" && node) onNode(node.id, { cor: undefined, borda: undefined });
    if (aba === "texto" && node) onNode(node.id, { texto: undefined, negrito: undefined });
    if (aba === "linha" && edge) onEdgeReset(edge.id);
    if (aba === "mapa") { onMapa(null); onFluxoGlobal(true); }
  };
  const alvoNo = node && node.type !== "brand" ? node : undefined;

  return (
    <aside className="pub pub--estilo" aria-label="Estilo" onPointerDown={(ev) => ev.stopPropagation()}>
      <header className="pub__head">
        <div className="pub__head-id">
          <span className="pub__badge">Estilo</span>
          <span className="pub__nome" style={{ cursor: "default" }}>
            {aba === "mapa" ? "Mapa inteiro" : aba === "linha" ? (edge ? "Linha selecionada" : "Nenhuma linha selecionada") : alvoNo ? alvoNo.title || "Bloco" : "Nenhum bloco selecionado"}
          </span>
        </div>
        <button type="button" className="pub__x" aria-label="Fechar" onClick={onFechar}>✕</button>
      </header>
      <div className="pub__url">Clique num bloco ou numa linha do quadro para editar o estilo dele</div>

      <div className="pub__body">
        <nav className="pub__rail" aria-label="Abas do estilo">
          {ABAS.map((a) => (
            <button key={a.id} type="button" className="pub__rail-btn" data-on={aba === a.id || undefined} style={{ "--aba-cor": a.cor } as React.CSSProperties} onClick={() => setAba(a.id)} title={a.rotulo} aria-label={a.rotulo}>
              <span className="pub__rail-ic" aria-hidden><a.Icone size={16} strokeWidth={2} /></span>
              <span className="pub__rail-lbl">{a.rotulo}</span>
            </button>
          ))}
        </nav>
        <div className="pub__corpo">
          <div className="pub__sec" style={{ "--aba-cor": abaAtual.cor } as React.CSSProperties}>
            <span className="pub__sec-badge" aria-hidden><abaAtual.Icone size={18} strokeWidth={2} /></span>
            <span className="pub__sec-txt">
              <b className="pub__sec-titulo">{abaAtual.rotulo}</b>
              <span className="pub__sec-sub">{abaAtual.sub}</span>
            </span>
          </div>

          {aba === "no" && (alvoNo ? (
            <>
              <div className="pub__campo">
                <span>Cor de destaque</span>
                <div className="pub__chips stp__cores">
                  <button type="button" className="stp__cor stp__cor--nenhuma" data-on={!n.cor || undefined} aria-label="Sem cor" title="Sem cor" onClick={() => onNode(alvoNo.id, { cor: undefined })}>∅</button>
                  {CORES_NO.map((c) => (
                    <button key={c} type="button" className="stp__cor" style={{ background: c }} data-on={n.cor === c || undefined} aria-label={`Cor ${c}`} title={c} onClick={() => onNode(alvoNo.id, { cor: c })} />
                  ))}
                </div>
              </div>
              <div className="pub__campo">
                <span>Borda</span>
                <div className="pub__chips">
                  {([1, 2, 3] as const).map((b) => (
                    <Chip key={b} on={(n.borda ?? 1) === b} onClick={() => onNode(alvoNo.id, { borda: b })}>{b === 1 ? "Fina" : b === 2 ? "Média" : "Grossa"}</Chip>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="pub__vazio">Selecione um bloco no quadro (clique nele) para mudar cor e borda.</div>
          ))}

          {aba === "linha" && (edge ? (
            <>
              {!edge.id.startsWith("rr:") && (
                <label className="pub__campo">
                  <span>Nome da saída</span>
                  <input
                    className="pub__input"
                    value={edge.rotulo ?? ""}
                    maxLength={40}
                    placeholder="ex.: Comprou, Não comprou, Abandonou"
                    onChange={(ev) => onRotulo(edge.id, ev.target.value)}
                  />
                  <small className="pub__hint">Aparece no meio da linha. Numa linha de regra do Redirecionador, o nome é a própria regra.</small>
                </label>
              )}
              <div className="pub__campo">
                <span>Forma</span>
                <div className="pub__chips">
                  {(["curva", "reta", "cotovelo", "livre"] as const).map((f) => (
                    <Chip key={f} on={(e.forma ?? "curva") === f} onClick={() => onEdge(edge.id, { forma: f })}>{f === "cotovelo" ? "Cotovelo (90°)" : f[0].toUpperCase() + f.slice(1)}</Chip>
                  ))}
                </div>
              </div>
              <div className="pub__campo">
                <span>Setas</span>
                <div className="pub__chips">
                  {(["fim", "ambas", "nenhuma"] as const).map((pt) => (
                    <Chip key={pt} on={(e.pontas ?? "fim") === pt} onClick={() => onEdge(edge.id, { pontas: pt })}>{pt === "fim" ? "No fim" : pt === "ambas" ? "Nas duas pontas" : "Sem seta"}</Chip>
                  ))}
                </div>
              </div>
              <div className="pub__campo">
                <span>Traço</span>
                <div className="pub__chips">
                  <Chip on={Boolean(e.tracejada)} onClick={() => onEdge(edge.id, { tracejada: !e.tracejada })}>Tracejada</Chip>
                  <Chip on={e.fluxo ?? fluxoGlobal} onClick={() => onEdge(edge.id, { fluxo: !(e.fluxo ?? fluxoGlobal) })}>Fluxo animado</Chip>
                  {([1, 2, 3] as const).map((es) => (
                    <Chip key={es} on={(e.espessura ?? 2) === es} onClick={() => onEdge(edge.id, { espessura: es })}>{es === 1 ? "Fina" : es === 2 ? "Média" : "Grossa"}</Chip>
                  ))}
                </div>
              </div>
              <div className="pub__campo">
                <span>Cor</span>
                <div className="pub__chips stp__cores">
                  {CORES_LINHA.map((c) => (
                    <button key={c} type="button" className="stp__cor" style={{ background: c }} data-on={(e.cor ?? mapa.corLinha ?? "#b1b1b7") === c || undefined} aria-label={`Cor ${c}`} title={c} onClick={() => onEdge(edge.id, { cor: c })} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="pub__vazio">Clique numa linha do quadro para mudar forma, setas, traço e cor. O padrão de todas as linhas fica na aba Mapa.</div>
          ))}

          {aba === "texto" && (alvoNo ? (
            <>
              <div className="pub__campo">
                <span>Tamanho do nome</span>
                <div className="pub__chips">
                  <Chip on={(n.texto ?? "normal") === "normal"} onClick={() => onNode(alvoNo.id, { texto: "normal" })}>Normal</Chip>
                  <Chip on={n.texto === "grande"} onClick={() => onNode(alvoNo.id, { texto: "grande" })}>Grande</Chip>
                </div>
              </div>
              <div className="pub__campo">
                <span>Peso</span>
                <div className="pub__chips">
                  <Chip on={Boolean(n.negrito)} onClick={() => onNode(alvoNo.id, { negrito: !n.negrito })}><b>Negrito</b></Chip>
                </div>
              </div>
            </>
          ) : (
            <div className="pub__vazio">Selecione um bloco para mudar o texto do nome.</div>
          ))}

          {aba === "mapa" && (
            <>
              <div className="pub__campo">
                <span>Fundo do quadro</span>
                <div className="pub__chips">
                  {(["pontos", "grade", "liso"] as const).map((f) => (
                    <Chip key={f} on={(mapa.fundo ?? "pontos") === f} onClick={() => onMapa({ fundo: f })}>{f === "pontos" ? "Pontinhos" : f === "grade" ? "Grade" : "Liso"}</Chip>
                  ))}
                </div>
              </div>
              <div className="pub__campo">
                <span>Cor padrão das linhas</span>
                <div className="pub__chips stp__cores">
                  {CORES_LINHA.map((c) => (
                    <button key={c} type="button" className="stp__cor" style={{ background: c }} data-on={(mapa.corLinha ?? "#b1b1b7") === c || undefined} aria-label={`Cor ${c}`} title={c} onClick={() => onMapa({ corLinha: c })} />
                  ))}
                </div>
                <small className="pub__hint">Linhas com cor própria continuam com a cor delas.</small>
              </div>
              <div className="pub__campo">
                <span>Movimento</span>
                <div className="pub__chips">
                  <Chip on={fluxoGlobal} onClick={() => onFluxoGlobal(!fluxoGlobal)}>Fluxo animado em todas</Chip>
                </div>
              </div>
              <div className="pub__campo">
                <span>Vista</span>
                <div className="pub__chips">
                  <button type="button" className="pub__btn" onClick={onEnquadrar}>Ajustar à tela</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="pub__foot">
        <span className="pub__foot-vps"><span className="pub__vps-dot" aria-hidden />Só aparência — salva junto com o funil</span>
        <button type="button" className="pub__btn stp__reset" onClick={reset}>↺ Reset {abaAtual.rotulo.toLowerCase()}</button>
      </footer>
    </aside>
  );
}
