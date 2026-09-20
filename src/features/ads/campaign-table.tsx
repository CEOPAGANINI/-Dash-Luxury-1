"use client";

import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import type { CampaignFormAction } from "./demo-store";
import { campaignOrigin, type CampaignSort } from "./manager-model";
import { CampaignClassSelect } from "./campaign-class-select";
import type { CampaignClassId } from "./campaign-classes";
import { InlineCampaignBudget, StatusToggle } from "./campaign-row-actions";
import {
  derivadas,
  somarMetricas,
  STATUS_LABEL,
  type AdMetrics,
  type CampaignRow,
} from "./types";

const currency = (cents: number | null) =>
  cents === null ? "—" : formatCurrency(cents / 100, 2);
const percent = (value: number | null) =>
  value === null ? "—" : formatPercent(value, 2);
const columns: {
  label: string;
  description: string;
  sort?: CampaignSort;
  value: (metrics: AdMetrics) => string;
}[] = [
  {
    label: "Valor gasto",
    description: "Investimento no período",
    sort: "spend",
    value: (m) => currency(m.spendCents),
  },
  {
    label: "Compras",
    description: "Compras atribuídas à campanha",
    value: (m) => formatInteger(m.purchases),
  },
  {
    label: "Custo por compra",
    description: "CPA: gasto dividido pelas compras",
    value: (m) => currency(derivadas(m).cpaCents),
  },
  {
    label: "Receita",
    description: "Receita atribuída à campanha",
    sort: "revenue",
    value: (m) => currency(m.revenueCents),
  },
  {
    label: "ROAS",
    description: "Receita dividida pelo investimento",
    sort: "roas",
    value: (m) => {
      const v = derivadas(m).roas;
      return v === null ? "—" : formatRatio(v);
    },
  },
  {
    label: "Impressões",
    description: "Quantidade de exibições dos anúncios",
    value: (m) => formatInteger(m.impressions),
  },
  {
    label: "Cliques",
    description: "Cliques registrados",
    value: (m) => formatInteger(m.clicks),
  },
  {
    label: "CTR",
    description: "Cliques divididos pelas impressões",
    value: (m) => percent(derivadas(m).ctr),
  },
  {
    label: "CPC",
    description: "Custo médio por clique",
    value: (m) => currency(derivadas(m).cpcCents),
  },
  {
    label: "CPM",
    description: "Custo por mil impressões",
    value: (m) => currency(derivadas(m).cpmCents),
  },
  {
    label: "Resultado após mídia",
    description: "Receita menos mídia; não desconta produto, taxas ou impostos",
    value: (m) => currency(m.revenueCents - m.spendCents),
  },
  {
    label: "Margem após mídia",
    description:
      "Resultado após mídia dividido pela receita; não é margem líquida",
    value: (m) => percent(derivadas(m).margem),
  },
];

