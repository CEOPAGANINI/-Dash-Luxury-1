"use client";

import { useMemo, useState } from "react";
import {
  ACQUISITION_METRICS,
  aggregateMetrics,
  analyzeSalesPatterns,
  type AcquisitionDailyRecord,
  type AcquisitionMetric,
  type PatternEvidence,
  type PatternResult,
} from "./acquisition-analytics";
import type { NetworkId } from "./types";
import styles from "./sales-patterns.module.css";
import { BlockPicker } from "@/components/ui/block-picker";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
function formatValue(value: number | null, metric: AcquisitionMetric) {
  if (value == null) return "Sem dados";
  if (metric === "roas") return `${number.format(value)}x`;
  return metric === "orders" ? number.format(value) : currency.format(value);
}
function shortDate(value: string) {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}
function winnerLabel(result: PatternResult) {
  if (!result.sufficient) return "Histórico insuficiente";
  if (result.winners.length > 1)
    return `Empate: ${result.winners.map((winner) => winner.label).join(" · ")}`;
  return result.winners[0]?.label ?? "Histórico insuficiente";
}

function EvidenceChart({
  evidence,
  metric,
  hourly = false,
  label,
}: {
  evidence: PatternEvidence[];
  metric: AcquisitionMetric;
  hourly?: boolean;
  label: string;
}) {
  const measured = evidence.filter(
    (item) =>
      item.value != null && (hourly ? item.value > 0 : item.observations > 0),
  );
  if (!measured.length)
    return (
      <p className={styles.empty}>
        Sem dados suficientes para exibir o gráfico.
      </p>
    );
  const maximum = Math.max(0, ...measured.map((item) => item.value!));
  return (
    <ul className={styles.chart} aria-label={label}>
      {evidence.map((item) => (
        <li key={item.key} className={styles.chartRow}>
          <div className={styles.chartLabel}>
            <span>{item.label}</span>
            <strong>
              {hourly
                ? `${number.format(item.value ?? 0)} semanas`
                : formatValue(item.value, metric)}
            </strong>
          </div>
          <div className={styles.track} aria-hidden="true">
            <span
              className={styles.bar}
              style={{
                width: `${maximum > 0 ? Math.max(0, ((item.value ?? 0) / maximum) * 100) : 0}%`,
              }}
            />
          </div>
          <small>
            {hourly
              ? `${item.observations} dias com pico nessa faixa`
              : `${item.observations} dias analisados${!item.complete ? ` de ${item.expectedDays} · período incompleto` : ""}`}
          </small>
        </li>
      ))}
    </ul>
  );
}

function PatternHeading({
  title,
  result,
  detail,
}: {
  title: string;
  result: PatternResult;
  detail: string;
}) {
  return (
    <header className={styles.heading}>
      <h3>{title}</h3>
      <strong className={styles.result}>{winnerLabel(result)}</strong>
      <p>{detail}</p>
    </header>
  );
}

export type SalesPatternSection =
  "hourly" | "weekday" | "week" | "fortnight" | "bestDays";
const SECTION_TITLES: Record<SalesPatternSection, string> = {
  hourly: "Horário de pico recorrente",
  weekday: "Melhor dia da semana",
  week: "Melhor semana",
  fortnight: "Melhor quinzena",
  bestDays: "Melhor dia de cada quinzena",
};

