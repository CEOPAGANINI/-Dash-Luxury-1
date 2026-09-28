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
  Copy,
  FolderOpen,
  Minus,
  Plug,
  Plus,
  Save,
  Server,
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
  enderecoConfigurado,
  paginaVazia,
  type FunnelData,
  type FunnelEdge,
  type FunnelNode,
  type FunnelNodeType,
  type LucideName,
  type MarcaDef,
} from "./funnel-model";
import {
  DOMINIOS_VPS,
  PAGINAS_VPS,
  estadoDoDominio,
  paginasDoDominio,
  urlDaPagina,
} from "@/features/vps/catalogo-demo";
import { PagePublisher, type EtapaDestino } from "./page-publisher";
import {
  duplicarFunil,
  listarFunis,
  quando,
  removerFunil,
  salvarFunil,
} from "./funil-store";

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
      /** Posição inicial de cada bloco do grupo (arrasto em conjunto). */
      grupo?: Record<string, { x: number; y: number }>;
    }
  | {
      modo: "laco";
      px: number;
      py: number;
      /** Seleção que já existia (Ctrl: soma; senão, começa vazia). */
      base: string[];
    }
  | { modo: "connect"; source: string }
  | null;

export interface FunnelBoardProps {
  /** O funil inicial mostrado no quadro. */
  inicial: FunnelData;
  /** Voltar à lista de funis. */
  onVoltar?: () => void;
  /** Persistir o funil (nome, nós e arestas). */
  onSalvar?: (data: FunnelData) => void;
  onArquivar?: (id: string) => void;
  onExcluir?: (id: string) => void;
  /** Abrir um funil salvo no cofre (troca o quadro inteiro). */
  onAbrir?: (data: FunnelData) => void;
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
  onSalvar,
  onArquivar,
  onExcluir,
  onAbrir,
}: FunnelBoardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = React.useState<FunnelNode[]>(inicial.nodes);
  const [edges, setEdges] = React.useState<FunnelEdge[]>(inicial.edges);
  const [vp, setVp] = React.useState<Viewport>({ x: 40, y: 40, k: 0.8 });
  const [sel, setSel] = React.useState<{
    tipo: "node" | "edge";
    id: string;
  } | null>(null);
  // Seleção múltipla (Ctrl+clique / laço), como no Windows.
  const [multi, setMulti] = React.useState<Set<string>>(() => new Set());
  // Retângulo do laço, em pixels da tela do quadro.
  const [laco, setLaco] = React.useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  // Ctrl+clique num bloco só marca/desmarca — não abre o painel dele.
  const ctrlClick = React.useRef(false);
  // Onde o mouse está (para colar no lugar certo) e quantas colagens
  // seguidas (cada Ctrl+V desloca um pouco mais).
  const mouse = React.useRef<{ x: number; y: number; dentro: boolean }>({
    x: 0,
    y: 0,
    dentro: false,
  });
  const colagens = React.useRef(0);
  const edgesRef = React.useRef(edges);
  const nodesRef = React.useRef(nodes);
  const [painel, setPainel] = React.useState<
    "recursos" | "icones" | "vps" | "funis" | null
  >(null);
  // Bump para reler o cofre de funis depois de salvar/apagar.
  const [, refrescarFunis] = React.useReducer((x: number) => x + 1, 0);
  const [avisoFunil, setAvisoFunil] = React.useState<string | null>(null);
  // O domínio da VPS escolhido no painel VPS (as páginas vêm dele).
  const [dominioVps, setDominioVps] = React.useState(DOMINIOS_VPS[0].host);
  const [dialog, setDialog] = React.useState(false);
  const [nome, setNome] = React.useState(inicial.nome);
  const [locked, setLocked] = React.useState(false);
  const [sizes, setSizes] = React.useState<
    Record<string, { w: number; h: number }>
  >({});
  const sizesRef = React.useRef(sizes);
  // Espelhos para os handlers globais (que vivem fora do render).
  React.useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    sizesRef.current = sizes;
  }, [nodes, edges, sizes]);
  const [conn, setConn] = React.useState<{
    wx: number;
    wy: number;
    /** O nó de origem da ligação em curso — no estado, porque o render
        desenha a aresta temporária e não deve ler o ref da interação. */
    source: string;
  } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  // O nó cuja configuração está aberta dentro do próprio bloco.
  const [aberto, setAberto] = React.useState<string | null>(null);

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
      // Roda sobre o publicador (painel lateral) rola o painel, não o
      // quadro: deixa o evento seguir e não dá zoom.
      if ((e.target as Element | null)?.closest?.(".pub")) return;
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
        if (it.grupo) {
          // Move o grupo inteiro mantendo as distâncias entre os blocos.
          const g = it.grupo;
          setNodes((ns) =>
            ns.map((n) =>
              g[n.id]
                ? { ...n, x: snap(g[n.id].x + dx), y: snap(g[n.id].y + dy) }
                : n,
            ),
          );
        } else {
          const nx = snap(it.nx + dx);
          const ny = snap(it.ny + dy);
          setNodes((ns) =>
            ns.map((n) => (n.id === it.id ? { ...n, x: nx, y: ny } : n)),
          );
        }
      } else if (it.modo === "laco") {
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        const x0 = Math.min(it.px, e.clientX) - r.left;
        const y0 = Math.min(it.py, e.clientY) - r.top;
        const w = Math.abs(e.clientX - it.px);
        const h = Math.abs(e.clientY - it.py);
        setLaco({ x: x0, y: y0, w, h });
        // Blocos que encostam no laço (em coordenadas do mundo).
        const a = paraMundoRef.current(Math.min(it.px, e.clientX), Math.min(it.py, e.clientY));
        const b = paraMundoRef.current(Math.max(it.px, e.clientX), Math.max(it.py, e.clientY));
        const dentro = new Set(it.base);
        for (const n of nodesRef.current) {
          const sz = sizesRef.current[n.id] ?? { w: NODE_W, h: 90 };
          const cruza =
            n.x < b.wx && n.x + sz.w > a.wx && n.y < b.wy && n.y + sz.h > a.wy;
          if (cruza) dentro.add(n.id);
        }
        setMulti(dentro);
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
      if (it.modo === "laco") setLaco(null);
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

  /*
    Área de transferência do quadro (Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D).
    Guarda no navegador, então dá para copiar num funil e colar em outro.
    Copia os blocos selecionados e as ligações entre eles; ao colar, ganha
    ids novos, cai onde o mouse está (ou um pouco deslocado) e a cópia já
    vem selecionada para arrastar.
  */
  const CLIP_KEY = "dash:funil-clipboard";
  const idsSelecionados = (): string[] => {
    if (multi.size > 0) return Array.from(multi);
    if (sel?.tipo === "node") return [sel.id];
    return [];
  };
  const copiar = (): number => {
    const ids = new Set(idsSelecionados());
    if (ids.size === 0) return 0;
    const ns = nodesRef.current.filter((n) => ids.has(n.id));
    const es = edgesRef.current.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    try {
      window.localStorage.setItem(CLIP_KEY, JSON.stringify({ nodes: ns, edges: es }));
    } catch {
      /* sem storage */
    }
    colagens.current = 0;
    return ns.length;
  };
  const colar = (deslocar = false) => {
    type Clip = { nodes: FunnelNode[]; edges: FunnelEdge[] };
    let clip: Clip | null = null;
    try {
      const bruto = window.localStorage.getItem(CLIP_KEY);
      clip = bruto ? (JSON.parse(bruto) as Clip) : null;
    } catch {
      clip = null;
    }
    if (!clip || clip.nodes.length === 0) return;
    colagens.current += 1;
    const minX = Math.min(...clip.nodes.map((n) => n.x));
    const minY = Math.min(...clip.nodes.map((n) => n.y));
    let dx: number;
    let dy: number;
    if (!deslocar && mouse.current.dentro) {
      // Cola com o canto do grupo onde o mouse está.
      const m = paraMundoRef.current(mouse.current.x, mouse.current.y);
      dx = snap(m.wx) - minX;
      dy = snap(m.wy) - minY;
    } else {
      dx = 40 * colagens.current;
      dy = 40 * colagens.current;
    }
    const mapa: Record<string, string> = {};
    const novos: FunnelNode[] = clip.nodes.map((n) => {
      const id = `n${idSeq.current++}`;
      mapa[n.id] = id;
      return { ...n, id, x: snap(n.x + dx), y: snap(n.y + dy) };
    });
    const novasEdges: FunnelEdge[] = clip.edges.map((e) => ({
      id: `e${idSeq.current++}`,
      source: mapa[e.source],
      target: mapa[e.target],
    }));
    setNodes((ns) => [...ns, ...novos]);
    setEdges((es) => [...es, ...novasEdges]);
    setMulti(new Set(novos.map((n) => n.id)));
    setSel(novos.length === 1 ? { tipo: "node", id: novos[0].id } : null);
    setAberto(null);
  };
  const recortar = () => {
    const ids = new Set(idsSelecionados());
    if (copiar() === 0) return;
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
    setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setMulti(new Set());
    setSel(null);
    setAberto(null);
  };
  const duplicar = () => {
    if (copiar() === 0) return;
    colar(true);
  };

  // Delete remove o que estiver selecionado (fora de inputs).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA"))
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "c") {
        if (copiar() > 0) e.preventDefault();
        return;
      }
      if (mod && k === "x") {
        e.preventDefault();
        recortar();
        return;
      }
      if (mod && k === "v") {
        e.preventDefault();
        colar();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        duplicar();
        return;
      }
      if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setMulti(new Set(nodesRef.current.map((n) => n.id)));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && multi.size > 0) {
        e.preventDefault();
        const ids = multi;
        setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
        setEdges((es) =>
          es.filter((ed) => !ids.has(ed.source) && !ids.has(ed.target)),
        );
        setMulti(new Set());
        setSel(null);
        setAberto(null);
        return;
      }
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
        setMulti(new Set());
        setAberto(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // copiar/colar/recortar/duplicar leem refs e o estado atual via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dialog, multi]);

  const iniciarPan = (e: React.PointerEvent) => {
    setPainel(null);
    // Ctrl/Cmd/Shift + arrastar no fundo = laço de seleção (Windows).
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const soma = e.ctrlKey || e.metaKey;
      inter.current = {
        modo: "laco",
        px: e.clientX,
        py: e.clientY,
        base: soma ? Array.from(multi) : [],
      };
      if (!soma) setMulti(new Set());
      setSel(null);
      setLaco({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
      return;
    }
    // Travado ou não, o pan da mesa funciona; só a seleção é limpa aqui.
    setSel(null);
    setMulti(new Set());
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
    // Ctrl/Cmd + clique: marca ou desmarca este bloco na seleção múltipla.
    if (e.ctrlKey || e.metaKey) {
      ctrlClick.current = true;
      setMulti((m) => {
        const n = new Set(m);
        if (n.has(node.id)) n.delete(node.id);
        else n.add(node.id);
        return n;
      });
      setSel({ tipo: "node", id: node.id });
      return;
    }
    setSel({ tipo: "node", id: node.id });
    // Clicou num bloco fora do grupo: a seleção múltipla se desfaz.
    const noGrupo = multi.has(node.id);
    if (!noGrupo && multi.size > 0) setMulti(new Set());
    if (locked) return;
    setDragId(node.id);
    const grupo =
      noGrupo && multi.size > 1
        ? Object.fromEntries(
            nodes
              .filter((n) => multi.has(n.id))
              .map((n) => [n.id, { x: n.x, y: n.y }]),
          )
        : undefined;
    inter.current = {
      modo: "node",
      id: node.id,
      px: e.clientX,
      py: e.clientY,
      nx: node.x,
      ny: node.y,
      moveu: false,
      grupo,
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
      if (payload.startsWith("vps:")) {
        // Uma página hospedada na VPS vira um nó de página com o endereço
        // real do domínio escolhido.
        const pag = PAGINAS_VPS.find((pp) => pp.id === payload.slice(4));
        if (!pag) return;
        novo = {
          id: `n${idSeq.current++}`,
          type: "page_v3",
          x,
          y,
          title: pag.nome,
          url: urlDaPagina(pag),
        };
      } else if (payload.startsWith("marca:")) {
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

  /*
    Ao abrir o publicador de uma página, o painel lateral (à direita) e o
    trilho (à esquerda) podem cobrir o card. Aqui, se o card não estiver
    inteiro na área útil (entre o trilho e o painel), o quadro dá um
    zoom-out só o necessário para o card caber e o centraliza nessa área.
    Se já estiver inteiro à vista, nada se move.
  */
  const trazerParaVista = (node: FunnelNode) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = size(node.id);
    const painelW = Math.min(468, r.width * 0.6, r.width - 12);
    const railW = 64; // o trilho de ícones do quadro, à esquerda
    const m = 28; // respiro em volta do card
    const dispW = r.width - painelW - railW; // largura útil entre trilho e painel
    setVp((v) => {
      const left = v.x + node.x * v.k;
      const right = left + s.w * v.k;
      const top = v.y + node.y * v.k;
      const bottom = top + s.h * v.k;
      const dentro =
        left >= railW + m &&
        right <= railW + dispW - m &&
        top >= m &&
        bottom <= r.height - m;
      if (dentro) return v;
      const kCabe = Math.min(
        (dispW - m * 2) / s.w,
        (r.height - m * 2) / s.h,
      );
      const k = clamp(Math.min(v.k, kCabe), MIN_ZOOM, MAX_ZOOM);
      const alvoX = railW + dispW / 2;
      const alvoY = r.height / 2;
      return {
        k,
        x: alvoX - (node.x + s.w / 2) * k,
        y: alvoY - (node.y + s.h / 2) * k,
      };
    });
  };

  const salvar = () => {
    onSalvar?.({ ...inicial, nome, nodes, edges });
    setDialog(false);
  };

  // Salvar no cofre: guarda este funil com nome, para reabrir depois e
  // para o redirecionador poder trazê-lo para o quadro dele.
  const salvarNoCofre = () => {
    const data: FunnelData = { ...inicial, nome, nodes, edges };
    const reg = salvarFunil(data, nome);
    onSalvar?.(reg.data);
    refrescarFunis();
    setAvisoFunil(`“${reg.nome}” salvo no cofre.`);
    window.setTimeout(() => setAvisoFunil(null), 2500);
  };

  // Edição dos campos dentro do bloco (nome, endereço, título, descrição).
  const atualizar = React.useCallback(
    (id: string, patch: Partial<FunnelNode>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n))),
    [],
  );

  const remover = React.useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((ed) => ed.source !== id && ed.target !== id));
    setSel(null);
    setAberto(null);
  }, []);

  // Quantas ligações saem de cada nó, para o rodapé "N saídas".
  const saidas = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const ed of edges) c[ed.source] = (c[ed.source] ?? 0) + 1;
    return c;
  }, [edges]);

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
        onPointerMove={(e) => {
          mouse.current = { x: e.clientX, y: e.clientY, dentro: true };
        }}
        onPointerLeave={() => {
          mouse.current.dentro = false;
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {laco && (
          <div
            className="funnel__laco"
            aria-hidden
            style={{ left: laco.x, top: laco.y, width: laco.w, height: laco.h }}
          />
        )}
        {multi.size > 1 && (
          <div className="funnel__multi-chip" role="status">
            <b>{multi.size} blocos selecionados</b>
            <span>
              arraste para mover juntos · Ctrl+C copia · Ctrl+D duplica ·
              Delete apaga · Esc limpa
            </span>
          </div>
        )}
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
              selected={
                (sel?.tipo === "node" && sel.id === node.id) ||
                multi.has(node.id)
              }
              dragging={dragId === node.id}
              locked={locked}
              aberto={aberto === node.id}
              saidas={saidas[node.id] ?? 0}
              measure={medir}
              onPointerDown={(e) => iniciarArrasto(e, node)}
              onHandleOut={(e) => iniciarConexao(e, node)}
              onToggle={() => {
                if (ctrlClick.current) {
                  ctrlClick.current = false;
                  return;
                }
                const abrindo = aberto !== node.id;
                setAberto((a) => (a === node.id ? null : node.id));
                if (abrindo && isPagina(node.type)) trazerParaVista(node);
              }}
              onChange={(patch) => atualizar(node.id, patch)}
              onRemover={() => remover(node.id)}
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

      {/* Publicador da página: painel lateral quando um nó de página está
          aberto. Só a interface — nada publica de verdade. */}
      {(() => {
        if (!aberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (!n || !isPagina(n.type)) return null;
        const dados = n.pagina ?? paginaVazia();
        const proximas: EtapaDestino[] = [];
        for (const e of edges) {
          if (e.source !== n.id) continue;
          const t = nodes.find((x) => x.id === e.target);
          if (!t) continue;
          const url = t.pagina?.dominio
            ? `https://${t.pagina.dominio}${t.pagina.caminho}`
            : t.url;
          proximas.push({ id: t.id, nome: t.title, url });
        }
        return (
          <PagePublisher
            nome={n.title}
            dados={dados}
            onNome={(nm) => atualizar(n.id, { title: nm })}
            onChange={(d) => atualizar(n.id, { pagina: d })}
            proximasEtapas={proximas}
            onFechar={() => setAberto(null)}
          />
        );
      })()}

      {/* Menu do quadro — trilho vertical à esquerda, igual ao do
          redirecionador: ícones num trilho escuro, o ativo em verde. */}
      <nav className="funnel__rail" aria-label="Menu do quadro">
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Voltar"
          onClick={onVoltar}
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <span className="funnel__rail-sep" aria-hidden />
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Ícones"
          data-on={painel === "icones"}
          onClick={() => setPainel((p) => (p === "icones" ? null : "icones"))}
        >
          <Plus size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Recursos"
          data-on={painel === "recursos"}
          onClick={() =>
            setPainel((p) => (p === "recursos" ? null : "recursos"))
          }
        >
          <Grid2x2 size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Páginas da VPS"
          data-on={painel === "vps"}
          onClick={() => setPainel((p) => (p === "vps" ? null : "vps"))}
        >
          <Server size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Meus funis"
          data-on={painel === "funis"}
          onClick={() => setPainel((p) => (p === "funis" ? null : "funis"))}
        >
          <FolderOpen size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Configurações"
          onClick={() => setDialog(true)}
        >
          <Settings size={18} strokeWidth={2} />
        </button>
      </nav>

      {painel === "funis" && (
        <div className="funnel__panel funnel__panel--funis">
          <div className="funnel__panel-title">Meus funis</div>
          <div className="funnel__panel-hint">
            Salve este funil com nome para reabrir depois — e para trazê-lo
            ao quadro do redirecionador.
          </div>
          <div className="funnel__funis-salvar">
            <input
              className="funnel__input"
              value={nome}
              maxLength={200}
              placeholder="Nome do funil"
              aria-label="Nome do funil"
              onChange={(e) => setNome(e.target.value)}
            />
            <button
              type="button"
              className={cn("funnel__btn", "funnel__btn--primary")}
              onClick={salvarNoCofre}
            >
              <Save size={15} strokeWidth={2} />
              Salvar
            </button>
          </div>
          {avisoFunil && <div className="funnel__funis-aviso">{avisoFunil}</div>}
          <ul className="funnel__funis" aria-label="Funis salvos">
            {listarFunis().length === 0 && (
              <li className="funnel__funis-vazio">
                Nenhum funil salvo ainda. Dê um nome e clique em Salvar.
              </li>
            )}
            {listarFunis().map((f) => (
              <li
                key={f.id}
                className="funnel__funil"
                data-atual={f.id === inicial.id || undefined}
              >
                <div className="funnel__funil-info">
                  <b>{f.nome}</b>
                  <span>
                    {f.data.nodes.length} bloco(s) · {quando(f.atualizadoEm)}
                    {f.id === inicial.id ? " · aberto" : ""}
                  </span>
                </div>
                <div className="funnel__funil-acoes">
                  {f.id !== inicial.id && (
                    <button
                      type="button"
                      className="funnel__btn"
                      onClick={() => {
                        onAbrir?.(f.data);
                        setPainel(null);
                      }}
                    >
                      <FolderOpen size={14} strokeWidth={2} />
                      Abrir
                    </button>
                  )}
                  <button
                    type="button"
                    className="funnel__btn"
                    aria-label={`Duplicar ${f.nome}`}
                    title="Duplicar"
                    onClick={() => {
                      duplicarFunil(f.id);
                      refrescarFunis();
                    }}
                  >
                    <Copy size={14} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={cn("funnel__btn", "funnel__btn--danger")}
                    aria-label={`Apagar ${f.nome}`}
                    title="Apagar do cofre"
                    onClick={() => {
                      removerFunil(f.id);
                      refrescarFunis();
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="funnel__panel-hint">
            Fica salvo neste navegador (Fase 1). Quando ligarmos o banco, a
            lista passa a valer em qualquer aparelho.
          </div>
        </div>
      )}

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

      {painel === "vps" && (
        <div className="funnel__panel">
          <div className="funnel__panel-title">Páginas da VPS</div>
          <div className="funnel__panel-hint">
            Escolha o domínio e arraste uma página hospedada para o fluxo.
          </div>
          <div className="funnel__vps-doms" role="group" aria-label="Domínio">
            {DOMINIOS_VPS.map((d) => (
              <button
                type="button"
                key={d.host}
                className="funnel__vps-dom"
                data-on={dominioVps === d.host || undefined}
                onClick={() => setDominioVps(d.host)}
              >
                {d.host}
              </button>
            ))}
          </div>
          <div className="funnel__grid">
            {paginasDoDominio(dominioVps).map((pg) => (
              <button
                type="button"
                key={pg.id}
                className="funnel__item"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(DATA_KEY, `vps:${pg.id}`)
                }
                onClick={() => adicionarNoCentro(`vps:${pg.id}`)}
                title={urlDaPagina(pg)}
              >
                <FileText size={24} strokeWidth={1.8} />
                <span className="funnel__item-label">{pg.nome}</span>
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
  /** A configuração deste nó está aberta dentro do bloco. */
  aberto: boolean;
  /** Ligações que saem deste nó. */
  saidas: number;
  measure: (id: string, el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandleOut: (e: React.PointerEvent) => void;
  onToggle: () => void;
  onChange: (patch: Partial<FunnelNode>) => void;
  onRemover: () => void;
}

/**
 * Um nó do quadro, no desenho do editor de páginas: o bloco preto
 * quadrado do CommandLayer — cabeçalho com ícone e tipo, corpo com nome,
 * título e endereço, rodapé mono com o status — e, ao clicar no corpo, a
 * configuração da página abre DENTRO do próprio bloco, como no outro
 * quadro. O nó de origem (marca) é só o cabeçalho.
 */
function NodeView({
  node,
  ord,
  selected,
  dragging,
  locked,
  aberto,
  saidas,
  measure,
  onPointerDown,
  onHandleOut,
  onToggle,
  onChange,
  onRemover,
}: NodeViewProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Medir antes do paint (layout effect), e só quando o conteúdo muda a
  // altura — abrir a configuração, editar um campo —, não a cada pan.
  React.useLayoutEffect(() => {
    measure(node.id, ref.current);
  }, [
    measure,
    node.id,
    node.type,
    node.title,
    node.url,
    node.headline,
    node.descricao,
    aberto,
  ]);

  const marca = node.type === "brand";
  const pagina = isPagina(node.type);
  const def = RECURSO_POR_TIPO[node.type];
  const Icone = def ? ICONES[def.icon] : FileText;
  const url = node.url ?? "";
  const urlOk = enderecoConfigurado(url);
  // Publicador (nós de página): estado do "crachá".
  const pag = node.pagina;
  const paginaPronta = Boolean(pag?.dominio && pag?.zip?.ok);
  const enderecoPub = pag?.dominio ? `${pag.dominio}${pag.caminho}` : "";
  const configId = `funnel-cfg-${node.id}`;
  const rotuloSaidas = `${saidas} ${saidas === 1 ? "saída" : "saídas"}`;

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
      data-aberto={aberto || undefined}
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
        <article
          className="funnel__node-shell"
          aria-label={`${ROTULO_TIPO[node.type]} ${node.title}`}
        >
          <header className="funnel__node-head">
            <span className="funnel__node-icon" aria-hidden>
              <Icone size={17} />
            </span>
            <span className="funnel__node-kind">{ROTULO_TIPO[node.type]}</span>
            <span className="funnel__node-badge">{ord}</span>
          </header>

          <button
            type="button"
            className="funnel__node-body"
            onClick={onToggle}
            aria-expanded={aberto}
            aria-controls={aberto ? configId : undefined}
            aria-label={`Configurar ${node.title || "bloco sem nome"}`}
          >
            <span className="funnel__node-name">
              {node.title || (pagina ? "Página sem nome" : "Sem nome")}
            </span>
            <span className="funnel__node-headline">
              {pagina
                ? node.headline || "Adicione um título para sua página"
                : node.descricao || "Adicione uma observação"}
            </span>
            <span className="funnel__node-url">
              {pagina ? (
                enderecoPub ? (
                  <>
                    <span
                      className="funnel__dom-dot"
                      data-estado={estadoDoDominio(pag?.dominio)}
                      aria-hidden
                    />
                    {enderecoPub}
                  </>
                ) : (
                  "Toque para configurar e publicar"
                )
              ) : (
                url || "Sem referência"
              )}
            </span>
          </button>

          {aberto && !pagina && (
            <div
              id={configId}
              role="region"
              aria-label={`Configuração de ${node.title || "bloco sem nome"}`}
              className="funnel__cfg"
              // Digitar nos campos não pode começar a arrastar o bloco.
              onPointerDown={(e) => e.stopPropagation()}
            >
              <header className="funnel__cfg-head">
                <h3>{pagina ? "Configurar página" : "Configurar bloco"}</h3>
                <button
                  type="button"
                  className="funnel__cfg-remove"
                  aria-label={`Remover ${node.title || "bloco"}`}
                  onClick={onRemover}
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className="funnel__fields">
                <label>
                  {pagina ? "Nome da página" : "Nome"}
                  <input
                    value={node.title}
                    maxLength={120}
                    onChange={(e) => onChange({ title: e.target.value })}
                  />
                </label>
                <label>
                  {pagina ? "Endereço da página" : "Referência"}
                  <input
                    value={url}
                    maxLength={2048}
                    placeholder={
                      pagina ? "https://sualoja.com/oferta" : "ex.: lista-vip"
                    }
                    aria-invalid={pagina && Boolean(url) && !urlOk}
                    onChange={(e) => onChange({ url: e.target.value })}
                  />
                  {pagina && (
                    <small>
                      {url && !urlOk
                        ? "Use https:// ou um caminho interno iniciado por /."
                        : "Isso não publica nem cria a rota."}
                    </small>
                  )}
                </label>
                {pagina ? (
                  <>
                    <label>
                      Título da landing page
                      <input
                        value={node.headline ?? ""}
                        maxLength={240}
                        onChange={(e) =>
                          onChange({ headline: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        rows={3}
                        value={node.descricao ?? ""}
                        maxLength={2000}
                        onChange={(e) =>
                          onChange({ descricao: e.target.value })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Observação
                    <textarea
                      rows={3}
                      value={node.descricao ?? ""}
                      maxLength={2000}
                      onChange={(e) => onChange({ descricao: e.target.value })}
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          <footer className="funnel__node-foot">
            <span data-ok={pagina ? paginaPronta : true}>
              <i aria-hidden />
              {pagina
                ? paginaPronta
                  ? "Pronto para publicar"
                  : "Rascunho"
                : ROTULO_TIPO[node.type]}
            </span>
            <span>{rotuloSaidas}</span>
          </footer>
        </article>
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