export function CampaignTable({
  campaigns,
  revision,
  action,
  sort,
  onSort,
  selectedId,
  onManage,
  onAnalyze,
  onClassChange,
}: {
  campaigns: CampaignRow[];
  revision: number;
  action?: CampaignFormAction;
  sort: CampaignSort;
  onSort: (sort: CampaignSort) => void;
  selectedId: string | null;
  onManage: (id: string) => void;
  onAnalyze?: (id: string) => void;
  onClassChange?: (id: string, value: CampaignClassId) => void;
}) {
  const totals = somarMetricas(campaigns.map((c) => c.metrics));
  return (
    <>
      <p className="campaign-table-help" id="campaign-table-help">
        Clique no orçamento para editar. Pause ou ative na própria linha.
        Deslize a tabela para ver todas as métricas. Use “Métricas e funil” para
        analisar ou simular uma campanha.
      </p>
      <div
        className="campaign-table-scroll"
        role="region"
        aria-label="Tabela de campanhas com rolagem horizontal"
        aria-describedby="campaign-table-help"
        tabIndex={0}
      >
        <table className="campaign-table">
          <caption className="sr-only">
            Campanhas e métricas dos últimos 7 dias. Totais consideram somente
            as campanhas filtradas.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="campaign-status-column">
                Veiculação
              </th>
              <th
                scope="col"
                className="campaign-name-column"
                aria-sort={sort === "name" ? "ascending" : "none"}
              >
                <button onClick={() => onSort("name")}>
                  Campanha{sort === "name" && <small>A–Z</small>}
                </button>
              </th>
              <th scope="col" className="campaign-budget-column">
                Orçamento diário
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  title={column.description}
                  aria-sort={
                    column.sort
                      ? sort === column.sort
                        ? "descending"
                        : "none"
                      : undefined
                  }
                >
                  {column.sort ? (
                    <button onClick={() => onSort(column.sort!)}>
                      {column.label}
                      {sort === column.sort && <small>Maior primeiro</small>}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              <th scope="col">Objetivo</th>
              <th scope="col">Grupos / conjuntos</th>
              <th scope="col">Anúncios</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const readOnly = campaign.id.startsWith("demo-") && !action;
              return (
                <tr
                  key={`${revision}-${campaign.id}`}
                  aria-label={campaign.name}
                  data-selected={selectedId === campaign.id || undefined}
                >
                  <td className="campaign-status-column">
                    <span
                      className="campaign-delivery"
                      data-status={campaign.status}
                    >
                      <span aria-hidden />
                      {STATUS_LABEL[campaign.status]}
                    </span>
                    {!readOnly && campaign.status !== "archived" && (
                      <StatusToggle
                        tipo="campaign"
                        id={campaign.id}
                        nome={campaign.name}
                        status={campaign.status}
                        action={action}
                      />
                    )}
                  </td>
                  <th scope="row" className="campaign-name-column">
                    <button
                      className="campaign-name-button"
                      onClick={() => onManage(campaign.id)}
                      aria-expanded={selectedId === campaign.id}
                      aria-controls="campaign-selected-details"
                    >
                      {campaign.name}
                    </button>
                    <span className="campaign-table-secondary">
                      {campaignOrigin(campaign)}
                    </span>
                    <CampaignClassSelect
                      campaign={campaign}
                      onChange={onClassChange}
                    />
                    {onAnalyze && (
                      <button
                        className="campaign-analyze-button"
                        aria-label={`Analisar campanha ${campaign.name}`}
                        onClick={() => onAnalyze(campaign.id)}
                        aria-controls="campaign-selected-details"
                      >
                        Métricas e funil
                      </button>
                    )}
                    <button
                      className="campaign-details-button"
                      onClick={() => onManage(campaign.id)}
                      aria-label={`Gerenciar ${campaign.name}`}
                      aria-expanded={selectedId === campaign.id}
                      aria-controls="campaign-selected-details"
                    >
                      {selectedId === campaign.id
                        ? "Fechar detalhes"
                        : "Editar e ver estrutura"}
                    </button>
                  </th>
                  <td className="campaign-budget-column">
                    <InlineCampaignBudget
                      campaign={campaign}
                      readOnly={readOnly}
                      action={action}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.label}>{column.value(campaign.metrics)}</td>
                  ))}
                  <td>{campaign.objective || "—"}</td>
                  <td>{formatInteger(campaign.adSets.length)}</td>
                  <td>
                    {formatInteger(
                      campaign.adSets.reduce(
                        (n, group) => n + group.ads.length,
                        0,
                      ),
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr aria-label="Totais das campanhas filtradas">
              <td className="campaign-status-column">
                {campaigns.filter((c) => c.status === "active").length} ativas
              </td>
              <th scope="row" className="campaign-name-column">
                Total de {campaigns.length} campanhas
                <span className="campaign-table-secondary">
                  Resultados dos filtros atuais
                </span>
              </th>
              <td title="Orçamentos podem usar grupos ou níveis diferentes; não são somados.">
                —
              </td>
              {columns.map((column) => (
                <td key={column.label}>{column.value(totals)}</td>
              ))}
              <td>—</td>
              <td>
                {formatInteger(
                  campaigns.reduce((n, c) => n + c.adSets.length, 0),
                )}
              </td>
              <td>
                {formatInteger(
                  campaigns.reduce(
                    (n, c) =>
                      n +
                      c.adSets.reduce(
                        (sum, group) => sum + group.ads.length,
                        0,
                      ),
                    0,
                  ),
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="campaign-table-footnote">
        Totais de CTR, CPC, CPM, CPA, ROAS e margem são recalculados sobre os
        valores somados, não pela média das linhas. Resultado e margem após
        mídia não descontam outros custos.
      </p>
    </>
  );
}
