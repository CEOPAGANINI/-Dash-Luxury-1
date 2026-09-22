"use client";

import * as React from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ImageIcon, Video, X } from "lucide-react";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import {
  buildPlacementPerformance,
  type PlacementPerformanceCard,
} from "./placement-performance-model";
import type { AdRow } from "./types";
import styles from "./placement-performance.module.css";

type Creative = AdRow & { conjunto?: string };
type CreativeMedia = AdRow["creative"] & {
  type?: "video" | "image";
  videoUrl?: string;
  imageUrl?: string;
  durationSeconds?: number;
};

const money = (cents: number | null) =>
  cents === null ? "—" : formatCurrency(cents / 100, 2);
const ratio = (value: number | null) =>
  value === null ? "—" : formatRatio(value);
const tone = (value: number | null) =>
  value === null ? undefined : value >= 1 ? "positive" : "negative";

/** Media metadata is optional: never infer a video or duration from its name. */
function Preview({ creative }: { creative: Creative }) {
  const media: CreativeMedia = creative.creative;
  const [failed, setFailed] = React.useState(false);
  const src = media.imageUrl ?? media.thumbnailUrl;
  if (!failed && media.videoUrl) {
    return (
      <video
        className={styles.media}
        src={media.videoUrl}
        poster={src}
        controls
        preload="metadata"
        aria-label={`Vídeo de ${creative.name}`}
        onError={() => setFailed(true)}
      />
    );
  }
  if (!failed && src) {
    return (
      <Image
        className={styles.media}
        src={src}
        alt={`Prévia de ${creative.name}`}
        width={480}
        height={600}
        unoptimized
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={styles.placeholder}>
      <ImageIcon aria-hidden="true" />
      <span>Prévia indisponível</span>
    </div>
  );
}

function PlatformIcon({ platform }: { platform: "instagram" | "facebook" }) {
  return (
    <i
      className={styles.platformIcon}
      data-platform={platform}
      aria-hidden="true"
    >
      {platform === "instagram" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 21v-8h2.7l.4-3H14V8.1c0-.9.3-1.6 1.6-1.6h1.7V3.8c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H8v3h2.6v8H14Z" />
        </svg>
      )}
    </i>
  );
}

