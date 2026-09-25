"use client";

import * as React from "react";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Bot,
  BookOpen,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  Grid2x2,
  Image as ImageIcon,
  List,
  ListChecks,
  Lock,
  LockOpen,
  Maximize,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Minus,
  Plug,
  Plus,
  Save,
  Settings,
  Smartphone,
  Split,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  GRID,
  MARCAS,
  NODE_W,
  RECURSOS,
  RECURSO_POR_TIPO,
  ROTULO_TIPO,
  type FunnelData,
  type FunnelEdge,
  type FunnelNode,
  type FunnelNodeType,
  type LucideName,
  type MarcaDef,
} from "./funnel-model";

const ICONES: Record<
  LucideName,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  FileText,
  ListChecks,
  Clock,
  Users,
  List,
  BarChart3,
  ExternalLink,
  FlaskConical,
  Split,
  Globe,
  MessageCircle,
  DollarSign,
  Ticket,
  MessagesSquare,
  Bot,
  Smartphone,
  Plug,
  BookOpen,
  ImageIcon,
  MessageSquare,
};

const OFF = 8000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const DATA_KEY = "application/x-funnel";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Tipos que mostram o card grande de página (com preview e "Editar"). */
const isPagina = (t: FunnelNodeType) => t === "page_v3";

interface Viewport {
  x: number;
  y: number;
  k: number;
}

type Interacao =
  | { modo: "pan"; px: number; py: number; ox: number; oy: number }
  | {
      modo: "node";
      id: string;
      px: number;
      py: number;
      nx: number;
      ny: number;
      moveu: boolean;
    }
  | { modo: "connect"; source: string }
  | null;

export interface FunnelBoardProps {
  /** O funil inicial mostrado no quadro. */
  inicial: FunnelData;
  /** Voltar à lista de funis. */
  onVoltar?: () => void;
  /** Abrir o editor de uma página (botão "Editar" do nó). */
  onEditarPagina?: (node: FunnelNode) => void;
  /** Persistir o funil (nome, nós e arestas). */
  onSalvar?: (data: FunnelData) => void;
  onArquivar?: (id: string) => void;
  onExcluir?: (id: string) => void;
}

/**
 * O quadro de funil: um canvas escuro de pontinhos onde cada etapa é um
 * card claro que flutua, arrasta com snap de 20px e se liga da saída à
 * entrada. Reimplementa a casca do editor do SellFlux sem dependência de
 * canvas — só React e ponteiro.
 */
