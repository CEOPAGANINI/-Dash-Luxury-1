"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";

import { BlockPicker } from "@/components/ui/block-picker";
import { Button } from "@/components/ui/button";
import {
  avaliarGuardrails,
  type ProfitGuardrails,
} from "@/features/guardrails/rules";
import { VereditoBadge } from "@/features/guardrails/veredito-badge";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/features/unified-dashboard/formatters";
import { cn } from "@/lib/utils";
import {
  seedDemoCampaignsAction,
  updateAdEntityAction,
  type ResultadoAds,
} from "./actions";
import {
  STATUS_LABEL,
  derivadas,
  type AdEntityType,
  type AdMetrics,
  type AdNetwork,
  type AdStatus,
  type CampaignRow,
  type CampaignTree,
} from "./types";

import {
  INITIAL_CAMPAIGN_FILTERS,
  NETWORK_MANAGERS,
  campaignOrigin,
  selectCampaigns,
  type CampaignFilters,
  type CampaignSort,
} from "./manager-model";
import { CampaignMetrics } from "./campaign-metrics";
import { CampaignDataUnavailable } from "./campaign-data-unavailable";
import { useCampaignDemo, type CampaignFormAction } from "./demo-store";
import { CampaignTable } from "./campaign-table";
import { StatusToggle } from "./campaign-row-actions";
import { CampaignInsights } from "./campaign-insights";
import { CampaignBoard } from "./campaign-board";
import { CAMPAIGN_CLASSES, isCampaignClass } from "./campaign-classes";
import { useCampaignClasses } from "./campaign-class-store";

