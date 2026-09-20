"use client";

import { useId, useState } from "react";
import type { ProfitGuardrails } from "@/features/guardrails/rules";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import type { CampaignRow } from "./types";
import {
  calculateCampaignScenario,
  campaignFunnel,
  campaignInsights,
  SCENARIO_FIELDS,
  scenarioFromMetrics,
  type CampaignScenario,
} from "./campaign-insights-model";

const currency = (cents: number | null) =>
  cents === null ? "—" : formatCurrency(cents / 100, 2);
const percent = (value: number | null) =>
  value === null ? "—" : formatPercent(value, 2);
const ratio = (value: number | null) =>
  value === null ? "—" : formatRatio(value);
const expected = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Metrics({
  items,
}: {
  items: { label: string; value: string; formula: string }[];
}) {
  return (
    <dl className="campaign-insight-metrics">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          <p>{item.formula}</p>
        </div>
      ))}
    </dl>
  );
}

export function CampaignInsights({
  campaign,
  rules,
}: {
  campaign: CampaignRow;
  rules: ProfitGuardrails;
}) {
  const [view, setView] = useState("diagnosis");
  const [scenario, setScenario] = useState<CampaignScenario>(() =>
    scenarioFromMetrics(campaign.metrics),
  );
  const [touched, setTouched] = useState(false);
  const id = useId();
  const {
    derived: d,
    conversion,
    ticketCents,
    findings,
  } = campaignInsights(campaign, rules);
  const funnel = campaignFunnel(campaign.metrics);
  const { errors, projection } = calculateCampaignScenario(scenario);
  return (
    <div className="campaign-insights">
      <nav className="campaign-insight-nav" aria-label="Análise da campanha">
        {[
          ["diagnosis", "Diagnóstico"],
          ["calculator", "Calculadora"],
          ["funnel", "Funil de tráfego"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={view === key}
            aria-controls={`${id}-content`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="campaign-note">
        {campaign.source === "demo"
          ? "Histórico demonstrativo · dados fictícios"
          : "Histórico disponível da campanha"}{" "}
        · últimos 7 dias. Os cálculos abaixo pertencem somente a{" "}
        <strong>{campaign.name}</strong>.
      </p>
      <div id={`${id}-content`}>
        {view === "diagnosis" && (
          <section
            aria-label="Diagnóstico da campanha"
            className="campaign-insight-view"
          >
            <header>
              <h4>O que está acontecendo</h4>
              <p>
                Leitura dos números e do mínimo de ROAS configurado. Não altera
                a veiculação.
              </p>
            </header>
            <Metrics
              items={[
                {
                  label: "ROAS",
                  value: ratio(d.roas),
                  formula: "Receita ÷ investimento",
                },
                {
                  label: "Custo por compra",
                  value: currency(d.cpaCents),
                  formula: "Investimento ÷ compras",
                },
                {
                  label: "CTR",
                  value: percent(d.ctr),
                  formula: "Cliques ÷ impressões",
                },
                {
                  label: "Compras por clique",
                  value: percent(conversion),
                  formula: "Compras ÷ cliques",
                },
                {
                  label: "CPC",
                  value: currency(d.cpcCents),
                  formula: "Investimento ÷ cliques",
                },
                {
                  label: "Ticket médio",
                  value: currency(ticketCents),
                  formula: "Receita ÷ compras",
                },
              ]}
            />
            <div className="campaign-findings">
              {findings.map((finding) => (
                <div key={finding.title}>
                  <h5>{finding.title}</h5>
                  <p>{finding.evidence}</p>
                  <p>
                    <strong>O que conferir:</strong> {finding.next}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {view === "calculator" && (
          <section
            aria-label="Calculadora da campanha"
            className="campaign-insight-view"
          >
            <header>
              <h4>Simule um cenário desta campanha</h4>
              <p>
                Premissas preenchidas a partir do histórico, quando disponíveis.
                Ajuste os valores para calcular uma hipótese — sem salvar
                orçamento nem alterar os resultados da tabela.
              </p>
            </header>
            <div className="campaign-scenario-layout">
              <div className="campaign-scenario-inputs">
                {SCENARIO_FIELDS.map((field) => (
                  <div key={field.key} className="campaign-scenario-field">
                    <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
                    <input
                      id={`${id}-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      min={field.min}
                      max={field.max}
                      step="any"
                      value={scenario[field.key]}
                      aria-invalid={touched && Boolean(errors[field.key])}
                      aria-describedby={
                        touched && errors[field.key]
                          ? `${id}-${field.key}-error`
                          : undefined
                      }
                      onChange={(event) => {
                        setTouched(true);
                        setScenario((previous) => ({
                          ...previous,
                          [field.key]: event.target.value,
                        }));
                      }}
                    />
                    {touched && errors[field.key] && (
                      <small id={`${id}-${field.key}-error`}>
                        {errors[field.key]}
                      </small>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => {
                    setScenario(scenarioFromMetrics(campaign.metrics));
                    setTouched(false);
                  }}
                >
                  Restaurar premissas do histórico
                </button>
              </div>
              <div
                className="campaign-scenario-results"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className="campaign-eyebrow">
                  Projeção hipotética · não é resultado realizado
                </p>
                {!projection ? (
                  <p className="campaign-note">
                    Preencha todas as premissas com valores válidos. Sem base
                    histórica, os campos ficam vazios até você informar uma
                    hipótese.
                  </p>
                ) : (
                  <Metrics
                    items={[
                      {
                        label: "Impressões previstas",
                        value: expected(projection.impressions),
                        formula: "Cliques previstos ÷ CTR",
                      },
                      {
                        label: "Cliques previstos",
                        value: expected(projection.clicks),
                        formula: "Investimento ÷ CPC",
                      },
                      {
                        label: "Compras previstas",
                        value: expected(projection.purchases),
                        formula: "Cliques previstos × conversão",
                      },
                      {
                        label: "Receita prevista",
                        value: formatCurrency(projection.revenue, 2),
                        formula: "Compras previstas × ticket",
                      },
                      {
                        label: "ROAS previsto",
                        value: ratio(projection.roas),
                        formula: "Receita prevista ÷ investimento",
                      },
                      {
                        label: "CPA previsto",
                        value:
                          projection.cpa === null
                            ? "—"
                            : formatCurrency(projection.cpa, 2),
                        formula: "Investimento ÷ compras previstas",
                      },
                      {
                        label: "Saldo após mídia",
                        value: formatCurrency(projection.result, 2),
                        formula: "Receita prevista − investimento",
                      },
                      {
                        label: "Investimento simulado",
                        value: formatCurrency(projection.investment, 2),
                        formula: "Valor total deste cenário",
                      },
                    ]}
                  />
                )}
              </div>
            </div>
            <p className="campaign-note">
              Modelo linear: pressupõe CPC, CTR, conversão e ticket constantes.
              Premissas arredondadas; compras fracionárias representam
              expectativa matemática. Não prevê saturação, leilão, impostos ou
              custos do produto. Não garante vendas nem autoriza aumentos de
              orçamento.
            </p>
          </section>
        )}
        {view === "funnel" && (
          <section
            aria-label="Funil da campanha"
            className="campaign-insight-view"
          >
            <header>
              <h4>Da exibição à compra</h4>
              <p>
                Volumes atribuídos nos últimos 7 dias. Barras na mesma escala,
                com os totais sempre visíveis.
              </p>
            </header>
            {funnel.nonSequential && (
              <p className="campaign-insight-warning">
                Os volumes não formam uma sequência decrescente. Confira a
                atribuição: uma compra pode não estar associada a um clique
                medido. As proporções não representam perdas de pessoas.
              </p>
            )}
            <ol className="campaign-funnel">
              {funnel.stages.map((stage, index) => (
                <li key={stage.label}>
                  <div className="campaign-funnel-caption">
                    <div>
                      <span className="campaign-eyebrow">
                        Etapa {index + 1}
                      </span>
                      <h5>{stage.label}</h5>
                    </div>
                    <strong>{formatInteger(stage.count)}</strong>
                    <p>
                      {index === 0
                        ? "Exibições dos anúncios"
                        : `${percent(stage.rate)} ${index === 1 ? "cliques por impressão" : "compras por clique"}`}
                    </p>
                  </div>
                  <div className="campaign-funnel-track" aria-hidden="true">
                    <span style={{ width: `${stage.width}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <Metrics
              items={[
                {
                  label: "Investimento",
                  value: currency(campaign.metrics.spendCents),
                  formula: "Mídia no período",
                },
                {
                  label: "Receita atribuída",
                  value: currency(campaign.metrics.revenueCents),
                  formula: "Receita informada pela campanha",
                },
                {
                  label: "Custo por compra",
                  value: currency(d.cpaCents),
                  formula: "Investimento ÷ compras",
                },
              ]}
            />
            <p className="campaign-note">
              Impressões e cliques não são pessoas únicas. Sessões, carrinhos e
              checkouts não estão disponíveis nesta integração e não foram
              estimados. As razões são entre totais atribuídos, não uma coorte
              de visitantes.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
