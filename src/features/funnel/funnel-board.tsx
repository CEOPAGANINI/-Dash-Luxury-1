"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FlowButton,
  FlowConfirmDialog,
  FlowIconButton,
  FlowStatusBadge,
} from "./flow-ui";
import { nodePreparation } from "./node-readiness";
import { FlowInspector } from "./flow-inspector";
import { nodeFocusViewport } from "./node-focus";
import { EdgeTools } from "./edge-tools";
import { FlowEdgeSignal } from "./edge-flow-signal";
import { addFunnelEdge, reconnectFunnelEdge } from "./reconnect-edge";
import {
  anchorPoint,
  perimeterAnchor,
  connectionControls,
  connectionMidpoint,
  connectionPath,
  moveConnectionControls,
  SOURCE_ANCHOR,
  TARGET_ANCHOR,
  type ConnectionPoint,
} from "./connection-geometry";
import "./flow-tokens.css";
import "./flow-design-system.css";
import type { FunnelSyncStatus } from "./cloud-client";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  Bot,
  BookOpen,
  Clock,
  CreditCard,
  GraduationCap,
  Mail,
  PartyPopper,
  Presentation,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Video,
  DollarSign,
  ExternalLink,
  FileText,
  FlaskConical,
  Frame,
  Globe,
  Grid2x2,
  LayoutTemplate,
  Image as ImageIcon,
  List,
  ListChecks,
  ListTree,
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
  Shuffle,
  Smartphone,
  Shapes,
  Split,
  StickyNote,
  Store,
  Ticket,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FAMILIAS,
  GRID,
  MARCAS,
  NODE_W,
  RECURSOS,
  RECURSO_POR_TIPO,
  ROTULO_TIPO,
  TIPOS_ANOTACAO,
  TIPOS_PAGINA,
  type FunnelData,
  type EstiloLinha,
  type FunnelConnectionAnchor,
  type EstiloMapa,
  type EstiloNo,
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
import { RedirectPanel } from "./redirect-panel";
import { BlockPanel } from "./block-panel";
import { MetaBusinessPanel } from "./meta-business-panel";
import { isFacebookTraffic } from "./meta-traffic-scope";
import { CORES_NO, StylePanel } from "./style-panel";
import {
  CENARIOS,
  PADRAO_TIPO,
  PREVISAO_PADRAO,
  VISITAS_PADRAO,
  calcularPrevisao,
  inteiro,
  reais,
  type PrevisaoCfg,
  type PrevisaoNo,
  type ResultadoNo,
} from "./funnel-forecast";
import { MODELOS, montarModelo } from "./funnel-templates";
import { StorePanel } from "./store-panel";
import { lojaVazia, nomeDaPlataforma, resumoDaLoja } from "./store-model";
import { FunnelSitePublisher } from "./funnel-site-publisher";
import { FunnelCloudHistory } from "./cloud-history";
import {
  GLIFO_REGRA,
  nomeDoDestino,
  nomesDosNos,
  rotuloDaRegra,
} from "./redirect-rules";
import { quando, type CofreFunil } from "./funil-store";
import {
  cloneFunnelGraph,
  parseFunnelClipboard,
  removeFunnelNodesGraph,
} from "./funnel-graph";
import {
  funnelNodeAddress,
  pageAddress,
  pageSettingsForNode,
} from "./funnel-address";
import { FunnelContentEditor } from "./content-editor";
import {
  forgetOtherUsersPageZips,
  forgetPreparedPageZip,
  getPreparedPageZip,
  preparePageZip,
  hasPreparedPageZips,
  type PageZipScope,
} from "./page-zip";
import { usePageZip } from "./use-page-zip";
import { contentFlowForPage } from "./content-flow";
import { funilSemArquivosTemporarios } from "./funnel-validation";
import type { SitePackage } from "@/features/landing-editor/site-package";

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
  Shuffle,
  UserPlus,
  Video,
  ShoppingBag,
  CreditCard,
  TrendingUp,
  TrendingDown,
  PartyPopper,
  Presentation,
  GraduationCap,
  Mail,
  StickyNote,
  Type,
  Shapes,
  Frame,
  Store,
};

const OFF = 8000;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.5;
const DATA_KEY = "application/x-funnel";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Tipos que mostram o card grande de página (com preview e "Editar"). */
const isPagina = (t: FunnelNodeType) => TIPOS_PAGINA.has(t);
const isRedir = (t: FunnelNodeType) => t === "redirect";
const isAnotacao = (t: FunnelNodeType) => TIPOS_ANOTACAO.has(t);
/** Anotações que se editam no próprio quadro, sem painel lateral. */
const SEM_PAINEL = new Set<FunnelNodeType>(["note", "text", "frame"]);

interface Viewport {
  x: number;
  y: number;
  k: number;
}

/** Cores de linha (mesma paleta dos post-its). */
const CORES_LINHA = [
  "#b1b1b7",
  "#2bd975",
  "#3b82f6",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#fbbf24",
  "#fb7185",
];
const ESPESSURA: Record<1 | 2 | 3, number> = { 1: 1.5, 2: 2.2, 3: 3.4 };

/** O caminho SVG de uma linha, na forma escolhida. Coordenadas do mundo. */
function caminhoDaLinha(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  estilo: EstiloLinha | undefined,
): string {
  return connectionPath({ x: sx, y: sy }, { x: tx, y: ty }, estilo, OFF);
}
type Snap = { nodes: FunnelNode[]; edges: FunnelEdge[] };

const idMarcador = (cor: string) => `fn-seta-${cor.replace("#", "")}`;

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
      modo: "ponto";
      edgeId: string;
      idx: number;
      points: ConnectionPoint[];
      before: Snap;
      pointerId: number;
    }
  | {
      modo: "bend";
      edgeId: string;
      start: ConnectionPoint;
      points: ConnectionPoint[];
      before: Snap;
      pointerId: number;
    }
  | {
      modo: "endpoint";
      edge: FunnelEdge;
      endpoint: "source" | "target";
      pointerId: number;
    }
  | { modo: "resize"; id: string; px: number; py: number; w: number; h: number }
  | {
      modo: "laco";
      px: number;
      py: number;
      /** Seleção que já existia (Ctrl: soma; senão, começa vazia). */
      base: string[];
    }
  | {
      modo: "connect";
      source: string;
      sourceAnchor: FunnelConnectionAnchor;
      pointerId: number;
    }
  | null;

