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
import {
  DESTINOS_FUNIL,
  FunnelDestino,
  ORIGENS_FUNIL,
  ROTULO_CATEGORIA,
  destinosPorCategoria,
  enderecoDoNo,
} from "./funnel-link";
import {
  listarFunis,
  listarRedirs,
  quando,
  removerRedir,
  salvarRedir,
  type FunilSalvo,
} from "@/features/funnel/funil-store";
import type { FunnelNodeType } from "@/features/funnel/funnel-model";
import {
  BlocoPagina,
  BlocoTipo,
  FERRAMENTAS,
  ferramenta,
  rotuloTipo,
} from "./redirector-tools";
import {
  DOMINIOS_VPS,
  PaginaVps,
  paginasDoDominioTipo,
  resumoDoDominio,
  urlDaPagina,
} from "@/features/vps/catalogo-demo";
import { CountryFlag } from "@/features/access-filter/country-flag";

/*
  A tela do Roteador de ofertas — só a interface, a pedido do dono. O
  "Configurar" é um quadro estilo funil: cada bloco (Fonte, cada regra e
  Saída) é um nó que arrasta pelo quadro e se liga aos outros por
  conectores verdes, com tamanho padronizado (o mesmo do quadro de funil).
  As outras três partes (páginas com redirecionamento, de onde vêm e
  redirecionados) trocam dentro do quadro pelo trilho. Nada roteia de
  verdade; é demonstração.
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

const NAV_FUNIS = {
  id: "funis",
  nome: "Meus funis",
  d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};
NAV_QUADRO.push(NAV_FUNIS);

/** Que tipo de bloco do redirecionador cada nó do funil vira. */
const BLOCO_POR_NO: Partial<Record<FunnelNodeType, BlocoTipo>> = {
  page_v3: "pagina",
  quiz: "pagina",
  pipeline: "loja",
  pipeline_ticket: "loja",
  shortcut_url: "pagina",
  link_whats: "pagina",
  link_split: "pagina",
  link_test_ab: "pagina",
  link_countries: "pagina",
};

const TIPOS: { id: MatchKind; nome: string }[] = [
  { id: "regiao", nome: "Por região" },
  { id: "dispositivo", nome: "Por aparelho" },
  { id: "sistema", nome: "Por sistema" },
  { id: "rede", nome: "Por rede" },
  { id: "origem", nome: "Por origem" },
  { id: "fatia", nome: "Por fatia %" },
];

/* ── Motor do quadro (arrastar/ligar), no mesmo modelo do quadro de funil ── */
const OFF = 8000; // origem da SVG de arestas (mundo negativo)
const GRIDF = 20; // snap dos blocos
const NODE_W = 280; // largura padrão do bloco (igual ao funil)
const clampF = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const snapF = (v: number) => Math.round(v / GRIDF) * GRIDF;

