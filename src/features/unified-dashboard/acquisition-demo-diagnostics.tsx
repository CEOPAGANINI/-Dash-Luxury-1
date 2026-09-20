import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "./formatters";
import type { NetworkId } from "./types";
import styles from "./acquisition-demo-diagnostics.module.css";

type DemoSection = "funnel" | "audience" | "creatives";

export interface AcquisitionDemoDiagnosticsProps {
  section: DemoSection;
  networkId?: NetworkId;
  year?: number;
  /** Zero-based month, matching the acquisition filters. */
  month?: number;
}

/** Deliberately isolated examples; never merged with the real-data contract. */
const DEMO_CHANNELS = [
  {
    id: "meta",
    name: "Meta Ads",
    campaign: "Exemplo · Descoberta",
    format: "Imagem · demonstração",
    spend: 4200,
    revenue: 25200,
    stages: [180000, 5400, 4800, 800, 320, 300, 280],
    ages: [42, 84, 70, 56, 28],
    newCustomers: 196,
  },
  {
    id: "google",
    name: "Google Ads",
    campaign: "Exemplo · Intenção",
    format: "Pesquisa · demonstração",
    spend: 3600,
    revenue: 19440,
    stages: [120000, 4800, 4320, 720, 240, 228, 216],
    ages: [22, 65, 65, 43, 21],
    newCustomers: 130,
  },
  {
    id: "youtube",
    name: "YouTube Ads",
    campaign: "Exemplo · Vídeo",
    format: "Vídeo · demonstração",
    spend: 1800,
    revenue: 10080,
    stages: [90000, 2700, 2430, 420, 140, 126, 112],
    ages: [28, 34, 28, 16, 6],
    newCustomers: 84,
  },
] as const;

