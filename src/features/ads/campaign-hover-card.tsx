"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { formatCompactCurrency, formatCurrency, formatPercent, formatRatio } from "@/features/unified-dashboard/formatters";
import { corDaEtiqueta, useCardNotes } from "./card-notes-store";
import { lucroDaCampanha, useTaxas } from "./fees-store";
import { derivadas, type CampaignRow } from "./types";

/*
  O card dos números da campanha, no mesmo desenho do "Detalhes do dia"
  do calendário: abre num portal fora do quadro ao clicar no megafone do
  cartão, encosta no cartão (à direita, à esquerda, abaixo ou acima —
  sempre dentro da tela), e fecha com Esc, ao clicar fora, ao rolar para
  longe ou quando a página do cartão some. Só números: o lucro em
  destaque — o retorno menos a taxa do gateway menos o tráfego —, o
  total investido (tráfego), o retorno total, ROAS, CPA, CPM e CTR, com
  a conta do lucro escrita e a taxa do gateway editável ali mesmo. Nada de título, nome, estado ou veredito.
*/

export interface CampaignPreview {
  anchor: HTMLElement;
}

const cents = (v: number) => (v === 0 ? "—" : formatCompactCurrency(v / 100));
const centsExatos = (v: number | null) =>
  v === null ? "—" : formatCurrency(v / 100, Math.abs(v) < 10_000 ? 2 : 0);
/** Um valor com sinal: "−R$ 1.234" ou "R$ 1.234". */
const comSinal = (v: number) => (v < 0 ? `−${centsExatos(-v)}` : centsExatos(v));

export function CampaignHoverCard({
  preview,
  campanha: c,
  id,
  onClose,
}: {
  preview: CampaignPreview;
  campanha: CampaignRow;
  id: string;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const anchor = preview.anchor;
    const viewport = window.visualViewport;
    const position = () => {
      const margin = 12;
      const gap = 10;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const originX = viewport?.offsetLeft ?? 0;
      const originY = viewport?.offsetTop ?? 0;
      const bounds = anchor.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      panel.style.width = `${Math.min(288, width - margin * 2)}px`;
      const panelWidth = panel.getBoundingClientRect().width;
      const spaceRight = originX + width - bounds.right - margin - gap;
      const spaceLeft = bounds.left - originX - margin - gap;
      let left: number;
      let top: number;
      if (spaceRight >= panelWidth || spaceLeft >= panelWidth) {
        // Ao lado do cartão, alinhado ao topo dele e preso à tela.
        left = spaceRight >= panelWidth ? bounds.right + gap : bounds.left - panelWidth - gap;
        const panelHeight = panel.getBoundingClientRect().height;
        top = Math.max(originY + margin, Math.min(bounds.top, originY + height - panelHeight - margin));
      } else {
        // Sem espaço ao lado: abaixo ou acima; em telas curtas, centrado e rolável.
        const below = originY + height - bounds.bottom - margin - gap;
        const above = bounds.top - originY - margin - gap;
        const available = Math.max(below, above);
        panel.style.maxHeight = `${available >= 280 ? available : height - margin * 2}px`;
        const panelHeight = panel.getBoundingClientRect().height;
        left = Math.max(originX + margin, Math.min(bounds.left, originX + width - panelWidth - margin));
        top =
          available < 280
            ? originY + Math.max(margin, (height - panelHeight) / 2)
            : below >= above
              ? bounds.bottom + gap
              : bounds.top - gap - panelHeight;
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = "visible";
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(panel);
    resize.observe(anchor);
    // As páginas de rede ficam montadas sob o menu da direita; o portal
    // precisa fechar quando a página do cartão some.
    const hidden = new MutationObserver(() => {
      if (!anchor.isConnected || anchor.closest('[hidden], [aria-hidden="true"]')) onClose();
    });
    let parent: HTMLElement | null = anchor;
    while (parent) {
      hidden.observe(parent, { attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
      parent = parent.parentElement;
    }
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
      }
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      const bounds = anchor.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) onClose();
      else position();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", position);
    viewport?.addEventListener("resize", position);
    viewport?.addEventListener("scroll", position);
    return () => {
      resize.disconnect();
      hidden.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", position);
      viewport?.removeEventListener("resize", position);
      viewport?.removeEventListener("scroll", position);
    };
  }, [preview.anchor, onClose]);

  const { notas } = useCardNotes(c.id);
  const d = derivadas(c.metrics);
  /* A taxa do gateway (a mesma para todas as campanhas) e o lucro. */
  const { gatewayPercentual, definirGateway } = useTaxas();
  const lucro = lucroDaCampanha(c.metrics, gatewayPercentual);
  const percentual = gatewayPercentual.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  /* O lucro em destaque, na largura toda; depois os pares: investimento
     e retorno, ROAS e CPA, CPM e CTR. O resto fica na página da campanha. */
  const linhas: [string, string][] = [
    ["Lucro", comSinal(lucro.lucroCents)],
    ["Investimento total", cents(c.metrics.spendCents)],
    ["Retorno total", cents(c.metrics.revenueCents)],
    ["ROAS", d.roas === null ? "—" : formatRatio(d.roas)],
    ["CPA", centsExatos(d.cpaCents)],
    ["CPM", centsExatos(d.cpmCents)],
    ["CTR", d.ctr === null ? "—" : formatPercent(d.ctr, 2)],
  ];

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={`Detalhes da campanha: ${c.name}`}
      aria-modal="false"
      className="campanha-card-flutuante"
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="campanha-card-flutuante-conteudo">
        {notas.etiquetas.length > 0 && (
          <ul className="class-board-etiquetas campanha-card-flutuante-etiquetas" aria-label="Etiquetas">
            {notas.etiquetas.map((e, i) => (
              <li key={`${e.cor}-${e.texto}-${i}`} style={{ background: corDaEtiqueta(e.cor) }}>{e.texto}</li>
            ))}
          </ul>
        )}
        {notas.texto && <p className="campanha-card-flutuante-nota">{notas.texto}</p>}
        <dl className="campanha-card-flutuante-metricas">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} data-lucro={rotulo === "Lucro" ? (lucro.lucroCents < 0 ? "negativo" : lucro.lucroCents > 0 ? "positivo" : "zero") : undefined}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
        {/* A conta do lucro, escrita: retorno − gateway − tráfego. */}
        <p className="campanha-card-flutuante-conta" aria-label="Conta do lucro">
          <span>Retorno {centsExatos(lucro.retornoCents)}</span>
          <span>− gateway {percentual}% ({centsExatos(lucro.gatewayCents)})</span>
          <span>− tráfego {centsExatos(lucro.trafegoCents)}</span>
          <span>= lucro <b>{comSinal(lucro.lucroCents)}</b></span>
        </p>
        <label className="campanha-card-flutuante-taxa">
          <span>Taxa do gateway (%)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            value={gatewayPercentual}
            aria-label="Taxa do gateway em porcentagem"
            onChange={(e) => definirGateway(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </label>
      </div>
    </div>,
    document.body,
  );
}