export function FunnelBoard({
  inicial,
  onVoltar,
  onEditarPagina,
  onSalvar,
  onArquivar,
  onExcluir,
}: FunnelBoardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = React.useState<FunnelNode[]>(inicial.nodes);
  const [edges, setEdges] = React.useState<FunnelEdge[]>(inicial.edges);
  const [vp, setVp] = React.useState<Viewport>({ x: 40, y: 40, k: 0.8 });
  const [sel, setSel] = React.useState<{
    tipo: "node" | "edge";
    id: string;
  } | null>(null);
  const [painel, setPainel] = React.useState<"recursos" | "icones" | null>(
    null,
  );
  const [dialog, setDialog] = React.useState(false);
  const [nome, setNome] = React.useState(inicial.nome);
  const [locked, setLocked] = React.useState(false);
  const [sizes, setSizes] = React.useState<
    Record<string, { w: number; h: number }>
  >({});
  const [conn, setConn] = React.useState<{
    wx: number;
    wy: number;
    /** O nó de origem da ligação em curso — no estado, porque o render
        desenha a aresta temporária e não deve ler o ref da interação. */
    source: string;
  } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const inter = React.useRef<Interacao>(null);
  // Semeia o contador a partir do maior id já existente, para novos nós e
  // arestas nunca colidirem com os do funil carregado (inclusive após
  // salvar e recarregar do localStorage).
  const idSeq = React.useRef(
    Math.max(
      0,
      ...inicial.nodes.map((n) => Number(n.id.replace(/^\D+/, "")) || 0),
      ...inicial.edges.map((e) => Number(e.id.replace(/^\D+/, "")) || 0),
    ) + 1,
  );

  const size = React.useCallback(
    (id: string) => sizes[id] ?? { w: NODE_W, h: 90 },
    [sizes],
  );

  const medir = React.useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setSizes((prev) => {
      const at = prev[id];
      if (at && at.w === w && at.h === h) return prev;
      return { ...prev, [id]: { w, h } };
    });
  }, []);

  // Converte um ponto de tela (clientX/Y) para coordenadas do mundo.
  const paraMundo = React.useCallback(
    (clientX: number, clientY: number) => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return { wx: 0, wy: 0 };
      return {
        wx: (clientX - r.left - vp.x) / vp.k,
        wy: (clientY - r.top - vp.y) / vp.k,
      };
    },
    [vp],
  );

  // Ref sempre atualizado de paraMundo, para o effect de ponteiro não
  // precisar dele nas deps (senão reassina os listeners a cada frame de pan).
  const paraMundoRef = React.useRef(paraMundo);
  React.useEffect(() => {
    paraMundoRef.current = paraMundo;
  }, [paraMundo]);

  // Roda do mouse: zoom mirando o cursor. Listener nativo para poder
  // cancelar o scroll da página (onWheel do React é passivo).
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setVp((v) => {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
        const escala = k / v.k;
        return { k, x: px - (px - v.x) * escala, y: py - (py - v.y) * escala };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Um único par move/up global enquanto há interação em curso.
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = inter.current;
      if (!it) return;
      if (it.modo === "pan") {
        setVp((v) => ({
          ...v,
          x: it.ox + (e.clientX - it.px),
          y: it.oy + (e.clientY - it.py),
        }));
      } else if (it.modo === "node") {
        const dx = (e.clientX - it.px) / vp.k;
        const dy = (e.clientY - it.py) / vp.k;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) it.moveu = true;
        const nx = snap(it.nx + dx);
        const ny = snap(it.ny + dy);
        setNodes((ns) =>
          ns.map((n) => (n.id === it.id ? { ...n, x: nx, y: ny } : n)),
        );
      } else if (it.modo === "connect") {
        setConn({
          ...paraMundoRef.current(e.clientX, e.clientY),
          source: it.source,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      const it = inter.current;
      if (!it) return;
      if (it.modo === "connect") {
        // Aceita o drop em qualquer parte do nó-alvo (o próprio card leva
        // data-in), não só no círculo de 20px da alça.
        const alvo = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-in]");
        const destino = alvo?.dataset.in;
        if (destino && destino !== it.source) {
          setEdges((es) => {
            if (
              es.some((ed) => ed.source === it.source && ed.target === destino)
            )
              return es;
            return [
              ...es,
              { id: `e${idSeq.current++}`, source: it.source, target: destino },
            ];
          });
        }
        setConn(null);
      }
      inter.current = null;
      setPanning(false);
      setDragId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [vp.k]);

  // Delete remove o que estiver selecionado (fora de inputs).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA"))
        return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        if (sel.tipo === "node") {
          setNodes((ns) => ns.filter((n) => n.id !== sel.id));
          setEdges((es) =>
            es.filter((ed) => ed.source !== sel.id && ed.target !== sel.id),
          );
        } else {
          setEdges((es) => es.filter((ed) => ed.id !== sel.id));
        }
        setSel(null);
      }
      if (e.key === "Escape") {
        setPainel(null);
        setSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, dialog]);

  const iniciarPan = (e: React.PointerEvent) => {
    // Travado ou não, o pan da mesa funciona; só a seleção é limpa aqui.
    setSel(null);
    setPainel(null);
    inter.current = {
      modo: "pan",
      px: e.clientX,
      py: e.clientY,
      ox: vp.x,
      oy: vp.y,
    };
    setPanning(true);
  };

  const iniciarArrasto = (e: React.PointerEvent, node: FunnelNode) => {
    e.stopPropagation();
    setSel({ tipo: "node", id: node.id });
    if (locked) return;
    setDragId(node.id);
    inter.current = {
      modo: "node",
      id: node.id,
      px: e.clientX,
      py: e.clientY,
      nx: node.x,
      ny: node.y,
      moveu: false,
    };
  };

  const iniciarConexao = (e: React.PointerEvent, node: FunnelNode) => {
    e.stopPropagation();
    if (locked) return;
    inter.current = { modo: "connect", source: node.id };
    setConn({ ...paraMundo(e.clientX, e.clientY), source: node.id });
  };

  const adicionar = React.useCallback(
    (payload: string, wx: number, wy: number) => {
      const x = snap(wx - NODE_W / 2);
      const y = snap(wy - 40);
      let novo: FunnelNode;
      if (payload.startsWith("marca:")) {
        const m = MARCAS.find((mm) => mm.id === payload.slice(6));
        if (!m) return;
        novo = {
          id: `n${idSeq.current++}`,
          type: "brand",
          x,
          y,
          title: m.label,
          cor: m.cor,
          sigla: m.sigla,
        };
      } else {
        const def = RECURSO_POR_TIPO[payload];
        if (!def) return;
        novo = {
          id: `n${idSeq.current++}`,
          type: def.type,
          x,
          y,
          title: def.label,
          url: isPagina(def.type) ? "/nova-pagina" : undefined,
        };
      }
      setNodes((ns) => [...ns, novo]);
      setSel({ tipo: "node", id: novo.id });
      setPainel(null);
    },
    [],
  );

  // Soltar um item dos painéis no canvas.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData(DATA_KEY);
    if (!payload) return;
    const { wx, wy } = paraMundo(e.clientX, e.clientY);
    adicionar(payload, wx, wy);
  };

  // Clique num item também adiciona, no centro da vista.
  const adicionarNoCentro = (payload: string) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const { wx, wy } = paraMundo(r.left + r.width / 2, r.top + r.height / 2);
    adicionar(payload, wx, wy);
  };

  const zoomPor = (fator: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = r.width / 2;
    const py = r.height / 2;
    setVp((v) => {
      const k = clamp(v.k * fator, MIN_ZOOM, MAX_ZOOM);
      const escala = k / v.k;
      return { k, x: px - (px - v.x) * escala, y: py - (py - v.y) * escala };
    });
  };

  const enquadrar = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || nodes.length === 0) {
      setVp({ x: 40, y: 40, k: 0.8 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const s = size(n.id);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + s.w);
      maxY = Math.max(maxY, n.y + s.h);
    }
    const pad = 80;
    const largura = maxX - minX + pad * 2;
    const altura = maxY - minY + pad * 2;
    const k = clamp(
      Math.min(r.width / largura, r.height / altura),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setVp({
      k,
      x: r.width / 2 - ((minX + maxX) / 2) * k,
      y: r.height / 2 - ((minY + maxY) / 2) * k,
    });
  };

  const salvar = () => {
    onSalvar?.({ ...inicial, nome, nodes, edges });
    setDialog(false);
  };

  const paginaAt = React.useMemo(() => {
    let i = 0;
    const ordem: Record<string, number> = {};
    for (const n of nodes) ordem[n.id] = ++i;
    return ordem;
  }, [nodes]);

  const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.k})`;

  return (
    <div className="funnel" ref={rootRef} data-design-system="orbit">
      <div
        className="funnel__viewport"
        data-panning={panning}
        data-locked={locked}
        onPointerDown={iniciarPan}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="funnel__world" style={{ transform }}>
          <div className="funnel__dots" aria-hidden />

          <svg className="funnel__edges" aria-hidden>
            {edges.map((ed) => {
              const s = nodes.find((n) => n.id === ed.source);
              const t = nodes.find((n) => n.id === ed.target);
              if (!s || !t) return null;
              const ss = size(s.id);
              const ts = size(t.id);
              const sx = s.x + ss.w;
              const sy = s.y + ss.h / 2;
              const tx = t.x;
              const ty = t.y + ts.h / 2;
              const dx = Math.max(40, Math.abs(tx - sx) / 2);
              const d = `M ${sx + OFF} ${sy + OFF} C ${sx + dx + OFF} ${sy + OFF}, ${tx - dx + OFF} ${ty + OFF}, ${tx + OFF} ${ty + OFF}`;
              return (
                <g key={ed.id}>
                  <path
                    className="funnel__edge-hit"
                    d={d}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSel({ tipo: "edge", id: ed.id });
                    }}
                  />
                  <path
                    className="funnel__edge"
                    d={d}
                    data-selected={sel?.tipo === "edge" && sel.id === ed.id}
                  />
                </g>
              );
            })}
            {conn &&
              (() => {
                const src = nodes.find((n) => n.id === conn.source);
                if (!src) return null;
                const ss = size(src.id);
                const sx = src.x + ss.w;
                const sy = src.y + ss.h / 2;
                const dx = Math.max(40, Math.abs(conn.wx - sx) / 2);
                const d = `M ${sx + OFF} ${sy + OFF} C ${sx + dx + OFF} ${sy + OFF}, ${conn.wx - dx + OFF} ${conn.wy + OFF}, ${conn.wx + OFF} ${conn.wy + OFF}`;
                return <path className="funnel__edge--temp" d={d} />;
              })()}
          </svg>

          {nodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              ord={paginaAt[node.id]}
              selected={sel?.tipo === "node" && sel.id === node.id}
              dragging={dragId === node.id}
              locked={locked}
              measure={medir}
              onPointerDown={(e) => iniciarArrasto(e, node)}
              onHandleOut={(e) => iniciarConexao(e, node)}
              onEditar={() => onEditarPagina?.(node)}
            />
          ))}
        </div>
      </div>

      {nodes.length === 0 && (
        <div className="funnel__empty">
          <b>Arraste recursos para começar</b>
          <span>
            Use os botões do topo para adicionar páginas, automações e outros
            elementos ao seu funil
          </span>
        </div>
      )}

      {/* Barra flutuante do quadro */}
      <div className="funnel__header">
        <button
          type="button"
          className="funnel__act"
          aria-label="Voltar"
          onClick={onVoltar}
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
        </button>
        <div className="funnel__header-id">
          <div className="funnel__header-name">
            <b>{nome}</b> <span>· {inicial.projeto}</span>
          </div>
          <span className="funnel__header-sub">
            Planejamento do Funil de Vendas
          </span>
        </div>
        <div className="funnel__header-actions">
          <button
            type="button"
            className="funnel__act"
            aria-label="Ícones"
            data-on={painel === "icones"}
            onClick={() => setPainel((p) => (p === "icones" ? null : "icones"))}
          >
            <Plus size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="funnel__act"
            aria-label="Recursos"
            data-on={painel === "recursos"}
            onClick={() =>
              setPainel((p) => (p === "recursos" ? null : "recursos"))
            }
          >
            <Grid2x2 size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="funnel__act"
            aria-label="Configurações"
            onClick={() => setDialog(true)}
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {painel === "recursos" && (
        <div className="funnel__panel">
          <div className="funnel__panel-title">Recursos</div>
          <div className="funnel__panel-hint">
            Arraste um destes recursos para o fluxo!
          </div>
          <div className="funnel__grid">
            {RECURSOS.map((r) => {
              const Icone = ICONES[r.icon];
              return (
                <button
                  type="button"
                  key={r.type}
                  className="funnel__item"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData(DATA_KEY, r.type)}
                  onClick={() => adicionarNoCentro(r.type)}
                >
                  <Icone size={24} strokeWidth={1.8} />
                  <span className="funnel__item-label">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {painel === "icones" && (
        <div className="funnel__panel">
          <div className="funnel__panel-title">Ícones</div>
          <div className="funnel__panel-hint">
            Arraste um destes ícones para o fluxo!
          </div>
          <div className="funnel__grid">
            {MARCAS.map((m) => (
              <button
                type="button"
                key={m.id}
                className="funnel__item"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(DATA_KEY, `marca:${m.id}`)
                }
                onClick={() => adicionarNoCentro(`marca:${m.id}`)}
              >
                <span
                  className="funnel__item-disc"
                  style={{ background: m.cor }}
                >
                  {m.sigla}
                </span>
                <span className="funnel__item-label">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar de zoom */}
      <div className="funnel__zoom">
        <button
          type="button"
          aria-label="Aproximar"
          onClick={() => zoomPor(1.2)}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Afastar"
          onClick={() => zoomPor(1 / 1.2)}
        >
          <Minus size={16} strokeWidth={2} />
        </button>
        <button type="button" aria-label="Enquadrar" onClick={enquadrar}>
          <Maximize size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Travar quadro"
          data-on={locked}
          onClick={() => setLocked((l) => !l)}
        >
          {locked ? (
            <Lock size={16} strokeWidth={2} />
          ) : (
            <LockOpen size={16} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Modal de configurações */}
      {dialog && (
        <div className="funnel__overlay" onPointerDown={() => setDialog(false)}>
          <div
            className="funnel__dialog"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="funnel__dialog-head">
              <span>Configurações do Funil</span>
              <button
                type="button"
                className="funnel__dialog-close"
                aria-label="Fechar"
                onClick={() => setDialog(false)}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="funnel__dialog-body">
              <label htmlFor="funnel-nome">Nome do funil</label>
              <input
                id="funnel-nome"
                className="funnel__input"
                type="text"
                maxLength={200}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <div className="funnel__count">{nome.length}/200</div>
              <div className="funnel__dialog-foot">
                <button
                  type="button"
                  className="funnel__btn"
                  onClick={() => onArquivar?.(inicial.id)}
                >
                  <Archive size={15} strokeWidth={2} />
                  Arquivar
                </button>
                <div className="funnel__foot-right">
                  <button
                    type="button"
                    className={cn("funnel__btn", "funnel__btn--danger")}
                    onClick={() => onExcluir?.(inicial.id)}
                  >
                    <Trash2 size={15} strokeWidth={2} />
                    Excluir
                  </button>
                  <button
                    type="button"
                    className={cn("funnel__btn", "funnel__btn--primary")}
                    onClick={salvar}
                  >
                    <Save size={15} strokeWidth={2} />
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface NodeViewProps {
  node: FunnelNode;
  ord: number;
  selected: boolean;
  dragging: boolean;
  locked: boolean;
  measure: (id: string, el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandleOut: (e: React.PointerEvent) => void;
  onEditar: () => void;
}

function NodeView({
  node,
  ord,
  selected,
  dragging,
  locked,
  measure,
  onPointerDown,
  onHandleOut,
  onEditar,
}: NodeViewProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Medir antes do paint (layout effect), e só quando o conteúdo muda a
  // altura — não a cada pan/arrasto —, para as arestas não "pularem".
  React.useLayoutEffect(() => {
    measure(node.id, ref.current);
  }, [measure, node.id, node.type, node.title, node.url]);

  const marca = node.type === "brand";
  const pagina = isPagina(node.type);

  return (
    <div
      ref={ref}
      className={cn(
        "funnel__node",
        marca && "funnel__node--brand",
        !pagina && !marca && "funnel__node--plain",
      )}
      style={{ left: node.x, top: node.y, width: marca ? "auto" : NODE_W }}
      data-selected={selected}
      data-dragging={dragging}
      data-locked={locked}
      data-in={node.id}
      onPointerDown={onPointerDown}
    >
      <span
        className="funnel__handle funnel__handle--in"
        data-in={node.id}
        aria-hidden
      />

      {marca ? (
        <div className="funnel__node-shell">
          <div className="funnel__node-brand">
            <span
              className="funnel__brand-disc"
              style={{ background: node.cor }}
            >
              {node.sigla}
            </span>
            <div className="funnel__node-titles">
              <span className="funnel__node-title">{node.title}</span>
              <span className="funnel__node-sub">Origem de tráfego</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="funnel__node-shell">
          <div className="funnel__node-frame">
            <div className="funnel__node-head">
              <span className="funnel__node-badge">{ord}</span>
              <span className="funnel__node-titles">
                <span className="funnel__node-title">{node.title}</span>
                <span className="funnel__node-sub">{node.url ?? " "}</span>
              </span>
              <span className="funnel__node-type">
                {ROTULO_TIPO[node.type]}
              </span>
            </div>
            {pagina && (
              <div className="funnel__node-preview">
                <svg
                  width="72"
                  height="72"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="14" y2="13" />
                  <line x1="8" y1="17" x2="16" y2="17" />
                </svg>
              </div>
            )}
          </div>
          {pagina && (
            <button
              type="button"
              className="funnel__node-edit"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onEditar}
            >
              Editar
            </button>
          )}
        </div>
      )}

      <span
        className="funnel__handle funnel__handle--out"
        data-out={node.id}
        onPointerDown={onHandleOut}
        aria-hidden
      />
    </div>
  );
}

/** Reexport para conveniência de quem monta a página. */
export type { FunnelData, MarcaDef };
