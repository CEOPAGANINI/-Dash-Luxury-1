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

/*
  Um cartão de posicionamento: o topo com o selo da plataforma, o nome e
  a fatia das vendas; depois as três métricas principais (vendas, ROAS e
  checkouts iniciados) em destaque; e por fim as seis secundárias, na
  mesma régua para todos os cartões — é isso que os faz ler alinhados
  quando estão uns por baixo dos outros na mesma coluna.
*/
function PlacementCard({ card }: { card: PlacementPerformanceCard }) {
  const { metrics, derived } = card;
  const principais: [string, React.ReactNode, string?][] = [
    [
      metrics.purchases === 1 ? "venda" : "vendas",
      formatInteger(metrics.purchases),
    ],
    ["ROAS", ratio(derived.roas), tone(derived.roas)],
    [
      "checkout",
      metrics.checkouts === undefined ? "—" : formatInteger(metrics.checkouts),
    ],
  ];
  const secundarias: [string, string][] = [
    ["impressões", formatInteger(metrics.impressions)],
    ["cliques", formatInteger(metrics.clicks)],
    ["CTR", formatPercent(derived.ctr ?? 0, 2)],
    ["CPC", money(derived.cpcCents ?? (card.hasData ? null : 0))],
    ["CPM", money(derived.cpmCents ?? (card.hasData ? null : 0))],
    ["CPA", money(derived.cpaCents ?? (card.hasData ? null : 0))],
  ];
  return (
    <article
      className={styles.placementCard}
      aria-label={card.label}
      data-placement={card.id}
    >
      <header className={styles.placementCardHeader}>
        <PlatformIcon platform={card.platform} />
        <h4>{card.label}</h4>
        <span className={styles.badge}>{card.percentage}% das vendas</span>
      </header>
      <dl className={styles.placementMainMetrics}>
        {principais.map(([rotulo, valor, toneName]) => (
          <div key={rotulo}>
            <dd data-tone={toneName}>{valor}</dd>
            <dt>{rotulo}</dt>
          </div>
        ))}
      </dl>
      <dl className={styles.placementSecondaryMetrics}>
        {secundarias.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dd>{valor}</dd>
            <dt>{rotulo}</dt>
          </div>
        ))}
      </dl>
    </article>
  );
}

/*
  A coluna de um criativo: o cartão dele no topo, a distribuição das
  vendas logo abaixo e os cinco posicionamentos em baixo, sempre na
  mesma ordem. Cada coluna é um criativo inteiro e nada dela se mistura
  com a do lado — é o que permite compará-los lendo na horizontal.
*/
function CreativeColumn({ creative }: { creative: Creative }) {
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
  const comVendas = performance.cards.filter((c) => c.metrics.purchases > 0);
  return (
    <div
      className={styles.creativeColumn}
      role="group"
      aria-label={`Análise de ${creative.name}`}
    >
      <article
        className={styles.creativeSummaryCard}
        aria-label={`Criativo ${creative.name}`}
      >
        <div className={styles.creativePreview}>
          <Preview
            key={`${media.videoUrl ?? ""}|${media.imageUrl ?? media.thumbnailUrl ?? ""}`}
            creative={creative}
          />
        </div>
        {/* Só o nome do criativo: sem subtítulo e sem descrição. Quem
            quiser o resto abre os detalhes no botão em baixo. */}
        <div className={styles.creativeInfo}>
          <h3>{creative.name}</h3>
          <div className={styles.creativeBadges}>
            <span className={styles.formatBadge}>
              {isVideo ? (
                <Video aria-hidden="true" />
              ) : (
                <ImageIcon aria-hidden="true" />
              )}
              {kind}
              {duration && ` · ${duration}`}
            </span>
            <span className={styles.statusBadge} data-status={creative.status}>
              {status}
            </span>
          </div>
        </div>
        <dl className={styles.creativeKpiGrid}>
          <div>
            <dd>{formatInteger(performance.totalSales)}</dd>
            <dt>Vendas totais</dt>
          </div>
          <div>
            <dd data-tone={tone(performance.derived.roas)}>
              {ratio(performance.derived.roas)}
            </dd>
            <dt>ROAS geral</dt>
          </div>
          <div>
            <dd>{money(performance.derived.cpaCents)}</dd>
            <dt>CPA geral</dt>
          </div>
        </dl>
        <button
          type="button"
          className={styles.detailsButton}
          data-acao="detalhes"
          onClick={() => setDetailsOpen(true)}
        >
          {/* O texto vai num <span> de propósito. A pele do dashboard
              apaga o fundo de qualquer botão cujo único filho-ELEMENTO
              seja um <svg> — e um nó de texto solto não conta como
              filho-elemento, por isso este botão caía nessa regra e
              ficava com letra clara sobre branco, invisível. Com o
              <span>, passam a ser dois elementos e a regra não casa. */}
          <span>Ver detalhes do criativo</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </article>

      <figure className={styles.distributionCard}>
        <figcaption>Distribuição de vendas por posicionamento</figcaption>
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
          {comVendas.map((card) => (
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

      {performance.cards.map((card) => (
        <PlacementCard key={card.id} card={card} />
      ))}

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
    </div>
  );
}

/*
  A comparação de criativos: uma coluna por criativo, lado a lado. No
  desktop a grade corre na horizontal e rola quando há mais criativos do
  que largura; em tablet passa a duas colunas por linha e no telemóvel a
  uma. Todas as colunas começam no topo e levam os mesmos blocos pela
  mesma ordem — é isso que faz a leitura na horizontal comparar sempre o
  mesmo com o mesmo.
*/
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
        <div className={styles.comparisonGrid}>
          {creatives.map((creative) => (
            <CreativeColumn key={creative.id} creative={creative} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h3>Desempenho por posicionamento</h3>
          <p>Esta campanha ainda não tem anúncios sincronizados.</p>
        </div>
      )}
    </section>
  );
}
