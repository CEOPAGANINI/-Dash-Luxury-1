"use client";

import Link from "next/link";
import { useCampaignDemo } from "./demo-store";
import { CampaignDemoControls } from "./campaign-demo-controls";
import { CampaignMetrics } from "./campaign-metrics";
import { CampaignDataUnavailable } from "./campaign-data-unavailable";
import { NETWORK_MANAGERS, campaignOrigin } from "./manager-model";
import { somarMetricas, type AdNetwork, type CampaignTree } from "./types";

export function CampaignAnalysis({
  tree: suppliedTree,
}: {
  tree: CampaignTree;
}) {
  const simulation = useCampaignDemo();
  const tree =
    suppliedTree.modo === "demo" && !suppliedTree.loadError
      ? { ...suppliedTree, campanhas: simulation.rows }
      : suppliedTree;
  if (tree.loadError)
    return <CampaignDataUnavailable title="Análise de campanhas" />;
  const total = somarMetricas(tree.campanhas.map((c) => c.metrics));
  const exampleCount = tree.campanhas.filter(
    (c) => campaignOrigin(c) === "Dados de exemplo",
  ).length;
  return (
    <section className="campaign-manager" aria-label="Análise de campanhas">
      <header className="campaign-page-heading">
        <div>
          <p className="campaign-eyebrow">Campanhas / Análise</p>
          <h1>Comparativo entre redes</h1>
          <p>
            Receita, investimento e retorno calculados a partir das mesmas
            campanhas dos gerenciadores.
          </p>
        </div>
      </header>
      <div className="campaign-source">
        <div>
          <strong>
            {exampleCount
              ? "Inclui dados de exemplo"
              : "Dados dos gerenciadores"}
          </strong>
          <p>
            {tree.campanhas.length} campanhas · {exampleCount} de exemplo.
            Métricas dos últimos 7 dias; confira a última sincronização em cada
            gerenciador.
          </p>
        </div>
      </div>
      {tree.modo === "demo" && <CampaignDemoControls page="analise" />}
      <CampaignMetrics metrics={total} />
      <div className="campaign-network-comparison">
        {(Object.keys(NETWORK_MANAGERS) as AdNetwork[]).map((network) => {
          const campaigns = tree.campanhas.filter((c) => c.network === network);
          const metrics = somarMetricas(campaigns.map((c) => c.metrics));
          const shares = [
            [
              "Investimento",
              total.spendCents ? metrics.spendCents / total.spendCents : null,
            ],
            [
              "Receita",
              total.revenueCents
                ? metrics.revenueCents / total.revenueCents
                : null,
            ],
          ] as const;
          return (
            <article key={network}>
              <div>
                <h2>{NETWORK_MANAGERS[network].label}</h2>
                <p className="campaign-note">
                  {campaigns.length} campanhas ·{" "}
                  {campaigns.filter((c) => c.status === "active").length} ativas
                </p>
              </div>
              <CampaignMetrics metrics={metrics} compact />
              {shares.map(([label, share]) => (
                <div className="campaign-share" key={label}>
                  <div>
                    <span>
                      Participação no{" "}
                      {label.toLowerCase() === "receita"
                        ? "total de receita"
                        : "investimento"}
                    </span>
                    <strong>
                      {share === null
                        ? "—"
                        : new Intl.NumberFormat("pt-BR", {
                            style: "percent",
                            maximumFractionDigits: 1,
                          }).format(share)}
                    </strong>
                  </div>
                  <div className="campaign-share-track" aria-hidden>
                    <span style={{ width: `${(share ?? 0) * 100}%` }} />
                  </div>
                </div>
              ))}
              <Link
                href={`/campanhas/${network}${tree.modo === "banco" ? "?modo=real" : ""}`}
              >
                Abrir gerenciador de {NETWORK_MANAGERS[network].label}
              </Link>
            </article>
          );
        })}
      </div>
      <p className="campaign-note">
        ROAS = receita ÷ investimento. Sem investimento, o retorno não pode ser
        calculado. A receita atribuída pelas plataformas pode se sobrepor: o
        consolidado não representa faturamento deduplicado da empresa.
      </p>
    </section>
  );
}