export function SalesPatterns({
  records,
  year,
  month,
  networkId,
  timeZone = "America/Sao_Paulo",
  today,
  demoMode = false,
  section,
  metric: controlledMetric,
  onMetricChange,
  historyDays: controlledHistoryDays,
  onHistoryDaysChange,
}: {
  records: AcquisitionDailyRecord[];
  year: number;
  month: number;
  networkId: NetworkId;
  timeZone?: string;
  today?: string;
  demoMode?: boolean;
  section?: SalesPatternSection;
  metric?: AcquisitionMetric;
  onMetricChange?: (metric: AcquisitionMetric) => void;
  historyDays?: 30 | 60 | 90;
  onHistoryDaysChange?: (days: 30 | 60 | 90) => void;
}) {
  const [internalMetric, setInternalMetric] =
    useState<AcquisitionMetric>("received");
  const [internalHistoryDays, setInternalHistoryDays] = useState<30 | 60 | 90>(
    60,
  );
  const metric = controlledMetric ?? internalMetric;
  const historyDays = controlledHistoryDays ?? internalHistoryDays;
  function setMetric(value: AcquisitionMetric) {
    setInternalMetric(value);
    onMetricChange?.(value);
  }
  function setHistoryDays(value: 30 | 60 | 90) {
    setInternalHistoryDays(value);
    onHistoryDaysChange?.(value);
  }
  const showHistoricalWindow =
    section === undefined || section === "hourly" || section === "weekday";
  const title = section ? SECTION_TITLES[section] : "Padrões de vendas";
  const analysis = useMemo(
    () =>
      analyzeSalesPatterns(records, {
        year,
        month,
        networkId,
        metric,
        historyDays,
        timeZone,
        today,
      }),
    [records, year, month, networkId, metric, historyDays, timeZone, today],
  );
  const available = useMemo(
    () =>
      aggregateMetrics(
        records.filter(
          (record) => networkId === "all" || record.networkId === networkId,
        ),
      ),
    [records, networkId],
  );
  const metricName = ACQUISITION_METRICS[metric].label;
  const measure =
    metric === "received" || metric === "orders"
      ? `${metricName} média por dia`
      : `${metricName} calculado pelos totais`;
  const hourlyWinner = analysis.hourly.winners[0];

  return (
    <section className={styles.page} aria-label={title}>
      <header className={`acquisition-block ${styles.controls}`}>
        <div>
          <h2>{title}</h2>
          <p>
            {demoMode
              ? "Evidências simuladas para demonstrar a leitura dos padrões de vendas."
              : "Evidências reais para entender quando a aquisição performa melhor."}
          </p>
        </div>
        <div className={styles.filters}>
          <div className={styles.field}>
            <span>Definir melhor por</span>
            <BlockPicker
              ariaLabel="Definir melhor por"
              size="sm"
              value={metric}
              onChange={(v) => setMetric(v as AcquisitionMetric)}
              options={(
                Object.keys(ACQUISITION_METRICS) as AcquisitionMetric[]
              ).map((key) => {
                const semDados = key !== "received" && available[key] == null;
                return {
                  value: key,
                  disabled: semDados,
                  title: semDados ? "Sem dados" : undefined,
                  label: `${ACQUISITION_METRICS[key].label}${semDados ? " · sem dados" : ""}`,
                };
              })}
            />
          </div>
          {showHistoricalWindow && (
            <div className={styles.field}>
              <span>Histórico recorrente</span>
              <BlockPicker
                ariaLabel="Histórico recorrente"
                size="sm"
                value={String(historyDays)}
                onChange={(v) => setHistoryDays(Number(v) as 30 | 60 | 90)}
                options={[
                  { value: "30", label: "30 dias" },
                  { value: "60", label: "60 dias" },
                  { value: "90", label: "90 dias" },
                ]}
              />
            </div>
          )}
        </div>
        <p className={styles.context}>
          {ACQUISITION_METRICS[metric].lowerIsBetter
            ? "Menor custo é melhor; somente resultados com conversões podem vencer."
            : "Maior resultado é melhor; dias sem dados não são tratados como zero."}{" "}
          {showHistoricalWindow
            ? `Histórico recorrente: ${shortDate(analysis.history.start)} a ${shortDate(analysis.history.end)} (${historyDays} dias).`
            : `Período analisado: ${shortDate(analysis.period.start)} a ${shortDate(analysis.period.end)}.`}{" "}
          Fuso: {timeZone}.
        </p>
      </header>

      <div className={`${styles.grid} ${section ? styles.single : ""}`}>
        {(section === undefined || section === "hourly") && (
          <article className={`acquisition-block ${styles.card}`}>
            <PatternHeading
              title="Horário de pico recorrente"
              result={analysis.hourly}
              detail={
                analysis.hourly.unsupported
                  ? "Receita e vendas são as únicas métricas horárias disponíveis. Escolha uma delas para analisar recorrência."
                  : hourlyWinner
                    ? `Pico em ${hourlyWinner.value} de ${analysis.hourly.weeks} semanas analisadas; ${hourlyWinner.observations} dias sustentam a faixa.`
                    : "São necessários picos em pelo menos duas datas de duas semanas diferentes."
              }
            />
            <p className={styles.caption}>
              {analysis.hourly.metric === "orders"
                ? "Quantidade de vendas"
                : "Receita atribuída"}{" "}
              por faixas de 3 horas · {analysis.hourly.dates} dias com histórico
              horário
            </p>
            {!analysis.hourly.unsupported && (
              <EvidenceChart
                evidence={analysis.hourly.evidence}
                metric={metric}
                hourly
                label="Recorrência semanal dos picos por horário"
              />
            )}
            <p className={styles.note}>
              Empates de pico contam para todas as faixas empatadas; as
              ocorrências não são exclusivas. Horários devem chegar da
              integração no fuso da conta.
            </p>
          </article>
        )}

        {(section === undefined || section === "weekday") && (
          <article className={`acquisition-block ${styles.card}`}>
            <PatternHeading
              title="Melhor dia da semana"
              result={analysis.weekday}
              detail={`${measure}. Pelo menos duas ocorrências por dia da semana e duas categorias comparáveis.`}
            />
            <EvidenceChart
              evidence={analysis.weekday.evidence}
              metric={metric}
              label="Desempenho médio por dia da semana"
            />
          </article>
        )}

        {(section === undefined || section === "week") && (
          <article className={`acquisition-block ${styles.card}`}>
            <PatternHeading
              title="Melhor semana"
              result={analysis.week}
              detail={`${measure}; semanas de segunda a domingo. Ao menos dois dias observados por semana.`}
            />
            <p className={styles.caption}>
              Média do período:{" "}
              <strong>{formatValue(analysis.periodAverage, metric)}</strong>
              {analysis.week.winners.length === 1 &&
              analysis.periodAverage != null &&
              analysis.periodAverage > 0
                ? ` · ${number.format(((analysis.week.winners[0].value! - analysis.periodAverage) / analysis.periodAverage) * 100)}% em relação à média`
                : ""}
            </p>
            <EvidenceChart
              evidence={analysis.week.evidence}
              metric={metric}
              label="Comparação das semanas do mês"
            />
            <p className={styles.note}>
              Semanas incompletas são identificadas. Volumes usam médias por dia
              observado, nunca o total de uma semana curta contra o de uma
              semana cheia.
            </p>
          </article>
        )}

        {(section === undefined || section === "fortnight") && (
          <article className={`acquisition-block ${styles.card}`}>
            <PatternHeading
              title="Melhor quinzena"
              result={analysis.fortnight}
              detail={`${measure}. Cada quinzena precisa de ao menos dois dias observados.`}
            />
            <EvidenceChart
              evidence={analysis.fortnight.evidence}
              metric={metric}
              label="Comparação entre as quinzenas"
            />
            <p className={styles.caption}>
              {analysis.fortnightDifference == null
                ? "Diferença percentual indisponível sem duas bases válidas e base inicial diferente de zero."
                : `2ª quinzena em relação à 1ª: ${number.format(analysis.fortnightDifference)}%.`}
            </p>
            <p className={styles.note}>
              Dias 1–15 contra 16–fim do mês. Médias diárias compensam o número
              diferente de dias; ROAS, CPA e CAC usam os totais corretos.
            </p>
          </article>
        )}

        {(section === undefined || section === "bestDays") && (
          <article
            className={`acquisition-block ${styles.card} ${styles.wide}`}
          >
            <header className={styles.heading}>
              <h3>Melhor dia de cada quinzena</h3>
              <p>
                {metricName} da data ·{" "}
                {ACQUISITION_METRICS[metric].lowerIsBetter
                  ? "menor é melhor"
                  : "maior é melhor"}
                . Pelo menos duas datas com registros para comparação.
              </p>
            </header>
            <div className={styles.bestDays}>
              {analysis.bestDays.map((result, index) => (
                <section
                  key={index}
                  className={styles.dayGroup}
                  aria-label={`Melhor dia da ${index + 1}ª quinzena`}
                >
                  <h4>{index + 1}ª quinzena</h4>
                  <strong className={styles.result}>
                    {winnerLabel(result)}
                  </strong>
                  <p className={styles.caption}>
                    {result.sufficient
                      ? formatValue(result.winners[0]?.value ?? null, metric)
                      : "Sem comparação suficiente"}
                  </p>
                  <EvidenceChart
                    evidence={result.evidence.filter(
                      (item) => item.observations > 0,
                    )}
                    metric={metric}
                    label={`Resultados diários da ${index + 1}ª quinzena`}
                  />
                </section>
              ))}
            </div>
          </article>
        )}
      </div>
      <p className={styles.method}>
        Método: ausência permanece “Sem dados”; zero explícito entra nas médias.
        Dias futuros e parciais não definem vencedores (
        {analysis.excludedPartialDays} dias parciais excluídos neste mês). As
        evidências indicam quantos dias foram observados; lacunas e amostras
        pequenas limitam a conclusão. Uma faixa recorrente descreve o histórico,
        não garante desempenho futuro.
      </p>
    </section>
  );
}