export interface FunnelBoardProps {
  storageId: string;
  cofre: CofreFunil;
  /** Abre, ao montar, o primeiro bloco deste tipo (ex.: o Redirecionador). */
  focoTipo?: FunnelNodeType;
  /** O funil inicial mostrado no quadro. */
  inicial: FunnelData;
  /** Voltar à lista de funis. */
  onVoltar?: () => void;
  /** Persistir o funil (nome, nós e arestas). */
  onSalvar?: (data: FunnelData) => void;
  onRascunho?: (data: FunnelData) => void;
  onArquivar?: (data: FunnelData) => void;
  syncStatus?: FunnelSyncStatus;
  onSyncRetry?: () => void;
  initialPanel?: "recursos" | "funis" | "lista";
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
  storageId,
  cofre,
  inicial,
  onVoltar,
  onSalvar,
  onArquivar,
  onExcluir,
  onAbrir,
  focoTipo,
  onRascunho,
  syncStatus,
  onSyncRetry,
  initialPanel,
}: FunnelBoardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = React.useState<FunnelNode[]>(inicial.nodes);
  const [edges, setEdges] = React.useState<FunnelEdge[]>(inicial.edges);
  // As linhas que as regras do Redirecionador desenham sozinhas até o bloco
  // de destino. Não ficam em `edges`: nascem das regras (id "rr:nó:regra").
  const edgesRegra = React.useMemo<FunnelEdge[]>(() => {
    const out: FunnelEdge[] = [];
    for (const n of nodes) {
      if (n.type !== "redirect" || !n.redir) continue;
      for (const r of n.redir.regras) {
        if (!r.destinoNoId || !nodes.some((x) => x.id === r.destinoNoId))
          continue;
        out.push({
          id: `rr:${n.id}:${r.id}`,
          source: n.id,
          target: r.destinoNoId,
          rotulo: rotuloDaRegra(r),
          estilo: r.ativo ? r.estilo : { ...r.estilo, fluxo: false },
        });
      }
    }
    return out;
  }, [nodes]);
  const todasLinhas = React.useMemo(
    () => [...edges, ...edgesRegra],
    [edges, edgesRegra],
  );
  const tipoPorId = React.useMemo(
    () =>
      Object.fromEntries(nodes.map((n) => [n.id, n.type])) as Record<
        string,
        FunnelNodeType
      >,
    [nodes],
  );
  const nomesNos = React.useMemo(() => nomesDosNos(nodes), [nodes]);
  const nodeById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const [vp, setVp] = React.useState<Viewport>({ x: 40, y: 40, k: 0.8 });
  const initialFitFunnelId = React.useRef<string | null>(null);
  const [canvasBox, setCanvasBox] = React.useState({ width: 0, height: 0 });
  const [sel, setSel] = React.useState<{
    tipo: "node" | "edge";
    id: string;
  } | null>(null);
  const [viewMode, setViewMode] = React.useState<"canvas" | "lista" | null>(
    null,
  );
  const [showForecast, setShowForecast] = React.useState(false);
  const listMode =
    viewMode === "lista" ||
    (viewMode === null && canvasBox.width > 0 && canvasBox.width <= 1024);
  // Seleção múltipla (Ctrl+clique / laço), como no Windows.
  const [multi, setMulti] = React.useState<Set<string>>(() => new Set());
  // Fluxo animado nas linhas (padrão ligado; cada linha pode desligar).
  const [fluxoGlobal, setFluxoGlobal] = React.useState(
    inicial.mapa?.fluxo ?? true,
  );
  // Menu "solte para criar": soltou a linha no vazio → escolher o que criar.
  const [menuLigar, setMenuLigar] = React.useState<{
    x: number;
    y: number;
    wx: number;
    wy: number;
    source: string;
    sourceAnchor: FunnelConnectionAnchor;
  } | null>(null);
  const [buscaLigar, setBuscaLigar] = React.useState("");
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
    | "recursos"
    | "icones"
    | "vps"
    | "funis"
    | "lista"
    | "previsao"
    | "modelos"
    | null
  >(initialPanel ?? null);
  // Bump para reler o cofre de funis depois de salvar/apagar.
  const [cofreRevision, refrescarFunis] = React.useReducer(
    (x: number) => x + 1,
    0,
  );
  const [avisoFunil, setAvisoFunil] = React.useState<string | null>(null);
  const listaFunis = React.useMemo(() => {
    try {
      return { itens: cofre.listarFunis(), erro: "" };
    } catch (cause) {
      return {
        itens: [],
        erro:
          cause instanceof Error
            ? cause.message
            : "Não foi possível ler os funis salvos.",
      };
    }
    // The revision changes after explicit vault mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cofre, cofre.revisao, cofreRevision]);
  const [conteudoId, setConteudoId] = React.useState<string | null>(null);
  const [pacotes, setPacotes] = React.useState<
    Record<string, SitePackage | null>
  >({});
  const preparedContent = React.useRef(new Map<string, string>());
  const [ultimoSalvo, setUltimoSalvo] = React.useState(() =>
    JSON.stringify({
      ...inicial,
      mapa: inicial.mapa ?? {},
      previsao: inicial.previsao ?? PREVISAO_PADRAO,
    }),
  );
  const importInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    forgetOtherUsersPageZips(storageId);
  }, [storageId]);
  // O domínio da VPS escolhido no painel VPS (as páginas vêm dele).
  const [dominioVps, setDominioVps] = React.useState(DOMINIOS_VPS[0].host);
  const [dialog, setDialog] = React.useState(false);
  const [nome, setNome] = React.useState(inicial.nome);
  const draftRef = React.useRef<FunnelData>(inicial);
  const saveDraftRef = React.useRef(onRascunho);
  React.useEffect(() => {
    // The prepared archive is a snapshot. Editing any of its outgoing URLs
    // must invalidate it, so we cannot send navigation from an older graph.
    for (const [nodeId, signature] of preparedContent.current) {
      let current = "";
      try {
        current = JSON.stringify(
          contentFlowForPage({ ...inicial, nome, nodes, edges }, nodeId),
        );
      } catch {
        /* Removed/invalid destinations invalidate the snapshot too. */
      }
      if (signature !== current) {
        forgetPreparedPageZip({ storageId, funnelId: inicial.id, nodeId });
        preparedContent.current.delete(nodeId);
      }
    }
  }, [inicial, nome, nodes, edges, storageId]);
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
    sourceAnchor: FunnelConnectionAnchor;
  } | null>(null);
  const [edgePreview, setEdgePreview] = React.useState<{
    edgeId: string;
    endpoint: "source" | "target";
    point: ConnectionPoint;
  } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  // O nó cuja configuração está aberta dentro do próprio bloco.
  const [aberto, setAberto] = React.useState<string | null>(null);
  // Parte 2: estilo do mapa, inspetor de estilo, menu do botão direito e
  // histórico de desfazer/refazer.
  const [mapa, setMapa] = React.useState<EstiloMapa>(inicial.mapa ?? {});
  const [estiloAberto, setEstiloAberto] = React.useState<
    "no" | "linha" | "texto" | "mapa" | false
  >(false);
  // Parte 5: previsão (calculadora do funil).
  const [previsaoCfg, setPrevisaoCfg] = React.useState<PrevisaoCfg>(
    inicial.previsao ?? PREVISAO_PADRAO,
  );
  const [publishSite, setPublishSite] = React.useState(false);
  React.useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setCanvasBox({ width: bounds.width, height: bounds.height });
    };
    if (typeof ResizeObserver === "undefined") {
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!conteudoId || pacotes[conteudoId]) return;
    const node = nodes.find((node) => node.id === conteudoId);
    if (!node?.pagina?.zip) return;
    let active = true;
    void (async () => {
      const scope = {
        storageId,
        funnelId: node.pagina?.zip?.sourceFunnelId ?? inicial.id,
        nodeId: node.id,
      };
      const { restorePackages } = await import("./package-cloud");
      await restorePackages(storageId, scope.funnelId);
      const prepared = getPreparedPageZip(scope);
      if (!prepared)
        throw new Error(
          "Reanexe o ZIP original para editar seus arquivos. O rascunho está preservado.",
        );
      const { importSiteFiles } =
        await import("@/features/landing-editor/site-package");
      const site = await importSiteFiles([prepared.file]);
      if (active) setPacotes((current) => ({ ...current, [node.id]: site }));
    })().catch((cause) => {
      if (active)
        setAvisoFunil(
          cause instanceof Error
            ? cause.message
            : "Não foi possível recuperar o conteúdo importado.",
        );
    });
    return () => {
      active = false;
    };
    // Load once per content dialog; text typing must not restart a download.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudoId, storageId, inicial.id]);
  const previsao = React.useMemo(
    () => calcularPrevisao(nodes, todasLinhas, previsaoCfg),
    [nodes, todasLinhas, previsaoCfg],
  );
  const setPrevisaoNo = (id: string, patch: Partial<PrevisaoNo>) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id ? { ...n, previsao: { ...n.previsao, ...patch } } : n,
      ),
    );
  const [menuCtx, setMenuCtx] = React.useState<{
    x: number;
    y: number;
    alvo: { tipo: "node" | "edge" | "canvas"; id?: string };
  } | null>(null);
  const [histTick, setHistTick] = React.useState(0);
  // Parte 3: busca da biblioteca de blocos e linhas-guia de alinhamento.
  const [buscaRec, setBuscaRec] = React.useState("");
  const [buscaLista, setBuscaLista] = React.useState("");
  const [guias, setGuias] = React.useState<{ x: number[]; y: number[] } | null>(
    null,
  );
  const hist = React.useRef<{ past: Snap[]; future: Snap[] }>({
    past: [],
    future: [],
  });
  const ultimo = React.useRef<Snap>({
    nodes: inicial.nodes,
    edges: inicial.edges,
  });
  const ignorarHist = React.useRef(false);

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

  // Regras e linhas manuais compartilham a mesma edição/persistência de estilo.
  const patchConnectionStyle = React.useCallback(
    (id: string, patch: Partial<EstiloLinha>) => {
      if (id.startsWith("rr:")) {
        setNodes((ns) =>
          ns.map((n) =>
            n.redir
              ? {
                  ...n,
                  redir: {
                    regras: n.redir.regras.map((r) =>
                      `rr:${n.id}:${r.id}` === id
                        ? { ...r, estilo: { ...r.estilo, ...patch } }
                        : r,
                    ),
                  },
                }
              : n,
          ),
        );
      } else {
        setEdges((es) =>
          es.map((ed) =>
            ed.id === id ? { ...ed, estilo: { ...ed.estilo, ...patch } } : ed,
          ),
        );
      }
    },
    [],
  );

  // Roda do mouse: zoom mirando o cursor. Listener nativo para poder
  // cancelar o scroll da página (onWheel do React é passivo).
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Roda sobre o publicador (painel lateral) rola o painel, não o
      // quadro: deixa o evento seguir e não dá zoom.
      if (
        (e.target as Element | null)?.closest?.(
          ".pub, .funnel__panel, .funnel__flow-list, .funnel__view-switch, .funnel__edge-tools, .flow-inspector",
        ) ||
        listMode
      )
        return;
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
  }, [listMode]);

  // Um único par move/up global enquanto há interação em curso.
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = inter.current;
      if (!it || ("pointerId" in it && it.pointerId !== e.pointerId)) return;
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
          let nx = snap(it.nx + dx);
          let ny = snap(it.ny + dy);
          // Linhas-guia: se a borda ou o centro do bloco chega perto do de
          // outro bloco, gruda nele e mostra a linha (como no Miro/Figma).
          const tol = 8 / vp.k;
          const meu = sizesRef.current[it.id] ?? { w: NODE_W, h: 90 };
          const gx: number[] = [];
          const gy: number[] = [];
          let melhorX: { d: number; nx: number; g: number } | null = null;
          let melhorY: { d: number; ny: number; g: number } | null = null;
          for (const o of nodesRef.current) {
            if (o.id === it.id) continue;
            const so = sizesRef.current[o.id] ?? { w: NODE_W, h: 90 };
            const ax = [o.x, o.x + so.w / 2, o.x + so.w];
            const ay = [o.y, o.y + so.h / 2, o.y + so.h];
            const mx = [nx, nx + meu.w / 2, nx + meu.w];
            const my = [ny, ny + meu.h / 2, ny + meu.h];
            for (const a of ax)
              for (let i = 0; i < 3; i++) {
                const d = Math.abs(a - mx[i]);
                if (d <= tol && (!melhorX || d < melhorX.d))
                  melhorX = { d, nx: nx + (a - mx[i]), g: a };
              }
            for (const a of ay)
              for (let i = 0; i < 3; i++) {
                const d = Math.abs(a - my[i]);
                if (d <= tol && (!melhorY || d < melhorY.d))
                  melhorY = { d, ny: ny + (a - my[i]), g: a };
              }
          }
          if (melhorX) {
            nx = melhorX.nx;
            gx.push(melhorX.g);
          }
          if (melhorY) {
            ny = melhorY.ny;
            gy.push(melhorY.g);
          }
          setGuias(gx.length || gy.length ? { x: gx, y: gy } : null);
          setNodes((ns) =>
            ns.map((n) => (n.id === it.id ? { ...n, x: nx, y: ny } : n)),
          );
        }
      } else if (it.modo === "resize") {
        const dx = (e.clientX - it.px) / vp.k;
        const dy = (e.clientY - it.py) / vp.k;
        const w = Math.max(80, snap(it.w + dx));
        const h = Math.max(40, snap(it.h + dy));
        setNodes((ns) => ns.map((n) => (n.id === it.id ? { ...n, w, h } : n)));
      } else if (it.modo === "ponto") {
        const w = paraMundoRef.current(e.clientX, e.clientY);
        const pontos = [...it.points];
        pontos[it.idx] = { x: w.wx, y: w.wy };
        patchConnectionStyle(it.edgeId, { forma: "livre", pontos });
      } else if (it.modo === "bend") {
        const w = paraMundoRef.current(e.clientX, e.clientY);
        const delta = { x: w.wx - it.start.x, y: w.wy - it.start.y };
        if (Math.hypot(delta.x, delta.y) * vp.k > 3) {
          patchConnectionStyle(it.edgeId, {
            forma: "livre",
            pontos: moveConnectionControls(it.points, delta),
          });
        }
      } else if (it.modo === "endpoint") {
        const w = paraMundoRef.current(e.clientX, e.clientY);
        setEdgePreview({
          edgeId: it.edge.id,
          endpoint: it.endpoint,
          point: { x: w.wx, y: w.wy },
        });
      } else if (it.modo === "laco") {
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        const x0 = Math.min(it.px, e.clientX) - r.left;
        const y0 = Math.min(it.py, e.clientY) - r.top;
        const w = Math.abs(e.clientX - it.px);
        const h = Math.abs(e.clientY - it.py);
        setLaco({ x: x0, y: y0, w, h });
        // Blocos que encostam no laço (em coordenadas do mundo).
        const a = paraMundoRef.current(
          Math.min(it.px, e.clientX),
          Math.min(it.py, e.clientY),
        );
        const b = paraMundoRef.current(
          Math.max(it.px, e.clientX),
          Math.max(it.py, e.clientY),
        );
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
          sourceAnchor: it.sourceAnchor,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      const it = inter.current;
      if (!it || ("pointerId" in it && it.pointerId !== e.pointerId)) return;
      const w = paraMundoRef.current(e.clientX, e.clientY);
      const point = { x: w.wx, y: w.wy };
      const surface = document.elementFromPoint(e.clientX, e.clientY);
      const overlay = surface?.closest(
        ".pub,.funnel__panel,.funnel__edge-tools,.funnel__toolbar,.flow-inspector",
      );
      const hitNodeId = surface
        ?.closest(".funnel__node[data-in]")
        ?.getAttribute("data-in");
      const hitNode = hitNodeId
        ? nodesRef.current.find(
            (node) =>
              node.id === hitNodeId &&
              (!isAnotacao(node.type) || node.type === "shape"),
          )
        : undefined;
      const targetNode = overlay
        ? undefined
        : (hitNode ??
          [...nodesRef.current].reverse().find((n) => {
            if (isAnotacao(n.type) && n.type !== "shape") return false;
            const sz = sizesRef.current[n.id] ?? { w: NODE_W, h: 90 };
            const tolerance = 18 / vp.k;
            return (
              point.x >= n.x - tolerance &&
              point.x <= n.x + sz.w + tolerance &&
              point.y >= n.y - tolerance &&
              point.y <= n.y + sz.h + tolerance
            );
          }));
      const targetAnchor = targetNode
        ? perimeterAnchor(
            {
              ...targetNode,
              ...(sizesRef.current[targetNode.id] ?? { w: NODE_W, h: 90 }),
            },
            point,
          )
        : undefined;
      if (it.modo === "connect") {
        const destino = targetNode?.id;
        if (!destino && !overlay) {
          // Soltou no vazio: abre o menu "o que criar e ligar aqui?".
          const r = rootRef.current?.getBoundingClientRect();
          if (r) {
            const w = paraMundoRef.current(e.clientX, e.clientY);
            // O menu fica dentro do quadro (não corta no canto de baixo).
            setMenuLigar({
              x: Math.max(8, Math.min(e.clientX - r.left, r.width - 312)),
              y: Math.max(8, Math.min(e.clientY - r.top, r.height - 424)),
              wx: w.wx,
              wy: w.wy,
              source: it.source,
              sourceAnchor: it.sourceAnchor,
            });
            setBuscaLigar("");
          }
        }
        if (destino && destino !== it.source) {
          const next = addFunnelEdge(
            { nodes: nodesRef.current, edges: edgesRef.current },
            {
              id: `e${idSeq.current++}`,
              source: it.source,
              target: destino,
              estilo: { sourceAnchor: it.sourceAnchor, targetAnchor },
            },
          );
          setNodes(next.nodes);
          setEdges(next.edges);
        }
        setConn(null);
      } else if (it.modo === "endpoint") {
        // Um drop vazio/cancelado só apaga a prévia; a ligação original permanece.
        if (targetNode && targetAnchor) {
          const source =
            it.endpoint === "source" ? targetNode.id : it.edge.source;
          const target =
            it.endpoint === "target" ? targetNode.id : it.edge.target;
          const duplicate =
            !it.edge.id.startsWith("rr:") &&
            (source !== it.edge.source || target !== it.edge.target) &&
            edgesRef.current.some(
              (ed) =>
                ed.id !== it.edge.id &&
                ed.source === source &&
                ed.target === target,
            );
          if (source !== target && !duplicate) {
            if (it.edge.id.startsWith("rr:")) {
              if (source === it.edge.source)
                setNodes((ns) =>
                  ns.map((n) =>
                    n.redir
                      ? {
                          ...n,
                          redir: {
                            regras: n.redir.regras.map((r) =>
                              `rr:${n.id}:${r.id}` === it.edge.id
                                ? {
                                    ...r,
                                    destinoNoId: target,
                                    destino: "",
                                    estilo: {
                                      ...r.estilo,
                                      [`${it.endpoint}Anchor`]: targetAnchor,
                                    },
                                  }
                                : r,
                            ),
                          },
                        }
                      : n,
                  ),
                );
            } else {
              const next = reconnectFunnelEdge(
                { nodes: nodesRef.current, edges: edgesRef.current },
                it.edge.id,
                { source, target, [`${it.endpoint}Anchor`]: targetAnchor },
              );
              setNodes(next.nodes);
              setEdges(next.edges);
            }
          }
        }
        setEdgePreview(null);
      }
      if (it.modo === "laco") setLaco(null);
      inter.current = null;
      setPanning(false);
      setDragId(null);
      setGuias(null);
      setHistTick((t) => t + 1);
    };
    const onCancel = (e: PointerEvent) => {
      const it = inter.current;
      if (!it || ("pointerId" in it && it.pointerId !== e.pointerId)) return;
      if ("before" in it) {
        setNodes(it.before.nodes);
        setEdges(it.before.edges);
      }
      inter.current = null;
      setConn(null);
      setEdgePreview(null);
      setPanning(false);
      setDragId(null);
      setGuias(null);
      setLaco(null);
      setHistTick((t) => t + 1);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [vp.k, patchConnectionStyle]);

  /*
    Área de transferência do quadro (Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D).
    Guarda no navegador, então dá para copiar num funil e colar em outro.
    Copia os blocos selecionados e as ligações entre eles; ao colar, ganha
    ids novos, cai onde o mouse está (ou um pouco deslocado) e a cópia já
    vem selecionada para arrastar.
  */
  const CLIP_KEY = cofre.clipboardKey;
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
      window.localStorage.setItem(
        CLIP_KEY,
        JSON.stringify({ nodes: ns, edges: es, originFunnelId: inicial.id }),
      );
    } catch {
      setAvisoFunil(
        "Não foi possível copiar os blocos. O armazenamento deste navegador está indisponível.",
      );
      return 0;
    }
    colagens.current = 0;
    return ns.length;
  };
  const colar = (deslocar = false) => {
    type Clip = {
      nodes: FunnelNode[];
      edges: FunnelEdge[];
      originFunnelId?: string;
    };
    let clip: Clip | null = null;
    try {
      const bruto = window.localStorage.getItem(CLIP_KEY);
      clip = bruto ? parseFunnelClipboard(JSON.parse(bruto)) : null;
    } catch {
      clip = null;
    }
    if (
      !clip ||
      !Array.isArray(clip.nodes) ||
      !Array.isArray(clip.edges) ||
      clip.nodes.length === 0
    )
      return;
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
    let copia;
    try {
      copia = cloneFunnelGraph({
        nodes: clip.nodes,
        edges: clip.edges,
        createId: (kind) => `${kind === "node" ? "n" : "e"}${idSeq.current++}`,
        offset: { x: dx, y: dy },
        existingNodeIds:
          clip.originFunnelId === inicial.id
            ? nodesRef.current.map((n) => n.id)
            : [],
      });
    } catch {
      setAvisoFunil(
        "A cópia dos blocos é inválida. Copie os blocos novamente.",
      );
      return;
    }
    const novos = copia.nodes;
    const novasEdges = copia.edges;
    setNodes((ns) => [...ns, ...novos]);
    setEdges((es) => [...es, ...novasEdges]);
    setMulti(new Set(novos.map((n) => n.id)));
    setSel(novos.length === 1 ? { tipo: "node", id: novos[0].id } : null);
    setAberto(null);
  };
  const recortar = () => {
    const ids = new Set(idsSelecionados());
    if (copiar() === 0) return;
    const next = removeFunnelNodesGraph(
      { nodes: nodesRef.current, edges: edgesRef.current },
      ids,
    );
    setNodes(next.nodes);
    setEdges(next.edges);
    setMulti(new Set());
    setSel(null);
    setAberto(null);
  };
  const duplicar = () => {
    if (copiar() === 0) return;
    colar(true);
  };

  // Delete remove o que estiver selecionado (fora de inputs).

  // Histórico (desfazer/refazer): guarda o estado anterior sempre que nós ou
  // linhas mudam de verdade — não no meio de um arrasto (só quando solta).
  React.useEffect(() => {
    if (ignorarHist.current) {
      ignorarHist.current = false;
      ultimo.current = { nodes, edges };
      return;
    }
    if (inter.current) return;
    const u = ultimo.current;
    if (u.nodes === nodes && u.edges === edges) return;
    hist.current.past.push(u);
    if (hist.current.past.length > 100) hist.current.past.shift();
    hist.current.future = [];
    ultimo.current = { nodes, edges };
  }, [nodes, edges, histTick]);
  const desfazer = () => {
    const p = hist.current.past.pop();
    if (!p) return;
    hist.current.future.push({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
    ignorarHist.current = true;
    setNodes(p.nodes);
    setEdges(p.edges);
    setSel(null);
    setMulti(new Set());
  };
  const refazer = () => {
    const f = hist.current.future.pop();
    if (!f) return;
    hist.current.past.push({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    });
    ignorarHist.current = true;
    setNodes(f.nodes);
    setEdges(f.edges);
    setSel(null);
    setMulti(new Set());
  };
  // Ordem de empilhamento: o último da lista fica por cima.
  const paraFrente = (id: string) =>
    setNodes((ns) => {
      const n = ns.find((x) => x.id === id);
      return n ? [...ns.filter((x) => x.id !== id), n] : ns;
    });
  const paraTras = (id: string) =>
    setNodes((ns) => {
      const n = ns.find((x) => x.id === id);
      return n ? [n, ...ns.filter((x) => x.id !== id)] : ns;
    });
  const setEstiloNo = (id: string, patch: Partial<EstiloNo> | null) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? {
              ...n,
              estilo: patch === null ? undefined : { ...n.estilo, ...patch },
            }
          : n,
      ),
    );
  // Menu do botão direito (bloco, linha ou fundo), sempre dentro do quadro.
  const abrirMenu = (
    e: React.MouseEvent,
    alvo: { tipo: "node" | "edge" | "canvas"; id?: string },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    mouse.current = { x: e.clientX, y: e.clientY, dentro: true };
    if (alvo.tipo === "node" && alvo.id) {
      setSel({ tipo: "node", id: alvo.id });
      if (!multi.has(alvo.id)) setMulti(new Set());
    }
    if (alvo.tipo === "edge" && alvo.id) {
      setSel({ tipo: "edge", id: alvo.id });
      setMulti(new Set());
    }
    setMenuLigar(null);
    setMenuCtx({
      x: Math.max(8, Math.min(e.clientX - r.left, r.width - 236)),
      y: Math.max(8, Math.min(e.clientY - r.top, r.height - 340)),
      alvo,
    });
  };

  const iniciarPan = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setMenuCtx(null);
    setPainel(null);
    setMenuLigar(null);
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
    if (e.button === 2) return;
    setMenuCtx(null);
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

  // Redimensionar uma anotação pelo canto inferior direito.
  const iniciarResize = (e: React.PointerEvent, node: FunnelNode) => {
    e.stopPropagation();
    if (locked) return;
    inter.current = {
      modo: "resize",
      id: node.id,
      px: e.clientX,
      py: e.clientY,
      w: node.w ?? NODE_W,
      h: node.h ?? sizesRef.current[node.id]?.h ?? 90,
    };
  };

  const iniciarConexao = (
    e: React.PointerEvent,
    node: FunnelNode,
    side: FunnelConnectionAnchor["side"],
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (locked || e.button !== 0) return;
    const w = paraMundo(e.clientX, e.clientY);
    const sourceAnchor = perimeterAnchor(
      { ...node, ...size(node.id) },
      { x: w.wx, y: w.wy },
      side,
    );
    inter.current = {
      modo: "connect",
      source: node.id,
      sourceAnchor,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setConn({ ...w, source: node.id, sourceAnchor });
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
          marcaId: m.id,
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
          url: isPagina(def.type) ? (def.slug ?? "/nova-pagina") : undefined,
          redir: isRedir(def.type) ? { regras: [] } : undefined,
        };
        // Anotações nascem com tamanho e cor próprios.
        if (def.type === "note")
          Object.assign(novo, {
            w: 200,
            h: 160,
            title: "",
            descricao: "",
            estilo: { cor: "#fde68a" },
          });
        if (def.type === "text")
          Object.assign(novo, {
            w: 240,
            h: 60,
            title: "",
            descricao: "Escreva aqui",
          });
        if (def.type === "shape")
          Object.assign(novo, {
            w: 200,
            h: 120,
            title: "Forma",
            forma: "retangulo",
            estilo: { cor: "#38bdf8" },
          });
        if (def.type === "frame")
          Object.assign(novo, {
            w: 640,
            h: 420,
            title: "Moldura",
            estilo: { cor: "#a78bfa" },
          });
        if (def.type === "comment")
          Object.assign(novo, { title: "Comentário", mensagens: [] });
        if (def.type === "store")
          Object.assign(novo, { title: "Minha loja", loja: lojaVazia() });
      }
      // Molduras vão para o fundo da pilha (ficam atrás dos blocos).
      setNodes((ns) => (novo.type === "frame" ? [novo, ...ns] : [...ns, novo]));
      setSel({ tipo: "node", id: novo.id });
      setPainel(null);
      return novo.id;
    },
    [],
  );

  // Cria o que foi escolhido no menu "solte para criar", já ligado à origem.
  const criarLigado = (payload: string) => {
    const m = menuLigar;
    if (!m) return;
    const id = adicionar(payload, m.wx + NODE_W / 2, m.wy + 40);
    if (id) {
      const next = addFunnelEdge(
        { nodes: nodesRef.current, edges: edgesRef.current },
        {
          id: `e${idSeq.current++}`,
          source: m.source,
          target: id,
          estilo: { sourceAnchor: m.sourceAnchor },
        },
      );
      // Preserve the new block queued by adicionar in this same batch.
      if (next.nodes !== nodesRef.current)
        setNodes((ns) =>
          ns.map((n) => next.nodes.find((old) => old.id === n.id) ?? n),
        );
      setEdges(next.edges);
    }
    setMenuLigar(null);
  };

  // Cria um bloco à direita de outro, já ligado a ele (ex.: Checkout da loja).
  const criarAoLado = (sourceId: string, tipo: FunnelNodeType) => {
    const src = nodesRef.current.find((n) => n.id === sourceId);
    if (!src) return;
    const id = adicionar(tipo, src.x + NODE_W * 1.5 + 100, src.y + 40);
    if (id) {
      const next = addFunnelEdge(
        { nodes: nodesRef.current, edges: edgesRef.current },
        { id: `e${idSeq.current++}`, source: sourceId, target: id },
      );
      if (next.nodes !== nodesRef.current)
        setNodes((ns) =>
          ns.map((n) => next.nodes.find((old) => old.id === n.id) ?? n),
        );
      setEdges(next.edges);
    }
  };

  // Estilo da linha selecionada (barra flutuante).
  const edgeSel =
    sel?.tipo === "edge" ? todasLinhas.find((e) => e.id === sel.id) : undefined;
  const setEstilo = patchConnectionStyle;
  // Nome da saída (o texto no meio da linha), só nas linhas comuns.
  const setRotulo = (id: string, rotulo: string) =>
    setEdges((es) =>
      es.map((ed) =>
        ed.id === id ? { ...ed, rotulo: rotulo || undefined } : ed,
      ),
    );
  // Volta uma linha ao estilo padrão (regra ou linha comum).
  const resetLinha = (id: string) => {
    if (id.startsWith("rr:")) {
      const [, nid, rid] = id.split(":");
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nid && n.redir
            ? {
                ...n,
                redir: {
                  regras: n.redir.regras.map((r) =>
                    r.id === rid ? { ...r, estilo: undefined } : r,
                  ),
                },
              }
            : n,
        ),
      );
    } else
      setEdges((es) =>
        es.map((ed) => (ed.id === id ? { ...ed, estilo: undefined } : ed)),
      );
  };
  // Apagar uma linha: se é de uma regra, some a regra também.
  const apagarLinha = (id: string) => {
    if (id.startsWith("rr:")) {
      const [, nid, rid] = id.split(":");
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nid && n.redir
            ? {
                ...n,
                redir: { regras: n.redir.regras.filter((r) => r.id !== rid) },
              }
            : n,
        ),
      );
    } else setEdges((es) => es.filter((x) => x.id !== id));
    setSel(null);
  };
  const pontoMedio = (ed: FunnelEdge) => {
    const s0 = nodeById.get(ed.source);
    const t0 = nodeById.get(ed.target);
    if (!s0 || !t0) return null;
    const ss = size(s0.id);
    const ts = size(t0.id);
    let start = anchorPoint(
      { ...s0, ...ss },
      ed.estilo?.sourceAnchor ?? SOURCE_ANCHOR,
    );
    let end = anchorPoint(
      { ...t0, ...ts },
      ed.estilo?.targetAnchor ?? TARGET_ANCHOR,
    );
    if (edgePreview?.edgeId === ed.id) {
      if (edgePreview.endpoint === "source") start = edgePreview.point;
      else end = edgePreview.point;
    }
    return { sx: start.x, sy: start.y, tx: end.x, ty: end.y };
  };

  const handleEdgePointerDown = (
    e: React.PointerEvent<SVGElement>,
    edge: FunnelEdge,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSel({ tipo: "edge", id: edge.id });
    setMulti(new Set());
    setAberto(null);
    if (locked || e.button !== 0) return;
    const pm = pontoMedio(edge);
    if (!pm) return;
    const w = paraMundo(e.clientX, e.clientY);
    inter.current = {
      modo: "bend",
      edgeId: edge.id,
      start: { x: w.wx, y: w.wy },
      points: connectionControls(
        { x: pm.sx, y: pm.sy },
        { x: pm.tx, y: pm.ty },
        edge.estilo,
      ),
      before: { nodes, edges },
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handleEndpointPointerDown = (
    e: React.PointerEvent<SVGElement>,
    edge: FunnelEdge,
    endpoint: "source" | "target",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (locked || e.button !== 0) return;
    inter.current = {
      modo: "endpoint",
      edge,
      endpoint,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moverPontaTeclado = (
    e: React.KeyboardEvent<SVGElement>,
    edge: FunnelEdge,
    endpoint: "source" | "target",
  ) => {
    if (
      locked ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(e.key)
    )
      return;
    e.stopPropagation();
    e.preventDefault();
    const anchor =
      edge.estilo?.[`${endpoint}Anchor`] ??
      (endpoint === "source" ? SOURCE_ANCHOR : TARGET_ANCHOR);
    const delta =
      (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) *
      (e.shiftKey ? 0.1 : 0.02);
    const offset =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 1
          : Math.max(0, Math.min(1, anchor.offset + delta));
    setEstilo(edge.id, { [`${endpoint}Anchor`]: { ...anchor, offset } });
  };
  const controlesDaLinha = (edge: FunnelEdge) => {
    const pm = pontoMedio(edge);
    if (!pm) return null;
    const start = { x: pm.sx, y: pm.sy };
    const end = { x: pm.tx, y: pm.ty };
    const midpoint = connectionMidpoint(start, end, edge.estilo);
    return (
      <g data-edge-id={edge.id}>
        {(
          [
            ["source", start, "origem"],
            ["target", end, "destino"],
          ] as const
        ).map(([endpoint, point, label]) => (
          <circle
            key={endpoint}
            className="funnel__edge-endpoint"
            data-endpoint={endpoint}
            data-edge-id={edge.id}
            cx={point.x + OFF}
            cy={point.y + OFF}
            r={9 / vp.k}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-label={`Mover ponta de ${label}. Setas ajustam a posição na borda; Home e End vão aos cantos.`}
            onPointerDown={(e) => handleEndpointPointerDown(e, edge, endpoint)}
            onKeyDown={(e) => moverPontaTeclado(e, edge, endpoint)}
          />
        ))}
        <circle
          className="funnel__edge-bend"
          data-edge-id={edge.id}
          cx={midpoint.x + OFF}
          cy={midpoint.y + OFF}
          r={8 / vp.k}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-label="Dobrar conexão. Use as setas para mover a curva."
          onPointerDown={(e) => handleEdgePointerDown(e, edge)}
          onKeyDown={(e) => {
            if (
              locked ||
              !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                e.key,
              )
            )
              return;
            e.stopPropagation();
            e.preventDefault();
            const step = e.shiftKey ? 50 : 10;
            const delta = {
              x:
                e.key === "ArrowLeft"
                  ? -step
                  : e.key === "ArrowRight"
                    ? step
                    : 0,
              y: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
            };
            setEstilo(edge.id, {
              forma: "livre",
              pontos: moveConnectionControls(
                connectionControls(start, end, edge.estilo),
                delta,
              ),
            });
          }}
        />
        {edge.estilo?.forma === "livre" &&
          (edge.estilo.pontos ?? []).slice(0, 2).map((pt, idx) => (
            <circle
              key={idx}
              className="funnel__ponto"
              cx={pt.x + OFF}
              cy={pt.y + OFF}
              r={7 / vp.k}
              aria-hidden
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (locked || e.button !== 0) return;
                inter.current = {
                  modo: "ponto",
                  edgeId: edge.id,
                  idx,
                  points: edge.estilo?.pontos ?? [],
                  before: { nodes, edges },
                  pointerId: e.pointerId,
                };
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
            />
          ))}
      </g>
    );
  };

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

  const enquadrar = React.useCallback(() => {
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
      const measured = sizes[n.id];
      // Cards virtualizados não têm medidas DOM. Seus limites continuam
      // participando do enquadramento, sem precisar montá-los todos.
      const s =
        measured?.w > 0 && measured.h > 0
          ? measured
          : {
              w: n.w ?? NODE_W,
              h:
                n.h ??
                (n.type === "store"
                  ? 600
                  : n.type === "redirect"
                    ? 240 + (n.redir?.regras.length ?? 0) * 44
                    : 400),
            };
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + s.w);
      maxY = Math.max(maxY, n.y + s.h);
    }
    const pad = 80;
    const largura = maxX - minX + pad * 2;
    const altura = maxY - minY + pad * 2;
    const panelWidth =
      rootRef.current?.querySelector(".funnel__panel")?.getBoundingClientRect()
        .width ?? 0;
    const leftReserved = 68 + panelWidth;
    const rightReserved =
      rootRef.current?.querySelector("aside.pub")?.getBoundingClientRect()
        .width ?? 0;
    const usable = Math.max(180, r.width - leftReserved - rightReserved);
    const k = clamp(
      Math.min(usable / largura, r.height / altura),
      MIN_ZOOM,
      1.2,
    );
    setVp({
      k,
      x: leftReserved + usable / 2 - ((minX + maxX) / 2) * k,
      y: r.height / 2 - ((minY + maxY) / 2) * k,
    });
  }, [nodes, sizes]);

  // Enquadra só na primeira abertura e depois das medidas reais. Rascunhos,
  // mudanças de tamanho e edições não desfazem o pan/zoom escolhido pelo dono.
  React.useEffect(() => {
    if (initialFitFunnelId.current === inicial.id) return;
    // Rotas com foco explícito continuam usando trazerParaVista abaixo.
    if (focoTipo && nodes.some((node) => node.type === focoTipo)) {
      initialFitFunnelId.current = inicial.id;
      return;
    }
    if (canvasBox.width <= 0 || canvasBox.height <= 0) return;
    if (nodes.length === 0) {
      initialFitFunnelId.current = inicial.id;
      return;
    }
    const mounted =
      rootRef.current?.querySelectorAll<HTMLDivElement>(".funnel__node") ?? [];
    // Acima de 200, esperar pelos IDs fora do DOM impediria justamente o
    // zoom-out que os traria para a tela. Aguarda só os cards montados.
    const needsMeasurement =
      nodes.length > 200
        ? Array.from(mounted).some((element) => {
            const id = element.dataset.in;
            return id && (!sizes[id]?.w || !sizes[id]?.h);
          })
        : nodes.some((node) => !sizes[node.id]?.w || !sizes[node.id]?.h);
    if (needsMeasurement) {
      // Um quadro inicialmente oculto pode medir cards como zero. Quando
      // aparece, relê o DOM uma vez; medir ignora dimensões sem alterações.
      for (const element of mounted) {
        const id = element.dataset.in;
        if (id) medir(id, element);
      }
      return;
    }
    initialFitFunnelId.current = inicial.id;
    enquadrar();
  }, [
    canvasBox.width,
    canvasBox.height,
    nodes,
    sizes,
    inicial.id,
    focoTipo,
    enquadrar,
    medir,
  ]);

  // Opening a card always centers it in the left half beside its inspector.
  const trazerParaVista = (node: FunnelNode, reserveInspector = true) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const focused = nodeFocusViewport(
      node,
      size(node.id),
      r,
      reserveInspector && r.width > 1024 && !listMode,
    );
    if (focused) setVp(focused);
  };

  const focusedWidth = aberto ? sizes[aberto]?.w : undefined;
  const focusedHeight = aberto ? sizes[aberto]?.h : undefined;
  React.useLayoutEffect(() => {
    if (!aberto || listMode || canvasBox.width <= 1024) return;
    const node = nodes.find((item) => item.id === aberto);
    if (!node) return;
    const focused = nodeFocusViewport(
      node,
      { w: focusedWidth ?? NODE_W, h: focusedHeight ?? 90 },
      canvasBox,
      true,
    );
    // A full card is measured again after leaving compact mode. Refit only
    // when opening, changing its dimensions, or resizing the canvas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (focused) setVp(focused);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dragging/panning and unrelated edits preserve the user's camera
  }, [
    aberto,
    listMode,
    focusedWidth,
    focusedHeight,
    canvasBox.width,
    canvasBox.height,
  ]);

  const irParaDestino = (id: string) => {
    const target = nodes.find((node) => node.id === id);
    if (!target) return;
    setSel({ tipo: "node", id });
    setMulti(new Set());
    if (listMode) {
      setAberto(null);
      requestAnimationFrame(() => {
        const item = rootRef.current?.querySelector<HTMLElement>(
          `[data-node-id="${CSS.escape(id)}"]`,
        );
        item?.scrollIntoView({ block: "center" });
        item
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus({ preventScroll: true });
      });
    } else if (canvasBox.width > 0 && canvasBox.width <= 1024) {
      setAberto(null);
      requestAnimationFrame(() => {
        trazerParaVista(target, false);
        requestAnimationFrame(() =>
          rootRef.current
            ?.querySelector<HTMLButtonElement>(
              `.funnel__node[data-in="${CSS.escape(id)}"] .funnel__node-body`,
            )
            ?.focus({ preventScroll: true }),
        );
      });
    } else {
      trazerParaVista(target);
    }
  };

  // Atalhos do teclado (depois de tudo que eles chamam estar declarado).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const interaction = inter.current;
      if (
        interaction &&
        (e.key === "Escape" ||
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        if ("before" in interaction) {
          setNodes(interaction.before.nodes);
          setEdges(interaction.before.edges);
        }
        inter.current = null;
        setConn(null);
        setEdgePreview(null);
        setMenuLigar(null);
        setPanning(false);
        setDragId(null);
        setGuias(null);
        setLaco(null);
        setHistTick((tick) => tick + 1);
        return;
      }
      if (dialog || conteudoId) return;
      const alvo = e.target as HTMLElement | null;
      if (
        alvo &&
        (alvo.isContentEditable ||
          alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.tagName === "SELECT" ||
          alvo.closest('[role="dialog"]'))
      )
        return;
      if (!alvo || !rootRef.current?.contains(alvo)) return;
      // Native buttons own Enter/Space. The previous selection must never
      // intercept activation of a different card or an inspector control.
      if (
        (e.key === "Enter" || e.key === " ") &&
        alvo.closest('button, [role="button"]')
      )
        return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !alvo.closest(".funnel__viewport, .funnel__flow-list")
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        refazer();
        return;
      }
      if (!mod && sel?.tipo === "node" && e.key === "]") {
        e.preventDefault();
        paraFrente(sel.id);
        return;
      }
      if (!mod && sel?.tipo === "node" && e.key === "[") {
        e.preventDefault();
        paraTras(sel.id);
        return;
      }
      if (!mod && sel?.tipo === "node" && e.key === "Enter") {
        e.preventDefault();
        setAberto(sel.id);
        const n = nodesRef.current.find((x) => x.id === sel.id);
        if (n) trazerParaVista(n);
        return;
      }
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
        const next = removeFunnelNodesGraph(
          { nodes: nodesRef.current, edges: edgesRef.current },
          ids,
        );
        setNodes(next.nodes);
        setEdges(next.edges);
        setMulti(new Set());
        setSel(null);
        setAberto(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        if (sel.tipo === "node") {
          const next = removeFunnelNodesGraph(
            { nodes: nodesRef.current, edges: edgesRef.current },
            [sel.id],
          );
          setNodes(next.nodes);
          setEdges(next.edges);
        } else {
          apagarLinha(sel.id);
        }
        setSel(null);
      }
      if (e.key === "Escape") {
        setMenuCtx(null);
        setEstiloAberto(false);
        setPainel(null);
        setSel(null);
        setMulti(new Set());
        setAberto(null);
        setMenuLigar(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // copiar/colar/recortar/duplicar leem refs e o estado atual via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dialog, multi, conteudoId]);

  const salvar = () => {
    try {
      const data = {
        ...inicial,
        nome,
        nodes,
        edges,
        mapa,
        previsao: previsaoCfg,
      };
      onSalvar?.(data);
      setUltimoSalvo(JSON.stringify(data));
      setDialog(false);
      setAvisoFunil("Rascunho salvo neste navegador, separado por conta.");
    } catch (cause) {
      setAvisoFunil(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Mantenha esta aba aberta.",
      );
    }
  };

  // Salvar no cofre: guarda este funil com nome, para reabrir depois e
  // para o redirecionador poder trazê-lo para o quadro dele.
  const salvarNoCofre = () => {
    const data: FunnelData = {
      ...inicial,
      nome,
      nodes,
      edges,
      mapa,
      previsao: previsaoCfg,
    };
    try {
      const reg = cofre.salvarFunil(data, nome);
      setUltimoSalvo(JSON.stringify(reg.data));
      refrescarFunis();
      setAvisoFunil(`“${reg.nome}” salvo no cofre deste navegador.`);
    } catch (cause) {
      setAvisoFunil(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Mantenha esta aba aberta.",
      );
    }
  };

  // Edição dos campos dentro do bloco (nome, endereço, título, descrição).
  const atualizar = React.useCallback(
    (id: string, patch: Partial<FunnelNode>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n))),
    [],
  );

  const remover = React.useCallback((id: string) => {
    const next = removeFunnelNodesGraph(
      { nodes: nodesRef.current, edges: edgesRef.current },
      [id],
    );
    setNodes(next.nodes);
    setEdges(next.edges);
    setSel(null);
    setAberto(null);
  }, []);

  React.useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      const current = JSON.stringify({
        ...inicial,
        nome,
        nodes,
        edges,
        mapa,
        previsao: previsaoCfg,
      });
      if (
        current !== ultimoSalvo ||
        hasPreparedPageZips(storageId) ||
        Object.values(pacotes).some(Boolean)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [
    inicial,
    nome,
    nodes,
    edges,
    mapa,
    previsaoCfg,
    ultimoSalvo,
    storageId,
    pacotes,
  ]);

  const exportarCopia = () => {
    const data = {
      ...inicial,
      nome,
      nodes,
      edges,
      mapa,
      previsao: previsaoCfg,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "meu-funil.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAvisoFunil(
      "Cópia JSON solicitada. Ela contém as configurações do funil, não os arquivos ZIP.",
    );
  };

  // Text/structure writes are immediate. A drag commits once at pointer-up,
  // avoiding large JSON writes on every pointer frame. Internal navigation
  // also flushes synchronously before Next can unmount the editor.
  React.useLayoutEffect(() => {
    const data = {
      ...inicial,
      nome,
      nodes,
      edges,
      mapa,
      previsao: previsaoCfg,
    };
    draftRef.current = data;
    saveDraftRef.current = onRascunho;
    if (!onRascunho || inter.current || JSON.stringify(data) === ultimoSalvo)
      return;
    try {
      onRascunho(data);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- acknowledge an atomic local write
      setUltimoSalvo(JSON.stringify(data));
    } catch (cause) {
      setAvisoFunil(
        cause instanceof Error
          ? cause.message
          : "Não foi possível guardar o rascunho.",
      );
    }
  }, [
    inicial,
    nome,
    nodes,
    edges,
    mapa,
    previsaoCfg,
    histTick,
    onRascunho,
    ultimoSalvo,
  ]);
  React.useEffect(() => {
    const flushNavigation = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || !saveDraftRef.current)
        return;
      try {
        saveDraftRef.current(draftRef.current);
      } catch (cause) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setAvisoFunil(
          cause instanceof Error
            ? cause.message
            : "Guarde ou exporte o funil antes de sair.",
        );
      }
    };
    document.addEventListener("click", flushNavigation, true);
    return () => document.removeEventListener("click", flushNavigation, true);
  }, []);

  const importarCopia = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("A cópia JSON excede 5 MB.");
      const data = funilSemArquivosTemporarios(JSON.parse(await file.text()));
      if (
        !window.confirm(
          "Abrir esta cópia no lugar do quadro atual? Baixe uma cópia das alterações ainda não salvas antes de continuar. O conteúdo salvo no cofre não será apagado.",
        )
      )
        return;
      onAbrir?.(data);
    } catch (cause) {
      setAvisoFunil(
        cause instanceof Error
          ? cause.message
          : "Não foi possível importar o JSON. O quadro foi preservado.",
      );
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  // Quantas ligações saem de cada nó, para o rodapé "N saídas".
  const saidas = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const ed of todasLinhas) c[ed.source] = (c[ed.source] ?? 0) + 1;
    return c;
  }, [todasLinhas]);

  const paginaAt = React.useMemo(() => {
    let i = 0;
    const ordem: Record<string, number> = {};
    for (const n of nodes) ordem[n.id] = ++i;
    return ordem;
  }, [nodes]);

  // Ao abrir pelo menu "Roteador de ofertas", já mostra o Redirecionador.
  React.useEffect(() => {
    if (!focoTipo) return;
    const n = inicial.nodes.find((x) => x.type === focoTipo);
    if (!n) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- foco inicial, uma vez
    setAberto(n.id);
    trazerParaVista(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao montar
  }, []);

  // Alvos do menu do botão direito e o "clique e fecha".
  const ctxNo =
    menuCtx?.alvo.tipo === "node"
      ? nodes.find((x) => x.id === menuCtx.alvo.id)
      : undefined;
  const ctxLinha = menuCtx?.alvo.tipo === "edge" ? menuCtx.alvo.id : undefined;
  const fecharMenu = () => setMenuCtx(null);

  const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.k})`;

  return (
    <div
      className="funnel"
      ref={rootRef}
      data-design-system="flow"
      data-mode={listMode ? "lista" : "canvas"}
      data-inspector-open={Boolean(aberto)}
      data-connecting={Boolean(conn)}
      data-tema={mapa.tema ?? "padrao"}
    >
      {syncStatus && (
        <div
          className="funnel__sync"
          role="status"
          data-state={syncStatus.state}
        >
          <FlowStatusBadge
            tone={
              syncStatus.state === "error"
                ? "danger"
                : syncStatus.state === "saved"
                  ? "success"
                  : syncStatus.state === "pending"
                    ? "warning"
                    : "info"
            }
            busy={
              syncStatus.state === "loading" || syncStatus.state === "pending"
            }
          >
            {syncStatus.message}
          </FlowStatusBadge>
          {syncStatus.state === "error" && onSyncRetry && (
            <button type="button" onClick={onSyncRetry}>
              Sincronizar novamente
            </button>
          )}
        </div>
      )}
      {avisoFunil && (
        <div className="funnel__save-notice" role="status">
          {avisoFunil}
          <button
            type="button"
            onClick={() => setAvisoFunil(null)}
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div
        className="funnel__view-switch"
        role="group"
        aria-label="Visualização do funil"
      >
        <FlowButton
          aria-pressed={!listMode}
          onClick={() => setViewMode("canvas")}
        >
          <Grid2x2 size={16} aria-hidden />
          Quadro
        </FlowButton>
        <FlowButton
          aria-pressed={listMode}
          onClick={() => setViewMode("lista")}
        >
          <ListTree size={16} aria-hidden />
          Etapas
        </FlowButton>
        <FlowButton
          aria-pressed={showForecast}
          onClick={() => setShowForecast((value) => !value)}
        >
          {showForecast ? "Ocultar simulação" : "Mostrar simulação"}
        </FlowButton>
      </div>
      {listMode && (
        <section className="funnel__flow-list" aria-label="Etapas do funil">
          <header>
            <h2>{nome || "Meu funil"}</h2>
            <p>
              Edite cada etapa e confira para onde ela conduz. A ordem abaixo
              segue a lista de blocos; as ligações definem a jornada.
            </p>
          </header>
          {nodes.map((node, index) => (
            <FunnelListItem
              key={node.id}
              node={node}
              nodes={nodes}
              edges={edges}
              connections={todasLinhas}
              storageId={storageId}
              funnelId={inicial.id}
              order={index + 1}
              selected={sel?.tipo === "node" && sel.id === node.id}
              onOpen={() => {
                setSel({ tipo: "node", id: node.id });
                setMulti(new Set());
                setAberto(node.id);
                setPainel(null);
              }}
            />
          ))}
        </section>
      )}
      <div
        className="funnel__viewport"
        tabIndex={listMode ? -1 : 0}
        role="region"
        aria-label="Quadro do funil"
        aria-hidden={listMode || undefined}
        inert={listMode || undefined}
        data-panning={panning}
        data-locked={locked}
        data-fundo={mapa.fundo ?? "pontos"}
        onPointerDown={iniciarPan}
        onContextMenu={(e) => abrirMenu(e, { tipo: "canvas" })}
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
        {edgeSel &&
          !edgePreview &&
          (() => {
            const pm = pontoMedio(edgeSel);
            if (!pm) return null;
            const midpoint = connectionMidpoint(
              { x: pm.sx, y: pm.sy },
              { x: pm.tx, y: pm.ty },
              edgeSel.estilo,
            );
            const availableWidth =
              aberto && canvasBox.width > 1024
                ? canvasBox.width / 2
                : canvasBox.width;
            const toolsWidth = Math.min(
              520,
              Math.max(240, availableWidth - 32),
            );
            const left = Math.max(
              toolsWidth / 2 + 16,
              Math.min(
                vp.x + midpoint.x * vp.k,
                availableWidth - toolsWidth / 2 - 16,
              ),
            );
            const minTop = Math.min(128, Math.max(16, canvasBox.height - 160));
            const top = Math.max(
              minTop,
              Math.min(
                vp.y + midpoint.y * vp.k,
                Math.max(minTop, canvasBox.height - 476),
              ),
            );
            return (
              <EdgeTools
                edge={edgeSel}
                scope={{
                  source: edgeSel.source,
                  target: edgeSel.target,
                  nodes,
                  edges,
                  storageId,
                  funnelId: inicial.id,
                }}
                position={{
                  left,
                  top,
                  maxHeight: Math.max(1, canvasBox.height - top - 16),
                }}
                flowEnabled={edgeSel.estilo?.fluxo ?? true}
                flowGlobal={fluxoGlobal}
                locked={locked}
                onStyle={(patch) => {
                  if (
                    patch.forma === "livre" &&
                    !edgeSel.estilo?.pontos?.length
                  ) {
                    patch = {
                      ...patch,
                      pontos: connectionControls(
                        { x: pm.sx, y: pm.sy },
                        { x: pm.tx, y: pm.ty },
                        edgeSel.estilo,
                      ),
                    };
                  }
                  setEstilo(edgeSel.id, patch);
                }}
                onLabel={(label) => setRotulo(edgeSel.id, label)}
                onReset={() => resetLinha(edgeSel.id)}
                onDelete={() => apagarLinha(edgeSel.id)}
                onGlobalFlow={() => {
                  const next = !fluxoGlobal;
                  setFluxoGlobal(next);
                  setMapa((m) => ({ ...m, fluxo: next }));
                }}
              />
            );
          })()}
        {menuLigar && (
          <div
            className="funnel__ligar"
            style={{ left: menuLigar.x, top: menuLigar.y }}
            onPointerDown={(e) => e.stopPropagation()}
            role="menu"
            aria-label="O que ligar aqui"
          >
            <div className="funnel__ligar-topo">
              <b>Ligar a…</b>
              <button
                type="button"
                className="funnel__ligar-x"
                aria-label="Fechar"
                onClick={() => setMenuLigar(null)}
              >
                ✕
              </button>
            </div>
            <input
              className="funnel__input"
              autoFocus
              value={buscaLigar}
              placeholder="Buscar (ex.: checkout, quiz, oferta)"
              onChange={(e) => setBuscaLigar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMenuLigar(null);
                if (e.key === "Enter") {
                  const q = buscaLigar.trim().toLowerCase();
                  const r = RECURSOS.find((x) =>
                    x.label.toLowerCase().includes(q),
                  );
                  if (r) criarLigado(r.type);
                }
              }}
            />
            {(() => {
              const q = buscaLigar.trim().toLowerCase();
              const rec = RECURSOS.filter(
                (r) => !q || r.label.toLowerCase().includes(q),
              );
              const pags = PAGINAS_VPS.filter(
                (pg) =>
                  !q ||
                  pg.nome.toLowerCase().includes(q) ||
                  pg.host.includes(q),
              );
              return (
                <div className="funnel__ligar-corpo">
                  {FAMILIAS.map((fam) => {
                    const itens = rec.filter((r) => r.familia === fam.id);
                    if (itens.length === 0) return null;
                    return (
                      <React.Fragment key={fam.id}>
                        <div className="funnel__ligar-sec">{fam.nome}</div>
                        <ul className="funnel__ligar-lista">
                          {itens.map((r) => {
                            const Ic = ICONES[r.icon] ?? FileText;
                            return (
                              <li key={r.type}>
                                <button
                                  type="button"
                                  title={r.desc ?? r.label}
                                  onClick={() => criarLigado(r.type)}
                                >
                                  <Ic size={14} strokeWidth={2} />
                                  {r.label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </React.Fragment>
                    );
                  })}
                  {pags.length > 0 && (
                    <>
                      <div className="funnel__ligar-sec">Páginas da VPS</div>
                      <ul className="funnel__ligar-lista">
                        {pags.slice(0, 8).map((pg) => (
                          <li key={pg.id}>
                            <button
                              type="button"
                              onClick={() => criarLigado(`vps:${pg.id}`)}
                            >
                              <Server size={14} strokeWidth={2} />
                              {pg.nome}
                              <small>
                                {pg.host}
                                {pg.caminho}
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        {multi.size > 1 && (
          <div className="funnel__multi-chip" role="status">
            <b>{multi.size} blocos selecionados</b>
            <span>
              arraste para mover juntos · Ctrl+C copia · Ctrl+D duplica · Delete
              apaga · Esc limpa
            </span>
          </div>
        )}
        <div className="funnel__world" style={{ transform }}>
          <div className="funnel__dots" aria-hidden />
          {guias?.x.map((x) => (
            <div
              key={`gx${x}`}
              className="funnel__guia funnel__guia--v"
              style={{ left: x }}
              aria-hidden
            />
          ))}
          {guias?.y.map((y) => (
            <div
              key={`gy${y}`}
              className="funnel__guia funnel__guia--h"
              style={{ top: y }}
              aria-hidden
            />
          ))}

          <svg
            className="funnel__edges"
            role="group"
            aria-label="Conexões do funil"
          >
            <defs>
              <marker
                id="fn-seta-auto"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
              {Array.from(
                new Set([
                  ...CORES_LINHA,
                  ...todasLinhas.map(
                    (e) => e.estilo?.cor ?? mapa.corLinha ?? "#b1b1b7",
                  ),
                  mapa.corLinha ?? "#b1b1b7",
                  "#B6A0FF",
                  "#AAB4C0",
                ]),
              ).map((cor) => (
                <marker
                  key={cor}
                  id={idMarcador(cor)}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  markerUnits="strokeWidth"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={cor} />
                </marker>
              ))}
            </defs>
            {/* eslint-disable-next-line react-hooks/refs -- Interaction refs are accessed only by the deferred pointer handlers. */}
            {todasLinhas.map((ed) => {
              const pm = pontoMedio(ed);
              if (!pm) return null;
              const { sx, sy, tx, ty } = pm;
              const est = ed.estilo;
              const d = caminhoDaLinha(sx, sy, tx, ty, est);
              const selecionada = sel?.tipo === "edge" && sel.id === ed.id;
              const relacionada =
                sel?.tipo === "node" &&
                (ed.source === sel.id || ed.target === sel.id);
              const cor = est?.cor ?? mapa.corLinha ?? "#AAB4C0";
              const midpoint = connectionMidpoint(
                { x: sx, y: sy },
                { x: tx, y: ty },
                est,
              );
              const pontas = est?.pontas ?? "fim";
              const fluxo = fluxoGlobal && (est?.fluxo ?? true);
              // Rótulo no meio: o da regra, ou "resto" na saída comum do Redirecionador.
              const rotulo =
                ed.rotulo ??
                (tipoPorId[ed.source] === "redirect" ? "resto" : undefined);
              return (
                <g key={ed.id} data-edge-id={ed.id}>
                  <path
                    className="funnel__edge-hit"
                    d={d}
                    role="button"
                    tabIndex={0}
                    aria-label={`Editar conexão de ${nomesNos[ed.source] ?? ed.source} para ${nomesNos[ed.target] ?? ed.target}`}
                    onContextMenu={(e) =>
                      abrirMenu(e, { tipo: "edge", id: ed.id })
                    }
                    onPointerDown={(e) => handleEdgePointerDown(e, ed)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.stopPropagation();
                      e.preventDefault();
                      setSel({ tipo: "edge", id: ed.id });
                      setMulti(new Set());
                      setAberto(null);
                    }}
                  />
                  <path
                    className="funnel__edge"
                    d={d}
                    aria-hidden
                    data-selected={selecionada || relacionada}
                    data-auto-color={
                      !est?.cor && !mapa.corLinha ? "true" : undefined
                    }
                    data-fluxo={fluxo || undefined}
                    data-tracejada={est?.tracejada || undefined}
                    style={{
                      stroke: est?.cor || mapa.corLinha ? cor : undefined,
                      strokeWidth: ESPESSURA[est?.espessura ?? 2],
                    }}
                    markerEnd={
                      pontas !== "nenhuma"
                        ? `url(#${!est?.cor && !mapa.corLinha ? "fn-seta-auto" : idMarcador(cor)})`
                        : undefined
                    }
                    markerStart={
                      pontas === "ambas"
                        ? `url(#${!est?.cor && !mapa.corLinha ? "fn-seta-auto" : idMarcador(cor)})`
                        : undefined
                    }
                  />
                  <FlowEdgeSignal
                    path={d}
                    tip={{ x: tx + OFF, y: ty + OFF }}
                    nodes={nodes}
                    source={ed.source}
                    target={ed.target}
                    edges={edges}
                    storageId={storageId}
                    funnelId={inicial.id}
                    enabled={fluxo}
                  />
                  {rotulo &&
                    (() => {
                      const w = Math.round(rotulo.length * 6.6 + 20);
                      return (
                        <g
                          className="funnel__edge-rotulo"
                          data-selected={selecionada || undefined}
                          transform={`translate(${midpoint.x + OFF}, ${midpoint.y + OFF})`}
                          style={{ "--linha-cor": cor } as React.CSSProperties}
                          onPointerDown={(e) => handleEdgePointerDown(e, ed)}
                        >
                          <rect
                            x={-w / 2}
                            y={-11}
                            width={w}
                            height={22}
                            rx={11}
                          />
                          <text textAnchor="middle" dominantBaseline="central">
                            {rotulo}
                          </text>
                        </g>
                      );
                    })()}
                </g>
              );
            })}
            {conn &&
              (() => {
                const src = nodes.find((n) => n.id === conn.source);
                if (!src) return null;
                const ss = size(src.id);
                const start = anchorPoint({ ...src, ...ss }, conn.sourceAnchor);
                const d = connectionPath(
                  start,
                  { x: conn.wx, y: conn.wy },
                  { sourceAnchor: conn.sourceAnchor },
                  OFF,
                );
                return (
                  <path className="funnel__edge--temp" d={d} aria-hidden />
                );
              })()}
          </svg>
          {conn && (
            <div
              className="funnel__ghost"
              style={{ left: conn.wx, top: conn.wy - 24 }}
              aria-hidden
            >
              Solte para criar
            </div>
          )}

          {nodes
            .filter((node) => {
              if (
                nodes.length <= 200 ||
                !canvasBox.width ||
                aberto === node.id ||
                dragId === node.id ||
                (sel?.tipo === "node" && sel.id === node.id) ||
                multi.has(node.id)
              )
                return true;
              const dimensions = size(node.id);
              const x = vp.x + node.x * vp.k,
                y = vp.y + node.y * vp.k;
              return (
                x + dimensions.w * vp.k >= -400 &&
                y + dimensions.h * vp.k >= -400 &&
                x <= canvasBox.width + 400 &&
                y <= canvasBox.height + 400
              );
            })
            .map((node) => (
              <NodeView
                key={node.id}
                node={node}
                compact={vp.k < 0.6 && aberto !== node.id}
                showForecast={showForecast}
                nodes={nodes}
                edges={edges}
                onSelect={() => {
                  if (!ctrlClick.current) {
                    setSel({ tipo: "node", id: node.id });
                    setMulti(new Set());
                  }
                }}
                zipScope={{
                  storageId,
                  funnelId: node.pagina?.zip?.sourceFunnelId ?? inicial.id,
                  nodeId: node.id,
                }}
                ord={paginaAt[node.id]}
                selected={
                  (sel?.tipo === "node" && sel.id === node.id) ||
                  multi.has(node.id)
                }
                dragging={dragId === node.id}
                locked={locked}
                aberto={aberto === node.id}
                saidas={saidas[node.id] ?? 0}
                nomes={nomesNos}
                measure={medir}
                onPointerDown={(e) => iniciarArrasto(e, node)}
                onHandleOut={(e, side) => iniciarConexao(e, node, side)}
                onMenu={(e) => abrirMenu(e, { tipo: "node", id: node.id })}
                onResize={(e) => iniciarResize(e, node)}
                onChange={(patch) => atualizar(node.id, patch)}
                prev={previsao.porNo[node.id]}
                onToggle={() => {
                  if (ctrlClick.current) {
                    ctrlClick.current = false;
                    return;
                  }
                  setSel({ tipo: "node", id: node.id });
                  setMulti(new Set());
                  const abrindo = aberto !== node.id;
                  setAberto((a) => (a === node.id ? null : node.id));
                  if (abrindo) trazerParaVista(node);
                }}
              />
            ))}
        </div>
        {edgeSel && (
          <div
            className="funnel__world funnel__controls-world"
            style={{ transform }}
          >
            <svg
              className="funnel__edges funnel__edges--handles"
              role="group"
              aria-label="Pontos de edição da conexão"
            >
              {controlesDaLinha(edgeSel)}
            </svg>
          </div>
        )}
      </div>

      {nodes.length === 0 && (
        <div className="funnel__empty">
          <b>Adicione a primeira etapa</b>
          <span>
            Use os botões do topo para adicionar páginas, automações e outros
            elementos ao seu funil
          </span>
          <FlowButton variant="primary" onClick={() => setPainel("recursos")}>
            <Plus size={16} aria-hidden />
            Adicionar etapa
          </FlowButton>
          <FlowButton onClick={() => setPainel("modelos")}>
            Escolher modelo
          </FlowButton>
        </div>
      )}

      {conteudoId && nodes.some((n) => n.id === conteudoId) && (
        <FunnelContentEditor
          key={`content:${conteudoId}`}
          data={{ ...inicial, nome, nodes, edges }}
          nodeId={conteudoId}
          site={pacotes[conteudoId] ?? null}
          onSiteChange={(site) => {
            setPacotes((current) => ({ ...current, [conteudoId]: site }));
            forgetPreparedPageZip({
              storageId,
              funnelId: inicial.id,
              nodeId: conteudoId,
            });
            const node = nodesRef.current.find(
              (item) => item.id === conteudoId,
            );
            if (node)
              atualizar(node.id, {
                pagina: { ...pageSettingsForNode(node), zip: undefined },
              });
          }}
          onChange={(patch) => {
            forgetPreparedPageZip({
              storageId,
              funnelId: inicial.id,
              nodeId: conteudoId,
            });
            const node = nodesRef.current.find(
              (item) => item.id === conteudoId,
            );
            if (node)
              atualizar(node.id, {
                ...patch,
                pagina: { ...pageSettingsForNode(node), zip: undefined },
              });
          }}
          onPrepareZip={async (file) => {
            const nodeId = conteudoId;
            const scope = { storageId, funnelId: inicial.id, nodeId };
            const signature = JSON.stringify(
              contentFlowForPage({ ...inicial, nome, nodes, edges }, nodeId),
            );
            const result = await preparePageZip(scope, file, { persist: true });
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (!node) {
              forgetPreparedPageZip(scope);
              throw new Error(
                "A página foi removida durante a preparação do ZIP.",
              );
            }
            let latest: string;
            try {
              latest = JSON.stringify(
                contentFlowForPage(
                  {
                    ...inicial,
                    nome,
                    nodes: nodesRef.current,
                    edges: edgesRef.current,
                  },
                  nodeId,
                ),
              );
            } catch (cause) {
              forgetPreparedPageZip(scope);
              throw cause;
            }
            if (signature !== latest) {
              forgetPreparedPageZip(scope);
              throw new Error(
                "O conteúdo ou as ligações mudaram durante a preparação. Prepare o ZIP novamente.",
              );
            }
            preparedContent.current.set(nodeId, signature);
            atualizar(node.id, {
              pagina: {
                ...pageSettingsForNode(node),
                zip: result.metadata,
              },
            });
            setConteudoId(null);
            setAberto(node.id);
            setAvisoFunil(
              "ZIP conferido. No painel da página, escolha o site real e confirme a publicação. Nada foi enviado ainda.",
            );
          }}
          onClose={() => setConteudoId(null)}
        />
      )}

      {publishSite && (
        <FunnelSitePublisher
          data={{ ...inicial, nome, nodes, edges, mapa, previsao: previsaoCfg }}
          storageId={storageId}
          onClose={() => setPublishSite(false)}
        />
      )}

      {/* O conteúdo e o pacote compartilham o mesmo identificador do nó. */}
      {(() => {
        if (!aberto || estiloAberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (!n || !isPagina(n.type) || n.type === "store") return null;
        const dados = pageSettingsForNode(n);
        const proximas: EtapaDestino[] = [];
        for (const e of edges) {
          if (e.source !== n.id) continue;
          const t = nodes.find((x) => x.id === e.target);
          if (!t) continue;
          const url = funnelNodeAddress(t);
          proximas.push({ id: t.id, nome: t.title, url });
        }
        return (
          <FlowInspector
            fullScreen={canvasBox.width > 0 && canvasBox.width <= 1024}
            label={`Configurar ${n.title}`}
            onClose={() => setAberto(null)}
          >
            <PagePublisher
              key={`publisher:${n.id}`}
              storageId={storageId}
              funnelId={inicial.id}
              nodeId={n.id}
              onEditarConteudo={() => setConteudoId(n.id)}
              onPublicarSite={() => {
                setAberto(null);
                setPublishSite(true);
              }}
              nome={n.title}
              dados={dados}
              onNome={(nm) => atualizar(n.id, { title: nm })}
              onChange={(d) => atualizar(n.id, { pagina: d })}
              proximasEtapas={proximas}
              onFechar={() => setAberto(null)}
            />
          </FlowInspector>
        );
      })()}

      {/* Redirecionador: painel lateral quando um bloco de redirecionamento
          está aberto — o roteador de ofertas dentro do quadro. */}
      {(() => {
        if (!aberto || estiloAberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (!n || !isRedir(n.type)) return null;
        return (
          <FlowInspector
            fullScreen={canvasBox.width > 0 && canvasBox.width <= 1024}
            label={`Configurar ${n.title}`}
            onClose={() => setAberto(null)}
          >
            <RedirectPanel
              node={n}
              nodes={nodes}
              defaultNodeId={edges.find((edge) => edge.source === n.id)?.target}
              onNome={(nm) => atualizar(n.id, { title: nm })}
              onChange={(redir) => atualizar(n.id, { redir })}
              onAddress={(url) => atualizar(n.id, { url })}
              onPublicarSite={() => {
                setAberto(null);
                setPublishSite(true);
              }}
              onFechar={() => setAberto(null)}
              onIrPara={irParaDestino}
            />
          </FlowInspector>
        );
      })()}

      {/* Loja: plataforma, produtos, checkout ligado e métricas. */}
      {(() => {
        if (!aberto || estiloAberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (!n || n.type !== "store") return null;
        return (
          <FlowInspector
            fullScreen={canvasBox.width > 0 && canvasBox.width <= 1024}
            label={`Configurar ${n.title}`}
            onClose={() => setAberto(null)}
          >
            <StorePanel
              key={n.id}
              storageId={storageId}
              funnelId={inicial.id}
              node={n}
              nodes={nodes}
              edges={todasLinhas}
              onNome={(nm) => atualizar(n.id, { title: nm })}
              onChange={(loja) => atualizar(n.id, { loja })}
              onFechar={() => setAberto(null)}
              onIrPara={irParaDestino}
              onCriarCheckout={() => criarAoLado(n.id, "checkout")}
              onEditarConteudo={() => {
                setAberto(null);
                setConteudoId(n.id);
              }}
              onPublicarSite={() => {
                setAberto(null);
                setPublishSite(true);
              }}
            />
          </FlowInspector>
        );
      })()}

      {(() => {
        if (!aberto || estiloAberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (!n || !isFacebookTraffic(n)) return null;
        return (
          <MetaBusinessPanel
            key={n.id}
            node={n}
            nodes={nodes}
            edges={todasLinhas}
            onChange={(id, patch) => atualizar(id, patch)}
            onClose={() => setAberto(null)}
          />
        );
      })()}

      {/* Qualquer outro bloco (anúncio, automação, CRM, link…): painel
          lateral igual ao da página, em vez de abrir dentro do bloco. */}
      {(() => {
        if (!aberto || estiloAberto) return null;
        const n = nodes.find((x) => x.id === aberto);
        if (
          !n ||
          isPagina(n.type) ||
          isRedir(n.type) ||
          n.type === "brand" ||
          SEM_PAINEL.has(n.type)
        )
          return null;
        return (
          <FlowInspector
            fullScreen={canvasBox.width > 0 && canvasBox.width <= 1024}
            label={`Configurar ${n.title}`}
            onClose={() => setAberto(null)}
          >
            <BlockPanel
              node={n}
              nodes={nodes}
              edges={todasLinhas}
              onChange={(patch) => atualizar(n.id, patch)}
              onFechar={() => setAberto(null)}
              onRemover={() => remover(n.id)}
              onIrPara={irParaDestino}
            />
          </FlowInspector>
        );
      })()}

      {/* Inspetor de estilo (NÓ / LINHA / TEXTO / MAPA + Reset). */}
      {estiloAberto && (
        <StylePanel
          key={estiloAberto}
          abaInicial={estiloAberto}
          node={
            sel?.tipo === "node"
              ? nodes.find((n) => n.id === sel.id)
              : undefined
          }
          edge={edgeSel}
          mapa={mapa}
          fluxoGlobal={fluxoGlobal}
          onNode={setEstiloNo}
          onEdge={setEstilo}
          onEdgeReset={resetLinha}
          onRotulo={setRotulo}
          onMapa={(patch) =>
            setMapa((m) => (patch === null ? {} : { ...m, ...patch }))
          }
          onFluxoGlobal={(v) => {
            setFluxoGlobal(v);
            setMapa((m) => ({ ...m, fluxo: v }));
          }}
          onEnquadrar={enquadrar}
          onFechar={() => setEstiloAberto(false)}
        />
      )}

      {/* Menu do botão direito: bloco, linha ou fundo, com os atalhos. */}
      {menuCtx && (
        <div
          className="funnel__ctx"
          role="menu"
          style={{ left: menuCtx.x, top: menuCtx.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menuCtx.alvo.tipo === "node" && ctxNo && (
            <>
              <ItemMenu
                rotulo="Configurar"
                atalho="Enter"
                onClick={() => {
                  setAberto(ctxNo.id);
                  trazerParaVista(ctxNo);
                }}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Estilo do bloco…"
                onClick={() => setEstiloAberto("no")}
                onFechar={fecharMenu}
              />
              <hr />
              <ItemMenu
                rotulo="Duplicar"
                atalho="Ctrl+D"
                onClick={duplicar}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Copiar"
                atalho="Ctrl+C"
                onClick={() => void copiar()}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Recortar"
                atalho="Ctrl+X"
                onClick={recortar}
                onFechar={fecharMenu}
              />
              <hr />
              <ItemMenu
                rotulo="Trazer para frente"
                atalho="]"
                onClick={() => paraFrente(ctxNo.id)}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Enviar para trás"
                atalho="["
                onClick={() => paraTras(ctxNo.id)}
                onFechar={fecharMenu}
              />
              <hr />
              <ItemMenu
                rotulo="Apagar"
                atalho="Del"
                perigo
                onClick={() => remover(ctxNo.id)}
                onFechar={fecharMenu}
              />
            </>
          )}
          {menuCtx.alvo.tipo === "edge" && ctxLinha && (
            <>
              <ItemMenu
                rotulo="Estilo da linha…"
                onClick={() => setEstiloAberto("linha")}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Curva"
                onClick={() => setEstilo(ctxLinha, { forma: "curva" })}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Reta"
                onClick={() => setEstilo(ctxLinha, { forma: "reta" })}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Cotovelo (90°)"
                onClick={() => setEstilo(ctxLinha, { forma: "cotovelo" })}
                onFechar={fecharMenu}
              />
              <hr />
              <ItemMenu
                rotulo="Apagar linha"
                atalho="Del"
                perigo
                onClick={() => apagarLinha(ctxLinha)}
                onFechar={fecharMenu}
              />
            </>
          )}
          {menuCtx.alvo.tipo === "canvas" && (
            <>
              <ItemMenu
                rotulo="Colar"
                atalho="Ctrl+V"
                onClick={() => colar()}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Selecionar tudo"
                atalho="Ctrl+A"
                onClick={() => setMulti(new Set(nodes.map((x) => x.id)))}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Ajustar à tela"
                onClick={enquadrar}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Estilo do mapa…"
                onClick={() => setEstiloAberto("mapa")}
                onFechar={fecharMenu}
              />
              <hr />
              <ItemMenu
                rotulo="Desfazer"
                atalho="Ctrl+Z"
                onClick={desfazer}
                onFechar={fecharMenu}
              />
              <ItemMenu
                rotulo="Refazer"
                atalho="Ctrl+Y"
                onClick={refazer}
                onFechar={fecharMenu}
              />
            </>
          )}
        </div>
      )}

      {/* Barra de formatação flutuante em cima do bloco selecionado. */}
      {sel?.tipo === "node" &&
        !dragId &&
        !panning &&
        multi.size <= 1 &&
        (() => {
          const n = nodes.find((x) => x.id === sel.id);
          if (!n || n.type === "brand") return null;
          const w = size(n.id).w * vp.k;
          const left = vp.x + n.x * vp.k + w / 2;
          const top = vp.y + n.y * vp.k - 10;
          return (
            <div
              className="funnel__fbar"
              style={{ left, top }}
              role="toolbar"
              aria-label="Formatação do bloco"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="funnel__fbar-cor funnel__fbar-cor--nenhuma"
                data-on={!n.estilo?.cor || undefined}
                title="Sem cor"
                aria-label="Sem cor"
                onClick={() => setEstiloNo(n.id, { cor: undefined })}
              >
                ∅
              </button>
              {CORES_NO.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="funnel__fbar-cor"
                  style={{ background: c }}
                  data-on={n.estilo?.cor === c || undefined}
                  title={`Cor ${c}`}
                  aria-label={`Cor ${c}`}
                  onClick={() => setEstiloNo(n.id, { cor: c })}
                />
              ))}
              <i className="funnel__fbar-sep" aria-hidden />
              {n.type === "shape" && (
                <>
                  <button
                    type="button"
                    className="funnel__fbar-btn"
                    title="Retângulo"
                    aria-label="Retângulo"
                    data-on={
                      (n.forma ?? "retangulo") === "retangulo" || undefined
                    }
                    onClick={() => atualizar(n.id, { forma: "retangulo" })}
                  >
                    ▭
                  </button>
                  <button
                    type="button"
                    className="funnel__fbar-btn"
                    title="Círculo"
                    aria-label="Círculo"
                    data-on={n.forma === "circulo" || undefined}
                    onClick={() => atualizar(n.id, { forma: "circulo" })}
                  >
                    ◯
                  </button>
                  <button
                    type="button"
                    className="funnel__fbar-btn"
                    title="Losango"
                    aria-label="Losango"
                    data-on={n.forma === "losango" || undefined}
                    onClick={() => atualizar(n.id, { forma: "losango" })}
                  >
                    ◇
                  </button>
                  <i className="funnel__fbar-sep" aria-hidden />
                </>
              )}
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Negrito"
                aria-label="Negrito"
                data-on={n.estilo?.negrito || undefined}
                onClick={() =>
                  setEstiloNo(n.id, { negrito: !n.estilo?.negrito })
                }
              >
                <b>B</b>
              </button>
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Configurar (Enter)"
                aria-label="Configurar"
                onClick={() => {
                  setAberto(n.id);
                  trazerParaVista(n);
                }}
              >
                ⚙
              </button>
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Estilo"
                aria-label="Estilo"
                onClick={() => setEstiloAberto("no")}
              >
                🎨
              </button>
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Duplicar (Ctrl+D)"
                aria-label="Duplicar"
                onClick={duplicar}
              >
                ⧉
              </button>
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Trazer para frente ( ] )"
                aria-label="Trazer para frente"
                onClick={() => paraFrente(n.id)}
              >
                ⬆
              </button>
              <button
                type="button"
                className="funnel__fbar-btn"
                title="Enviar para trás ( [ )"
                aria-label="Enviar para trás"
                onClick={() => paraTras(n.id)}
              >
                ⬇
              </button>
              <button
                type="button"
                className="funnel__fbar-btn funnel__fbar-btn--perigo"
                title="Apagar (Del)"
                aria-label="Apagar"
                onClick={() => remover(n.id)}
              >
                🗑
              </button>
            </div>
          );
        })()}

      {/* Menu do quadro — trilho vertical à esquerda, igual ao do
          redirecionador: ícones num trilho escuro, o ativo em verde. */}
      <nav className="funnel__rail" aria-label="Menu do quadro">
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Voltar"
          onClick={() => {
            try {
              onRascunho?.(draftRef.current);
              onVoltar?.();
            } catch (cause) {
              setAvisoFunil(
                cause instanceof Error
                  ? cause.message
                  : "Guarde o rascunho antes de sair.",
              );
            }
          }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} />
        </button>
        <span className="funnel__rail-sep" aria-hidden />
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Publicar site completo"
          title="Publicar site completo"
          onClick={() => setPublishSite(true)}
        >
          <ExternalLink size={18} />
        </button>
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
          aria-label="Lista de blocos"
          data-on={painel === "lista"}
          onClick={() => setPainel((p) => (p === "lista" ? null : "lista"))}
        >
          <ListTree size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Previsão"
          data-on={painel === "previsao"}
          onClick={() =>
            setPainel((p) => (p === "previsao" ? null : "previsao"))
          }
        >
          <TrendingUp size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="funnel__rail-btn"
          aria-label="Modelos"
          data-on={painel === "modelos"}
          onClick={() => setPainel((p) => (p === "modelos" ? null : "modelos"))}
        >
          <LayoutTemplate size={18} strokeWidth={2} />
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
          onClick={() => {
            refrescarFunis();
            setPainel((p) => (p === "funis" ? null : "funis"));
          }}
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
            Salve este funil com nome para reabrir depois — e para trazê-lo ao
            quadro do redirecionador.
          </div>
          <FunnelCloudHistory
            storageId={storageId}
            cofre={cofre}
            onRestored={(data) => {
              refrescarFunis();
              if (data) onAbrir?.(data);
            }}
          />
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
            <button
              type="button"
              className="funnel__btn"
              onClick={exportarCopia}
            >
              Baixar cópia JSON
            </button>
            <button
              type="button"
              className="funnel__btn"
              onClick={() => importInput.current?.click()}
            >
              Importar cópia JSON
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Cópia JSON do funil"
              onChange={(event) => void importarCopia(event.target.files?.[0])}
            />
          </div>
          {listaFunis.erro && (
            <div className="funnel__funis-aviso" role="alert">
              {listaFunis.erro}
            </div>
          )}
          <ul className="funnel__funis" aria-label="Funis salvos">
            {listaFunis.itens.length === 0 && (
              <li className="funnel__funis-vazio">
                Nenhum funil salvo ainda. Dê um nome e clique em Salvar.
              </li>
            )}
            {listaFunis.itens.map((f) => (
              <li
                key={f.id}
                className="funnel__funil"
                data-atual={f.id === inicial.id || undefined}
              >
                <div className="funnel__funil-info">
                  <b>{f.nome}</b>
                  <span>
                    {f.data.nodes.length} bloco(s) · {quando(f.atualizadoEm)}
                    {f.arquivado ? " · arquivado" : ""}
                    {f.id === inicial.id ? " · aberto" : ""}
                  </span>
                </div>
                <div className="funnel__funil-acoes">
                  {f.id !== inicial.id && (
                    <button
                      type="button"
                      className="funnel__btn"
                      onClick={() => {
                        try {
                          if (f.arquivado) cofre.restaurarFunil(f.id);
                          onAbrir?.(f.data);
                          setPainel(null);
                        } catch (cause) {
                          setAvisoFunil(
                            cause instanceof Error
                              ? cause.message
                              : "Não foi possível abrir o funil.",
                          );
                        }
                      }}
                    >
                      <FolderOpen size={14} strokeWidth={2} />
                      {f.arquivado ? "Restaurar e abrir" : "Abrir"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="funnel__btn"
                    aria-label={`Duplicar ${f.nome}`}
                    title="Duplicar"
                    onClick={() => {
                      try {
                        cofre.duplicarFunil(f.id);
                        refrescarFunis();
                      } catch (cause) {
                        setAvisoFunil(
                          cause instanceof Error
                            ? cause.message
                            : "Não foi possível duplicar.",
                        );
                      }
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
                      try {
                        cofre.removerFunil(f.id);
                        refrescarFunis();
                      } catch (cause) {
                        setAvisoFunil(
                          cause instanceof Error
                            ? cause.message
                            : "Não foi possível apagar.",
                        );
                      }
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
          <div className="funnel__panel-title">Biblioteca de blocos</div>
          <input
            className="funnel__input funnel__panel-busca"
            value={buscaRec}
            placeholder="Buscar (ex.: checkout, upsell, e-mail)"
            aria-label="Buscar bloco"
            onChange={(e) => setBuscaRec(e.target.value)}
          />
          <div className="funnel__panel-hint">
            Arraste para o quadro ou clique para adicionar no centro.
          </div>
          {FAMILIAS.map((fam) => {
            const q = buscaRec.trim().toLowerCase();
            const itens = RECURSOS.filter(
              (r) =>
                r.familia === fam.id &&
                (!q || r.label.toLowerCase().includes(q)),
            );
            if (itens.length === 0) return null;
            return (
              <React.Fragment key={fam.id}>
                <div className="funnel__panel-sec">{fam.nome}</div>
                <div className="funnel__grid">
                  {itens.map((r) => {
                    const Icone = ICONES[r.icon];
                    return (
                      <button
                        type="button"
                        key={r.type}
                        className="funnel__item"
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(DATA_KEY, r.type)
                        }
                        title={r.desc ?? r.label}
                        onClick={() => adicionarNoCentro(r.type)}
                      >
                        <Icone size={24} strokeWidth={1.8} />
                        <span className="funnel__item-label">{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {painel === "lista" && (
        <div className="funnel__panel">
          <div className="funnel__panel-title">Lista de blocos</div>
          <input
            className="funnel__input funnel__panel-busca"
            value={buscaLista}
            placeholder="Buscar bloco pelo nome"
            aria-label="Buscar na lista"
            onChange={(e) => setBuscaLista(e.target.value)}
          />
          <div className="funnel__panel-hint">
            {nodes.length} {nodes.length === 1 ? "bloco" : "blocos"} ·{" "}
            {todasLinhas.length} {todasLinhas.length === 1 ? "linha" : "linhas"}
            . Clique para ir até o bloco.
          </div>
          {FAMILIAS.map((fam) => {
            const q = buscaLista.trim().toLowerCase();
            const itens = nodes.filter((n) => {
              const f =
                RECURSO_POR_TIPO[n.type]?.familia ??
                (n.type === "brand" ? "trafego" : "outros");
              return (
                f === fam.id &&
                (!q || (n.title || "").toLowerCase().includes(q))
              );
            });
            if (itens.length === 0) return null;
            return (
              <React.Fragment key={fam.id}>
                <div className="funnel__panel-sec">{fam.nome}</div>
                <ul className="funnel__lista">
                  {itens.map((n) => {
                    const def = RECURSO_POR_TIPO[n.type];
                    const Ic = def ? ICONES[def.icon] : Globe;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          data-on={
                            (sel?.tipo === "node" && sel.id === n.id) ||
                            undefined
                          }
                          onClick={() => {
                            setSel({ tipo: "node", id: n.id });
                            setMulti(new Set());
                            trazerParaVista(n);
                          }}
                        >
                          <Ic size={14} strokeWidth={2} />
                          <span>
                            {n.title ||
                              n.descricao?.slice(0, 30) ||
                              "(sem nome)"}
                          </span>
                          <small>{ROTULO_TIPO[n.type]}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {painel === "previsao" && (
        <div className="funnel__panel funnel__panel--largo">
          <div className="funnel__panel-title">Previsão do funil</div>
          <div className="funnel__panel-hint">
            Calculadora: digite as visitas que entram e a conversão de cada
            bloco. São contas, não medições.
          </div>
          {previsao.avisos.map((aviso) => (
            <p key={aviso} className="funnel__panel-hint" role="status">
              {aviso}
            </p>
          ))}
          <div className="funnel__prev-topo">
            <div className="pub__chips" role="radiogroup" aria-label="Cenário">
              {CENARIOS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={previsaoCfg.cenario === c.id}
                  className="pub__chip"
                  data-on={previsaoCfg.cenario === c.id || undefined}
                  style={{ "--aba-cor": c.cor } as React.CSSProperties}
                  onClick={() =>
                    setPrevisaoCfg((p) => ({ ...p, cenario: c.id }))
                  }
                >
                  {c.nome} <small>×{c.fator}</small>
                </button>
              ))}
            </div>
            <label className="funnel__prev-cpc">
              Custo por visita (R$)
              <input
                type="number"
                min={0}
                step={0.1}
                value={previsaoCfg.cpc}
                onChange={(e) =>
                  setPrevisaoCfg((p) => ({
                    ...p,
                    cpc: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>
          <div className="funnel__prev-kpis">
            <div>
              <span>Visitas</span>
              <b>{inteiro(previsao.total.visitas)}</b>
            </div>
            <div>
              <span>Leads</span>
              <b>{inteiro(previsao.total.leads)}</b>
            </div>
            <div>
              <span>Vendas</span>
              <b>{inteiro(previsao.total.vendas)}</b>
            </div>
            <div>
              <span>Receita</span>
              <b>{reais(previsao.total.receita)}</b>
            </div>
            <div>
              <span>Custo do tráfego</span>
              <b>{reais(previsao.total.custo)}</b>
            </div>
            <div data-neg={previsao.total.lucro < 0 || undefined}>
              <span>Lucro</span>
              <b>{reais(previsao.total.lucro)}</b>
            </div>
            <div data-neg={previsao.total.roi < 0 || undefined}>
              <span>ROI</span>
              <b>
                {previsao.total.roi.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                ×
              </b>
            </div>
            <div>
              <span>Custo por venda</span>
              <b>
                {previsao.total.vendas
                  ? reais(previsao.total.custoPorVenda)
                  : "—"}
              </b>
            </div>
          </div>
          <table className="funnel__prev-tab">
            <thead>
              <tr>
                <th>Bloco</th>
                <th>Entram</th>
                <th>Conversão %</th>
                <th>Seguem</th>
                <th>Preço</th>
                <th>Receita</th>
              </tr>
            </thead>
            <tbody>
              {previsao.ordem.map((id) => {
                const n = nodes.find((x) => x.id === id);
                const r = previsao.porNo[id];
                if (!n || !r) return null;
                const pad = PADRAO_TIPO[n.type];
                const editaConv = Boolean(pad?.faixa || pad?.vende);
                return (
                  <tr key={id}>
                    <td>
                      <i
                        className="funnel__sem"
                        data-sem={r.semaforo}
                        aria-hidden
                      />
                      {n.title || "(sem nome)"}{" "}
                      <small>{ROTULO_TIPO[n.type]}</small>
                    </td>
                    <td>
                      {r.origem ? (
                        <input
                          type="number"
                          min={0}
                          value={n.previsao?.visitas ?? VISITAS_PADRAO}
                          aria-label={`Visitas por mês de ${n.title}`}
                          onChange={(e) =>
                            setPrevisaoNo(id, {
                              visitas: Number(e.target.value) || 0,
                            })
                          }
                        />
                      ) : (
                        inteiro(r.entram)
                      )}
                    </td>
                    <td>
                      {editaConv ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={n.previsao?.conversao ?? pad?.conv ?? 100}
                          aria-label={`Conversão de ${n.title}`}
                          onChange={(e) =>
                            setPrevisaoNo(id, {
                              conversao: Number(e.target.value) || 0,
                            })
                          }
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{inteiro(r.saem)}</td>
                    <td>
                      {pad?.vende ? (
                        <input
                          type="number"
                          min={0}
                          value={n.previsao?.preco ?? pad.preco ?? 0}
                          aria-label={`Preço em ${n.title}`}
                          onChange={(e) =>
                            setPrevisaoNo(id, {
                              preco: Number(e.target.value) || 0,
                            })
                          }
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{r.receita ? reais(r.receita) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="funnel__panel-hint">
            Semáforo: 🟢 conversão boa para o tipo do bloco · 🟡 mediana · 🔴
            abaixo do comum. Os cenários multiplicam as conversões (×0,7 / ×1 /
            ×1,3).
          </div>
        </div>
      )}

      {painel === "modelos" && (
        <div className="funnel__panel">
          <div className="funnel__panel-title">Modelos prontos</div>
          <div className="funnel__panel-hint">
            Um clique monta o funil inteiro com os blocos ligados. O quadro
            atual é trocado — salve antes no cofre se quiser guardá-lo.
          </div>
          <ul className="funnel__modelos">
            {MODELOS.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAbrir?.(montarModelo(m));
                    setPainel(null);
                  }}
                >
                  <b>{m.nome}</b>
                  <span>{m.para}</span>
                  <small>
                    {m.passos.length + (m.extras?.length ?? 0)} blocos
                  </small>
                </button>
              </li>
            ))}
          </ul>
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
      <div
        className="funnel__zoom"
        role="group"
        aria-label="Controles do quadro"
      >
        <span className="funnel__zoom-value" aria-label="Zoom do quadro">
          {Math.round(vp.k * 100)}%
        </span>
        <FlowIconButton label="Aproximar" onClick={() => zoomPor(1.2)}>
          <Plus size={16} strokeWidth={2} />
        </FlowIconButton>
        <FlowIconButton label="Afastar" onClick={() => zoomPor(1 / 1.2)}>
          <Minus size={16} strokeWidth={2} />
        </FlowIconButton>
        <FlowIconButton label="Enquadrar" onClick={enquadrar}>
          <Maximize size={16} strokeWidth={2} />
        </FlowIconButton>
        <FlowIconButton
          label="Travar quadro"
          data-on={locked}
          onClick={() => setLocked((l) => !l)}
        >
          {locked ? (
            <Lock size={16} strokeWidth={2} />
          ) : (
            <LockOpen size={16} strokeWidth={2} />
          )}
        </FlowIconButton>
      </div>

      {/* Modal de configurações */}
      {dialog && (
        <Dialog.Root open onOpenChange={setDialog}>
          <Dialog.Overlay className="funnel__overlay">
            <Dialog.Content
              className="funnel__dialog"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="funnel__dialog-head">
                <Dialog.Title asChild>
                  <span>Configurações do Funil</span>
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Edite o nome, salve ou arquive o funil.
                </Dialog.Description>
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
                    onClick={() => {
                      try {
                        onArquivar?.({
                          ...inicial,
                          nome,
                          nodes,
                          edges,
                          mapa,
                          previsao: previsaoCfg,
                        });
                      } catch (cause) {
                        setAvisoFunil(
                          cause instanceof Error
                            ? cause.message
                            : "Não foi possível arquivar.",
                        );
                      }
                    }}
                  >
                    <Archive size={15} strokeWidth={2} />
                    Arquivar com as alterações
                  </button>
                  <div className="funnel__foot-right">
                    <FlowConfirmDialog
                      title="Excluir este rascunho?"
                      description="O rascunho será removido do cofre deste navegador. As páginas já publicadas no servidor continuam disponíveis."
                      confirmLabel="Excluir rascunho"
                      theme={mapa.tema}
                      onConfirm={() => {
                        try {
                          onExcluir?.(inicial.id);
                        } catch (cause) {
                          setAvisoFunil(
                            cause instanceof Error
                              ? cause.message
                              : "Não foi possível excluir o rascunho.",
                          );
                        }
                      }}
                    >
                      <button
                        type="button"
                        className={cn("funnel__btn", "funnel__btn--danger")}
                      >
                        <Trash2 size={15} strokeWidth={2} />
                        Excluir
                      </button>
                    </FlowConfirmDialog>
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
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Root>
      )}
    </div>
  );
}

function FunnelListItem({
  node,
  nodes,
  edges,
  connections,
  storageId,
  funnelId,
  order,
  selected,
  onOpen,
}: {
  node: FunnelNode;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  connections: FunnelEdge[];
  storageId: string;
  funnelId: string;
  order: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const zip = usePageZip({
    storageId,
    funnelId: node.pagina?.zip?.sourceFunnelId ?? funnelId,
    nodeId: node.id,
  });
  const preparation = nodePreparation(node, nodes, edges, Boolean(zip));
  const outgoing = connections.filter((edge) => edge.source === node.id);
  const Icon = ICONES[RECURSO_POR_TIPO[node.type]?.icon] ?? FileText;
  return (
    <article
      className="funnel__flow-list-item"
      data-node-id={node.id}
      data-selected={selected}
      aria-label={`${ROTULO_TIPO[node.type]} ${node.title}`}
    >
      <div className="funnel__flow-list-main">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
        <span>
          {order.toString().padStart(2, "0")} · {ROTULO_TIPO[node.type]}
        </span>
      </div>
      <h3>{node.title || "Etapa sem nome"}</h3>
      <code className="funnel__flow-list-path">{funnelNodeAddress(node)}</code>
      <div className="funnel__flow-list-state">
        <FlowStatusBadge
          tone={
            preparation.state === "error"
              ? "danger"
              : preparation.state === "ready"
                ? "success"
                : preparation.state === "pending"
                  ? "warning"
                  : "neutral"
          }
        >
          {preparation.total ? preparation.label : "Bloco do funil"}
        </FlowStatusBadge>
        {preparation.total > 0 && (
          <span>
            {preparation.completed}/{preparation.total} itens
          </span>
        )}
      </div>
      <p>
        {outgoing.length
          ? outgoing
              .map(
                (edge) =>
                  `${edge.rotulo || (node.type === "redirect" ? "Destino padrão" : "Continuar")} → ${nodes.find((target) => target.id === edge.target)?.title || "Destino não encontrado"}`,
              )
              .join(" · ")
          : node.type === "thanks"
            ? "Conclusão do funil"
            : "Sem próxima etapa ligada"}
      </p>
      {!SEM_PAINEL.has(node.type) && (
        <FlowButton className="funnel__flow-list-action" onClick={onOpen}>
          Configurar {node.title || "etapa"}
          <ExternalLink size={14} aria-hidden />
        </FlowButton>
      )}
    </article>
  );
}

interface NodeViewProps {
  compact: boolean;
  showForecast: boolean;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  onSelect: () => void;
  zipScope: PageZipScope;
  node: FunnelNode;
  ord: number;
  selected: boolean;
  dragging: boolean;
  locked: boolean;
  /** A configuração deste nó está aberta dentro do bloco. */
  aberto: boolean;
  /** Ligações que saem deste nó. */
  saidas: number;
  /** id → título dos blocos (nome do destino das regras). */
  nomes: Record<string, string>;
  measure: (id: string, el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandleOut: (
    e: React.PointerEvent,
    side: FunnelConnectionAnchor["side"],
  ) => void;
  /** Botão direito no bloco: abre o menu de contexto. */
  onMenu: (e: React.MouseEvent) => void;
  /** Puxar o canto inferior direito (anotações). */
  onResize: (e: React.PointerEvent) => void;
  onChange: (patch: Partial<FunnelNode>) => void;
  /** Números da previsão deste bloco. */
  prev?: ResultadoNo;
  onToggle: () => void;
}

/**
 * Um nó do quadro, no desenho do editor de páginas: o bloco preto
 * quadrado do CommandLayer — cabeçalho com ícone e tipo, corpo com nome,
 * título e endereço, rodapé mono com o status — e, ao clicar no corpo, a
 * configuração da página abre DENTRO do próprio bloco, como no outro
 * quadro. O nó de origem (marca) é só o cabeçalho.
 */
function NodeView({
  compact,
  showForecast,
  nodes,
  edges,
  onSelect,
  zipScope,
  node,
  ord,
  selected,
  dragging,
  locked,
  aberto,
  saidas,
  nomes,
  measure,
  onPointerDown,
  onHandleOut,
  onMenu,
  onResize,
  onChange,
  prev,
  onToggle,
}: NodeViewProps) {
  const zipPreparado = usePageZip(zipScope);
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
    node.redir,
    aberto,
    compact,
    showForecast,
    zipPreparado,
    edges,
  ]);

  const marca = node.type === "brand";
  const loja = node.type === "store";
  const pagina = isPagina(node.type) && !loja;
  const redir = isRedir(node.type);
  const anot = isAnotacao(node.type);
  const semAlca = anot && node.type !== "shape";
  const def = RECURSO_POR_TIPO[node.type];
  const Icone = def ? ICONES[def.icon] : FileText;
  const url = node.url ?? "";
  // Publicador (nós de página): estado do "crachá".
  const pag = node.pagina;
  const enderecoPub = pag?.dominio
    ? (pageAddress(pag) ?? "Endereço inválido")
    : "";
  const preparation = nodePreparation(
    node,
    nodes,
    edges,
    Boolean(zipPreparado),
  );
  const rotuloSaidas = `${saidas} ${saidas === 1 ? "saída" : "saídas"}`;

  return (
    <div
      ref={ref}
      className={cn(
        "funnel__node",
        marca && "funnel__node--brand",
        !pagina && !marca && "funnel__node--plain",
      )}
      style={
        {
          left: node.x,
          top: node.y,
          width: marca || node.type === "comment" ? "auto" : (node.w ?? NODE_W),
          height: anot && node.type !== "comment" ? node.h : undefined,
          "--node-cor": node.estilo?.cor,
        } as React.CSSProperties
      }
      data-selected={selected}
      data-compact={compact && !marca && !anot}
      data-dragging={dragging}
      data-locked={locked}
      data-aberto={aberto || undefined}
      data-in={node.id}
      data-tipo={node.type}
      data-cor={node.estilo?.cor ? "" : undefined}
      data-borda={node.estilo?.borda}
      data-texto={node.estilo?.texto}
      data-negrito={node.estilo?.negrito || undefined}
      onPointerDown={onPointerDown}
      onContextMenu={onMenu}
    >
      {marca ? (
        <div className="funnel__node-shell">
          <div
            onFocus={onSelect}
            className="funnel__node-brand"
            role={isFacebookTraffic(node) ? "button" : undefined}
            tabIndex={isFacebookTraffic(node) ? 0 : undefined}
            aria-label={
              isFacebookTraffic(node)
                ? "Ver BMs e tráfego da loja no Facebook"
                : undefined
            }
            onClick={isFacebookTraffic(node) ? onToggle : undefined}
            onKeyDown={
              isFacebookTraffic(node)
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle();
                    }
                  }
                : undefined
            }
            style={isFacebookTraffic(node) ? { cursor: "pointer" } : undefined}
          >
            <span
              className="funnel__brand-disc"
              style={{ background: node.cor }}
            >
              {node.sigla}
            </span>
            <div className="funnel__node-titles">
              <span className="funnel__node-title">{node.title}</span>
              <span className="funnel__node-sub">
                {isFacebookTraffic(node)
                  ? "Ver BMs e tráfego da loja"
                  : prev
                    ? `${inteiro(prev.entram)} visitas/mês`
                    : "Origem de tráfego"}
              </span>
            </div>
          </div>
        </div>
      ) : anot ? (
        <AnotacaoView
          node={node}
          aberto={aberto}
          onChange={onChange}
          onToggle={onToggle}
          onResize={onResize}
        />
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
            onFocus={onSelect}
            aria-expanded={aberto}
            aria-label={`Configurar ${node.title || "bloco sem nome"}`}
          >
            {redir ? (
              <RedirCorpo node={node} nomes={nomes} />
            ) : (
              <>
                {loja ? (
                  <LojaCorpo node={node} />
                ) : (
                  <>
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
                  </>
                )}
                {pagina && (
                  <MetricasResumo
                    seed={
                      pag?.dominio ? `${pag.dominio}${pag.caminho}` : node.title
                    }
                  />
                )}
                {showForecast && prev && (
                  <span
                    className="funnel__node-prev"
                    data-sem={prev.semaforo}
                    title="Simulação — não são dados reais"
                  >
                    <i aria-hidden />
                    <span className="funnel__simulation-label">
                      Simulação · não são dados reais
                    </span>
                    {prev.origem
                      ? `${inteiro(prev.entram)} visitas/mês`
                      : `${inteiro(prev.entram)} entram · ${prev.conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · ${inteiro(prev.saem)} seguem`}
                    {prev.receita > 0 && <b> · {reais(prev.receita)}</b>}
                  </span>
                )}
              </>
            )}
            {preparation.total > 0 && (
              <span className="funnel__node-checklist">
                <span className="funnel__node-progress-label">
                  Configuração{" "}
                  <b>
                    {preparation.completed}/{preparation.total} itens
                  </b>
                </span>
                <span
                  className="funnel__node-progress"
                  role="progressbar"
                  aria-label={`Configuração de ${node.title}`}
                  aria-valuemin={0}
                  aria-valuemax={preparation.total}
                  aria-valuenow={preparation.completed}
                >
                  <span
                    style={{
                      width: `${(100 * preparation.completed) / preparation.total}%`,
                    }}
                  />
                </span>
                <span className="funnel__node-checks">
                  {preparation.items.map((item) => (
                    <span key={item.label} data-done={item.done}>
                      <span aria-hidden>{item.done ? "✓" : "○"}</span>
                      {item.label}
                    </span>
                  ))}
                </span>
              </span>
            )}
          </button>

          <footer className="funnel__node-foot">
            <FlowStatusBadge
              tone={
                preparation.state === "error"
                  ? "danger"
                  : preparation.state === "ready"
                    ? "success"
                    : preparation.state === "pending"
                      ? "warning"
                      : "neutral"
              }
            >
              {preparation.total ? preparation.label : ROTULO_TIPO[node.type]}
            </FlowStatusBadge>
            <span>{rotuloSaidas}</span>
          </footer>
        </article>
      )}

      {!semAlca &&
        (
          [
            ["top", "superior"],
            ["right", "direita"],
            ["bottom", "inferior"],
            ["left", "esquerda"],
          ] as const
        ).map(([side, label]) => (
          <button
            key={side}
            type="button"
            className={`funnel__port funnel__port--${side}`}
            data-node-id={node.id}
            data-port-side={side}
            disabled={locked}
            aria-label={`Conectar ${node.title} pela borda ${label}. Arraste para ligar; Enter abre as configurações.`}
            onPointerDown={(e) => onHandleOut(e, side)}
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail === 0) onToggle();
            }}
          />
        ))}
    </div>
  );
}

/**
 * Uma anotação do quadro: post-it, texto, forma, moldura ou o pino de um
 * comentário. Edita-se no próprio quadro (menos o comentário, que abre a
 * conversa no painel).
 */
function AnotacaoView({
  node,
  aberto,
  onChange,
  onToggle,
  onResize,
}: {
  node: FunnelNode;
  aberto: boolean;
  onChange: (patch: Partial<FunnelNode>) => void;
  onToggle: () => void;
  onResize: (e: React.PointerEvent) => void;
}) {
  const parar = (e: React.PointerEvent) => e.stopPropagation();
  if (node.type === "comment") {
    const n = node.mensagens?.length ?? 0;
    const ultima = node.mensagens?.[n - 1];
    return (
      <button
        type="button"
        className="funnel__pin"
        onClick={onToggle}
        aria-expanded={aberto}
        aria-label={`Comentário: ${ultima?.texto ?? node.title}`}
      >
        <span className="funnel__pin-ic" aria-hidden>
          💬
        </span>
        <span className="funnel__pin-txt">
          {ultima ? ultima.texto : node.title || "Comentário"}
        </span>
        {n > 0 && <span className="funnel__pin-n">{n}</span>}
      </button>
    );
  }
  return (
    <div
      className={cn("funnel__anot", `funnel__anot--${node.type}`)}
      data-forma={node.forma}
      style={{ "--anot-cor": node.estilo?.cor } as React.CSSProperties}
    >
      {node.type === "frame" && (
        <input
          className="funnel__anot-titulo"
          value={node.title}
          placeholder="Nome da moldura"
          aria-label="Nome da moldura"
          maxLength={80}
          onPointerDown={parar}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      )}
      {node.type === "shape" && (
        <textarea
          className="funnel__anot-texto funnel__anot-texto--centro"
          value={node.title}
          placeholder="Texto"
          aria-label="Texto da forma"
          maxLength={200}
          onPointerDown={parar}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      )}
      {(node.type === "note" || node.type === "text") && (
        <textarea
          className="funnel__anot-texto"
          value={node.descricao ?? ""}
          placeholder={
            node.type === "note" ? "Escreva no post-it…" : "Escreva aqui…"
          }
          aria-label={node.type === "note" ? "Texto do post-it" : "Texto"}
          maxLength={2000}
          onPointerDown={parar}
          onChange={(e) => onChange({ descricao: e.target.value })}
        />
      )}
      <span
        className="funnel__resize"
        title="Arraste para redimensionar"
        onPointerDown={onResize}
        aria-hidden
      />
    </div>
  );
}

/** Uma linha de métricas no bloco da página (demonstração, 30 dias). */
function MetricasResumo({ seed }: { seed: string }) {
  return (
    <span
      className="funnel__node-metricas"
      title={`Sem medição de visitas, cliques e rolagem conectada a ${seed}`}
    >
      <span>
        <i aria-hidden>👁</i> —
      </span>
      <span>
        <i aria-hidden>🛒</i> —
      </span>
      <span>Sem medição</span>
    </span>
  );
}

/** O corpo do bloco Loja: plataforma, domínio, produtos e métricas. */
function LojaCorpo({ node }: { node: FunnelNode }) {
  const l = node.loja;
  return (
    <>
      <span className="funnel__node-name">{node.title || "Minha loja"}</span>
      <span className="funnel__node-headline">
        {l ? nomeDaPlataforma(l.plataforma) : "Loja"} ·{" "}
        {l?.dominio ?? "sem domínio"}
      </span>
      <span className="funnel__node-url">🛍 {resumoDaLoja(l)}</span>
      <MetricasResumo seed={l?.dominio ?? node.title} />
    </>
  );
}

/** O corpo do bloco Redirecionador: as regras, uma por linha, e o "resto". */
function RedirCorpo({
  node,
  nomes,
}: {
  node: FunnelNode;
  nomes: Record<string, string>;
}) {
  const regras = node.redir?.regras ?? [];
  return (
    <>
      <span className="funnel__node-name">
        {node.title || "Redirecionador"}
      </span>
      <span className="funnel__redir-lista">
        {regras.map((r) => (
          <span
            key={r.id}
            className="funnel__redir-regra"
            data-off={!r.ativo || undefined}
          >
            <i aria-hidden>{GLIFO_REGRA[r.tipo]}</i>
            <span className="funnel__redir-quem">{rotuloDaRegra(r)}</span>
            <span className="funnel__redir-seta" aria-hidden>
              →
            </span>
            <span className="funnel__redir-dest">
              {nomeDoDestino(r, nomes)}
            </span>
          </span>
        ))}
        {regras.length === 0 && (
          <span className="funnel__redir-vazio">
            Toque para criar as regras (região, aparelho, fatia…)
          </span>
        )}
        <span className="funnel__redir-regra funnel__redir-resto">
          <i aria-hidden>↩</i>
          <span className="funnel__redir-quem">Quem não bate em nenhuma</span>
          <span className="funnel__redir-seta" aria-hidden>
            →
          </span>
          <span className="funnel__redir-dest">segue a linha de saída</span>
        </span>
      </span>
    </>
  );
}

/** Um item do menu do botão direito, com o atalho à direita. */
function ItemMenu({
  rotulo,
  atalho,
  perigo,
  onClick,
  onFechar,
}: {
  rotulo: string;
  atalho?: string;
  perigo?: boolean;
  onClick: () => void;
  /** Fecha o menu depois da ação. */
  onFechar: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="funnel__ctx-item"
      data-perigo={perigo || undefined}
      onClick={() => {
        onClick();
        onFechar();
      }}
    >
      <span>{rotulo}</span>
      {atalho && <kbd>{atalho}</kbd>}
    </button>
  );
}

/** Reexport para conveniência de quem monta a página. */
export type { FunnelData, MarcaDef };
