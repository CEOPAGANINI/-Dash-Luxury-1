"use client";

/*
  O painel do bloco Redirecionador — o Roteador de ofertas dentro do quadro
  do funil. Abre à direita, como o publicador da página, com quatro abas:
  Regras (quem vai para onde), Testar (simula um visitante), De onde vêm e
  Redirecionados (números de demonstração). O teste é local; as regras
  suportadas são aplicadas pelo publicador na exportação estática.
*/

import * as React from "react";
import {
  ArrowRightLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FlaskConical,
  Globe,
  GripVertical,
  Info,
  ListOrdered,
  Megaphone,
  Monitor,
  Network,
  Plus,
  Shuffle,
  Smartphone,
  Trash2,
  TriangleAlert,
  X,
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
  type MatchKind,
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
import { normalizeFunnelAddress } from "./funnel-address";
import {
  TIPOS_REGRA,
  nomeDoDestino,
  nomesDosNos,
  regraRedirNova,
  rotuloDaRegra,
} from "./redirect-rules";

type Aba = "regras" | "testar" | "origem" | "redirecionados";

const RULE_ICONS: Record<
  MatchKind,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  regiao: Globe,
  dispositivo: Smartphone,
  sistema: Monitor,
  rede: Network,
  origem: Megaphone,
  fatia: Shuffle,
};

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
    sub: "A primeira regra correspondente define o destino",
    cor: "var(--flow-color-primary, #22E58B)",
    Icone: ListOrdered,
  },
  {
    id: "testar",
    rotulo: "Testar",
    sub: "Simule um visitante e veja para onde ele vai",
    cor: "var(--flow-color-info, #71B7FF)",
    Icone: FlaskConical,
  },
  {
    id: "origem",
    rotulo: "De onde vêm",
    sub: "Aparelho, região e anúncio (demonstração)",
    cor: "var(--flow-color-routing, #B6A0FF)",
    Icone: Globe,
  },
  {
    id: "redirecionados",
    rotulo: "Registro",
    sub: "Quem foi redirecionado para outra página (demonstração)",
    cor: "var(--flow-color-warning, #F2C66D)",
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
  defaultNodeId,
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
  /** Destino da ligação manual de saída; regras geram outras ligações. */
  defaultNodeId?: string;
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
  const [anuncio, setAnuncio] = React.useState("");
  const [dragOverRule, setDragOverRule] = React.useState<string | null>(null);
  const panelId = React.useId();
  const tabRefs = React.useRef<Partial<Record<Aba, HTMLButtonElement>>>({});
  const ruleRefs = React.useRef(new Map<string, HTMLElement>());
  const pendingRuleFocus = React.useRef<string | null>(null);
  const draggedRule = React.useRef<string | null>(null);
  const addRef = React.useRef<HTMLButtonElement>(null);
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
  React.useEffect(() => {
    const anterior = document.activeElement;
    tabRefs.current.regras?.focus();
    return () => {
      if (anterior instanceof HTMLElement && anterior.isConnected)
        anterior.focus();
    };
  }, []);
  React.useEffect(() => {
    if (!pendingRuleFocus.current) return;
    const target = ruleRefs.current.get(pendingRuleFocus.current);
    if (target) {
      target.focus();
      pendingRuleFocus.current = null;
    }
  }, [regras]);

  const addRegra = () => {
    const id = novoId();
    pendingRuleFocus.current = id;
    setRegras([...regras, regraRedirNova(id, "regiao")]);
    setAnuncio(
      `Regra criada na prioridade ${regras.length + 1}. Configure a condição e o destino.`,
    );
  };
  const moverPara = (i: number, j: number) => {
    if (i < 0 || j < 0 || i === j || i >= regras.length || j >= regras.length)
      return;
    const rs = [...regras];
    const [regra] = rs.splice(i, 1);
    rs.splice(j, 0, regra);
    pendingRuleFocus.current = regras[i].id;
    setRegras(rs);
    setAnuncio(`Regra movida da prioridade ${i + 1} para ${j + 1}.`);
  };
  const mover = (i: number, dir: -1 | 1) => moverPara(i, i + dir);
  const remover = (id: string) => {
    const index = regras.findIndex((r) => r.id === id);
    const seguinte = regras[index + 1] ?? regras[index - 1];
    pendingRuleFocus.current = seguinte?.id ?? null;
    setRegras(regras.filter((r) => r.id !== id));
    if (!seguinte) addRef.current?.focus();
    setAnuncio(`Regra da prioridade ${index + 1} removida.`);
  };
  const alternar = <T,>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

  const ativas = regras.filter((r) => r.ativo).length;
  const defaultNode = nodes.find((candidate) => candidate.id === defaultNodeId);
  const destinoPadrao =
    defaultNode?.title ?? (defaultNodeId ? "Bloco removido" : "Não conectado");
  const destinoErro = (r: RegraRedir): string | null => {
    if (r.destinoNoId === node.id)
      return "A regra aponta para este redirecionador. Escolha outra etapa para evitar um ciclo.";
    if (
      r.destinoNoId &&
      !nodes.some((candidate) => candidate.id === r.destinoNoId)
    )
      return "Destino não encontrado: o bloco foi removido. Selecione outro bloco ou informe um endereço.";
    if (r.destinoNoId) return null;
    if (!r.destino.trim())
      return "Defina o destino: selecione um bloco ou informe um endereço.";
    if (!normalizeFunnelAddress(r.destino))
      return "Endereço inválido. Use um caminho como /oferta ou uma URL completa com http:// ou https://.";
    return null;
  };
  const incompatíveis = regras.filter(
    (r) => r.ativo && (r.tipo === "regiao" || r.tipo === "rede"),
  );
  const falhasDestino = regras.filter((r) => r.ativo && destinoErro(r));
  const fatias = regras
    .filter((r) => r.ativo && r.tipo === "fatia")
    .reduce((total, r) => total + r.percentual, 0);

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
    ? destinoPadrao
    : decisao.destino.startsWith("#")
      ? (nomes[decisao.destino.slice(1)] ?? "(bloco removido)")
      : decisao.destino;
  const regraDecisao = regras.find((r) => r.id === decisao.regra?.id);
  const erroDecisao = regraDecisao
    ? destinoErro(regraDecisao)
    : defaultNodeId && !defaultNode
      ? "A saída padrão aponta para um bloco removido. Reconecte a saída no quadro."
      : !defaultNodeId
        ? "Nenhuma saída padrão conectada. Conecte a saída do redirecionador a uma etapa no quadro."
        : null;

  const navegarAbas = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next: number;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (index + 1) % ABAS.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (index + ABAS.length - 1) % ABAS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ABAS.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    setAba(ABAS[next].id);
    tabRefs.current[ABAS[next].id]?.focus();
  };

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
      onKeyDown={(event) => {
        // Key events inside the inspector must never reach canvas shortcuts.
        if (event.key !== "Tab") event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onFechar();
        }
      }}
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
          aria-label="Fechar redirecionador"
          title="Fechar redirecionador (Esc)"
          onClick={onFechar}
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="pub__url">
        {regras.length === 0
          ? "Sem regras · visitantes seguem o destino padrão"
          : `${regras.length} ${regras.length === 1 ? "regra" : "regras"} · avaliadas por prioridade`}
      </div>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {anuncio}
      </span>

      <div className="pub__body">
        <nav
          className="pub__rail"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Abas do redirecionador"
        >
          {ABAS.map((a, index) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${a.id}`}
              aria-selected={aba === a.id}
              aria-controls={`${panelId}-panel-${a.id}`}
              tabIndex={aba === a.id ? 0 : -1}
              ref={(element) => {
                if (element) tabRefs.current[a.id] = element;
              }}
              className="pub__rail-btn"
              data-on={aba === a.id || undefined}
              style={{ "--aba-cor": a.cor } as React.CSSProperties}
              onClick={() => setAba(a.id)}
              onKeyDown={(event) => navegarAbas(event, index)}
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

        <div
          className="pub__corpo"
          role="tabpanel"
          id={`${panelId}-panel-${aba}`}
          aria-labelledby={`${panelId}-tab-${aba}`}
          tabIndex={0}
        >
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
                  aria-describedby={`${panelId}-address-help`}
                  spellCheck={false}
                  onChange={(event) => onAddress?.(event.target.value)}
                />
                <small className="pub__hint" id={`${panelId}-address-help`}>
                  Comece com / e use um caminho exclusivo, como /go.
                </small>
              </label>
              <div className="rdp__default">
                <div>
                  <span className="rdp__lbl">Destino padrão</span>
                  <strong>{destinoPadrao}</strong>
                  <p>
                    Quando nenhuma regra corresponde, o visitante segue a
                    ligação de saída do bloco.
                  </p>
                </div>
                {defaultNode && onIrPara && (
                  <button
                    type="button"
                    className="rdp__ver"
                    onClick={() => onIrPara(defaultNode.id)}
                  >
                    Ver destino no quadro ↗
                  </button>
                )}
                {!defaultNode && (
                  <small className="rdp__notice rdp__notice--warning">
                    <TriangleAlert size={16} aria-hidden />
                    {defaultNodeId
                      ? "A saída padrão aponta para um bloco removido. Reconecte-a no quadro."
                      : "Conecte a saída do redirecionador a uma etapa no quadro. Sem essa ligação, visitantes sem correspondência não têm um destino."}
                  </small>
                )}
              </div>
              <div className="rdp__notice rdp__help">
                <Info size={16} aria-hidden />
                <small>
                  No ZIP único, fatias percentuais, aparelho, sistema e
                  utm_source rodam no navegador. Região/IP e rede não são
                  suportados; com essas regras ativas, a exportação é bloqueada.
                  Roteamento no navegador não é controle de acesso.
                </small>
              </div>
              {(incompatíveis.length > 0 ||
                falhasDestino.length > 0 ||
                fatias > 100) && (
                <div className="rdp__notice rdp__notice--warning" role="status">
                  <TriangleAlert size={16} aria-hidden />
                  <span>
                    <b>Revise antes de publicar</b>
                    <br />
                    {incompatíveis.length > 0 &&
                      `${incompatíveis.length} ${incompatíveis.length === 1 ? "regra ativa incompatível" : "regras ativas incompatíveis"} com o ZIP único. `}
                    {falhasDestino.length > 0 &&
                      `${falhasDestino.length} ${falhasDestino.length === 1 ? "destino precisa" : "destinos precisam"} de correção. `}
                    {fatias > 100 &&
                      `As fatias ativas somam ${fatias}%; reduza para no máximo 100%.`}
                  </span>
                </div>
              )}
              <div className="rdp__topo">
                <span className="pub__hint" id={`${panelId}-reorder-help`}>
                  A prioridade 1 é avaliada primeiro. A primeira correspondência
                  decide. Arraste pela alça ou use os botões Subir e Descer.
                </span>
                <button
                  type="button"
                  className="pub__btn rdp__add"
                  onClick={addRegra}
                  ref={addRef}
                >
                  <Plus size={16} strokeWidth={2} aria-hidden /> Criar regra
                </button>
              </div>
              {regras.length === 0 && (
                <div className="pub__vazio">
                  <ListOrdered size={24} aria-hidden />
                  <strong>Crie sua primeira regra</strong>
                  <p>
                    Todo visitante segue o destino padrão enquanto não houver
                    regras. Crie uma condição para separar o tráfego por
                    aparelho, origem, sistema ou fatia percentual.
                  </p>
                </div>
              )}
              {regras.map((r, i) => (
                <section
                  key={r.id}
                  className="pub__campo rdp__regra"
                  data-off={!r.ativo || undefined}
                  data-drag-over={dragOverRule === r.id || undefined}
                  aria-label={`Regra ${i + 1}`}
                  tabIndex={-1}
                  ref={(element) => {
                    if (element) ruleRefs.current.set(r.id, element);
                    else ruleRefs.current.delete(r.id);
                  }}
                  onDragOver={(event) => {
                    if (!draggedRule.current || draggedRule.current === r.id)
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverRule(r.id);
                  }}
                  onDragLeave={(event) => {
                    if (
                      !(event.relatedTarget instanceof Node) ||
                      !event.currentTarget.contains(event.relatedTarget)
                    )
                      setDragOverRule((current) =>
                        current === r.id ? null : current,
                      );
                  }}
                  onDrop={(event) => {
                    if (!draggedRule.current) return;
                    event.preventDefault();
                    event.stopPropagation();
                    moverPara(
                      regras.findIndex(
                        (regra) => regra.id === draggedRule.current,
                      ),
                      i,
                    );
                    draggedRule.current = null;
                    setDragOverRule(null);
                  }}
                >
                  <header className="rdp__regra-head">
                    <span
                      className="rdp__num"
                      aria-label={`Prioridade ${i + 1}`}
                      title={`Prioridade ${i + 1}`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="rdp__quem">
                      <span aria-hidden>
                        {React.createElement(RULE_ICONS[r.tipo], {
                          size: 16,
                          strokeWidth: 1.75,
                        })}
                      </span>{" "}
                      {rotuloDaRegra(r)}{" "}
                      <span className="rdp__seta" aria-hidden>
                        →
                      </span>{" "}
                      <b>{nomeDoDestino(r, nomes)}</b>
                    </span>
                    <span className="rdp__acoes">
                      <button
                        type="button"
                        className="rdp__drag"
                        draggable
                        aria-label={`Arrastar regra ${i + 1}`}
                        aria-describedby={`${panelId}-reorder-help`}
                        title="Arraste para mudar a prioridade. Use Subir e Descer pelo teclado."
                        onDragStart={(event) => {
                          event.stopPropagation();
                          draggedRule.current = r.id;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", r.id);
                          setAnuncio(
                            `Arrastando regra da prioridade ${i + 1}. Solte sobre a prioridade desejada.`,
                          );
                        }}
                        onDragEnd={() => {
                          draggedRule.current = null;
                          setDragOverRule(null);
                        }}
                      >
                        <GripVertical size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Subir regra ${i + 1}`}
                        title="Subir prioridade"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                      >
                        <ArrowUp size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Descer regra ${i + 1}`}
                        title="Descer prioridade"
                        disabled={i === regras.length - 1}
                        onClick={() => mover(i, 1)}
                      >
                        <ArrowDown size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remover regra ${i + 1}`}
                        title="Remover regra"
                        onClick={() => remover(r.id)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </span>
                  </header>
                  <div
                    className="rdp__rule-state"
                    data-off={!r.ativo || undefined}
                    data-state={destinoErro(r) ? "pending" : "ready"}
                  >
                    <span>{r.ativo ? "Ativa" : "Pausada"}</span>
                    <span>
                      {destinoErro(r)
                        ? "Destino pendente"
                        : "Destino configurado"}
                    </span>
                  </div>
                  {r.ativo && (r.tipo === "regiao" || r.tipo === "rede") && (
                    <p className="rdp__notice rdp__notice--warning">
                      <TriangleAlert size={16} aria-hidden />
                      Esta regra bloqueia a exportação do ZIP único.{" "}
                      {r.tipo === "regiao"
                        ? "Região/IP exige um roteador no servidor."
                        : "O tipo de rede não pode ser detectado com segurança no site estático."}{" "}
                      Pause a regra ou escolha um tipo suportado.
                    </p>
                  )}

                  <div
                    className="pub__chips rdp__tipos"
                    role="radiogroup"
                    aria-label={`Tipo da regra ${i + 1}`}
                  >
                    {TIPOS_REGRA.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={r.tipo === t.id}
                        tabIndex={r.tipo === t.id ? 0 : -1}
                        className="pub__chip"
                        data-on={r.tipo === t.id || undefined}
                        onClick={() => setRegra(r.id, { tipo: t.id })}
                        onKeyDown={(event) => {
                          const index = TIPOS_REGRA.findIndex(
                            (tipo) => tipo.id === t.id,
                          );
                          let next: number;
                          if (
                            event.key === "ArrowRight" ||
                            event.key === "ArrowDown"
                          )
                            next = (index + 1) % TIPOS_REGRA.length;
                          else if (
                            event.key === "ArrowLeft" ||
                            event.key === "ArrowUp"
                          )
                            next =
                              (index + TIPOS_REGRA.length - 1) %
                              TIPOS_REGRA.length;
                          else if (event.key === "Home") next = 0;
                          else if (event.key === "End")
                            next = TIPOS_REGRA.length - 1;
                          else return;
                          event.preventDefault();
                          event.stopPropagation();
                          setRegra(r.id, { tipo: TIPOS_REGRA[next].id });
                          event.currentTarget
                            .closest('[role="radiogroup"]')
                            ?.querySelectorAll<HTMLButtonElement>(
                              '[role="radio"]',
                            )
                            [next]?.focus();
                        }}
                      >
                        <span aria-hidden>
                          {React.createElement(RULE_ICONS[t.id], {
                            size: 16,
                            strokeWidth: 1.75,
                          })}
                        </span>{" "}
                        {t.nome}
                      </button>
                    ))}
                  </div>

                  {r.tipo === "regiao" && (
                    <>
                      <label
                        className="rdp__lbl"
                        htmlFor={`${panelId}-country-${r.id}`}
                      >
                        Buscar país
                      </label>
                      <input
                        id={`${panelId}-country-${r.id}`}
                        className="pub__input"
                        value={filtroPais[r.id] ?? ""}
                        placeholder="Buscar país… (ex.: Japão, BR, Alemanha)"
                        aria-label={`Buscar país da regra ${i + 1}`}
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
                    <label
                      className="rdp__lbl"
                      htmlFor={`${panelId}-destination-${r.id}`}
                    >
                      Ou informe um endereço
                    </label>
                    <input
                      id={`${panelId}-destination-${r.id}`}
                      className="pub__input"
                      value={r.destinoNoId ? "" : r.destino}
                      maxLength={2048}
                      placeholder="ou um endereço: /outra-pagina ou https://…"
                      aria-label={`Endereço de destino da regra ${i + 1}`}
                      aria-invalid={Boolean(destinoErro(r))}
                      aria-describedby={`${panelId}-destination-help-${r.id}`}
                      spellCheck={false}
                      onChange={(e) =>
                        setRegra(r.id, {
                          destino: e.target.value,
                          destinoNoId: undefined,
                        })
                      }
                    />
                    <small
                      id={`${panelId}-destination-help-${r.id}`}
                      className={
                        destinoErro(r)
                          ? "rdp__notice rdp__notice--danger"
                          : "pub__hint"
                      }
                    >
                      {destinoErro(r) ? (
                        <>
                          <TriangleAlert size={16} aria-hidden />{" "}
                          {destinoErro(r)}
                        </>
                      ) : r.destinoNoId ? (
                        "O destino selecionado está vinculado ao bloco do quadro."
                      ) : (
                        "Use um caminho interno (/oferta) ou um endereço HTTP(S)."
                      )}
                    </small>
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
                    rotulo={
                      r.ativo
                        ? `Regra ${i + 1} ativa`
                        : `Regra ${i + 1} pausada`
                    }
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
              <div className="rdp__demo">
                <FlaskConical size={16} aria-hidden />
                <span>
                  <strong>Simulação — não são dados reais</strong>
                  <br />
                  Os atributos são definidos por você. Nenhum visitante será
                  redirecionado.
                </span>
              </div>
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
                    <small className="pub__hint">
                      Número de 0 a 99. Fatias ativas ocupam intervalos
                      consecutivos, na ordem das regras.
                    </small>
                  </label>
                </div>
              </div>
              <div
                className="rdp__veredito"
                data-ficou={decisao.ficou || undefined}
                data-invalid={Boolean(erroDecisao) || undefined}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="rdp__veredito-mark" aria-hidden>
                  {erroDecisao ? (
                    <TriangleAlert size={20} />
                  ) : (
                    <CheckCircle2 size={20} />
                  )}
                </span>
                <div className="rdp__veredito-body">
                  <b>
                    {erroDecisao
                      ? "Destino precisa de correção"
                      : decisao.ficou
                        ? "Destino padrão"
                        : "Destino da simulação"}
                  </b>
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
                      Prioridade{" "}
                      {regras.findIndex((r) => r.id === decisao.regra?.id) + 1}:{" "}
                      {descreverRegra(decisao.regra)}. Foi a primeira regra
                      correspondente com destino definido.
                    </span>
                  )}
                  {decisao.ficou && (
                    <span className="rdp__veredito-why">
                      Nenhuma regra ativa com destino definido correspondeu aos
                      atributos informados.
                    </span>
                  )}
                  {erroDecisao && (
                    <span className="rdp__reason">{erroDecisao}</span>
                  )}
                  {regraDecisao &&
                    (regraDecisao.tipo === "regiao" ||
                      regraDecisao.tipo === "rede") && (
                      <span className="rdp__reason">
                        Esta condição foi testada com os atributos informados
                        manualmente. Ela não é executada no ZIP único e bloqueia
                        essa exportação.
                      </span>
                    )}
                </div>
              </div>
              {falhasDestino.length > 0 && (
                <p className="rdp__notice rdp__notice--warning">
                  <TriangleAlert size={16} aria-hidden />
                  Há regras ativas com destino pendente ou inválido. Corrija-as
                  na aba Regras antes de publicar; o teste não valida o funil
                  completo.
                </p>
              )}
            </>
          )}

          {/* ── De onde vêm ────────────────────────────────────────── */}
          {aba === "origem" && (
            <>
              <div className="rdp__demo">
                <Info size={16} aria-hidden />
                <span>
                  <strong>Demonstração — não são dados reais</strong>
                  <br />
                  Os números abaixo ilustram a leitura da origem dos visitantes.
                </span>
              </div>
              <Barras titulo="Por aparelho" itens={POR_DISPOSITIVO} />
              <Barras titulo="Por região" itens={POR_REGIAO} />
              <Barras titulo="Por origem do anúncio" itens={POR_ORIGEM} />
              <small className="pub__hint">
                Esta tela usa dados de exemplo e não mede tráfego real.
              </small>
            </>
          )}

          {/* ── Redirecionados ─────────────────────────────────────── */}
          {aba === "redirecionados" && (
            <>
              <div className="rdp__demo">
                <Info size={16} aria-hidden />
                <span>
                  <strong>Demonstração — não são dados reais</strong>
                  <br />
                  Este registro não confirma a execução de redirecionamentos.
                </span>
              </div>
              <div className="pub__campo">
                <span>
                  Total redirecionados:{" "}
                  <b>{totalRedirecionados(REDIRECIONADOS_EXEMPLO)}</b>
                </span>
                <table className="rdp__tabela">
                  <caption className="sr-only">
                    Registro de redirecionamentos de demonstração
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Região</th>
                      <th scope="col">Aparelho</th>
                      <th scope="col">Destino</th>
                      <th scope="col">Qtd.</th>
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
                Registros reais exigem integração com o serviço de roteamento.
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
          Revisar publicação
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