function PlacementCard({ card }: { card: PlacementPerformanceCard }) {
  const { metrics, derived } = card;
  /* As vendas ficam sozinhas em destaque; tudo o resto desce em linhas
     de rótulo à esquerda e valor à direita, na mesma régua em todos os
     cartões — é o que os faz ler alinhados lado a lado. */
  const rows: [string, React.ReactNode, string?][] = [
    ["ROAS", ratio(derived.roas), tone(derived.roas)],
    [
      "Initiate Checkout",
      metrics.checkouts === undefined ? "—" : formatInteger(metrics.checkouts),
    ],
    ["Impressões", formatInteger(metrics.impressions)],
    ["Cliques", formatInteger(metrics.clicks)],
    ["CTR", formatPercent(derived.ctr ?? 0, 2)],
    ["CPC", money(derived.cpcCents ?? (card.hasData ? null : 0))],
    ["CPM", money(derived.cpmCents ?? (card.hasData ? null : 0))],
    ["CPA", money(derived.cpaCents ?? (card.hasData ? null : 0))],
  ];
  return (
    <article
      className={styles.card}
      aria-label={card.label}
      data-placement={card.id}
    >
      <header className={styles.cardHeader}>
        <PlatformIcon platform={card.platform} />
        <h4>{card.label}</h4>
        <small>{card.platform === "instagram" ? "Instagram" : "Facebook"}</small>
        <span className={styles.badge}>{card.percentage}% das vendas</span>
      </header>
      <p className={styles.cardSales}>
        <b>{formatInteger(metrics.purchases)}</b>
        <span>{metrics.purchases === 1 ? "venda" : "vendas"}</span>
      </p>
      <dl className={styles.cardRows}>
        {rows.map(([label, value, toneName]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd data-tone={toneName}>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function CreativePerformance({ creative }: { creative: Creative }) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const performance = buildPlacementPerformance(creative.placements ?? []);
  const media: CreativeMedia = creative.creative;
  const isVideo = media.type === "video" || Boolean(media.videoUrl);
  const kind = isVideo
    ? "Vídeo"
    : media.type === "image" || media.imageUrl
      ? "Imagem"
      : "Formato não informado";
  const duration =
    isVideo &&
    Number.isFinite(media.durationSeconds) &&
    media.durationSeconds! > 0
      ? `${media.durationSeconds}s`
      : null;
  const status =
    creative.status === "active"
      ? "Ativo"
      : creative.status === "paused"
        ? "Pausado"
        : "Arquivado";
  return (
    <article
      className={styles.creativeBlock}
      aria-label={`Desempenho de ${creative.name}`}
    >
      <aside
        className={styles.summary}
        aria-label={`Resumo de ${creative.name}`}
      >
        <div className={styles.preview}>
          <Preview
            key={`${media.videoUrl ?? ""}|${media.imageUrl ?? media.thumbnailUrl ?? ""}`}
            creative={creative}
          />
        </div>
        <div className={styles.identity}>
          <h3>{creative.name}</h3>
          {media.title && <p>{media.title}</p>}
          <div className={styles.metadata}>
            <span>
              {isVideo ? (
                <Video aria-hidden="true" />
              ) : (
                <ImageIcon aria-hidden="true" />
              )}
              {kind}
              {duration && ` · ${duration}`}
            </span>
            <b className={styles.status} data-status={creative.status}>
              {status}
            </b>
          </div>
          <p className={styles.description}>
            {media.body || "Descrição não informada."}
          </p>
        </div>
        <dl className={styles.summaryMetrics}>
          <div>
            <dt>Vendas (total)</dt>
            <dd>{formatInteger(performance.totalSales)}</dd>
          </div>
          <div>
            <dt>ROAS (geral)</dt>
            <dd data-tone={tone(performance.derived.roas)}>
              {ratio(performance.derived.roas)}
            </dd>
          </div>
          <div>
            <dt>CPA (geral)</dt>
            <dd>{money(performance.derived.cpaCents)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className={styles.detailsButton}
          onClick={() => setDetailsOpen(true)}
        >
          Ver detalhes do criativo <ArrowRight aria-hidden="true" />
        </button>
      </aside>
      <div className={styles.performance}>
        {/* Sem faixa de cabeçalho: o título, o subtexto, o seletor de
            período e o menu saíram. A secção já se apresenta pelo painel
            que a contém, e o espaço que a faixa ocupava vai todo para os
            cartões. O nome continua a existir para quem lê por leitor de
            ecrã, no aria-label da grelha. */}
        <div
          className={styles.cards}
          aria-label="Desempenho por posicionamento"
          role="group"
        >
          {performance.cards.map((card) => (
            <PlacementCard key={card.id} card={card} />
          ))}
        </div>
        <figure className={styles.distribution}>
          <figcaption>
            <h4>Distribuição de vendas por posicionamento</h4>
            <span>
              Total de {formatInteger(performance.totalSales)}{" "}
              {performance.totalSales === 1 ? "venda" : "vendas"}
            </span>
          </figcaption>
          <div
            className={styles.bar}
            role="img"
            aria-label={
              performance.totalSales
                ? performance.cards
                    .map(
                      (c) =>
                        `${c.label}: ${c.percentage}% (${formatInteger(c.metrics.purchases)} vendas)`,
                    )
                    .join("; ")
                : "Nenhuma venda nos cinco posicionamentos"
            }
          >
            {performance.cards
              .filter((c) => c.metrics.purchases > 0)
              .map((card) => (
                <span
                  key={card.id}
                  style={{
                    width: `${card.share * 100}%`,
                    backgroundColor: card.color,
                  }}
                />
              ))}
          </div>
          <ul className={styles.legend}>
            {performance.cards.map((card) => (
              <li key={card.id}>
                <i aria-hidden="true" style={{ backgroundColor: card.color }} />
                <div>
                  <b>
                    {card.percentage}% ({formatInteger(card.metrics.purchases)})
                  </b>
                  <span>{card.label}</span>
                </div>
              </li>
            ))}
          </ul>
          {performance.totalSales === 0 && (
            <p className={styles.emptySales}>
              Nenhuma venda no período disponível.
            </p>
          )}
        </figure>
      </div>
      <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Title>Detalhes de {creative.name}</Dialog.Title>
            <Dialog.Description>
              Informações disponíveis do criativo e resultados dos cinco
              posicionamentos.
            </Dialog.Description>
            <dl className={styles.detailList}>
              <div>
                <dt>Status</dt>
                <dd>{status}</dd>
              </div>
              <div>
                <dt>Formato</dt>
                <dd>
                  {kind}
                  {duration && ` · ${duration}`}
                </dd>
              </div>
              {creative.conjunto && (
                <div>
                  <dt>Conjunto</dt>
                  <dd>{creative.conjunto}</dd>
                </div>
              )}
              {media.title && (
                <div>
                  <dt>Título</dt>
                  <dd>{media.title}</dd>
                </div>
              )}
              <div>
                <dt>Descrição</dt>
                <dd>{media.body || "Não informada"}</dd>
              </div>
              <div>
                <dt>Vendas</dt>
                <dd>{formatInteger(performance.totalSales)}</dd>
              </div>
              <div>
                <dt>ROAS</dt>
                <dd>{ratio(performance.derived.roas)}</dd>
              </div>
              <div>
                <dt>CPA</dt>
                <dd>{money(performance.derived.cpaCents)}</dd>
              </div>
            </dl>
            <Dialog.Close
              className={styles.closeButton}
              aria-label="Fechar detalhes"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </article>
  );
}

export function PlacementPerformance({
  creatives,
}: {
  creatives: readonly Creative[];
}) {
  return (
    <section
      className={styles.section}
      aria-label="Desempenho por posicionamento"
    >
      {creatives.length ? (
        creatives.map((creative) => (
          <CreativePerformance key={creative.id} creative={creative} />
        ))
      ) : (
        <div className={styles.empty}>
          <h3>Desempenho por posicionamento</h3>
          <p>Esta campanha ainda não tem anúncios sincronizados.</p>
        </div>
      )}
    </section>
  );
}
