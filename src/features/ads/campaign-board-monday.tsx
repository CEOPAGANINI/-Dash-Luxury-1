"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  avaliarGuardrails,
  VEREDITOS,
  type ProfitGuardrails,
  type Veredito,
} from "@/features/guardrails/rules";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { cn } from "@/lib/utils";
import {
  bulkStatusAction,
  createCampaignAction,
  seedDemoCampaignsAction,
  syncMetaAction,
  updateAdEntityAction,
  type ResultadoAds,
} from "./actions";
import {
  NETWORK_LABEL,
  STATUS_LABEL,
  derivadas,
  somarMetricas,
  type AdEntityType,
  type AdMetrics,
  type AdNetwork,
  type AdStatus,
  type CampaignRow,
  type CampaignTree,
} from "./types";

/*
  O quadro de campanhas no jeito de quadro de tarefas (todas as redes).

  Convive com os gerenciadores por rede do Codex (/campanhas/meta etc.):
  aqui é a visão em tabela agrupada, lá é o quadro em colunas.

  Um grupo por rede de tráfego — Meta, Google, YouTube — e, dentro de
  cada um, uma linha por campanha, no jeito de quadro de tarefas: célula
  de estado colorida que troca com um clique, nome e orçamento que viram
  campo ao clicar, caixa de seleção para agir em várias, e um rodapé que
  resume o grupo (a distribuição de estados em barra, os totais).

  As cores seguem a régua do painel: verde, amarelo e vermelho só onde há
  um julgamento (estado da campanha, decisão do freio de mão); o resto é
  cinza. A campanha abre em conjuntos e anúncios com a seta do nome.
*/

const REDES: AdNetwork[] = ["meta", "google", "youtube"];
const COR_REDE: Record<AdNetwork, string> = {
  meta: "#f5f5f5",
  google: "#c2c2c2",
  youtube: "#909090",
};

const CELULA_ESTADO: Record<AdStatus, string> = {
  active: "bg-success text-success-foreground",
  paused: "bg-warning text-warning-foreground",
  archived: "bg-muted text-muted-foreground",
};
const CELULA_FREIO: Record<Veredito, string> = {
  escalar: "bg-success text-success-foreground",
  manter: "bg-[#909090] text-[#121212]",
  reduzir: "bg-warning text-warning-foreground",
  pausar: "bg-destructive text-destructive-foreground",
};
const BARRA_ESTADO: Record<AdStatus, string> = {
  active: "bg-success",
  paused: "bg-warning",
  archived: "bg-muted-foreground/40",
};
const BARRA_FREIO: Record<Veredito, string> = {
  escalar: "bg-success",
  manter: "bg-[#909090]",
  reduzir: "bg-warning",
  pausar: "bg-destructive",
};

function decisaoDe(m: AdMetrics, regras: ProfitGuardrails) {
  if (m.spendCents === 0) return null;
  const gasto = m.spendCents / 100;
  const receita = m.revenueCents / 100;
  return avaliarGuardrails(
    {
      gasto,
      receita,
      lucro: receita - gasto,
      margem: derivadas(m).margem ?? 0,
      diasSeguidosNegativos: receita - gasto < 0 ? 1 : 0,
    },
    regras,
  );
}

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) =>
  v === null ? "—" : formatCurrency(v / 100, v < 10_000 ? 2 : 0);

/** Chama a ação de edição direto, sem formulário na tela. */
async function salvar(campos: Record<string, string>): Promise<ResultadoAds> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return updateAdEntityAction(null, fd);
}

const AvisoContext = React.createContext<(r: ResultadoAds) => void>(() => {});