interface Viewport {
  x: number;
  y: number;
  k: number;
}
interface Tamanho {
  w: number;
  h: number;
}
interface Aresta {
  id: string;
  source: string;
  target: string;
}
type Interacao =
  | { modo: "pan"; px: number; py: number; ox: number; oy: number }
  | { modo: "node"; id: string; px: number; py: number; nx: number; ny: number }
  | { modo: "connect"; source: string }
  | null;

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
  const [navAtivo, setNavAtivo] = React.useState("cfg");

  const irPara = (id: string) => setNavAtivo(id);
  const tituloView =
    NAV_QUADRO.find((n) => n.id === navAtivo)?.nome ?? "Configurar";
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

  // Traz uma página/quiz do quadro de funil como origem (a página que
  // recebe o tráfego). Se já foi trazida, só seleciona; nada roteia — é
  // demonstração, igual ao resto da tela.
  const usarOrigemDoFunil = (d: FunnelDestino) => {
    const id = `funil-${d.id}`;
    setPaginas((ps) =>
      ps.some((p) => p.id === id)
        ? ps
        : [...ps, { id, nome: d.nome, url: d.url, regras: [] }],
    );
    setSelId(id);
  };

  // Os lugares do funil que ainda não viraram origem aqui.
  const origensNovasDoFunil = ORIGENS_FUNIL.filter(
    (d) => !paginas.some((p) => p.id === `funil-${d.id}`),
  );
  const gruposDestinoFunil = destinosPorCategoria(DESTINOS_FUNIL);

  const togglePais = (ruleId: string, code: string, atual: string[]) =>
    setRegra(ruleId, {
      paises: atual.includes(code)
        ? atual.filter((x) => x !== code)
        : [...atual, code],
    });

  const toggleDisp = (ruleId: string, id: DeviceKind, atual: DeviceKind[]) =>
    setRegra(ruleId, {
      dispositivos: atual.includes(id)
        ? atual.filter((x) => x !== id)
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

  // ── Estado do quadro: posições, viewport, tamanhos, ligações extras ──────
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [vp, setVp] = React.useState<Viewport>({ x: 60, y: 40, k: 0.85 });
  const [sizes, setSizes] = React.useState<Record<string, Tamanho>>({});
  const [extras, setExtras] = React.useState<Aresta[]>([]);
  const [conn, setConn] = React.useState<{
    wx: number;
    wy: number;
    source: string;
  } | null>(null);
  const [panning, setPanning] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [selEdge, setSelEdge] = React.useState<string | null>(null);
  const inter = React.useRef<Interacao>(null);
  const eseq = React.useRef(1);
  // Blocos de página que o dono adiciona pela paleta (do que está na VPS).
  const [blocos, setBlocos] = React.useState<BlocoPagina[]>([]);
  const [paleta, setPaleta] = React.useState(false);
  // O domínio da VPS escolhido na paleta (as páginas vêm dele).
  const [dominioSel, setDominioSel] = React.useState(DOMINIOS_VPS[0].host);
  const bseq = React.useRef(1);
  // Cofre: nome do fluxo atual do redirecionador e bump para reler listas.
  const [nomeRedir, setNomeRedir] = React.useState("Meu redirecionador");
  const [redirId, setRedirId] = React.useState<string | undefined>(undefined);
  const [avisoCofre, setAvisoCofre] = React.useState<string | null>(null);
  const [, refrescarCofre] = React.useReducer((x: number) => x + 1, 0);
  const avisar = (t: string) => {
    setAvisoCofre(t);
    window.setTimeout(() => setAvisoCofre(null), 2500);
  };

  // Traz um funil salvo para o quadro: cada página/loja vira um bloco
  // (com o endereço do funil) e as ligações viram arestas. Os blocos
  // ganham ids "f-<nó>" para não bater com os da paleta.
  const trazerFunil = (f: FunilSalvo) => {
    const nos = f.data.nodes.filter((n) => BLOCO_POR_NO[n.type]);
    if (nos.length === 0) {
      avisar("Esse funil não tem páginas nem lojas para trazer.");
      return;
    }
    const minX = Math.min(...nos.map((n) => n.x));
    const minY = Math.min(...nos.map((n) => n.y));
    const ids = new Set<string>();
    const novos: BlocoPagina[] = nos.map((n) => {
      const id = `f-${n.id}`;
      ids.add(id);
      const dom = n.pagina?.dominio;
      const url = dom
        ? `https://${dom}${n.pagina?.caminho || "/"}`
        : enderecoDoNo(n);
      return {
        id,
        tipo: BLOCO_POR_NO[n.type] ?? "pagina",
        nome: n.title,
        url,
        host: dom,
      };
    });
    setBlocos((bs) => [...bs.filter((b) => !ids.has(b.id)), ...novos]);
    setPos((ps) => {
      const p2 = { ...ps };
      for (const n of nos) {
        // Chega abaixo dos blocos do quadro (Fonte/regras/Saída), para não
        // cair em cima deles; dali o dono arrasta como quiser.
        p2[`f-${n.id}`] = {
          x: snapF(140 + (n.x - minX) * 0.8),
          y: snapF(960 + (n.y - minY) * 0.8),
        };
      }
      return p2;
    });
    setExtras((es) => [
      ...es.filter((e) => !e.id.startsWith("xf-")),
      ...f.data.edges
        .filter((e) => ids.has(`f-${e.source}`) && ids.has(`f-${e.target}`))
        .map((e) => ({
          id: `xf-${e.id}`,
          source: `f-${e.source}`,
          target: `f-${e.target}`,
        })),
    ]);
    setNavAtivo("cfg");
    avisar(`Funil “${f.nome}” trazido: ${novos.length} bloco(s).`);
    // Depois que a view "Configurar" monta, desliza o quadro até o grupo
    // recém-chegado, para o dono ver os blocos sem precisar procurar.
    const maxX = Math.max(...nos.map((n) => n.x));
    const maxY = Math.max(...nos.map((n) => n.y));
    const cx = 140 + ((maxX - minX) * 0.8) / 2 + NODE_W / 2;
    const cy = 960 + ((maxY - minY) * 0.8) / 2 + 70;
    window.setTimeout(() => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      setVp((v) => ({
        ...v,
        x: r.width / 2 - cx * v.k,
        y: r.height / 2 - cy * v.k,
      }));
    }, 60);
  };

  // Salvar/abrir o fluxo do redirecionador (tudo que precisa para reabrir).
  const salvarFluxo = () => {
    const reg = salvarRedir(
      nomeRedir,
      { paginas, blocos, pos, extras, dominioSel, vp, selId },
      redirId,
    );
    setRedirId(reg.id);
    refrescarCofre();
    avisar(`“${reg.nome}” salvo no cofre.`);
  };
  const abrirFluxo = (id: string) => {
    const r = listarRedirs().find((x) => x.id === id);
    if (!r) return;
    const e = r.estado as {
      paginas?: OfferPage[];
      blocos?: BlocoPagina[];
      pos?: Record<string, { x: number; y: number }>;
      extras?: Aresta[];
      dominioSel?: string;
      vp?: Viewport;
      selId?: string;
    };
    if (e.paginas) setPaginas(e.paginas);
    if (e.blocos) {
      setBlocos(e.blocos);
      const maior = Math.max(
        0,
        ...e.blocos.map((b) => Number(b.id.replace(/^b/, "")) || 0),
      );
      bseq.current = maior + 1;
    }
    if (e.pos) setPos(e.pos);
    if (e.extras) setExtras(e.extras);
    if (e.dominioSel) setDominioSel(e.dominioSel);
    if (e.vp) setVp(e.vp);
    if (e.selId) setSelId(e.selId);
    setRedirId(r.id);
    setNomeRedir(r.nome);
    setNavAtivo("cfg");
    avisar(`“${r.nome}” aberto.`);
  };

  // Adiciona um bloco novo no quadro (de uma página da VPS, ou em branco
  // para o dono preencher o endereço). Ganha um lugar padrão à direita.
  const addBloco = (tipo: BlocoTipo, pag?: PaginaVps) => {
    const id = `b${bseq.current++}`;
    const n = blocos.length;
    setBlocos((bs) => [
      ...bs,
      {
        id,
        tipo,
        nome: pag?.nome ?? `${rotuloTipo(tipo)} nova`,
        url: pag ? urlDaPagina(pag) : "",
        host: pag?.host ?? (pag ? undefined : dominioSel),
      },
    ]);
    setPos((ps) => ({ ...ps, [id]: { x: 480 + (n % 3) * 40, y: 620 + n * 40 } }));
    setPaleta(false);
  };

  const setBloco = (id: string, patch: Partial<BlocoPagina>) =>
    setBlocos((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeBloco = (id: string) => {
    setBlocos((bs) => bs.filter((b) => b.id !== id));
    setExtras((es) => es.filter((x) => x.source !== id && x.target !== id));
    setPos((ps) => {
      if (!(id in ps)) return ps;
      const resto = { ...ps };
      delete resto[id];
      return resto;
    });
  };

  // Semeia uma posição para cada bloco (Fonte, cada regra, Saída) que ainda
  // não tem uma. Blocos ganham um lugar padrão em colunas: Fonte à esquerda,
  // regras no meio (empilhadas), Saída à direita.
  React.useEffect(() => {
    // Só posições de layout (não dados): semeia um lugar para blocos novos
    // e mantém os que o dono já arrastou. É idempotente — só escreve quando
    // falta alguém.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- semeadura de layout, idempotente
    setPos((prev) => {
      const next = { ...prev };
      let mudou = false;
      if (!next.fonte) {
        next.fonte = { x: 0, y: 200 };
        mudou = true;
      }
      if (!next.saida) {
        next.saida = { x: 860, y: 160 };
        mudou = true;
      }
      pagina.regras.forEach((r, i) => {
        if (!next[r.id]) {
          next[r.id] = { x: 400, y: 40 + i * 380 };
          mudou = true;
        }
      });
      return mudou ? next : prev;
    });
  }, [pagina.regras]);

  const tam = React.useCallback(
    (id: string): Tamanho => sizes[id] ?? { w: NODE_W, h: 120 },
    [sizes],
  );
  const p = React.useCallback(
    (id: string) => pos[id] ?? { x: 0, y: 0 },
    [pos],
  );

  const medir = React.useCallback((id: string, w: number, h: number) => {
    setSizes((prev) => {
      const a = prev[id];
      if (a && a.w === w && a.h === h) return prev;
      return { ...prev, [id]: { w, h } };
    });
  }, []);

  // As arestas do fluxo: Fonte → cada regra → Saída (seguem os blocos ao
  // arrastar). Mais as ligações extras que o dono desenhar.
  const arestasFluxo = React.useMemo<Aresta[]>(() => {
    const es: Aresta[] = [];
    if (pagina.regras.length === 0) {
      es.push({ id: "fx-fonte-saida", source: "fonte", target: "saida" });
    } else {
      for (const r of pagina.regras) {
        es.push({ id: `fx-fonte-${r.id}`, source: "fonte", target: r.id });
        es.push({ id: `fx-${r.id}-saida`, source: r.id, target: "saida" });
      }
    }
    return es;
  }, [pagina.regras]);
  const arestas = React.useMemo(
    () => [...arestasFluxo, ...extras],
    [arestasFluxo, extras],
  );

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
  const paraMundoRef = React.useRef(paraMundo);
  React.useEffect(() => {
    paraMundoRef.current = paraMundo;
  }, [paraMundo]);

  // Roda do mouse: zoom mirando o cursor (listener nativo, não passivo).
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
        const k = clampF(v.k * factor, 0.4, 1.8);
        const escala = k / v.k;
        return { k, x: px - (px - v.x) * escala, y: py - (py - v.y) * escala };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [navAtivo]);

  // Um par move/up global enquanto há interação (pan, arrastar nó, ligar).
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
        const nx = snapF(it.nx + dx);
        const ny = snapF(it.ny + dy);
        setPos((ps) => ({ ...ps, [it.id]: { x: nx, y: ny } }));
      } else if (it.modo === "connect") {
        setConn({
          ...paraMundoRef.current(e.clientX, e.clientY),
          source: it.source,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      const it = inter.current;
      if (it && it.modo === "connect") {
        const alvo = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-in]");
        const destino = alvo?.dataset.in;
        if (destino && destino !== it.source) {
          setExtras((es) =>
            es.some((x) => x.source === it.source && x.target === destino) ||
            arestasFluxo.some(
              (x) => x.source === it.source && x.target === destino,
            )
              ? es
              : [
                  ...es,
                  { id: `x${eseq.current++}`, source: it.source, target: destino },
                ],
          );
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
  }, [vp.k, arestasFluxo]);

  // Delete apaga a ligação extra selecionada (fora de campos de texto).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA"))
        return;
      if ((e.key === "Delete" || e.key === "Backspace") && selEdge) {
        e.preventDefault();
        setExtras((es) => es.filter((x) => x.id !== selEdge));
        setSelEdge(null);
      }
      if (e.key === "Escape") setSelEdge(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selEdge]);

  const iniciarPan = (e: React.PointerEvent) => {
    setSelEdge(null);
    inter.current = {
      modo: "pan",
      px: e.clientX,
      py: e.clientY,
      ox: vp.x,
      oy: vp.y,
    };
    setPanning(true);
  };

  // Começa a arrastar o bloco — só quando o toque não é num controle
  // (botão, campo, seletor), para os controles continuarem funcionando.
  const iniciarArrasto = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const alvo = e.target as HTMLElement;
    if (alvo.closest("input,select,textarea,button,a,[data-port]")) return;
    setDragId(id);
    const at = pos[id] ?? { x: 0, y: 0 };
    inter.current = {
      modo: "node",
      id,
      px: e.clientX,
      py: e.clientY,
      nx: at.x,
      ny: at.y,
    };
  };

  const iniciarConexao = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    inter.current = { modo: "connect", source: id };
    setConn({ ...paraMundo(e.clientX, e.clientY), source: id });
  };

  const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.k})`;
  const curva = (edge: Aresta) => {
    const sp = p(edge.source);
    const tp = p(edge.target);
    const ss = tam(edge.source);
    const ts = tam(edge.target);
    const sx = sp.x + ss.w;
    const sy = sp.y + ss.h / 2;
    const tx = tp.x;
    const ty = tp.y + ts.h / 2;
    const dx = Math.max(40, Math.abs(tx - sx) / 2);
    return `M ${sx + OFF} ${sy + OFF} C ${sx + dx + OFF} ${sy + OFF}, ${tx - dx + OFF} ${ty + OFF}, ${tx + OFF} ${ty + OFF}`;
  };

  return (
    <div className="ofr">
      <div className="ofr__stage ofr__stage--flow">
        {/* O quadro do redirecionador — tela cheia, sem moldura; o menu do
            trilho troca a view DENTRO do quadro. */}
        <section className="wf wf--full" aria-label="Roteador de ofertas">
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
                redirecionador.fluxo — {tituloView}
              </span>
              <span className="wf__top-meta">
                {totalDeRedirecionamentos(paginas)} redirecionamento(s) ·{" "}
                {comRedir.length} página(s)
              </span>
              <span className="wf__status">
                <i />
                demonstração
              </span>
            </header>
            <div className="wf__canvas" data-view={navAtivo}>
              {navAtivo === "cfg" && (
                <div
                  className="wf__flow"
                  ref={rootRef}
                  data-panning={panning || undefined}
                  onPointerDown={iniciarPan}
                >
                  <div className="wf__world" style={{ transform }}>
                    <div className="wf__dots" aria-hidden />

                    <svg className="wf__edges">
                      {arestas.map((edge) => {
                        const extra = edge.id.startsWith("x");
                        const d = curva(edge);
                        return (
                          <g key={edge.id}>
                            {extra && (
                              <path
                                className="wf__edge-hit"
                                d={d}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  setSelEdge(edge.id);
                                }}
                              />
                            )}
                            <path
                              className="wf__edge"
                              d={d}
                              data-selected={selEdge === edge.id || undefined}
                            />
                          </g>
                        );
                      })}
                      {conn &&
                        (() => {
                          const sp = p(conn.source);
                          const ss = tam(conn.source);
                          const sx = sp.x + ss.w;
                          const sy = sp.y + ss.h / 2;
                          const dx = Math.max(40, Math.abs(conn.wx - sx) / 2);
                          const d = `M ${sx + OFF} ${sy + OFF} C ${sx + dx + OFF} ${sy + OFF}, ${conn.wx - dx + OFF} ${conn.wy + OFF}, ${conn.wx + OFF} ${conn.wy + OFF}`;
                          return <path className="wf__edge--temp" d={d} />;
                        })()}
                    </svg>

                    {/* ── Bloco Fonte ─────────────────────────────────── */}
                    <NodeShell
                      id="fonte"
                      pos={p("fonte")}
                      dragging={dragId === "fonte"}
                      hasOut
                      onDrag={iniciarArrasto}
                      onConnect={iniciarConexao}
                      onMeasure={medir}
                    >
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
                            <span className="ofr__label">
                              Página que recebe o tráfego
                            </span>
                            <div className="ofr__pills">
                              {paginas.map((pg) => (
                                <button
                                  key={pg.id}
                                  type="button"
                                  className="ofr__pill"
                                  data-on={pg.id === selId}
                                  onClick={() => setSelId(pg.id)}
                                >
                                  {pg.nome}
                                </button>
                              ))}
                            </div>
                            <small className="ofr__hint">
                              Origem: {pagina.url} — quem não bater em regra
                              nenhuma fica aqui.
                            </small>
                          </div>

                          {origensNovasDoFunil.length > 0 && (
                            <div className="ofr__field ofr__from-funnel">
                              <span className="ofr__label">
                                Do quadro de funil{" "}
                                <span className="ofr__from-funnel-tag">
                                  conectado
                                </span>
                              </span>
                              <div className="ofr__pills">
                                {origensNovasDoFunil.map((d) => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    className="ofr__pill ofr__pill--add"
                                    onClick={() => usarOrigemDoFunil(d)}
                                    title={`Usar "${d.nome}" (${d.url}) como origem`}
                                  >
                                    + {d.nome}
                                  </button>
                                ))}
                              </div>
                              <small className="ofr__hint">
                                Puxe uma página ou quiz do funil para receber o
                                tráfego aqui.
                              </small>
                            </div>
                          )}
                        </div>
                      </div>
                    </NodeShell>

                    {/* ── Um bloco por regra ──────────────────────────── */}
                    {pagina.regras.map((r, i) => (
                      <NodeShell
                        key={r.id}
                        id={r.id}
                        pos={p(r.id)}
                        dragging={dragId === r.id}
                        hasIn
                        hasOut
                        onDrag={iniciarArrasto}
                        onConnect={iniciarConexao}
                        onMeasure={medir}
                      >
                        <div className="ofr__rule" data-off={!r.ativo}>
                          <div className="ofr__rule-head">
                            <span className="ofr__rule-n">{i + 1}</span>
                            <div
                              className="ofr__seg"
                              role="group"
                              aria-label="Tipo da regra"
                            >
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
                                onChange={(e) =>
                                  setRegra(r.id, { ativo: e.target.checked })
                                }
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
                                  setFiltroPais((f) => ({
                                    ...f,
                                    [r.id]: e.target.value,
                                  }))
                                }
                              />
                              <div className="ofr__chips">
                                {paisesDaRegra(r).map((pais) => (
                                  <button
                                    key={pais.code}
                                    type="button"
                                    className="ofr__chip"
                                    data-on={r.paises.includes(pais.code)}
                                    aria-pressed={r.paises.includes(pais.code)}
                                    onClick={() =>
                                      togglePais(r.id, pais.code, r.paises)
                                    }
                                  >
                                    <CountryFlag code={pais.code} /> {pais.nome}
                                  </button>
                                ))}
                                {paisesDaRegra(r).length === 0 && (
                                  <span className="ofr__hint">
                                    Digite acima para achar um país (são todos do
                                    mundo).
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
                                  onClick={() =>
                                    toggleDisp(r.id, d.id, r.dispositivos)
                                  }
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
                                  onClick={() =>
                                    toggleSis(r.id, x.id, r.sistemas ?? [])
                                  }
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
                                  onClick={() =>
                                    toggleRede(r.id, x.id, r.redes ?? [])
                                  }
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
                                  setRegra(r.id, {
                                    percentual: Number(e.target.value),
                                  })
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
                              onChange={(e) =>
                                setRegra(r.id, { destino: e.target.value })
                              }
                            />
                          </label>

                          {gruposDestinoFunil.length > 0 && (
                            <div className="ofr__funnel-pick">
                              <span className="ofr__funnel-pick-lead">
                                ou escolha do funil:
                              </span>
                              {gruposDestinoFunil.map((g) => (
                                <div className="ofr__funnel-group" key={g.categoria}>
                                  <span className="ofr__funnel-group-name">
                                    {ROTULO_CATEGORIA[g.categoria]}
                                  </span>
                                  {g.itens.map((d) => (
                                    <button
                                      key={d.id}
                                      type="button"
                                      className="ofr__chip-funnel"
                                      data-on={r.destino === d.url}
                                      onClick={() =>
                                        setRegra(r.id, { destino: d.url })
                                      }
                                      title={`${d.nome} — ${d.url}`}
                                    >
                                      {d.nome}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="ofr__rule-resumo">
                            {descreverRegra(r)} →{" "}
                            <b>{r.destino.trim() || "(defina o destino)"}</b>
                          </p>
                        </div>
                      </NodeShell>
                    ))}

                    {/* ── Bloco Saída (simulador) ─────────────────────── */}
                    <NodeShell
                      id="saida"
                      pos={p("saida")}
                      dragging={dragId === "saida"}
                      hasIn
                      onDrag={iniciarArrasto}
                      onConnect={iniciarConexao}
                      onMeasure={medir}
                    >
                      <div className="wf__node wf__saida">
                        <header className="wf__node-head">
                          <span className="wf__node-ico" aria-hidden>
                            ▣
                          </span>
                          <span className="wf__node-title">Saída</span>
                          <span className="wf__node-dot" aria-hidden />
                        </header>
                        <div className="ofr__sim">
                          <div className="ofr__card-head">Simular um visitante</div>
                          <div className="ofr__sim-controls">
                            <label className="ofr__inline">
                              <span className="ofr__label">Região</span>
                              <select
                                className="ofr__select"
                                value={visitante.pais}
                                onChange={(e) =>
                                  setVisitante((v) => ({
                                    ...v,
                                    pais: e.target.value,
                                  }))
                                }
                              >
                                {PAISES.map((pais) => (
                                  <option key={pais.code} value={pais.code}>
                                    {pais.nome}
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
                                onChange={(e) =>
                                  setSorteio(Number(e.target.value))
                                }
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
                                {nomeDaOrigem(visitante.origem ?? "facebook")} ·
                                roleta {sorteio}
                              </span>
                              <span className="ofr__verdict-dest">
                                → {decisao.destino}
                              </span>
                              {decisao.regra && (
                                <span className="ofr__verdict-why">
                                  pela regra: {descreverRegra(decisao.regra)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </NodeShell>

                    {/* ── Blocos de página que o dono adicionou (VPS) ─── */}
                    {blocos.map((b) => {
                      const f = ferramenta(b.tipo);
                      return (
                        <NodeShell
                          key={b.id}
                          id={b.id}
                          pos={p(b.id)}
                          dragging={dragId === b.id}
                          hasIn
                          hasOut
                          onDrag={iniciarArrasto}
                          onConnect={iniciarConexao}
                          onMeasure={medir}
                        >
                          <div
                            className="wf__node wf__page"
                            data-tipo={b.tipo}
                            style={
                              { "--tipo-cor": f.cor } as React.CSSProperties
                            }
                          >
                            <header className="wf__node-head">
                              <span className="wf__page-ico" aria-hidden>
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d={f.icone} />
                                </svg>
                              </span>
                              <span className="wf__node-title">{f.nome}</span>
                              <button
                                type="button"
                                className="wf__page-del"
                                aria-label={`Remover ${f.nome}`}
                                onClick={() => removeBloco(b.id)}
                              >
                                ✕
                              </button>
                            </header>
                            <div className="wf__page-body">
                              <input
                                className="ofr__input"
                                value={b.nome}
                                maxLength={120}
                                aria-label="Nome do bloco"
                                onChange={(e) =>
                                  setBloco(b.id, { nome: e.target.value })
                                }
                              />
                              <input
                                className="ofr__input"
                                value={b.url}
                                maxLength={2048}
                                placeholder="https://… (endereço na VPS)"
                                aria-label="Endereço do bloco"
                                onChange={(e) =>
                                  setBloco(b.id, { url: e.target.value })
                                }
                              />
                              {b.host && (
                                <span className="wf__page-host">
                                  <i aria-hidden />
                                  hospedado na VPS · {b.host}
                                </span>
                              )}
                            </div>
                          </div>
                        </NodeShell>
                      );
                    })}
                  </div>

                  <p className="wf__flow-hint" aria-hidden>
                    Arraste os blocos • puxe da bolinha ▸ de um bloco até outro
                    para ligar • roda do mouse dá zoom
                  </p>
                  <div className="wf__flow-acts">
                    <button
                      type="button"
                      className="wf__flow-add wf__flow-add--ghost"
                      onClick={() => setPaleta((v) => !v)}
                      data-on={paleta || undefined}
                    >
                      + Bloco
                    </button>
                    <button
                      type="button"
                      className="wf__flow-add"
                      onClick={addRegra}
                    >
                      + Adicionar regra
                    </button>
                  </div>

                  {paleta && (
                    <div
                      className="wf__palette"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="wf__palette-head">
                        <b>Adicionar bloco</b>
                        <span>Escolha o domínio da VPS e o que ele hospeda</span>
                        <button
                          type="button"
                          className="wf__palette-x"
                          aria-label="Fechar"
                          onClick={() => setPaleta(false)}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="wf__palette-dominios" role="group" aria-label="Domínio da VPS">
                        {DOMINIOS_VPS.map((d) => {
                          const r = resumoDoDominio(d.host);
                          const total =
                            r.pagina + r.pagina_fake + r.oferta + r.loja + r.produto;
                          return (
                            <button
                              key={d.host}
                              type="button"
                              className="wf__dominio"
                              data-on={dominioSel === d.host || undefined}
                              onClick={() => setDominioSel(d.host)}
                            >
                              <span className="wf__dominio-host">
                                <i data-estado={d.estado} aria-hidden />
                                {d.host}
                              </span>
                              <span className="wf__dominio-sub">
                                {d.titulo} · {total} página(s)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="wf__palette-body">
                        {FERRAMENTAS.map((f) => {
                          const hosp = paginasDoDominioTipo(dominioSel, f.tipo);
                          return (
                            <div className="wf__tool" key={f.tipo}>
                              <div
                                className="wf__tool-head"
                                style={
                                  { "--tipo-cor": f.cor } as React.CSSProperties
                                }
                              >
                                <span className="wf__tool-ico" aria-hidden>
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d={f.icone} />
                                  </svg>
                                </span>
                                <div>
                                  <b>{f.nome}</b>
                                  <span>{f.descricao}</span>
                                </div>
                                <button
                                  type="button"
                                  className="wf__tool-new"
                                  onClick={() => addBloco(f.tipo)}
                                >
                                  + Em branco
                                </button>
                              </div>
                              {hosp.length > 0 ? (
                                <div className="wf__tool-hosted">
                                  {hosp.map((h) => (
                                    <button
                                      key={h.id}
                                      type="button"
                                      className="wf__tool-item"
                                      onClick={() => addBloco(f.tipo, h)}
                                      title={urlDaPagina(h)}
                                    >
                                      <b>{h.nome}</b>
                                      <span>{h.caminho}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="wf__tool-hosted">
                                  <span className="ofr__hint">
                                    Nada desse tipo em {dominioSel}.
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {navAtivo === "funis" && (
                <div className="wf__view ofr__funis">
                  <div className="ofr__card-head">Meus funis</div>
                  <p className="ofr__funis-hint">
                    Traga um funil salvo no quadro do funil para cá: cada
                    página e loja vira um bloco, já ligadas, para você
                    configurar o redirecionamento do jeito que quiser.
                  </p>
                  {avisoCofre && (
                    <div className="ofr__funis-aviso">{avisoCofre}</div>
                  )}
                  <div className="ofr__funis-grid">
                    <section className="ofr__funis-col">
                      <h3>Funis do quadro</h3>
                      {listarFunis().length === 0 ? (
                        <p className="ofr__empty">
                          Nenhum funil salvo. No quadro do funil, abra “Meus
                          funis” (ícone de pasta) e clique em Salvar.
                        </p>
                      ) : (
                        <ul className="ofr__funis-lista">
                          {listarFunis().map((f) => (
                            <li key={f.id}>
                              <div className="ofr__funis-info">
                                <b>{f.nome}</b>
                                <span>
                                  {f.data.nodes.length} bloco(s) ·{" "}
                                  {quando(f.atualizadoEm)}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="ofr__btn ofr__btn--primary"
                                onClick={() => trazerFunil(f)}
                              >
                                Trazer para o quadro →
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section className="ofr__funis-col">
                      <h3>Fluxos do redirecionador</h3>
                      <div className="ofr__funis-salvar">
                        <input
                          className="ofr__input"
                          value={nomeRedir}
                          maxLength={120}
                          aria-label="Nome do fluxo do redirecionador"
                          onChange={(e) => setNomeRedir(e.target.value)}
                        />
                        <button
                          type="button"
                          className="ofr__btn ofr__btn--primary"
                          onClick={salvarFluxo}
                        >
                          {redirId ? "Salvar alterações" : "Salvar este fluxo"}
                        </button>
                      </div>
                      {listarRedirs().length === 0 ? (
                        <p className="ofr__empty">
                          Nenhum fluxo salvo ainda.
                        </p>
                      ) : (
                        <ul className="ofr__funis-lista">
                          {listarRedirs().map((r) => (
                            <li key={r.id} data-atual={r.id === redirId || undefined}>
                              <div className="ofr__funis-info">
                                <b>{r.nome}</b>
                                <span>
                                  {quando(r.atualizadoEm)}
                                  {r.id === redirId ? " · aberto" : ""}
                                </span>
                              </div>
                              <div className="ofr__funis-acoes">
                                {r.id !== redirId && (
                                  <button
                                    type="button"
                                    className="ofr__btn"
                                    onClick={() => abrirFluxo(r.id)}
                                  >
                                    Abrir
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="ofr__btn ofr__btn--danger"
                                  aria-label={`Apagar ${r.nome}`}
                                  onClick={() => {
                                    removerRedir(r.id);
                                    if (r.id === redirId) setRedirId(undefined);
                                    refrescarCofre();
                                  }}
                                >
                                  Apagar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                  <p className="ofr__funis-hint">
                    Fica salvo neste navegador (Fase 1). Com o banco ligado,
                    vale em qualquer aparelho.
                  </p>
                </div>
              )}
              {navAtivo === "pgs" && (
                <div className="wf__view">
                  <div className="ofr__card-head">
                    Páginas com redirecionamento
                  </div>
                  {comRedir.length === 0 ? (
                    <p className="ofr__empty">
                      Nenhuma página tem redirecionamento.
                    </p>
                  ) : (
                    <div className="ofr__pages">
                      {comRedir.map((pg) => (
                        <div className="ofr__page" key={pg.id}>
                          <div className="ofr__page-head">
                            <b>{pg.nome}</b>
                            <span className="ofr__page-url">{pg.url}</span>
                          </div>
                          <ul className="ofr__page-rules">
                            {pg.regras
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
                </div>
              )}
              {navAtivo === "onde" && (
                <div className="wf__view">
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
                </div>
              )}
              {navAtivo === "redir" && (
                <div className="wf__view">
                  <div className="ofr__card-head">
                    Redirecionados — região e aparelho
                  </div>
                  <p className="ofr__sim-lead">
                    Quem tentou entrar e foi mandado para outra página —{" "}
                    {totalRedirecionados(REDIRECIONADOS_EXEMPLO)} no total
                    (demonstração).
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
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * A casca de um bloco no quadro: posiciona pelo {x,y}, reporta o tamanho
 * (para os conectores), arrasta pela área livre e traz as bolinhas de
 * entrada/saída para ligar um bloco ao outro.
 */
function NodeShell({
  id,
  pos,
  dragging,
  hasIn,
  hasOut,
  onDrag,
  onConnect,
  onMeasure,
  children,
}: {
  id: string;
  pos: { x: number; y: number };
  dragging?: boolean;
  hasIn?: boolean;
  hasOut?: boolean;
  onDrag: (e: React.PointerEvent, id: string) => void;
  onConnect: (e: React.PointerEvent, id: string) => void;
  onMeasure: (id: string, w: number, h: number) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onMeasure(id, el.offsetWidth, el.offsetHeight);
    report();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(report) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [id, onMeasure]);

  return (
    <div
      ref={ref}
      className="wf__fnode"
      data-in={id}
      data-dragging={dragging || undefined}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => onDrag(e, id)}
    >
      {hasIn && <span className="wf__port wf__port--in" data-port aria-hidden />}
      {children}
      {hasOut && (
        <button
          type="button"
          className="wf__port wf__port--out"
          data-port
          aria-label="Ligar a outro bloco"
          onPointerDown={(e) => onConnect(e, id)}
        />
      )}
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