function decisaoDe(m: AdMetrics, regras: ProfitGuardrails) {
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

export function CampaignManager({
  tree: suppliedTree,
  regras,
  network,
  view: viewFixa,
}: {
  tree: CampaignTree;
  regras: ProfitGuardrails;
  network: AdNetwork;
  /** Com uma vista fixa, o seletor Quadro/Tabela some: cada vista é uma página. */
  view?: "board" | "table";
}) {
  const simulation = useCampaignDemo();
  const tree =
    suppliedTree.modo === "demo" && !suppliedTree.loadError
      ? { ...suppliedTree, campanhas: simulation.rows }
      : suppliedTree;
  const demoUpdate =
    tree.modo === "demo" ? simulation.update(regras) : undefined;
  const [filters, setFilters] = React.useState<CampaignFilters>(
    INITIAL_CAMPAIGN_FILTERS,
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [viewLivre, setView] = React.useState<"board" | "table">("board");
  const view = viewFixa ?? viewLivre;
  /* Foco numerado: em vez de rolar a lista, um número por campanha. Nas
     páginas de rede (vista fixa) começa na campanha 1; "Todas" continua
     disponível. Fora delas mostra tudo, como antes. */
  const [foco, setFoco] = React.useState<number | null>(viewFixa ? 1 : null);
  const [detailView, setDetailView] = React.useState<"analysis" | "manage">(
    "manage",
  );
  const config = NETWORK_MANAGERS[network];
  const classes = useCampaignClasses(tree.modo, network);
  const allCampaigns = tree.campanhas
    .filter((c) => c.network === network)
    .map((c) => ({ ...c, campaignClass: classes.resolve(c) }));
  const campaigns = selectCampaigns(allCampaigns, network, filters);
  const focoValido =
    foco !== null && campaigns.length > 0
      ? Math.min(foco, campaigns.length)
      : null;
  const visiveis =
    focoValido !== null ? [campaigns[focoValido - 1]] : campaigns;
  const objectives = [
    ...new Set(
      allCampaigns
        .map((c) => c.objective)
        .filter((o): o is string => Boolean(o)),
    ),
  ].sort();
  const setFilter = <K extends keyof CampaignFilters>(
    key: K,
    value: CampaignFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  const openDetails = (id: string, nextView: "analysis" | "manage") => {
    setDetailView(nextView);
    setSelectedId(id);
    requestAnimationFrame(() => {
      const panel = document.getElementById("campaign-selected-details");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView?.({ block: "start", behavior: "instant" });
    });
  };

  if (tree.loadError) return <CampaignDataUnavailable title={config.label} />;

  return (
    <section
      aria-label={`Gerenciador ${config.label}`}
      className="campaign-manager"
    >
      <section
        className="campaign-surface campaign-inventory"
        aria-label="Lista de campanhas"
      >
        <div className="campaign-section-heading campaign-toolbar-linha">
          <div>
            <h1>Suas campanhas</h1>
            <p role="status">
              {campaigns.length} de {allCampaigns.length} ·{" "}
              {campaigns.filter((c) => c.status === "active").length} ativas
            </p>
          </div>
          <div className="campaign-board-toolbar">
            {!viewFixa && (
              <nav
                className="campaign-view-switch"
                aria-label="Visualização das campanhas"
              >
                <button
                  aria-pressed={view === "board"}
                  onClick={() => setView("board")}
                >
                  Quadro de campanhas
                </button>
                <button
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                >
                  Tabela de métricas
                </button>
              </nav>
            )}
            <button
              className="campaign-control"
              onClick={() => setFilters(INITIAL_CAMPAIGN_FILTERS)}
            >
              Limpar filtros
            </button>
          </div>
        </div>
        <div className="campaign-filters">
          <label className="campaign-busca">
            <span className="sr-only">Buscar campanha</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Buscar por nome, classe, objetivo ou ID"
            />
          </label>
          <div className="campaign-filter">
            <span>Estado</span>
            <BlockPicker
              ariaLabel="Estado"
              size="sm"
              tone="claro"
              value={filters.status}
              onChange={(v) =>
                setFilter("status", v as CampaignFilters["status"])
              }
              options={[
                { value: "all", label: "Todos" },
                ...Object.entries(STATUS_LABEL).map(([id, label]) => ({
                  value: id,
                  label,
                })),
              ]}
            />
          </div>
          <div className="campaign-filter">
            <span>Objetivo</span>
            <BlockPicker
              ariaLabel="Objetivo"
              size="sm"
              tone="claro"
              value={filters.objective}
              onChange={(v) => setFilter("objective", v)}
              options={[
                { value: "all", label: "Todos" },
                ...objectives.map((objective) => ({
                  value: objective,
                  label: objective,
                })),
              ]}
            />
          </div>
          <div className="campaign-filter campaign-filter-classe">
            <span>Classe da campanha</span>
            <BlockPicker
              ariaLabel="Classe da campanha"
              size="sm"
              tone="claro"
              value={filters.campaignClass ?? "all"}
              onChange={(value) => {
                if (value === "all" || isCampaignClass(value))
                  setFilter("campaignClass", value);
              }}
              options={[
                { value: "all", label: "Todas" },
                ...CAMPAIGN_CLASSES.map((item) => ({
                  value: item.id,
                  label: item.label,
                })),
              ]}
            />
          </div>
          <div className="campaign-filter">
            <span>Ordenar por</span>
            <BlockPicker
              ariaLabel="Ordenar por"
              size="sm"
              tone="claro"
              value={filters.sort}
              onChange={(v) => setFilter("sort", v as CampaignSort)}
              options={[
                { value: "spend", label: "Maior investimento" },
                { value: "revenue", label: "Maior receita" },
                { value: "roas", label: "Maior ROAS" },
                { value: "name", label: "Nome da campanha" },
              ]}
            />
          </div>
        </div>
        {classes.notice && (
          <p role="status" className="campaign-class-notice">
            {classes.notice}
          </p>
        )}
        {campaigns.length > 0 && (
          <div className="campaign-pager" role="group" aria-label="Campanha em foco">
            <button
              type="button"
              className="campaign-pager-seta"
              aria-label="Campanha anterior"
              disabled={focoValido === null || focoValido <= 1}
              onClick={() => setFoco((f) => Math.max(1, (f ?? 1) - 1))}
            >
              ‹
            </button>
            <BlockPicker
              ariaLabel="Número da campanha"
              size="sm"
              tone="claro"
              value={focoValido === null ? "all" : String(focoValido)}
              onChange={(v) => setFoco(v === "all" ? null : Number(v))}
              options={[
                ...campaigns.map((c, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                  title: c.name,
                })),
                { value: "all", label: "Todas" },
              ]}
            />
            <button
              type="button"
              className="campaign-pager-seta"
              aria-label="Próxima campanha"
              disabled={focoValido === null || focoValido >= campaigns.length}
              onClick={() => setFoco((f) => Math.min(campaigns.length, (f ?? 0) + 1))}
            >
              ›
            </button>
            <span className="campaign-pager-nome" aria-live="polite">
              {focoValido !== null
                ? `${focoValido} de ${campaigns.length} · ${campaigns[focoValido - 1].name}`
                : `${campaigns.length} campanhas`}
            </span>
          </div>
        )}
        <div className="campaign-list">
          {campaigns.length === 0 ? (
            <div className="campaign-empty">
              <h3>
                {allCampaigns.length
                  ? "Nenhuma campanha corresponde aos filtros"
                  : `Nenhuma campanha de ${config.label}`}
              </h3>
              <p>
                {allCampaigns.length
                  ? "Ajuste a busca ou limpe os filtros para visualizar novamente."
                  : "As campanhas cadastradas ou sincronizadas desta rede aparecerão aqui."}
              </p>
            </div>
          ) : (
            <>
              {view === "board" ? (
                <CampaignBoard
                  campaigns={visiveis}
                  revision={simulation.revision}
                  action={demoUpdate}
                  selectedId={selectedId}
                  onManage={(id) => openDetails(id, "manage")}
                  onAnalyze={(id) => openDetails(id, "analysis")}
                  onClassChange={classes.assign}
                />
              ) : (
                <CampaignTable
                  campaigns={visiveis}
                  revision={simulation.revision}
                  action={demoUpdate}
                  sort={filters.sort}
                  onClassChange={classes.assign}
                  onSort={(sort) => setFilter("sort", sort)}
                  selectedId={selectedId}
                  onManage={(id) => {
                    setDetailView("manage");
                    setSelectedId((current) =>
                      current === id && detailView === "manage" ? null : id,
                    );
                  }}
                  onAnalyze={(id) => {
                    openDetails(id, "analysis");
                  }}
                />
              )}
              {campaigns
                .filter((campaign) => campaign.id === selectedId)
                .map((campaign) => (
                  <article
                    key={`${simulation.revision}-${campaign.id}`}
                    className="campaign-row"
                    aria-label={campaign.name}
                    id="campaign-selected-details"
                    tabIndex={-1}
                  >
                    <div className="campaign-section-heading">
                      <div>
                        <p className="campaign-eyebrow">
                          {campaignOrigin(campaign)}
                          {campaign.objective ? ` · ${campaign.objective}` : ""}
                        </p>
                        <h3>{campaign.name}</h3>
                      </div>
                      <div className="campaign-toolbar">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setDetailView(
                              detailView === "analysis" ? "manage" : "analysis",
                            )
                          }
                        >
                          {detailView === "analysis"
                            ? "Editar e ver estrutura"
                            : "Métricas e funil"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedId(null)}
                        >
                          Fechar detalhes da campanha
                        </Button>
                      </div>
                    </div>
                    {detailView === "analysis" ? (
                      <CampaignInsights campaign={campaign} rules={regras} />
                    ) : (
                      <div className="campaign-disclosure">
                        <div className="campaign-structure-heading">
                          <span>Gerenciar campanha</span>
                          <span>
                            {campaign.adSets.length}{" "}
                            {network === "meta" ? "conjuntos" : "grupos"} ·{" "}
                            {campaign.adSets.reduce(
                              (n, group) => n + group.ads.length,
                              0,
                            )}{" "}
                            anúncios
                          </span>
                        </div>
                        <div className="campaign-detail-content">
                          <EntityDetails
                            tipo="campaign"
                            entity={campaign}
                            regras={regras}
                            action={demoUpdate}
                          />
                          <h4>{config.groups}</h4>
                          {campaign.adSets.length === 0 && (
                            <p className="campaign-note">
                              Nenhum grupo cadastrado nesta campanha.
                              {campaign.source !== "meta"
                                ? " A criação local organiza o planejamento; não publica grupos ou anúncios."
                                : ""}
                            </p>
                          )}
                          {campaign.adSets.map((group) => (
                            <details className="campaign-child" key={group.id}>
                              <summary>
                                <span>{group.name}</span>
                                <span>
                                  {STATUS_LABEL[group.status]} ·{" "}
                                  {group.ads.length} anúncios
                                </span>
                              </summary>
                              <div className="campaign-detail-content">
                                <EntityDetails
                                  tipo="ad_set"
                                  entity={group}
                                  regras={regras}
                                  action={demoUpdate}
                                />
                                {group.ads.length === 0 && (
                                  <p className="campaign-note">
                                    Nenhum anúncio neste grupo.
                                  </p>
                                )}
                                {group.ads.map((ad) => (
                                  <details
                                    key={ad.id}
                                    className="campaign-child"
                                  >
                                    <summary>
                                      <span>{ad.name}</span>
                                      <span>{STATUS_LABEL[ad.status]}</span>
                                    </summary>
                                    <div className="campaign-detail-content">
                                      <p>
                                        {[ad.creative.title, ad.creative.body]
                                          .filter(Boolean)
                                          .join(" · ") ||
                                          "Sem texto criativo cadastrado."}
                                      </p>
                                      <EntityDetails
                                        tipo="ad"
                                        entity={{
                                          ...ad,
                                          dailyBudgetCents: null,
                                        }}
                                        regras={regras}
                                        action={demoUpdate}
                                      />
                                    </div>
                                  </details>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
            </>
          )}
        </div>
      </section>
      <p className="campaign-note">
        {tree.modo === "demo"
          ? "Ambiente de teste: limites de segurança simulados, sem gasto real. Os resultados históricos fictícios não mudam ao pausar uma campanha. "
          : ""}
        Aumentos de orçamento e reativações passam pelos{" "}
        <Link href="/seguranca">limites de segurança</Link>. Alterações ficam no{" "}
        {tree.modo === "demo" ? "navegador" : "histórico"}. Métricas derivadas
        sem base suficiente aparecem como “—”.
      </p>
      {tree.modo === "banco" && (
        <details className="campaign-disclosure campaign-example-tools">
          <summary>Ferramentas de demonstração</summary>
          <p>
            Adiciona campanhas de exemplo nas três redes, identificadas como
            “Exemplo”. Não publica anúncios.
          </p>
          <SeedButton />
        </details>
      )}
    </section>
  );
}

function EntityDetails({
  tipo,
  entity,
  regras,
  action,
}: {
  tipo: AdEntityType;
  entity: Pick<
    CampaignRow,
    "id" | "name" | "status" | "dailyBudgetCents" | "metrics"
  >;
  regras: ProfitGuardrails;
  action?: CampaignFormAction;
}) {
  const [editing, setEditing] = React.useState(false);
  const demo = entity.id.startsWith("demo-");
  const d = derivadas(entity.metrics);
  const currency = (cents: number | null) =>
    cents === null ? "—" : formatCurrency(cents / 100, 2);
  const decision =
    entity.metrics.spendCents > 0 ? decisaoDe(entity.metrics, regras) : null;
  return (
    <div className="campaign-entity">
      <dl className="campaign-detail-metrics">
        {[
          ["Orçamento diário", currency(entity.dailyBudgetCents)],
          ["Impressões", formatInteger(entity.metrics.impressions)],
          ["Cliques", formatInteger(entity.metrics.clicks)],
          ["CTR", d.ctr === null ? "—" : formatPercent(d.ctr, 2)],
          ["CPC", currency(d.cpcCents)],
          ["CPM", currency(d.cpmCents)],
          ["CPA", currency(d.cpaCents)],
          [
            "Resultado após mídia",
            currency(entity.metrics.revenueCents - entity.metrics.spendCents),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {tipo !== "campaign" && (
        <CampaignMetrics metrics={entity.metrics} compact />
      )}
      <div className="campaign-entity-actions">
        <div className="campaign-note">
          {decision ? (
            <>
              <VereditoBadge veredito={decision.veredito} />
              <span>{decision.motivo}</span>
            </>
          ) : (
            "Sem investimento suficiente para avaliar a segurança."
          )}
        </div>
        <div className="campaign-toolbar">
          {demo && !action ? (
            <span className="campaign-note">Exemplo · edição indisponível</span>
          ) : (
            <>
              {entity.status !== "archived" && (
                <StatusToggle
                  tipo={tipo}
                  id={entity.id}
                  nome={entity.name}
                  status={entity.status}
                  action={action}
                />
              )}
              <Button
                variant="outline"
                onClick={() => setEditing((value) => !value)}
                aria-expanded={editing}
              >
                {editing ? "Fechar edição" : "Editar"}
              </Button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <EditarForm
          tipo={tipo}
          id={entity.id}
          nome={entity.name}
          status={entity.status}
          dailyBudgetCents={entity.dailyBudgetCents}
          aoFechar={() => setEditing(false)}
          action={action}
        />
      )}
    </div>
  );
}
/** Com banco e sem campanhas reais, as doze de exemplo dão o que editar. */
function SeedButton() {
  const [estado, acao, pendente] = useActionState<ResultadoAds | null>(
    seedDemoCampaignsAction,
    null,
  );
  return (
    <form action={acao} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? "Carregando…" : "Carregar exemplos"}
      </Button>
      {estado && (
        <span
          role="status"
          className={cn(
            "text-xs font-semibold",
            estado.ok ? "text-success" : "text-warning",
          )}
        >
          {estado.mensagem}
        </span>
      )}
    </form>
  );
}

const INPUT =
  "border-input bg-background focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";

function EditarForm({
  tipo,
  id,
  nome,
  status,
  dailyBudgetCents,
  aoFechar,
  action = updateAdEntityAction,
}: {
  tipo: AdEntityType;
  id: string;
  nome: string;
  status: AdStatus;
  dailyBudgetCents: number | null;
  aoFechar: () => void;
  action?: CampaignFormAction;
}) {
  const [estado, acao, pendente] = useActionState<
    ResultadoAds | null,
    FormData
  >(action, null);

  return (
    <form action={acao} className="campaign-edit-form">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
          Nome
        </span>
        <input name="name" defaultValue={nome} className={cn(INPUT, "mt-1")} />
      </label>
      <div className="block">
        <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
          Estado
        </span>
        <BlockPicker
          name="status"
          ariaLabel="Novo estado"
          size="sm"
          stretch
          className="mt-1"
          defaultValue={status}
          options={[
            { value: "active", label: "Ativa" },
            { value: "paused", label: "Pausada" },
            { value: "archived", label: "Arquivada" },
          ]}
        />
      </div>
      {tipo !== "ad" ? (
        <label className="block">
          <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
            Orçamento/dia (R$)
          </span>
          <input
            name="dailyBudget"
            type="number"
            step="1"
            min="0"
            inputMode="decimal"
            defaultValue={
              dailyBudgetCents === null ? "" : String(dailyBudgetCents / 100)
            }
            className={cn(INPUT, "mt-1")}
          />
        </label>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
      {estado?.pedeAprovacao && (
        <label className="flex items-center gap-2 text-xs md:col-span-4">
          <input
            type="checkbox"
            name="aprovado"
            className="accent-foreground size-4"
          />
          Aprovo este aumento — sei que passa do valor de aprovação do freio de
          mão.
        </label>
      )}
      {estado && (
        <p
          role="status"
          className={cn(
            "text-xs font-semibold md:col-span-4",
            estado.ok ? "text-success" : "text-warning",
          )}
        >
          {estado.mensagem}
        </p>
      )}
    </form>
  );
}

export type { AdSetRow, CampaignRow } from "./types";