export function CampaignBoardMonday({
  tree,
  regras,
  network,
}: {
  tree: CampaignTree;
  regras: ProfitGuardrails;
  /** Quando presente, só o grupo desta rede. */
  network?: AdNetwork;
}) {
  const redes = network ? [network] : REDES;
  const [aviso, setAviso] = React.useState<ResultadoAds | null>(null);
  const [selecionadas, setSelecionadas] = React.useState<Set<string>>(new Set());
  const [pendente, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const alternarSelecao = React.useCallback((id: string, marcada: boolean) => {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (marcada) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }, []);

  function emLote(status: AdStatus) {
    const ids = Array.from(selecionadas);
    startTransition(async () => {
      const r = await bulkStatusAction(ids, status);
      setAviso(r);
      if (r.ok) setSelecionadas(new Set());
    });
  }

  return (
    <AvisoContext.Provider value={setAviso}>
      <div className="space-y-4">
        <div className="bg-card flex flex-col gap-3 rounded-2xl border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <span className="text-muted-foreground block text-[0.6875rem] leading-4 font-extrabold tracking-[0.1em] uppercase">
              Quadro
            </span>
            <h3 className="text-[clamp(1rem,0.92rem+0.2vw,1.125rem)] leading-tight font-extrabold tracking-tight">
              Campanhas por rede de tráfego
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs leading-5">
              {tree.modo === "demo"
                ? "Demonstração: doze campanhas de exemplo. Com o banco ligado, tudo aqui passa a ser editável."
                : tree.metaConectado
                  ? `Meta conectado${tree.ultimaSync ? ` · última sincronização ${new Date(tree.ultimaSync).toLocaleString("pt-BR")}` : " · ainda não sincronizado"}. Clique no estado, no nome ou no orçamento para editar.`
                  : "Clique no estado, no nome ou no orçamento para editar. Conecte o Meta em Integrações para sincronizar as campanhas reais."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tree.modo === "banco" && <SeedButton />}
            <SyncButton habilitado={tree.modo === "banco" && tree.metaConectado} />
          </div>
        </div>

        {aviso && (
          <p
            role="status"
            className={cn(
              "rounded-xl border px-4 py-2 text-xs font-semibold",
              aviso.ok
                ? "border-success/40 bg-success/10 text-success"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            {aviso.mensagem}
          </p>
        )}

        {selecionadas.size > 0 && (
          <div className="bg-foreground text-background sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl px-4 py-2 text-sm shadow-lg">
            <b className="tabular-nums">{selecionadas.size} {selecionadas.size === 1 ? "selecionada" : "selecionadas"}</b>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" disabled={pendente} onClick={() => emLote("active")}>Ativar</Button>
              <Button size="sm" variant="secondary" disabled={pendente} onClick={() => emLote("paused")}>Pausar</Button>
              <Button size="sm" variant="secondary" disabled={pendente} onClick={() => emLote("archived")}>Arquivar</Button>
              <Button size="sm" variant="ghost" className="text-background hover:text-background" onClick={() => setSelecionadas(new Set())}>Limpar</Button>
            </span>
          </div>
        )}

        {redes.map((rede) => (
          <Grupo
            key={rede}
            rede={rede}
            campanhas={tree.campanhas.filter((c) => c.network === rede)}
            regras={regras}
            demo={tree.modo === "demo"}
            selecionadas={selecionadas}
            aoSelecionar={alternarSelecao}
          />
        ))}

        <p className="text-muted-foreground px-1 text-xs leading-5">
          Subir orçamento ou reativar passa pelo{" "}
          <Link href="/seguranca" className="font-bold underline-offset-2 hover:underline">freio de mão</Link>
          ; pausar e reduzir nunca são barrados. Toda mudança fica no diário, com a decisão que a liberou.
        </p>
      </div>
    </AvisoContext.Provider>
  );
}

const COLS = ["Estado", "Orç./dia", "Freio", "Gasto", "Receita", "ROAS", "CPA", "Compras"] as const;

function Grupo({
  rede,
  campanhas,
  regras,
  demo,
  selecionadas,
  aoSelecionar,
}: {
  rede: AdNetwork;
  campanhas: CampaignRow[];
  regras: ProfitGuardrails;
  demo: boolean;
  selecionadas: Set<string>;
  aoSelecionar: (id: string, marcada: boolean) => void;
}) {
  const [aberto, setAberto] = React.useState(true);
  const [expandidas, setExpandidas] = React.useState<Set<string>>(new Set());
  const totais = somarMetricas(campanhas.map((c) => c.metrics));
  const d = derivadas(totais);
  const todasMarcadas = campanhas.length > 0 && campanhas.every((c) => selecionadas.has(c.id));

  const contagemEstado = { active: 0, paused: 0, archived: 0 } as Record<AdStatus, number>;
  const contagemFreio = { escalar: 0, manter: 0, reduzir: 0, pausar: 0 } as Record<Veredito, number>;
  for (const c of campanhas) {
    contagemEstado[c.status] += 1;
    const dec = decisaoDe(c.metrics, regras);
    if (dec) contagemFreio[dec.veredito] += 1;
  }

  function expandir(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <section className="bg-card overflow-hidden rounded-2xl border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="hover:bg-muted/20 flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        {aberto ? <ChevronDown className="text-muted-foreground size-4" /> : <ChevronRight className="text-muted-foreground size-4" />}
        <span aria-hidden className="h-5 w-1 rounded-full" style={{ backgroundColor: COR_REDE[rede] }} />
        <b className="text-base font-extrabold tracking-tight">{NETWORK_LABEL[rede]}</b>
        <span className="text-muted-foreground text-xs tabular-nums">
          {campanhas.length} {campanhas.length === 1 ? "campanha" : "campanhas"} · {contagemEstado.active}{" "}
          {contagemEstado.active === 1 ? "ativa" : "ativas"}
        </span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          gasto {cents(totais.spendCents)} · receita {cents(totais.revenueCents)}
        </span>
      </button>

      {aberto && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-sm">
            <thead className="text-muted-foreground text-center text-xs">
              <tr className="border-y">
                <th className="w-10 border-r px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar todas de ${NETWORK_LABEL[rede]}`}
                    checked={todasMarcadas}
                    onChange={(e) => campanhas.forEach((c) => aoSelecionar(c.id, e.target.checked))}
                    className="accent-foreground size-4 align-middle"
                  />
                </th>
                <th className="min-w-[18rem] border-r px-3 py-2 text-left font-medium">Campanha</th>
                <th className="border-r px-2 py-2 font-medium">Objetivo</th>
                {COLS.map((c) => (
                  <th key={c} className="border-r px-2 py-2 font-medium last:border-r-0">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map((c) => (
                <React.Fragment key={c.id}>
                  <LinhaCampanha
                    campanha={c}
                    regras={regras}
                    marcada={selecionadas.has(c.id)}
                    aoMarcar={(m) => aoSelecionar(c.id, m)}
                    expandida={expandidas.has(c.id)}
                    aoExpandir={() => expandir(c.id)}
                  />
                  {expandidas.has(c.id) &&
                    c.adSets.map((s) => (
                      <React.Fragment key={s.id}>
                        <LinhaFilha tipo="ad_set" nivel={1} id={s.id} nome={s.name} legenda={`Conjunto · ${s.ads.length} ${s.ads.length === 1 ? "anúncio" : "anúncios"}`} status={s.status} dailyBudgetCents={s.dailyBudgetCents} metrics={s.metrics} regras={regras} />
                        {s.ads.map((a) => (
                          <LinhaFilha key={a.id} tipo="ad" nivel={2} id={a.id} nome={a.name} legenda={[a.creative.title, a.creative.body].filter(Boolean).join(" — ") || "Anúncio"} status={a.status} dailyBudgetCents={null} metrics={a.metrics} regras={regras} />
                        ))}
                      </React.Fragment>
                    ))}
                </React.Fragment>
              ))}
              <AdicionarCampanha rede={rede} demo={demo} />
            </tbody>
            <tfoot>
              <tr className="border-t text-xs">
                <td className="border-r" />
                <td className="border-r px-3 py-2" />
                <td className="border-r" />
                <td className="border-r px-2 py-2">
                  <Barra segmentos={(Object.keys(contagemEstado) as AdStatus[]).map((s) => ({ classe: BARRA_ESTADO[s], n: contagemEstado[s], rotulo: `${STATUS_LABEL[s]}: ${contagemEstado[s]}` }))} />
                </td>
                <td className="border-r px-2 py-2 text-center tabular-nums">
                  <b>{cents(campanhas.reduce((s, c) => s + (c.dailyBudgetCents ?? 0), 0))}</b>
                  <span className="text-muted-foreground block">por dia</span>
                </td>
                <td className="border-r px-2 py-2">
                  <Barra segmentos={(Object.keys(contagemFreio) as Veredito[]).map((v) => ({ classe: BARRA_FREIO[v], n: contagemFreio[v], rotulo: `${VEREDITOS[v].label}: ${contagemFreio[v]}` }))} />
                </td>
                <td className="border-r px-2 py-2 text-center tabular-nums"><b>{cents(totais.spendCents)}</b><span className="text-muted-foreground block">Total</span></td>
                <td className="border-r px-2 py-2 text-center tabular-nums"><b>{cents(totais.revenueCents)}</b><span className="text-muted-foreground block">Total</span></td>
                <td className="border-r px-2 py-2 text-center tabular-nums"><b>{d.roas === null ? "—" : formatRatio(d.roas)}</b><span className="text-muted-foreground block">Média</span></td>
                <td className="border-r px-2 py-2 text-center tabular-nums"><b>{centsExatos(d.cpaCents)}</b><span className="text-muted-foreground block">Média</span></td>
                <td className="px-2 py-2 text-center tabular-nums"><b>{totais.purchases ? formatInteger(totais.purchases) : "—"}</b><span className="text-muted-foreground block">Total</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** A barrinha do rodapé: a distribuição de um grupo em cores. */
function Barra({ segmentos }: { segmentos: { classe: string; n: number; rotulo: string }[] }) {
  const total = segmentos.reduce((s, x) => s + x.n, 0);
  if (total === 0) return <span className="text-muted-foreground block text-center">—</span>;
  return (
    <span className="mx-auto flex h-6 w-full max-w-40 overflow-hidden rounded-md" title={segmentos.filter((s) => s.n).map((s) => s.rotulo).join(" · ")}>
      {segmentos.filter((s) => s.n > 0).map((s) => (
        <span key={s.rotulo} className={cn("h-full", s.classe)} style={{ width: `${(s.n / total) * 100}%` }} aria-label={s.rotulo} />
      ))}
    </span>
  );
}

function LinhaCampanha({
  campanha: c,
  regras,
  marcada,
  aoMarcar,
  expandida,
  aoExpandir,
}: {
  campanha: CampaignRow;
  regras: ProfitGuardrails;
  marcada: boolean;
  aoMarcar: (m: boolean) => void;
  expandida: boolean;
  aoExpandir: () => void;
}) {
  const d = derivadas(c.metrics);
  const dec = decisaoDe(c.metrics, regras);
  return (
    <tr className={cn("border-b", marcada && "bg-muted/25")}>
      <td className="border-r px-2 py-1.5 text-center">
        <input type="checkbox" checked={marcada} onChange={(e) => aoMarcar(e.target.checked)} aria-label={`Selecionar ${c.name}`} className="accent-foreground size-4 align-middle" />
      </td>
      <td className="border-r px-2 py-1.5">
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={aoExpandir} aria-expanded={expandida} aria-label={expandida ? "Recolher" : "Expandir"} className="text-muted-foreground hover:text-foreground shrink-0" disabled={c.adSets.length === 0}>
            {expandida ? <ChevronDown className="size-4" /> : <ChevronRight className={cn("size-4", c.adSets.length === 0 && "opacity-30")} />}
          </button>
          <Link
            href={`/campanhas/campanha/${encodeURIComponent(c.id)}${c.source === "demo" ? "" : "?modo=real"}`}
            title="Abrir todos os dados da campanha"
            className="bg-foreground/10 hover:bg-foreground/20 focus-visible:ring-ring block min-w-0 flex-1 truncate px-2.5 py-1.5 text-left font-bold outline-none focus-visible:ring-2"
          >
            {c.name}
          </Link>
          {c.source === "demo" && <span className="text-muted-foreground shrink-0 text-[0.625rem] font-bold uppercase">demo</span>}
          {c.source === "meta" && <span className="text-muted-foreground shrink-0 text-[0.625rem] font-bold uppercase">Meta</span>}
        </span>
      </td>
      <td className="text-muted-foreground border-r px-2 py-1.5 text-center text-xs">{c.objective ?? "—"}</td>
      <CelulaEstado tipo="campaign" id={c.id} status={c.status} />
      <CelulaOrcamento tipo="campaign" id={c.id} valorCents={c.dailyBudgetCents} />
      <CelulaFreio decisao={dec} />
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{cents(c.metrics.spendCents)}</td>
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{cents(c.metrics.revenueCents)}</td>
      <td className={cn("border-r px-2 py-1.5 text-center font-semibold tabular-nums", d.roas !== null && (d.roas < regras.roasPausa ? "text-destructive" : d.roas < regras.roasMinimo ? "text-warning" : "text-success"))}>{d.roas === null ? "—" : formatRatio(d.roas)}</td>
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{centsExatos(d.cpaCents)}</td>
      <td className="px-2 py-1.5 text-center tabular-nums">{c.metrics.purchases ? formatInteger(c.metrics.purchases) : "—"}</td>
    </tr>
  );
}

function LinhaFilha({
  tipo,
  nivel,
  id,
  nome,
  legenda,
  status,
  dailyBudgetCents,
  metrics,
  regras,
}: {
  tipo: AdEntityType;
  nivel: 1 | 2;
  id: string;
  nome: string;
  legenda: string;
  status: AdStatus;
  dailyBudgetCents: number | null;
  metrics: AdMetrics;
  regras: ProfitGuardrails;
}) {
  const d = derivadas(metrics);
  const dec = decisaoDe(metrics, regras);
  return (
    <tr className={cn("border-b", nivel === 1 ? "bg-muted/10" : "bg-muted/20")}>
      <td className="border-r" />
      <td className="border-r px-2 py-1.5">
        <span className="flex items-start gap-1.5" style={{ paddingLeft: nivel * 22 }}>
          <span className="text-muted-foreground mt-0.5 shrink-0 text-xs">└</span>
          <span className="min-w-0">
            <CelulaTexto tipo={tipo} id={id} valor={nome} pequeno />
            <small className="text-muted-foreground block truncate">{legenda}</small>
          </span>
        </span>
      </td>
      <td className="text-muted-foreground border-r px-2 py-1.5 text-center text-xs">{tipo === "ad_set" ? "Conjunto" : "Anúncio"}</td>
      <CelulaEstado tipo={tipo} id={id} status={status} />
      {tipo === "ad" ? <td className="text-muted-foreground border-r px-2 py-1.5 text-center">—</td> : <CelulaOrcamento tipo={tipo} id={id} valorCents={dailyBudgetCents} />}
      <CelulaFreio decisao={dec} />
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{cents(metrics.spendCents)}</td>
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{cents(metrics.revenueCents)}</td>
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{d.roas === null ? "—" : formatRatio(d.roas)}</td>
      <td className="border-r px-2 py-1.5 text-center tabular-nums">{centsExatos(d.cpaCents)}</td>
      <td className="px-2 py-1.5 text-center tabular-nums">{metrics.purchases ? formatInteger(metrics.purchases) : "—"}</td>
    </tr>
  );
}

/** O nome: texto que vira campo ao clicar; Enter ou sair do campo salva. */
function CelulaTexto({ tipo, id, valor, pequeno }: { tipo: AdEntityType; id: string; valor: string; pequeno?: boolean }) {
  const avisar = React.useContext(AvisoContext);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(valor);
  const [pendente, startTransition] = React.useTransition();
  /* Quando o servidor devolve um nome novo, o campo acompanha — ajuste de
     estado durante o render, como o React recomenda para "derivar de prop". */
  const [valorVisto, setValorVisto] = React.useState(valor);
  if (valorVisto !== valor) {
    setValorVisto(valor);
    setTexto(valor);
  }

  function confirmar() {
    setEditando(false);
    const novo = texto.trim();
    if (!novo || novo === valor) { setTexto(valor); return; }
    startTransition(async () => avisar(await salvar({ tipo, id, name: novo })));
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") { setTexto(valor); setEditando(false); } }}
        className="border-input bg-background focus-visible:ring-ring h-8 w-full min-w-40 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditando(true)} title="Clique para renomear" className={cn("hover:bg-muted/40 min-w-0 truncate rounded px-1 text-left", pequeno ? "text-[0.8125rem] font-semibold" : "font-semibold", pendente && "opacity-50")}>
      {texto}
    </button>
  );
}

/** O estado: célula sólida colorida; clicar abre as opções. */
function CelulaEstado({ tipo, id, status }: { tipo: AdEntityType; id: string; status: AdStatus }) {
  const avisar = React.useContext(AvisoContext);
  const [aberto, setAberto] = React.useState(false);
  const [pendente, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLTableCellElement>(null);

  React.useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

  function escolher(novo: AdStatus) {
    setAberto(false);
    if (novo === status) return;
    startTransition(async () => avisar(await salvar({ tipo, id, status: novo })));
  }

  return (
    <td ref={ref} className="relative border-r p-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={cn("flex h-full min-h-10 w-full items-center justify-center px-2 text-sm font-bold", CELULA_ESTADO[status], pendente && "opacity-60")}
      >
        {pendente ? "…" : STATUS_LABEL[status]}
      </button>
      {aberto && (
        <ul role="listbox" className="bg-popover absolute top-full left-0 z-30 mt-1 w-40 space-y-1 rounded-lg border p-1.5 shadow-xl">
          {(Object.keys(STATUS_LABEL) as AdStatus[]).map((s) => (
            <li key={s}>
              <button type="button" role="option" aria-selected={s === status} onClick={() => escolher(s)} className={cn("w-full rounded-md py-1.5 text-sm font-bold", CELULA_ESTADO[s], s === status && "ring-foreground ring-2")}>
                {STATUS_LABEL[s]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </td>
  );
}

/** O orçamento diário: número que vira campo ao clicar. */
function CelulaOrcamento({ tipo, id, valorCents }: { tipo: AdEntityType; id: string; valorCents: number | null }) {
  const avisar = React.useContext(AvisoContext);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(valorCents === null ? "" : String(valorCents / 100));
  const [pendente, startTransition] = React.useTransition();
  const [valorVisto, setValorVisto] = React.useState(valorCents);
  if (valorVisto !== valorCents) {
    setValorVisto(valorCents);
    setTexto(valorCents === null ? "" : String(valorCents / 100));
  }

  function confirmar(aprovado = false) {
    setEditando(false);
    const novo = Number(texto.replace(",", "."));
    if (!Number.isFinite(novo) || Math.round(novo * 100) === (valorCents ?? -1)) return;
    startTransition(async () => {
      const r = await salvar({ tipo, id, dailyBudget: String(novo), ...(aprovado ? { aprovado: "on" } : {}) });
      if (r.pedeAprovacao && window.confirm(`${r.mensagem}\n\nAprovar este aumento?`)) {
        avisar(await salvar({ tipo, id, dailyBudget: String(novo), aprovado: "on" }));
      } else {
        avisar(r);
      }
    });
  }

  return (
    <td className="border-r px-1 py-1 text-center tabular-nums">
      {editando ? (
        <input
          autoFocus
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => confirmar()}
          onKeyDown={(e) => { if (e.key === "Enter") confirmar(); if (e.key === "Escape") setEditando(false); }}
          className="border-input bg-background focus-visible:ring-ring h-8 w-24 rounded-md border px-2 text-right text-sm outline-none focus-visible:ring-2"
        />
      ) : (
        <button type="button" onClick={() => setEditando(true)} title="Clique para mudar o orçamento" className={cn("hover:bg-muted/40 w-full rounded px-2 py-1", pendente && "opacity-50")}>
          {valorCents === null ? "—" : formatCurrency(valorCents / 100)}
        </button>
      )}
    </td>
  );
}

/** O freio de mão: célula sólida, só leitura; o motivo no título. */
function CelulaFreio({ decisao }: { decisao: ReturnType<typeof decisaoDe> }) {
  if (!decisao) return <td className="text-muted-foreground border-r px-2 py-1.5 text-center text-xs">sem gasto</td>;
  return (
    <td className="border-r p-0">
      <span title={decisao.motivo} className={cn("flex min-h-10 w-full cursor-help items-center justify-center px-2 text-sm font-bold", CELULA_FREIO[decisao.veredito])}>
        {VEREDITOS[decisao.veredito].label}
      </span>
    </td>
  );
}

/** A última linha do grupo: "+ Adicionar campanha", que vira um formulário curto. */
function AdicionarCampanha({ rede, demo }: { rede: AdNetwork; demo: boolean }) {
  const [aberto, setAberto] = React.useState(false);
  const [estado, acao, pendente] = useActionState<ResultadoAds | null, FormData>(createCampaignAction, null);

  React.useEffect(() => {
    if (!estado?.ok) return;
    const t = window.setTimeout(() => setAberto(false), 1500);
    return () => window.clearTimeout(t);
  }, [estado]);

  return (
    <tr className="border-b">
      <td className="border-r" />
      <td colSpan={COLS.length + 2} className="px-3 py-1.5">
        {!aberto ? (
          <button type="button" onClick={() => setAberto(true)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1 text-sm">
            <Plus className="size-4" /> Adicionar campanha
          </button>
        ) : (
          <form action={acao} className="flex flex-wrap items-center gap-2 py-1">
            <input type="hidden" name="network" value={rede} />
            <input type="hidden" name="objective" value="Vendas" />
            <input name="name" autoFocus required placeholder="Nome da campanha" className="border-input bg-background focus-visible:ring-ring h-8 min-w-56 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-2" />
            <input name="dailyBudget" type="number" min="1" step="1" required placeholder="R$/dia" className="border-input bg-background focus-visible:ring-ring h-8 w-28 rounded-md border px-2 text-sm outline-none focus-visible:ring-2" />
            <Button type="submit" size="sm" disabled={pendente || demo}>{pendente ? "Criando…" : "Criar pausada"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            {demo && <span className="text-muted-foreground text-xs">Em demonstração a criação fica desligada.</span>}
            {estado && <span role="status" className={cn("text-xs font-semibold", estado.ok ? "text-success" : "text-warning")}>{estado.mensagem}</span>}
          </form>
        )}
      </td>
    </tr>
  );
}

function SeedButton() {
  const [estado, acao, pendente] = useActionState<ResultadoAds | null>(seedDemoCampaignsAction, null);
  return (
    <form action={acao} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>{pendente ? "Carregando…" : "Carregar exemplos"}</Button>
      {estado && <span role="status" className={cn("text-xs font-semibold", estado.ok ? "text-success" : "text-warning")}>{estado.mensagem}</span>}
    </form>
  );
}

function SyncButton({ habilitado }: { habilitado: boolean }) {
  const [estado, acao, pendente] = useActionState<ResultadoAds | null>(syncMetaAction, null);
  return (
    <form action={acao} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={!habilitado || pendente} title={habilitado ? "Puxar campanhas, conjuntos e anúncios do Meta" : "Conecte o Meta em Integrações"}>
        <RefreshCw className={cn(pendente && "animate-spin")} />
        {pendente ? "Sincronizando…" : "Sincronizar com o Meta"}
      </Button>
      {estado && <span role="status" className={cn("text-xs font-semibold", estado.ok ? "text-success" : "text-warning")}>{estado.mensagem}</span>}
    </form>
  );
}
