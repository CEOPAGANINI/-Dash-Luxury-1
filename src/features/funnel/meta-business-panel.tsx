"use client";

import * as React from "react";
import type {
  MetaEntity,
  MetaInsight,
  MetaInventory,
  MetaBusinessInventory,
  MetaResource,
  TrafficPeriod,
} from "@/features/ads/meta-business-graph";
import type { FunnelNode, FunnelEdge } from "./funnel-model";
import { lojaVazia } from "./store-model";
import { trafficStoreId, toggleStoreBusiness } from "./meta-traffic-scope";
import styles from "./meta-business-panel.module.css";
import {
  DEFAULT_DEMO_SETTINGS,
  DEMO_STORES,
  demoTrafficResponse,
  demoStoreSummary,
  type DemoTrafficSettings,
} from "./meta-traffic-demo";
import { MetaDemoSettings } from "./meta-demo-settings";
import { MetaDemoCreative } from "./meta-demo-creative";
import { matchesTrafficStatus } from "./meta-traffic-status";

const tabs: { id: MetaResource; label: string }[] = [
  { id: "insights", label: "Resultados" },
  { id: "campaigns", label: "Campanhas" },
  { id: "adsets", label: "Conjuntos" },
  { id: "ads", label: "Anúncios" },
  { id: "adcreatives", label: "Criativos" },
  { id: "adspixels", label: "Pixels" },
  { id: "customaudiences", label: "Públicos" },
];
type ResourceData = { rows: (MetaEntity & MetaInsight)[]; fetchedAt: string };
type Load<T> = { data?: T; error?: string; loading: boolean };
function useMeta<T>(
  params: Record<string, string> | null,
  refresh: number,
  demoSettings: DemoTrafficSettings | null = null,
): Load<T> {
  const demo = demoSettings !== null;
  const query = params ? new URLSearchParams(params).toString() : null;
  const [result, setResult] = React.useState<Load<T> & { key?: string }>({
    loading: false,
  });
  const key = query === null ? undefined : `${query}:${refresh}`;
  React.useEffect(() => {
    if (query === null || demo) return;
    const controller = new AbortController();
    const current = `${query}:${refresh}`;
    // Enquanto a resposta não chega, o retorno abaixo já devolve
    // { loading: true } porque result.key ainda é o da consulta anterior.
    fetch(`/api/ads/meta/businesses?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Não foi possível consultar o Meta.");
        return body as T;
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ key: current, data, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            key: current,
            error:
              error instanceof Error ? error.message : "Falha na consulta.",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [query, refresh, demo]);
  if (params && demoSettings)
    return {
      data: demoTrafficResponse(params, demoSettings) as T,
      loading: false,
    };
  return query === null
    ? { loading: false }
    : result.key === key
      ? result
      : { loading: true };
}
const quantity = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR");
function amount(value: unknown, currency?: string) {
  if (!currency) return `${quantity(value)} (moeda não informada)`;
  try {
    return Number(value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency,
    });
  } catch {
    return `${quantity(value)} ${currency}`;
  }
}
const purchaseValue = (values: MetaInsight["actions"]) => {
  for (const type of [
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
  ]) {
    const item = values?.find((value) => value.action_type === type);
    if (item) return Number(item.value) || 0;
  }
  return 0;
};
function Results({ row, currency }: { row: MetaInsight; currency?: string }) {
  const spend = Number(row.spend ?? 0),
    purchases = purchaseValue(row.actions),
    revenue = purchaseValue(row.action_values);
  const values = [
    ["Gasto", amount(spend, currency)],
    ["Impressões", quantity(row.impressions)],
    ["Cliques", quantity(row.clicks)],
    ["Compras atribuídas", quantity(purchases)],
    ["Receita atribuída", amount(revenue, currency)],
    ["ROAS", spend > 0 ? (revenue / spend).toFixed(2) : "—"],
    ["CPA", purchases > 0 ? amount(spend / purchases, currency) : "—"],
    [
      "CTR",
      Number(row.impressions) > 0
        ? `${((Number(row.clicks ?? 0) / Number(row.impressions)) * 100).toFixed(2)}%`
        : "—",
    ],
  ];
  return (
    <dl className={styles.metrics}>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function State({ value }: { value: Load<unknown> }) {
  return value.loading ? (
    <p role="status">Consultando o Meta…</p>
  ) : value.error ? (
    <p role="alert" className={styles.error}>
      {value.error}
    </p>
  ) : null;
}

export function MetaBusinessPanel({
  node,
  nodes,
  edges,
  onChange,
  onClose,
}: {
  node: FunnelNode;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  onChange: (id: string, patch: Partial<FunnelNode>) => void;
  onClose: () => void;
}) {
  const [refresh, setRefresh] = React.useState(0);
  const [selectedBusiness, setSelectedBusiness] = React.useState("");
  const [selectedAccount, setSelectedAccount] = React.useState("");
  const [period, setPeriod] = React.useState<TrafficPeriod>("last_7d");
  const [resource, setResource] = React.useState<MetaResource>("insights");
  const [bindingError, setBindingError] = React.useState("");
  const [campaignFilter, setCampaignFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [isDemo, setIsDemo] = React.useState(true);
  const [demoStoreId, setDemoStoreId] = React.useState(DEMO_STORES[0].id);
  const [demoSettings, setDemoSettings] = React.useState<DemoTrafficSettings>({
    ...DEFAULT_DEMO_SETTINGS,
  });
  const [demoBindings, setDemoBindings] = React.useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      DEMO_STORES.map((s) => [s.id, [...(s.loja?.metaBusinessIds ?? [])]]),
    ),
  );
  const stores = isDemo ? DEMO_STORES : nodes.filter((n) => n.type === "store");
  const storeId = isDemo ? demoStoreId : trafficStoreId(node, nodes, edges);
  const store = stores.find((n) => n.id === storeId);
  const businessIds = isDemo
    ? (demoBindings[storeId] ?? [])
    : (store?.loja?.metaBusinessIds ?? []);
  const simulated = isDemo ? demoSettings : null;
  const catalog = useMeta<MetaInventory>({}, refresh, simulated);
  const businessId = businessIds.includes(selectedBusiness)
    ? selectedBusiness
    : (businessIds[0] ?? "");
  const accessible = catalog.data?.businesses.some((b) => b.id === businessId);
  const business = useMeta<MetaBusinessInventory>(
    businessId && accessible ? { businessId } : null,
    refresh,
    simulated,
  );
  const account =
    business.data?.accounts.find((a) => a.id === selectedAccount) ??
    (isDemo ? business.data?.accounts[0] : undefined);
  const data = useMeta<ResourceData>(
    businessId && account
      ? { businessId, accountId: account.id, resource, period }
      : null,
    refresh,
    simulated,
  );
  const campaigns = useMeta<ResourceData>(
    businessId && account && (resource === "adsets" || resource === "ads")
      ? { businessId, accountId: account.id, resource: "campaigns", period }
      : null,
    refresh,
    simulated,
  );
  const summary = isDemo
    ? demoStoreSummary(businessIds, period, demoSettings)
    : null;
  const alerts =
    summary && demoSettings.alerts
      ? summary.campaigns.filter((c) => {
          const metrics = c.insights?.data?.[0];
          const spend = Number(metrics?.spend ?? 0),
            purchases = purchaseValue(metrics?.actions),
            revenue = purchaseValue(metrics?.action_values);
          return (
            spend > 0 &&
            (revenue / spend < demoSettings.minimumRoas ||
              (purchases > 0 && spend / purchases > demoSettings.maximumCpa))
          );
        })
      : [];
  const rows =
    data.data?.rows.filter(
      (row) =>
        matchesTrafficStatus(row, statusFilter) &&
        (!campaignFilter ||
          (resource === "campaigns" ? row.id : row.campaign_id) ===
            campaignFilter),
    ) ?? [];
  const switchBusiness = (value: string) => {
    setSelectedBusiness(value);
    setSelectedAccount("");
    setCampaignFilter("");
  };
  const bind = (id: string, checked: boolean) => {
    if (!store) return;
    if (isDemo) {
      const ids = checked
        ? [...new Set([...businessIds, id])]
        : businessIds.filter((value) => value !== id);
      if (ids.length > 5) {
        setBindingError("Cada loja pode ter até 5 BMs.");
        return;
      }
      setDemoBindings((current) => ({ ...current, [storeId]: ids }));
      setBindingError("");
      if (!ids.includes(businessId)) switchBusiness("");
      return;
    }
    try {
      const ids = toggleStoreBusiness(businessIds, id, checked);
      onChange(store.id, {
        loja: { ...(store.loja ?? lojaVazia()), metaBusinessIds: ids },
      });
      setBindingError("");
      if (!ids.includes(businessId)) switchBusiness("");
    } catch (error) {
      setBindingError(
        error instanceof Error ? error.message : "Vínculo inválido.",
      );
    }
  };
  return (
    <aside
      className={`pub ${styles.panel}`}
      aria-label="Tráfego Facebook da loja"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="pub__head">
        <div>
          <span className="pub__badge">Facebook Ads</span>
          <h2>Tráfego da loja</h2>
        </div>
        <button
          type="button"
          className="pub__x"
          onClick={onClose}
          aria-label="Fechar tráfego Facebook"
        >
          ✕
        </button>
      </header>
      <div className={styles.body}>
        <nav className={styles.tabs} aria-label="Modo dos dados">
          <button
            type="button"
            aria-pressed={isDemo}
            onClick={() => {
              setIsDemo(true);
              switchBusiness("");
              setBindingError("");
            }}
          >
            Demonstração completa
          </button>
          <button
            type="button"
            aria-pressed={!isDemo}
            onClick={() => {
              setIsDemo(false);
              switchBusiness("");
              setBindingError("");
            }}
          >
            Dados reais
          </button>
        </nav>
        {isDemo && (
          <div className={styles.demoBanner}>
            <b>DEMONSTRAÇÃO · dados fictícios</b>
            <p>
              Todas as lojas, pessoas, ativos e métricas deste modo são
              exemplos. Explore sem conectar contas; suas conexões e vínculos
              reais ficam separados.
            </p>
          </div>
        )}
        <label>
          Loja
          <select
            value={storeId}
            onChange={(e) => {
              if (isDemo) setDemoStoreId(e.target.value);
              else
                onChange(node.id, {
                  trafficStoreNodeId: e.target.value || undefined,
                });
              switchBusiness("");
              setBindingError("");
            }}
          >
            {!isDemo && <option value="">Selecione a loja</option>}
            {stores.map((s) => (
              <option value={s.id} key={s.id}>
                {s.title}
                {s.loja?.dominio ? ` · ${s.loja.dominio}` : ""}
              </option>
            ))}
          </select>
        </label>
        {!stores.length && (
          <p>Adicione um bloco Loja ao quadro para vincular suas BMs.</p>
        )}
        <div className={styles.toolbar}>
          <button type="button" onClick={() => setRefresh((n) => n + 1)}>
            {isDemo ? "Atualizar demonstração" : "Atualizar dados"}
          </button>
          <a href="/integracoes">Conectar Meta</a>
        </div>
        <State value={catalog} />
        {catalog.data && (
          <p className={styles.note}>
            {isDemo ? "Perfil de exemplo:" : "Perfil autorizado:"}{" "}
            <b>{catalog.data.profile.name ?? "Facebook"}</b> · ID{" "}
            {catalog.data.profile.id}. Pessoas das BMs aparecem abaixo conforme
            as permissões.
          </p>
        )}
        <label>
          Período
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as TrafficPeriod)}
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="last_7d">Últimos 7 dias</option>
            <option value="last_30d">Últimos 30 dias</option>
            <option value="this_month">Este mês</option>
          </select>
        </label>
        {summary && (
          <section className={styles.overview}>
            <h3>Visão geral da loja · demonstração</h3>
            <p>
              {businessIds.length} BMs · {summary.accounts.length} contas ·{" "}
              {
                summary.campaigns.filter((c) => c.effective_status === "ACTIVE")
                  .length
              }{" "}
              campanhas ativas ·{" "}
              {summary.campaigns.filter((c) => c.status === "PAUSED").length}{" "}
              pausadas
            </p>
            <Results row={summary.metrics} currency="BRL" />
            <div className={styles.health}>
              <span>
                {summary.accounts.filter((a) => a.account_status === 2).length}{" "}
                conta(s) com restrição simulada
              </span>
              <span>
                Pixel:{" "}
                {demoSettings.pixel
                  ? "recebendo eventos simulados"
                  : "desativado na prévia"}
              </span>
              <span>
                API de Conversões:{" "}
                {demoSettings.conversionsApi
                  ? "ativa na simulação"
                  : "desativada na prévia"}
              </span>
              <span>
                UTMs: {demoSettings.utm ? "configuradas" : "desativadas"}
              </span>
            </div>
            {demoSettings.alerts && (
              <details>
                <summary>Alertas simulados · {alerts.length}</summary>
                {alerts.length ? (
                  alerts.map((c) => (
                    <p key={c.id}>
                      {c.name} · {c.id.split("-campaign")[0]}: ROAS abaixo de{" "}
                      {demoSettings.minimumRoas} ou CPA acima de{" "}
                      {amount(demoSettings.maximumCpa, "BRL")}. Avalie a
                      campanha antes de ampliar o orçamento.
                    </p>
                  ))
                ) : (
                  <p>Nenhuma campanha ultrapassou os limites escolhidos.</p>
                )}
              </details>
            )}
            <MetaDemoSettings
              settings={demoSettings}
              onChange={setDemoSettings}
              onReset={() => {
                setDemoSettings({ ...DEFAULT_DEMO_SETTINGS });
                setDemoBindings(
                  Object.fromEntries(
                    DEMO_STORES.map((s) => [
                      s.id,
                      [...(s.loja?.metaBusinessIds ?? [])],
                    ]),
                  ),
                );
                switchBusiness("");
                setBindingError("");
              }}
            />
          </section>
        )}
        {store && catalog.data && (
          <section>
            <h3>BMs vinculadas · {businessIds.length}/5</h3>
            <p className={styles.note}>
              Selecione as BMs que anunciam ou anunciaram para {store.title}. O
              {isDemo
                ? "vínculo vale apenas nesta demonstração."
                : "vínculo fica salvo nesta loja do quadro."}
            </p>
            <div className={styles.businesses}>
              {catalog.data.businesses.map((b) => (
                <label className={styles.check} key={b.id}>
                  <input
                    type="checkbox"
                    checked={businessIds.includes(b.id)}
                    disabled={
                      !businessIds.includes(b.id) && businessIds.length >= 5
                    }
                    onChange={(e) => bind(b.id, e.target.checked)}
                  />
                  <span>
                    {b.name ?? b.id}
                    <small>ID {b.id}</small>
                  </span>
                </label>
              ))}
            </div>
            {!catalog.data.businesses.length && (
              <p>
                Nenhuma BM acessível. Revise business_management na conexão
                Meta.
              </p>
            )}
            {businessIds
              .filter(
                (id) => !catalog.data!.businesses.some((b) => b.id === id),
              )
              .map((id) => (
                <div key={id} className={styles.error}>
                  BM {id}: acesso indisponível{" "}
                  <button type="button" onClick={() => bind(id, false)}>
                    Desvincular
                  </button>
                </div>
              ))}
            {bindingError && (
              <p role="alert" className={styles.error}>
                {bindingError}
              </p>
            )}
            {!businessIds.length && (
              <p>Vincule de 1 a 5 BMs para acompanhar esta loja.</p>
            )}
          </section>
        )}
        {!!businessIds.length && catalog.data && (
          <label>
            BM
            <select
              value={businessId}
              onChange={(e) => switchBusiness(e.target.value)}
            >
              {businessIds.map((id) => (
                <option key={id} value={id}>
                  {catalog.data!.businesses.find((b) => b.id === id)?.name ??
                    id}
                </option>
              ))}
            </select>
          </label>
        )}
        <State value={business} />
        {business.data && (
          <>
            {business.data.warnings.map((w) => (
              <p className={styles.error} key={w}>
                {w}
              </p>
            ))}
            <details>
              <summary>Páginas e pessoas da BM</summary>
              <h4>Páginas</h4>
              {business.data.pages.map((p) => (
                <p key={p.id}>
                  {p.name} · {p.id}
                </p>
              ))}
              {!business.data.pages.length && <p>Nenhuma página retornada.</p>}
              <h4>Pessoas autorizadas</h4>
              {business.data.people.map((p) => (
                <p key={p.id}>
                  {p.name} · {p.id}
                </p>
              ))}
              {!business.data.people.length && <p>Nenhuma pessoa retornada.</p>}
            </details>
            <label>
              Conta de anúncios
              <select
                value={account?.id ?? ""}
                onChange={(e) => {
                  setSelectedAccount(e.target.value);
                  setCampaignFilter("");
                  setStatusFilter("all");
                }}
              >
                <option value="">Selecione a conta</option>
                {business.data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.id} · {a.currency ?? "sem moeda"} · {a.id}
                  </option>
                ))}
              </select>
            </label>
            {!business.data.accounts.length && (
              <p>Nenhuma conta acessível nesta BM.</p>
            )}
          </>
        )}
        {account && (
          <section>
            <p className={styles.note}>
              Conta {account.id} ·{" "}
              {account.account_status === 1
                ? "ativa"
                : account.account_status === 2
                  ? "desativada"
                  : `status Meta ${account.account_status ?? "não informado"}`}
              . Os resultados abrangem esta conta; use o filtro de campanha
              quando a BM atender outras lojas.
            </p>

            <nav className={styles.tabs} aria-label="Dados da conta">
              {tabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  aria-pressed={resource === tab.id}
                  onClick={() => {
                    setResource(tab.id);
                    setStatusFilter("all");
                    setCampaignFilter("");
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {["campaigns", "adsets", "ads"].includes(resource) && (
              <div className={styles.filters}>
                <label>
                  Estado
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">Todos os estados</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="PAUSED">Pausados</option>
                    <option value="ARCHIVED">Arquivados</option>
                  </select>
                </label>
                <label>
                  Campanha
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                  >
                    <option value="">Todas as campanhas</option>
                    {(resource === "campaigns"
                      ? data.data
                      : campaigns.data
                    )?.rows.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ?? c.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <State value={data} />
            {campaigns.error &&
              ["campaigns", "adsets", "ads"].includes(resource) && (
                <p role="alert" className={styles.error}>
                  Filtro de campanha indisponível: {campaigns.error}
                </p>
              )}
            {data.data && (
              <>
                <p className={styles.note}>
                  Consulta:{" "}
                  {new Date(data.data.fetchedAt).toLocaleString("pt-BR")} ·
                  {isDemo
                    ? "dados fictícios de demonstração"
                    : "dados da API Meta"}
                </p>
                {resource === "insights" ? (
                  data.data.rows.length ? (
                    <Results
                      row={data.data.rows[0]}
                      currency={account.currency}
                    />
                  ) : (
                    <p>O Meta não retornou resultados para este período.</p>
                  )
                ) : (
                  <>
                    <p>
                      {rows.length}{" "}
                      {tabs
                        .find((tab) => tab.id === resource)
                        ?.label.toLowerCase()}{" "}
                      retornados
                    </p>
                    {rows.map((row) => (
                      <article className={styles.item} key={row.id}>
                        <h4>{row.name ?? row.title ?? row.id}</h4>
                        <small>
                          ID {row.id}
                          {row.effective_status || row.status
                            ? ` · ${row.effective_status ?? row.status}`
                            : ""}
                        </small>
                        {isDemo && resource === "campaigns" && (
                          <button
                            type="button"
                            onClick={() =>
                              setDemoSettings((current) => ({
                                ...current,
                                campaignStates: {
                                  ...current.campaignStates,
                                  [row.id]:
                                    row.status === "PAUSED"
                                      ? "ACTIVE"
                                      : "PAUSED",
                                },
                              }))
                            }
                          >
                            {row.status === "PAUSED"
                              ? "Simular ativação"
                              : "Simular pausa"}
                          </button>
                        )}
                        {isDemo &&
                          (resource === "adcreatives" || row.creative) && (
                            <MetaDemoCreative
                              id={row.creative?.id ?? row.id}
                              title={row.creative?.title ?? row.title}
                              body={row.creative?.body ?? row.body}
                            />
                          )}
                        {isDemo && resource === "adsets" && (
                          <details>
                            <summary>
                              Público e posicionamentos · exemplo
                            </summary>
                            <p>
                              Brasil · 25 a 54 anos · todos os gêneros · Feed,
                              Stories, Reels e Marketplace. Otimização:
                              Purchase. Orçamento compartilhado da campanha.
                            </p>
                          </details>
                        )}
                        {isDemo && resource === "customaudiences" && (
                          <p className={styles.note}>
                            Origem:{" "}
                            {row.subtype === "LOOKALIKE"
                              ? "semelhantes aos compradores"
                              : "pixel e eventos da loja"}{" "}
                            · tamanho estimado de exemplo:{" "}
                            {row.subtype === "LOOKALIKE"
                              ? "1.200.000"
                              : "24.800"}{" "}
                            pessoas.
                          </p>
                        )}
                        {isDemo && resource === "adspixels" && (
                          <details>
                            <summary>
                              Eventos e qualidade · demonstração
                            </summary>
                            <p>
                              PageView: 18.400 · ViewContent: 9.200 · AddToCart:
                              1.140 · InitiateCheckout: 480 · Purchase: 186.
                              Contagens de exemplo independentes do período do
                              relatório.
                            </p>
                            <p>
                              API de Conversões:{" "}
                              {demoSettings.conversionsApi
                                ? "ativa, event_id configurado, deduplicação simulada de 98%"
                                : "desativada nesta prévia"}
                              . Qualidade de correspondência ilustrativa:
                              8,2/10.
                            </p>
                          </details>
                        )}
                        {row.campaign_id && (
                          <p className={styles.note}>
                            Campanha {row.campaign_id}
                            {row.adset_id ? ` · conjunto ${row.adset_id}` : ""}
                          </p>
                        )}
                        {row.creative && (
                          <p>
                            Criativo {row.creative.id} ·{" "}
                            {row.creative.title ?? row.creative.name ?? ""}
                            <br />
                            {row.creative.body}
                          </p>
                        )}
                        {row.body && <p>{row.body}</p>}
                        {row.subtype && <p>Tipo: {row.subtype}</p>}
                        {resource === "adspixels" && (
                          <p>
                            Último evento:{" "}
                            {row.last_fired_time
                              ? new Date(row.last_fired_time).toLocaleString(
                                  "pt-BR",
                                )
                              : "não informado pelo Meta"}
                          </p>
                        )}
                        {row.insights?.data?.[0] && (
                          <Results
                            row={row.insights.data[0]}
                            currency={account.currency}
                          />
                        )}
                        {["campaigns", "adsets", "ads"].includes(resource) &&
                          !row.insights?.data?.length && (
                            <p className={styles.note}>
                              Sem resultados retornados neste período.
                            </p>
                          )}
                      </article>
                    ))}
                    {!rows.length && (
                      <p>Nenhum item retornado para esta consulta.</p>
                    )}
                  </>
                )}
              </>
            )}
            <p className={styles.note}>
              {isDemo && "Estes números são simulados. "}
              Compras e receita atribuídas pelo Meta, conforme a janela da
              conta. Cliques não equivalem a visitas à loja. As listas mostram
              os ativos ainda acessíveis, inclusive pausados; ativos excluídos
              ou sem permissão podem não aparecer.
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
