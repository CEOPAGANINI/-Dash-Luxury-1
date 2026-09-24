"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  CircleHelp,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  House,
  LayoutGrid,
  Package,
  ShoppingCart,
  Tags,
  TrendingDown,
  TrendingUp,
  Grip,
  Link2,
  Maximize2,
  Minus,
  Monitor,
  Plus,
  Save,
  ShoppingBag,
  Smartphone,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  PAGE_KIND_LABELS,
  FLOW_TEMPLATE_LABELS,
  createFlowTemplate,
  connectPages,
  createFlowPage,
  parseFlow,
  removeFlowPage,
  validateDestinationUrl,
  type FlowPage,
  type LandingFlow,
  type PageKind,
  type FlowTemplateKind,
} from "./flow-model";
import { useLandingFlowDraft } from "./flow-store";
import { PageExportPanel } from "./page-export-panel";
import type { SitePackage } from "./site-package";
import styles from "./landing-flow-editor.module.css";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 246;
const clampPosition = (n: number) => Math.max(0, Math.min(2000, n));
const ICONS = {
  home: House,
  collection: LayoutGrid,
  category: Tags,
  product: Package,
  cart: ShoppingCart,
  upsell: TrendingUp,
  downsell: TrendingDown,
  landing: FileText,
  checkout: ShoppingBag,
  "thank-you": CheckCheck,
  external: ExternalLink,
};

function downloadFlow(flow: LandingFlow) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(flow, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "landing-pages-orbit.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LandingFlowEditor({ storageId }: { storageId: string }) {
  const draft = useLandingFlowDraft(storageId);
  if (!draft.ready)
    return (
      <p className={styles.loading} role="status">
        Abrindo seu espaço de páginas…
      </p>
    );
  return (
    <Editor
      key={storageId}
      initialFlow={draft.flow}
      storageNotice={draft.notice}
      saveDraft={draft.save}
    />
  );
}