const FUNNEL_STAGES = [
  "Impressões",
  "Cliques no link",
  "Visitas à página",
  "Início de checkout",
  "Compras",
  "Aprovadas",
  "Liquidadas",
];
const AGES = [
  "18–24 anos",
  "25–34 anos",
  "35–44 anos",
  "45–54 anos",
  "55+ anos",
];
const SHADES = ["#f5f5f5", "#d4d4d4", "#bdbdbd", "#a3a3a3", "#858585"];
const TITLES: Record<DemoSection, string> = {
  funnel: "Funil do tráfego",
  audience: "Público e demográficos",
  creatives: "Creative Intelligence",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AcquisitionDemoDiagnostics({
  section,
  networkId = "all",
  year,
  month,
}: AcquisitionDemoDiagnosticsProps) {
  const channels = DEMO_CHANNELS.filter(
    (channel) => networkId === "all" || channel.id === networkId,
  );
  const stages = FUNNEL_STAGES.map((_, index) =>
    channels.reduce((sum, channel) => sum + channel.stages[index], 0),
  );
  const ages = AGES.map((_, index) =>
    channels.reduce((sum, channel) => sum + channel.ages[index], 0),
  );
  const spend = channels.reduce((sum, channel) => sum + channel.spend, 0);
  const revenue = channels.reduce((sum, channel) => sum + channel.revenue, 0);
  const customers = ages.reduce((sum, value) => sum + value, 0);
  const newCustomers = channels.reduce(
    (sum, channel) => sum + channel.newCustomers,
    0,
  );
  const recurringCustomers = customers - newCustomers;
  const period =
    year != null && month != null
      ? new Intl.DateTimeFormat("pt-BR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(year, month, 1)))
      : "período ilustrativo";
  const channelLabel =
    networkId === "all"
      ? "Todos os canais"
      : (channels[0]?.name ?? "Canal não disponível");

  return (
    <section
      className={styles.root}
      aria-label={TITLES[section]}
      data-demo-section={section}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.badge}>Dados de exemplo</span>
          <h2>{TITLES[section]}</h2>
          <p>
            {channelLabel} · {period}
          </p>
        </div>
        <p className={styles.disclaimer}>
          Cenário fictício independente dos totais do calendário. Serve apenas
          para demonstrar esta análise; não representa o desempenho da empresa.
        </p>
      </header>

      {section === "funnel" ? (
        <>
          <dl className={styles.summary}>
            <Metric
              label="Investimento de exemplo"
              value={formatCurrency(spend)}
            />
            <Metric
              label="Compras de exemplo"
              value={formatInteger(stages[4])}
            />
            <Metric
              label="Clique até compra"
              value={formatPercent(
                stages[1] > 0 ? stages[4] / stages[1] : 0,
                2,
              )}
            />
          </dl>
          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <h3>Caminho até a compra</h3>
              <p>
                Barras em escala linear comum: 100% representa as impressões.
              </p>
            </div>
            <ol
              className={styles.funnel}
              aria-label="Etapas do funil de exemplo"
            >
              {stages.map((value, index) => {
                const previous = index > 0 ? stages[index - 1] : null;
                const rate =
                  previous != null && previous > 0 ? value / previous : null;
                const width = stages[0] > 0 ? (value / stages[0]) * 100 : 0;
                return (
                  <li key={FUNNEL_STAGES[index]} data-demo-stage={index}>
                    <div className={styles.funnelValue}>
                      <span>{FUNNEL_STAGES[index]}</span>
                      <strong>{formatInteger(value)}</strong>
                    </div>
                    <div
                      className={styles.track}
                      role="img"
                      aria-label={`${FUNNEL_STAGES[index]}: ${formatInteger(value)}, ${formatPercent(width / 100, 2)} das impressões.`}
                    >
                      <span
                        style={{
                          width: `${width}%`,
                          backgroundColor:
                            SHADES[Math.min(index, SHADES.length - 1)],
                        }}
                      />
                    </div>
                    <div className={styles.conversion}>
                      <span>Da etapa anterior</span>
                      <strong>
                        {rate == null ? "—" : formatPercent(rate, 2)}
                      </strong>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className={styles.note}>
            Cada taxa divide a etapa atual pela anterior. A primeira etapa não
            possui taxa anterior; compras, aprovações e liquidações são estados
            distintos do exemplo.
          </p>
        </>
      ) : null}

      {section === "audience" ? (
        <>
          <dl className={styles.summary}>
            <Metric
              label="Clientes no exemplo"
              value={formatInteger(customers)}
            />
            <Metric
              label="Novos clientes"
              value={formatInteger(newCustomers)}
            />
            <Metric
              label="Clientes recorrentes"
              value={formatInteger(recurringCustomers)}
            />
          </dl>
          <div className={styles.audienceGrid}>
            <section
              className={styles.panel}
              aria-label="Faixas etárias de exemplo"
            >
              <div className={styles.panelHeading}>
                <h3>Distribuição por idade</h3>
                <p>Clientes fictícios · participação na amostra</p>
              </div>
              <ul className={styles.ageList}>
                {ages.map((value, index) => (
                  <li key={AGES[index]}>
                    <div>
                      <span>{AGES[index]}</span>
                      <strong>
                        {formatInteger(value)} ·{" "}
                        {formatPercent(customers > 0 ? value / customers : 0)}
                      </strong>
                    </div>
                    <div
                      className={styles.track}
                      role="img"
                      aria-label={`${AGES[index]}: ${formatInteger(value)} clientes, ${formatPercent(customers > 0 ? value / customers : 0)} da amostra.`}
                    >
                      <span
                        style={{
                          width: `${customers > 0 ? (value / customers) * 100 : 0}%`,
                          backgroundColor: SHADES[index],
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section
              className={styles.panel}
              aria-label="Novos e recorrentes de exemplo"
            >
              <div className={styles.panelHeading}>
                <h3>Novos e recorrentes</h3>
                <p>Classificação fictícia, sem sobreposição</p>
              </div>
              <div
                className={styles.customerSplit}
                role="img"
                aria-label={`${formatInteger(newCustomers)} novos e ${formatInteger(recurringCustomers)} recorrentes; ${formatInteger(customers)} clientes no total.`}
              >
                <span
                  style={{
                    width: `${customers > 0 ? (newCustomers / customers) * 100 : 0}%`,
                  }}
                />
                <span
                  style={{
                    width: `${customers > 0 ? (recurringCustomers / customers) * 100 : 0}%`,
                  }}
                />
              </div>
              <dl className={styles.customerLegend}>
                <Metric
                  label="Novos"
                  value={formatPercent(
                    customers > 0 ? newCustomers / customers : 0,
                  )}
                />
                <Metric
                  label="Recorrentes"
                  value={formatPercent(
                    customers > 0 ? recurringCustomers / customers : 0,
                  )}
                />
              </dl>
              <p className={styles.note}>
                As faixas etárias e os dois grupos somam a mesma amostra. Nenhum
                perfil real de cliente é utilizado.
              </p>
            </section>
          </div>
        </>
      ) : null}

      {section === "creatives" ? (
        <>
          <dl className={styles.summary}>
            <Metric
              label="Investimento de exemplo"
              value={formatCurrency(spend)}
            />
            <Metric
              label="Receita de exemplo"
              value={formatCurrency(revenue)}
            />
            <Metric
              label="ROAS do exemplo"
              value={formatRatio(spend > 0 ? revenue / spend : 0)}
            />
          </dl>
          <div className={styles.creatives}>
            {channels.map((channel, index) => (
              <article
                key={channel.id}
                className={styles.campaign}
                aria-label={channel.campaign}
              >
                <header>
                  <span className={styles.campaignNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p>{channel.name}</p>
                    <h3>{channel.campaign}</h3>
                    <span>{channel.format}</span>
                  </div>
                </header>
                <dl className={styles.campaignMetrics}>
                  <Metric
                    label="Investimento"
                    value={formatCompactCurrency(channel.spend)}
                  />
                  <Metric
                    label="Receita atribuída"
                    value={formatCompactCurrency(channel.revenue)}
                  />
                  <Metric
                    label="ROAS"
                    value={formatRatio(channel.revenue / channel.spend)}
                  />
                  <Metric
                    label="Compras"
                    value={formatInteger(channel.stages[4])}
                  />
                  <Metric
                    label="CPA"
                    value={formatCurrency(channel.spend / channel.stages[4], 2)}
                  />
                  <Metric
                    label="Cliques"
                    value={formatInteger(channel.stages[1])}
                  />
                </dl>
                <div className={styles.campaignComparison}>
                  <div>
                    <span>Investimento</span>
                    <strong>{formatCurrency(channel.spend)}</strong>
                  </div>
                  <div className={styles.track}>
                    <span
                      style={{
                        width: `${(channel.spend / channel.revenue) * 100}%`,
                        backgroundColor: "#858585",
                      }}
                    />
                  </div>
                  <div>
                    <span>Receita atribuída</span>
                    <strong>{formatCurrency(channel.revenue)}</strong>
                  </div>
                  <div className={styles.track}>
                    <span
                      style={{ width: "100%", backgroundColor: "#e5e5e5" }}
                    />
                  </div>
                </div>
                <p className={styles.note}>
                  Campanha fictícia · ROAS = receita ÷ investimento. Barras usam
                  a mesma escala dentro desta campanha.
                </p>
              </article>
            ))}
          </div>
          <p className={styles.note}>
            ROAS consolidado calculado pelos totais, não pela média dos canais.
            Nenhuma campanha real é criada ou alterada.
          </p>
        </>
      ) : null}
    </section>
  );
}
