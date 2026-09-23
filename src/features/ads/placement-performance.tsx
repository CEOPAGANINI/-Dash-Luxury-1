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
import { buildPlacementPerformance } from "./placement-performance-model";
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
  A distribuição e os cinco posicionamentos, num bloco só.

  São seis linhas e um painel. A primeira linha é a visão geral — como
  as vendas se repartiram —, e as outras cinco são cada posicionamento.
  A linha diz o essencial (quem é, quanto vendeu, que fatia levou) e o
  painel mostra o detalhe do que estiver sob o rato: a barra e a legenda
  para a geral, as métricas para um posicionamento.

  É o padrão das abas, de propósito: quem usa rato aponta, quem usa
  teclado anda com as setas e o Tab entra no painel, quem usa toque
  toca. Uma coisa que só aparecesse com o rato deixaria de fora metade
  das pessoas.

  Começa na visão geral, que é por onde se começa a ler: primeiro de
  onde vieram as vendas, depois cada sítio de perto.
*/
const LINHA_GERAL = 0;

function PlacementsBlock({
  performance,
  creativeName,
}: {
  performance: ReturnType<typeof buildPlacementPerformance>;
  creativeName: string;
}) {
  const { cards, totalSales } = performance;
  const [escolhido, setEscolhido] = React.useState(LINHA_GERAL);
  const base = React.useId();
  const abaId = (i: number) => `${base}-aba-${i}`;
  const painelId = `${base}-painel`;
  const botoes = React.useRef<(HTMLButtonElement | null)[]>([]);
  const quantas = cards.length + 1;

  function teclado(e: React.KeyboardEvent<HTMLDivElement>) {
    const passo =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -escolhido
            : e.key === "End"
              ? quantas - 1 - escolhido
              : 0;
    if (!passo && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const proximo = (escolhido + passo + quantas) % quantas;
    setEscolhido(proximo);
    botoes.current[proximo]?.focus();
  }

  const naGeral = escolhido === LINHA_GERAL;
  const atual = cards[Math.min(Math.max(escolhido - 1, 0), cards.length - 1)];
  const { metrics, derived } = atual;
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
    ["CPC", money(derived.cpcCents ?? (atual.hasData ? null : 0))],
    ["CPM", money(derived.cpmCents ?? (atual.hasData ? null : 0))],
    ["CPA", money(derived.cpaCents ?? (atual.hasData ? null : 0))],
  ];

  /* Uma linha da fila. A geral e os posicionamentos partilham o mesmo
     desenho de propósito: a fila lê-se como uma lista só. */
  const linha = (
    i: number,
    chave: string,
    selo: React.ReactNode,
    nome: string,
    numero: string,
    emblema: string,
    neon: string,
    extra?: Record<string, string>,
  ) => (
    <button
      key={chave}
      ref={(el) => {
        botoes.current[i] = el;
      }}
      type="button"
      role="tab"
      id={abaId(i)}
      aria-controls={painelId}
      aria-selected={i === escolhido}
      tabIndex={i === escolhido ? 0 : -1}
      className={styles.placementRow}
      style={{ "--neon": neon } as React.CSSProperties}
      onMouseEnter={() => setEscolhido(i)}
      onFocus={() => setEscolhido(i)}
      onClick={() => setEscolhido(i)}
      {...extra}
    >
      {selo}
      <span className={styles.rowName}>{nome}</span>
      <b className={styles.rowSales}>{numero}</b>
      <span className={styles.badge}>{emblema}</span>
    </button>
  );

  return (
    <section
      className={styles.placementsCard}
      aria-label={`Posicionamentos de ${creativeName}`}
    >
      <div
        className={styles.placementRows}
        role="tablist"
        aria-orientation="vertical"
        aria-label={`Posicionamentos de ${creativeName}`}
        onKeyDown={teclado}
      >
        {linha(
          LINHA_GERAL,
          "geral",
          /* O selo da geral é a própria barra, em miniatura: diz de
             relance o que a linha abre. */
          <i className={styles.overviewIcon} aria-hidden="true">
            {cards
              .filter((c) => c.metrics.purchases > 0)
              .map((c) => (
                <span
                  key={c.id}
                  style={{
                    width: `${c.share * 100}%`,
                    backgroundColor: c.color,
                  }}
                />
              ))}
          </i>,
          "Distribuição de vendas",
          formatInteger(totalSales),
          totalSales === 1 ? "venda no total" : "vendas no total",
          /* O neon da geral é a cor de quem mais vendeu: a linha acende
             da cor do posicionamento que domina a barra. */
          (cards.find((c) => c.metrics.purchases > 0) ?? cards[0]).color,
          { "data-geral": "true" },
        )}
        {cards.map((card, i) =>
          linha(
            i + 1,
            card.id,
            <PlatformIcon platform={card.platform} />,
            card.label,
            formatInteger(card.metrics.purchases),
            `${card.percentage}% das vendas`,
            card.color,
            { "data-placement": card.id },
          ),
        )}
      </div>
      <div
        className={styles.placementDetail}
        role="tabpanel"
        id={painelId}
        aria-labelledby={abaId(escolhido)}
        tabIndex={0}
      >
        {naGeral ? (
          <>
            <h4>Distribuição de vendas por posicionamento</h4>
            <div
              className={styles.bar}
              role="img"
              aria-label={
                totalSales
                  ? cards
                      .map(
                        (c) =>
                          `${c.label}: ${c.percentage}% (${formatInteger(c.metrics.purchases)} vendas)`,
                      )
                      .join("; ")
                  : "Nenhuma venda nos cinco posicionamentos"
              }
            >
              {cards
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
              {cards.map((card) => (
                <li key={card.id}>
                  <i
                    aria-hidden="true"
                    style={{ backgroundColor: card.color }}
                  />
                  <div>
                    <b>
                      {card.percentage}% (
                      {formatInteger(card.metrics.purchases)})
                    </b>
                    <span>{card.label}</span>
                  </div>
                </li>
              ))}
            </ul>
            {totalSales === 0 && (
              <p className={styles.emptySales}>
                Nenhuma venda no período disponível.
              </p>
            )}
          </>
        ) : (
          <>
            <h4>{atual.label}</h4>
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
          </>
        )}
      </div>
    </section>
  );
}

/*
  A coluna de um criativo: o cartão dele no topo e, por baixo, o bloco
  que junta a distribuição das vendas e os cinco posicionamentos. Cada
  coluna é um criativo inteiro e nada dela se mistura com a do lado — é
  o que permite compará-los lendo na horizontal.
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

      <PlacementsBlock performance={performance} creativeName={creative.name} />

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