function Editor({
  initialFlow,
  storageNotice,
  saveDraft,
}: {
  initialFlow: LandingFlow;
  storageNotice: string;
  saveDraft: (flow: LandingFlow) => boolean;
}) {
  const [flow, setFlow] = React.useState(initialFlow);
  const [saved, setSaved] = React.useState(() => JSON.stringify(initialFlow));
  const [selectedId, setSelectedId] = React.useState(
    initialFlow.pages[0]?.id ?? "",
  );
  /* O cartão aberto mostra, dentro dele, a configuração da própria página.
     Um por vez: abrir outro fecha o anterior. */
  const [aberta, setAberta] = React.useState<string | null>(
    initialFlow.pages[0]?.id ?? null,
  );
  const [alturaAberta, setAlturaAberta] = React.useState(NODE_HEIGHT);
  const cartaoAberto = React.useRef<HTMLElement>(null);
  const [kind, setKind] = React.useState<PageKind>("landing");
  const [view, setView] = React.useState<"flow" | "files">("flow");
  const [pagePackages, setPagePackages] = React.useState<
    Record<string, SitePackage>
  >({});
  const [packageRevision, setPackageRevision] = React.useState(0);
  const [templateKind, setTemplateKind] =
    React.useState<FlowTemplateKind>("store");
  const [targetId, setTargetId] = React.useState("");
  const [connectionLabel, setConnectionLabel] = React.useState("Continuar");
  const [zoom, setZoom] = React.useState(1);
  const [message, setMessage] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewId, setPreviewId] = React.useState(selectedId);
  const [mobilePreview, setMobilePreview] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [imported, setImported] = React.useState<LandingFlow | null>(null);
  const [undoCount, setUndoCount] = React.useState(0);
  const history = React.useRef<LandingFlow[]>([]);
  const viewport = React.useRef<HTMLDivElement>(null);
  const upload = React.useRef<HTMLInputElement>(null);
  const importSequence = React.useRef(0);
  const drag = React.useRef<{
    id: string;
    x: number;
    y: number;
    pointerX: number;
    pointerY: number;
  } | null>(null);
  const selected =
    flow.pages.find((page) => page.id === selectedId) ?? flow.pages[0];
  const previewPage =
    flow.pages.find((page) => page.id === previewId) ?? selected;
  const dirty = JSON.stringify(flow) !== saved;
  const hasPackages = Object.keys(pagePackages).length > 0;
  const pending = flow.pages.filter(
    (page) => !validateDestinationUrl(page.url),
  ).length;
  const boardWidth = Math.max(
    1100,
    ...flow.pages.map((page) => page.x + NODE_WIDTH + 60),
  );
  const paginaAberta = flow.pages.find((page) => page.id === aberta) ?? null;
  const boardHeight = Math.max(
    660,
    ...flow.pages.map((page) => page.y + NODE_HEIGHT + 60),
    paginaAberta ? paginaAberta.y + alturaAberta + 60 : 0,
  );

  /* O cartão aberto cresce com o formulário; o quadro cresce junto, para
     o fim da configuração nunca ficar fora da área de blocos. */
  React.useLayoutEffect(() => {
    const cartao = cartaoAberto.current;
    if (!cartao) return;
    const medir = () =>
      setAlturaAberta((atual) =>
        atual === cartao.offsetHeight ? atual : cartao.offsetHeight,
      );
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(cartao);
    return () => observador.disconnect();
  }, [aberta]);

  React.useEffect(() => {
    if (!dirty && !hasPackages) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, hasPackages]);
  React.useEffect(
    () => () => {
      importSequence.current += 1;
    },
    [],
  );

  function remember() {
    history.current = [...history.current.slice(-29), flow];
    setUndoCount(history.current.length);
  }
  function change(next: LandingFlow) {
    remember();
    setFlow(next);
    setMessage("");
  }
  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setFlow(previous);
    setUndoCount(history.current.length);
    setMessage("Última alteração desfeita.");
  }
  function updatePage(id: string, patch: Partial<FlowPage>) {
    change({
      ...flow,
      pages: flow.pages.map((page) =>
        page.id === id ? { ...page, ...patch } : page,
      ),
    });
  }
  function addPage() {
    if (flow.pages.length >= 20) return;
    const page = createFlowPage(kind, flow.pages.length);
    change({ ...flow, pages: [...flow.pages, page] });
    setSelectedId(page.id);
    setAberta(page.id);
    setMessage(
      `${PAGE_KIND_LABELS[kind]} adicionada. Configure a página no próprio cartão.`,
    );
  }
  function save() {
    if (!parseFlow(flow)) {
      setMessage(
        "Revise nomes e endereços antes de salvar. Use https:// ou um caminho como /minha-pagina.",
      );
      return;
    }
    if (saveDraft(flow)) {
      setSaved(JSON.stringify(flow));
      setMessage(
        "Rascunho salvo neste navegador. Nenhuma página pública foi alterada.",
      );
    } else
      setMessage(
        "Não foi possível salvar neste navegador. Exporte o fluxo para guardar suas alterações.",
      );
  }
  function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const result = connectPages(flow, selected.id, targetId, connectionLabel);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    change(result.flow);
    setTargetId("");
    setMessage("Ligação adicionada ao fluxo.");
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const sequence = ++importSequence.current;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) {
      setMessage("Escolha um JSON de até 200 KB.");
      return;
    }
    try {
      const parsed = parseFlow(JSON.parse(await file.text()));
      if (sequence !== importSequence.current) return;
      if (!parsed) {
        setMessage(
          "Esse arquivo não é um fluxo Orbit válido. Verifique páginas, endereços e ligações.",
        );
        return;
      }
      setImported(parsed);
    } catch {
      if (sequence !== importSequence.current) return;
      setMessage(
        "Não foi possível ler o arquivo. Escolha um fluxo JSON exportado pelo editor.",
      );
    }
  }
  function fit() {
    setZoom(
      Math.max(
        0.35,
        Math.min(1, (viewport.current?.clientWidth ?? boardWidth) / boardWidth),
      ),
    );
    viewport.current?.scrollTo({ left: 0, top: 0, behavior: "instant" });
  }
  function beginDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    page: FlowPage,
  ) {
    if (event.button !== 0 || !window.matchMedia("(min-width: 801px)").matches)
      return;
    remember();
    setSelectedId(page.id);
    drag.current = {
      id: page.id,
      x: page.x,
      y: page.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start) return;
    const x = clampPosition(start.x + (event.clientX - start.pointerX) / zoom);
    const y = clampPosition(start.y + (event.clientY - start.pointerY) / zoom);
    setFlow((current) => ({
      ...current,
      pages: current.pages.map((page) =>
        page.id === start.id ? { ...page, x, y } : page,
      ),
    }));
  }
  function moveWithKeys(event: React.KeyboardEvent, page: FlowPage) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
    };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    updatePage(page.id, {
      x: clampPosition(page.x + delta[0]),
      y: clampPosition(page.y + delta[1]),
    });
  }

  /** A configuração mora dentro do cartão da própria página. */
  function configuracao(pagina: FlowPage) {
    return (
      <div
        id={`config-${pagina.id}`}
        role="region"
        aria-label={`Configuração de ${pagina.name || "página sem nome"}`}
        className={styles.nodeConfig}
      >
        <header className={styles.configHeader}>
          <h3>Configurar página</h3>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remover ${pagina.name}`}
            onClick={() => {
              change(removeFlowPage(flow, pagina.id));
              setSelectedId(
                flow.pages.find((page) => page.id !== pagina.id)?.id ?? "",
              );
              setAberta(null);
              setMessage("Página removida. Use Desfazer para recuperá-la.");
            }}
          >
            <Trash2 size={16} />
          </button>
        </header>
        <div className={styles.fields}>
          <label>
            Nome da página
            <input
              value={pagina.name}
              maxLength={120}
              onChange={(event) =>
                updatePage(pagina.id, { name: event.target.value })
              }
            />
          </label>
          <label>
            Endereço da página
            <input
              value={pagina.url}
              maxLength={2048}
              placeholder="https://sualoja.com/oferta"
              aria-invalid={Boolean(
                pagina.url && !validateDestinationUrl(pagina.url),
              )}
              onChange={(event) =>
                updatePage(pagina.id, { url: event.target.value })
              }
            />
            <small>
              {pagina.url && !validateDestinationUrl(pagina.url)
                ? "Use https:// ou um caminho interno iniciado por /."
                : "Isso não publica nem cria a rota."}
            </small>
          </label>
          <label>
            Título da landing page
            <input
              value={pagina.headline}
              maxLength={240}
              onChange={(event) =>
                updatePage(pagina.id, {
                  headline: event.target.value,
                })
              }
            />
          </label>
          <label>
            Descrição
            <textarea
              rows={3}
              value={pagina.description}
              maxLength={2000}
              onChange={(event) =>
                updatePage(pagina.id, {
                  description: event.target.value,
                })
              }
            />
          </label>
          <label>
            Texto do botão
            <input
              value={pagina.buttonLabel}
              maxLength={80}
              onChange={(event) =>
                updatePage(pagina.id, {
                  buttonLabel: event.target.value,
                })
              }
            />
          </label>
          <label>
            Imagem de capa <span className={styles.optional}>(opcional)</span>
            <input
              value={pagina.imageUrl}
              maxLength={2048}
              placeholder="https://…/imagem.jpg"
              aria-invalid={Boolean(
                pagina.imageUrl && !validateDestinationUrl(pagina.imageUrl),
              )}
              onChange={(event) =>
                updatePage(pagina.id, {
                  imageUrl: event.target.value,
                })
              }
            />
          </label>
          <button
            type="button"
            className={styles.previewButton}
            onClick={() => {
              setPreviewId(pagina.id);
              setPreviewOpen(true);
            }}
          >
            <Monitor size={16} /> Pré-visualizar página
          </button>
          <button
            type="button"
            className={styles.previewButton}
            onClick={() => setView("files")}
          >
            <Download size={16} /> Exportar esta página (ZIP)
          </button>
        </div>
        <form className={styles.linkForm} onSubmit={connect}>
          <h3>
            <Link2 size={16} /> Ligar a outra página
          </h3>
          <p>
            Escolha o próximo destino a partir de {pagina.name || "esta página"}
            .
          </p>
          <label>
            Destino
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              required
            >
              <option value="">Selecione uma página</option>
              {flow.pages
                .filter((page) => page.id !== pagina.id)
                .map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name || "Página sem nome"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Nome da ligação
            <input
              value={connectionLabel}
              maxLength={100}
              onChange={(event) => setConnectionLabel(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={
              !targetId ||
              !connectionLabel.trim() ||
              flow.connections.length >= 40
            }
          >
            <Plus size={16} /> Criar ligação
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.root} data-orbit-workspace>
      <div className={styles.breadcrumb}>
        <Link href="/landing-pages">Páginas</Link>
        <span>/</span>
        <span>Editor visual</span>
      </div>
      <header className={styles.header}>
        <div>
          <div className={styles.titleLine}>
            <h2>
              Seu espaço de páginas<span>.</span>
            </h2>
            <span className={styles.draftBadge}>Rascunho</span>
          </div>
          <p>
            Monte seu funil e exporte cada página como um site estático em ZIP.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => upload.current?.click()}>
            <Upload size={16} /> Importar fluxo
          </button>
          <button
            type="button"
            onClick={() => {
              if (parseFlow(flow)) {
                downloadFlow(flow);
                setMessage("Fluxo exportado em JSON.");
              } else
                setMessage(
                  "Corrija os nomes e endereços inválidos antes de exportar.",
                );
            }}
          >
            <Download size={16} /> Exportar fluxo JSON
          </button>
          <button
            type="button"
            className={`${styles.primary} bg-primary text-primary-foreground`}
            onClick={save}
          >
            <Save size={16} /> Salvar rascunho
          </button>
          <input
            ref={upload}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importFile}
            aria-label="Importar fluxo JSON"
          />
        </div>
      </header>
      <nav className={styles.workspaceNav} aria-label="Áreas do editor">
        <button
          type="button"
          aria-pressed={view === "flow"}
          onClick={() => setView("flow")}
        >
          <Link2 size={16} /> Funil de vendas
        </button>
        <button
          type="button"
          aria-pressed={view === "files"}
          onClick={() => setView("files")}
        >
          <FolderOpen size={16} /> ZIP de cada página
        </button>
      </nav>
      {storageNotice ? (
        <p className={styles.notice} role="alert">
          {storageNotice}
        </p>
      ) : null}
      <div className={styles.feedback} role="status" aria-live="polite">
        {message ||
          "Salve o funil em JSON e baixe os ZIPs separadamente. Em Servidor → Sites, cada ZIP é publicado no site escolhido."}
      </div>
      <div hidden={view !== "files"}>
        {selected ? (
          <>
            <div className={styles.templateBar}>
              <label>
                Página para exportar
                <select
                  value={selected.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {flow.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setView("flow")}>
                Editar conteúdo e ligações
              </button>
            </div>
            <PageExportPanel
              key={`${packageRevision}:${selected.id}`}
              flow={flow}
              page={selected}
              site={pagePackages[selected.id] ?? null}
              onSiteChange={(site) =>
                setPagePackages((current) => {
                  const next = { ...current };
                  if (site) next[selected.id] = site;
                  else delete next[selected.id];
                  return next;
                })
              }
            />
          </>
        ) : (
          <p>Adicione uma página no funil para exportar seu ZIP.</p>
        )}
      </div>
      <div hidden={view !== "flow"}>
        <div className={styles.templateBar}>
          <label>
            Começar com um modelo
            <select
              aria-label="Modelo de funil"
              value={templateKind}
              onChange={(event) =>
                setTemplateKind(event.target.value as FlowTemplateKind)
              }
            >
              {Object.entries(FLOW_TEMPLATE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              importSequence.current += 1;
              setImported(createFlowTemplate(templateKind));
            }}
          >
            Carregar modelo
          </button>
          <p>
            Personalize cada etapa. Ofertas e pagamentos não são executados pela
            prévia.
          </p>
        </div>
        <div className={styles.projectBar}>
          <label className={styles.flowName}>
            Nome do fluxo
            <input
              value={flow.name}
              maxLength={120}
              onChange={(event) =>
                change({ ...flow, name: event.target.value })
              }
            />
          </label>
          <span className={styles.localState}>
            <i data-dirty={dirty} />
            {dirty ? "Alterações não salvas" : "Rascunho neste navegador"}
          </span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setHelpOpen(true)}
            aria-label="Ajuda do editor"
          >
            <CircleHelp size={18} />
          </button>
        </div>
        <div className={styles.workspace}>
          <section className={styles.canvas} aria-label="Fluxo de páginas">
            <div className={styles.canvasToolbar}>
              <div className={styles.canvasHeading}>
                <span className={styles.orbitMark} aria-hidden>
                  ◎
                </span>
                <strong>Fluxo de páginas</strong>
                <span>
                  {flow.pages.length}{" "}
                  {flow.pages.length === 1 ? "bloco" : "blocos"}
                </span>
              </div>
              <div className={styles.addControls}>
                <select
                  aria-label="Tipo de página para adicionar"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as PageKind)}
                >
                  {Object.entries(PAGE_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addPage}
                  disabled={flow.pages.length >= 20}
                >
                  <Plus size={16} /> Adicionar
                </button>
              </div>
            </div>
            <div
              className={styles.viewport}
              ref={viewport}
              data-cartao-aberto={paginaAberta ? "true" : undefined}
              style={
                {
                  "--altura-do-quadro": `${boardHeight * zoom + 2}px`,
                } as React.CSSProperties
              }
              tabIndex={0}
              aria-label="Área de blocos; role para explorar"
            >
              <div
                className={styles.boardSize}
                style={{ width: boardWidth * zoom, height: boardHeight * zoom }}
              >
                <div
                  className={styles.board}
                  style={{
                    width: boardWidth,
                    height: boardHeight,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <svg
                    className={styles.wires}
                    width={boardWidth}
                    height={boardHeight}
                    aria-hidden="true"
                  >
                    {flow.connections.map((connection) => {
                      const from = flow.pages.find(
                          (page) => page.id === connection.source,
                        ),
                        to = flow.pages.find(
                          (page) => page.id === connection.target,
                        );
                      if (!from || !to) return null;
                      const sx = from.x + NODE_WIDTH,
                        sy = from.y + 132,
                        tx = to.x,
                        ty = to.y + 132;
                      return (
                        <path
                          key={connection.id}
                          data-kind={from.kind}
                          d={`M${sx},${sy} C${sx + 90},${sy} ${tx - 90},${ty} ${tx},${ty}`}
                        />
                      );
                    })}
                  </svg>
                  {flow.pages.map((page, index) => {
                    const Icon = ICONS[page.kind];
                    const outgoing = flow.connections.filter(
                      (connection) => connection.source === page.id,
                    );
                    return (
                      <React.Fragment key={page.id}>
                        {index > 0 &&
                        flow.connections.some(
                          (connection) =>
                            connection.source === flow.pages[index - 1].id &&
                            connection.target === page.id,
                        ) ? (
                          <div className={styles.mobileStep} aria-hidden>
                            <ArrowDown size={20} />
                          </div>
                        ) : null}
                        <article
                          ref={aberta === page.id ? cartaoAberto : undefined}
                          className={styles.node}
                          data-kind={page.kind}
                          data-selected={selected?.id === page.id}
                          data-aberto={aberta === page.id || undefined}
                          style={{ left: page.x, top: page.y }}
                          aria-label={`Página ${page.name}`}
                        >
                          <header className={styles.nodeHeader}>
                            <span className={styles.nodeIcon}>
                              <Icon size={17} />
                            </span>
                            <span>{PAGE_KIND_LABELS[page.kind]}</span>
                            <button
                              className={styles.dragHandle}
                              type="button"
                              aria-label={`Mover ${page.name}; use as setas`}
                              onPointerDown={(event) => beginDrag(event, page)}
                              onPointerMove={moveDrag}
                              onPointerUp={() => {
                                drag.current = null;
                              }}
                              onPointerCancel={() => {
                                drag.current = null;
                              }}
                              onKeyDown={(event) => moveWithKeys(event, page)}
                            >
                              <Grip size={16} />
                            </button>
                          </header>
                          <button
                            type="button"
                            className={styles.nodeBody}
                            onClick={() => {
                              setSelectedId(page.id);
                              setTargetId("");
                              setAberta((atual) =>
                                atual === page.id ? null : page.id,
                              );
                            }}
                            aria-expanded={aberta === page.id}
                            aria-controls={
                              aberta === page.id
                                ? `config-${page.id}`
                                : undefined
                            }
                            aria-label={`Configurar ${page.name}`}
                          >
                            <span className={styles.nodeName}>
                              {page.name || "Página sem nome"}
                            </span>
                            <span className={styles.nodeHeadline}>
                              {page.headline ||
                                "Adicione um título para sua página"}
                            </span>
                            <span className={styles.nodeUrl}>
                              {page.url || "Endereço não definido"}
                            </span>
                          </button>
                          {aberta === page.id ? configuracao(page) : null}
                          <footer className={styles.nodeFooter}>
                            <span>
                              <i />
                              {validateDestinationUrl(page.url)
                                ? "Endereço configurado"
                                : "Configuração pendente"}
                            </span>
                            <span>
                              {outgoing.length}{" "}
                              {outgoing.length === 1 ? "saída" : "saídas"}
                            </span>
                          </footer>
                          <span
                            className={`${styles.port} ${styles.portIn}`}
                            aria-hidden
                          />
                          <span
                            className={`${styles.port} ${styles.portOut}`}
                            aria-hidden
                          />
                        </article>
                      </React.Fragment>
                    );
                  })}
                  {!flow.pages.length ? (
                    <div className={styles.empty}>
                      <FileText size={32} />
                      <h2>O primeiro passo é uma página.</h2>
                      <p>
                        Escolha o tipo e adicione um bloco para começar seu
                        fluxo.
                      </p>
                      <button type="button" onClick={addPage}>
                        <Plus size={16} /> Adicionar página
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <footer className={styles.canvasFooter}>
              <span className={styles.dragHint}>
                Arraste pelo ícone <Grip size={13} /> ou use as setas.
              </span>
              <button type="button" onClick={undo} disabled={!undoCount}>
                <Undo2 size={16} /> Desfazer
              </button>
              <div className={styles.zoomControls}>
                <button
                  type="button"
                  onClick={() =>
                    setZoom(Math.max(0.35, +(zoom - 0.1).toFixed(2)))
                  }
                  aria-label="Diminuir zoom"
                  disabled={zoom <= 0.35}
                >
                  <Minus size={15} />
                </button>
                <output aria-label="Zoom do fluxo">
                  {Math.round(zoom * 100)}%
                </output>
                <button
                  type="button"
                  onClick={() =>
                    setZoom(Math.min(1.5, +(zoom + 0.1).toFixed(2)))
                  }
                  aria-label="Aumentar zoom"
                  disabled={zoom >= 1.5}
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  onClick={fit}
                  aria-label="Ajustar fluxo à tela"
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </footer>
          </section>
        </div>
        <section
          className={styles.connections}
          aria-label="Ligações entre páginas"
        >
          <header>
            <div>
              <h2>Ligações do fluxo</h2>
              <p>Confira os destinos sem depender do desenho.</p>
            </div>
            <span>
              {flow.connections.length}{" "}
              {flow.connections.length === 1 ? "ligação" : "ligações"}
            </span>
          </header>
          {flow.connections.length ? (
            <ul>
              {flow.connections.map((connection) => {
                const source = flow.pages.find(
                    (page) => page.id === connection.source,
                  )!,
                  target = flow.pages.find(
                    (page) => page.id === connection.target,
                  )!;
                return (
                  <li key={connection.id}>
                    <Link2 size={16} />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(source.id);
                        setAberta(source.id);
                      }}
                    >
                      {source.name}
                    </button>
                    <ArrowRight size={15} aria-hidden />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(target.id);
                        setAberta(target.id);
                      }}
                    >
                      {target.name}
                    </button>
                    <span className={styles.connectionLabel}>
                      {connection.label}
                    </span>
                    <span className={styles.connectionState}>
                      {validateDestinationUrl(target.url)
                        ? "Destino configurado"
                        : "Falta o endereço de destino"}
                    </span>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remover ligação de ${source.name} para ${target.name}`}
                      onClick={() => {
                        change({
                          ...flow,
                          connections: flow.connections.filter(
                            (item) => item.id !== connection.id,
                          ),
                        });
                        setMessage(
                          "Ligação removida. Você pode desfazer esta ação.",
                        );
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.noConnections}>
              Nenhuma ligação ainda. Selecione uma página e escolha seu próximo
              destino.
            </p>
          )}
        </section>
        <div className={styles.statusBar}>
          <span>
            <Check size={14} />
            {flow.pages.length} {flow.pages.length === 1 ? "página" : "páginas"}{" "}
            / {flow.connections.length}{" "}
            {flow.connections.length === 1 ? "ligação" : "ligações"}
          </span>
          <span>
            {pending
              ? `${pending} ${pending === 1 ? "página precisa" : "páginas precisam"} de endereço`
              : "Endereços configurados"}{" "}
            · Configuração local
          </span>
        </div>
      </div>
      <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog}>
            <div className={styles.dialogToolbar}>
              <div>
                <Dialog.Title>Prévia da página</Dialog.Title>
                <Dialog.Description>
                  Simulação do conteúdo e das ligações. Não é uma página
                  publicada.
                </Dialog.Description>
              </div>
              <div className={styles.previewDevices}>
                <button
                  type="button"
                  aria-label="Prévia no computador"
                  aria-pressed={!mobilePreview}
                  onClick={() => setMobilePreview(false)}
                >
                  <Monitor size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Prévia no celular"
                  aria-pressed={mobilePreview}
                  onClick={() => setMobilePreview(true)}
                >
                  <Smartphone size={18} />
                </button>
                <Dialog.Close
                  className={styles.iconButton}
                  aria-label="Fechar prévia"
                >
                  <X size={20} />
                </Dialog.Close>
              </div>
            </div>
            {previewPage ? (
              <div className={styles.previewWrap}>
                <div className={styles.pagePreview} data-mobile={mobilePreview}>
                  <div className={styles.previewAddress}>
                    {previewPage.url || "Endereço não configurado"}
                  </div>
                  <div className={styles.previewContent}>
                    <span className={styles.previewBrand}>
                      {previewPage.name}
                    </span>
                    {previewPage.imageUrl &&
                    validateDestinationUrl(previewPage.imageUrl) ? (
                      <Image
                        src={previewPage.imageUrl}
                        alt={`Capa de ${previewPage.name}`}
                        width={800}
                        height={450}
                        unoptimized
                        className={styles.previewImage}
                      />
                    ) : (
                      <div className={styles.previewIllustration} aria-hidden>
                        <FileText size={46} strokeWidth={1} />
                      </div>
                    )}
                    <h2>{previewPage.headline || "Título da sua página"}</h2>
                    <p>
                      {previewPage.description ||
                        "Adicione uma descrição no painel de configuração."}
                    </p>
                    {flow.connections
                      .filter(
                        (connection) => connection.source === previewPage.id,
                      )
                      .map((connection, index) => {
                        const target = flow.pages.find(
                          (page) => page.id === connection.target,
                        )!;
                        return (
                          <button
                            key={connection.id}
                            type="button"
                            className={`${styles.previewCta} bg-primary text-primary-foreground`}
                            onClick={() => setPreviewId(target.id)}
                          >
                            {index === 0
                              ? previewPage.buttonLabel || connection.label
                              : connection.label}
                            <ArrowRight size={16} />
                          </button>
                        );
                      })}
                    {!flow.connections.some(
                      (connection) => connection.source === previewPage.id,
                    ) ? (
                      <span className={styles.previewEnd}>
                        Fim desta etapa. Adicione uma ligação para continuar.
                      </span>
                    ) : null}
                    {validateDestinationUrl(previewPage.url) ? (
                      <a
                        href={previewPage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.openUrl}
                      >
                        Abrir endereço configurado <ExternalLink size={14} />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={`${styles.dialog} ${styles.smallDialog}`}>
            <Dialog.Title>Um espaço para conectar páginas.</Dialog.Title>
            <Dialog.Description>
              O visual de blocos do Orbit, adaptado para a jornada da sua loja.
            </Dialog.Description>
            <ol className={styles.helpSteps}>
              <li>
                Adicione uma landing page, checkout, página de obrigado ou
                destino externo.
              </li>
              <li>
                Selecione o bloco e configure nome, endereço, conteúdo e botão.
              </li>
              <li>
                Escolha outra página em “Ligar a outra página”. As linhas
                acompanham os blocos.
              </li>
              <li>
                Use a prévia para percorrer o fluxo. Salve neste navegador ou
                exporte a configuração em JSON.
              </li>
              <li>
                Em “ZIP de cada página”, baixe cada site com index.html na raiz
                e publique-o em Servidor → Sites. O limite é 3 MB por ZIP.
              </li>
            </ol>
            <p>
              Arraste os blocos pelo ícone ou use as setas do teclado. No
              celular, eles aparecem em sequência. Salvar não publica páginas
              nem modifica redirecionamentos reais.
            </p>
            <Dialog.Close className={styles.helpClose}>Entendi</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(imported)}
        onOpenChange={(open) => {
          if (!open) setImported(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={`${styles.dialog} ${styles.smallDialog}`}>
            <Dialog.Title>Substituir o fluxo em edição?</Dialog.Title>
            <Dialog.Description>
              O fluxo escolhido contém {imported?.pages.length} páginas e{" "}
              {imported?.connections.length} ligações. O rascunho salvo continua
              intacto até você salvar. A importação também pode ser desfeita.
              {hasPackages
                ? " Os arquivos associados às páginas serão descartados desta aba e não são recuperados por Desfazer. Baixe seus ZIPs antes de substituir."
                : ""}
            </Dialog.Description>
            <div className={styles.actions}>
              <Dialog.Close>Cancelar</Dialog.Close>
              <button
                type="button"
                className={`${styles.primary} bg-primary text-primary-foreground`}
                onClick={() => {
                  if (!imported) return;
                  change(imported);
                  setPagePackages({});
                  setPackageRevision((revision) => revision + 1);
                  setSelectedId(imported.pages[0]?.id ?? "");
                  setAberta(imported.pages[0]?.id ?? null);
                  setTargetId("");
                  setImported(null);
                  setMessage("Fluxo importado. Revise e salve o rascunho.");
                }}
              >
                Importar fluxo
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
