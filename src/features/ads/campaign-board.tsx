"use client";

import { startTransition, useActionState, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GripVertical } from "lucide-react";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRatio,
} from "@/features/unified-dashboard/formatters";
import { updateAdEntityAction, type ResultadoAds } from "./actions";
import type { CampaignFormAction } from "./demo-store";
import { campaignOrigin } from "./manager-model";
import { BlockPicker } from "@/components/ui/block-picker";
import { CampaignClassSelect } from "./campaign-class-select";
import type { CampaignClassId } from "./campaign-classes";
import { InlineCampaignBudget, StatusToggle } from "./campaign-row-actions";
import {
  derivadas,
  somarMetricas,
  STATUS_LABEL,
  type AdStatus,
  type CampaignRow,
} from "./types";

const COLUMNS: { status: AdStatus; title: string; description: string }[] = [
  { status: "active", title: "Ativas", description: "Campanhas em veiculação" },
  {
    status: "paused",
    title: "Pausadas",
    description: "Campanhas com entrega pausada",
  },
  {
    status: "archived",
    title: "Arquivadas",
    description: "Histórico preservado",
  },
];
const money = (cents: number | null) =>
  cents === null ? "—" : formatCurrency(cents / 100, 2);
type Move = { id: string; status: AdStatus };

export function CampaignBoard({
  campaigns,
  revision,
  action,
  selectedId,
  onManage,
  onAnalyze,
  onClassChange,
}: {
  campaigns: CampaignRow[];
  revision: number;
  action?: CampaignFormAction;
  selectedId: string | null;
  onManage: (id: string) => void;
  onAnalyze: (id: string) => void;
  onClassChange?: (id: string, value: CampaignClassId) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<AdStatus | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const [notice, setNotice] = useState("");
  const moving = move ? campaigns.find((c) => c.id === move.id) : null;
  const readOnly = (c: CampaignRow) => c.id.startsWith("demo-") && !action;
  const requestMove = (c: CampaignRow, status: AdStatus) => {
    if (readOnly(c)) return;
    setNotice("");
    setMove({ id: c.id, status });
  };
  return (
    <>
      <p className="campaign-board-help">
        Um cartão por campanha. Arraste pelo ícone de organização ou use “Mover”
        para trocar de coluna. Mover entre colunas pede confirmação; os
        resultados históricos são preservados.
      </p>
      {notice && (
        <p role="status" className="campaign-board-notice">
          {notice}
        </p>
      )}
      <div
        className="campaign-board-scroll"
        role="region"
        aria-label="Quadro de campanhas com rolagem horizontal"
        tabIndex={0}
      >
        <div className="campaign-board">
          {COLUMNS.map((column) => {
            const cards = campaigns.filter((c) => c.status === column.status);
            const total = somarMetricas(cards.map((c) => c.metrics));
            return (
              <section
                key={column.status}
                className="campaign-board-column"
                aria-label={`Campanhas ${column.title.toLowerCase()}`}
                data-drop-active={over === column.status || undefined}
                onDragOver={(event) => {
                  if (dragged) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOver(column.status);
                  }
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setOver(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const campaign = campaigns.find((c) => c.id === dragged);
                  setDragged(null);
                  setOver(null);
                  if (campaign && campaign.status !== column.status)
                    requestMove(campaign, column.status);
                }}
              >
                <header className="campaign-board-column-heading">
                  <div>
                    <h3>{column.title}</h3>
                    <span
                      className="campaign-board-count"
                      aria-label={`${cards.length} campanhas`}
                    >
                      {cards.length}
                    </span>
                  </div>
                  <p>{column.description}</p>
                  <dl>
                    <div>
                      <dt>Investimento</dt>
                      <dd>{money(total.spendCents)}</dd>
                    </div>
                    <div>
                      <dt>Receita</dt>
                      <dd>{money(total.revenueCents)}</dd>
                    </div>
                  </dl>
                </header>
                <div
                  className="campaign-board-cards"
                  tabIndex={0}
                  role="region"
                  aria-label={`Lista de campanhas ${column.title.toLowerCase()}`}
                >
                  {cards.length === 0 && (
                    <div className="campaign-board-empty">
                      <strong>Nenhuma campanha</strong>
                      <p>Campanhas neste estado aparecerão aqui.</p>
                    </div>
                  )}
                  {cards.map((campaign) => {
                    const d = derivadas(campaign.metrics);
                    return (
                      <article
                        className="campaign-board-card"
                        aria-label={`Cartão ${campaign.name}`}
                        key={`${revision}-${campaign.id}`}
                        data-selected={selectedId === campaign.id || undefined}
                      >
                        <div className="campaign-board-card-top">
                          <span className="campaign-eyebrow">
                            {campaign.objective || "Sem objetivo"}
                          </span>
                          {!readOnly(campaign) && (
                            <button
                              className="campaign-board-move"
                              id={`campaign-move-${campaign.id}`}
                              draggable
                              aria-label={`Mover campanha ${campaign.name}`}
                              onClick={() =>
                                requestMove(
                                  campaign,
                                  campaign.status === "active"
                                    ? "paused"
                                    : "active",
                                )
                              }
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  "text/plain",
                                  campaign.id,
                                );
                                event.dataTransfer.effectAllowed = "move";
                                setDragged(campaign.id);
                              }}
                              onDragEnd={() => {
                                setDragged(null);
                                setOver(null);
                              }}
                            >
                              <GripVertical size={16} aria-hidden />
                              Mover
                            </button>
                          )}
                        </div>
                        <h4>
                          <button
                            onClick={() => onAnalyze(campaign.id)}
                            aria-controls="campaign-selected-details"
                          >
                            {campaign.name}
                          </button>
                        </h4>
                        <p className="campaign-board-origin">
                          {campaignOrigin(campaign)}
                        </p>
                        <CampaignClassSelect
                          campaign={campaign}
                          onChange={onClassChange}
                        />
                        <dl className="campaign-board-card-metrics">
                          {[
                            [
                              "Investimento",
                              money(campaign.metrics.spendCents),
                            ],
                            ["Receita", money(campaign.metrics.revenueCents)],
                            [
                              "ROAS",
                              d.roas === null ? "—" : formatRatio(d.roas),
                            ],
                            [
                              "Compras",
                              formatInteger(campaign.metrics.purchases),
                            ],
                            ["Custo por compra", money(d.cpaCents)],
                            [
                              "CTR",
                              d.ctr === null ? "—" : formatPercent(d.ctr, 2),
                            ],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="campaign-board-budget">
                          <span>Orçamento diário</span>
                          <InlineCampaignBudget
                            campaign={campaign}
                            readOnly={readOnly(campaign)}
                            action={action}
                          />
                        </div>
                        <div className="campaign-board-card-footer">
                          <span>
                            {campaign.adSets.length}{" "}
                            {campaign.network === "meta"
                              ? "conjuntos"
                              : "grupos"}{" "}
                            ·{" "}
                            {campaign.adSets.reduce(
                              (sum, group) => sum + group.ads.length,
                              0,
                            )}{" "}
                            anúncios
                          </span>
                          {!readOnly(campaign) &&
                            campaign.status !== "archived" && (
                              <StatusToggle
                                tipo="campaign"
                                id={campaign.id}
                                nome={campaign.name}
                                status={campaign.status}
                                action={action}
                              />
                            )}
                        </div>
                        <div className="campaign-board-card-actions">
                          <button
                            className="campaign-analyze-button"
                            aria-label={`Analisar campanha ${campaign.name}`}
                            aria-controls="campaign-selected-details"
                            onClick={() => onAnalyze(campaign.id)}
                          >
                            Métricas e funil
                          </button>
                          <button
                            aria-label={`Gerenciar ${campaign.name}`}
                            aria-controls="campaign-selected-details"
                            onClick={() => onManage(campaign.id)}
                          >
                            Editar campanha
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {move && moving && (
        <MoveCampaignDialog
          key={moving.id}
          campaign={moving}
          initialStatus={move.status}
          action={action}
          onClose={() => setMove(null)}
          onSaved={(message) => {
            setNotice(message);
            setMove(null);
          }}
        />
      )}
    </>
  );
}

function MoveCampaignDialog({
  campaign,
  initialStatus,
  action = updateAdEntityAction,
  onClose,
  onSaved,
}: {
  campaign: CampaignRow;
  initialStatus: AdStatus;
  action?: CampaignFormAction;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [destination, setDestination] = useState(initialStatus);
  const fieldId = useId();
  const [result, submit, pending] = useActionState<
    ResultadoAds | null,
    FormData
  >(async (previous, form) => {
    try {
      const response = await action(previous, form);
      if (response.ok)
        onSaved(
          `${campaign.name}: ${STATUS_LABEL[destination].toLowerCase()}. ${response.mensagem}`,
        );
      return response;
    } catch {
      return {
        ok: false,
        mensagem:
          "Não foi possível confirmar a mudança. Recarregue e confira o estado antes de tentar novamente.",
      };
    }
  }, null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="campaign-move-overlay" />
        <Dialog.Content
          className="campaign-move-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() =>
              document.getElementById(`campaign-move-${campaign.id}`)?.focus(),
            );
          }}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <Dialog.Title>Mover campanha</Dialog.Title>
          <Dialog.Description>
            {campaign.name}. Mover altera o estado de veiculação, não o
            orçamento nem os resultados históricos. Campanhas conectadas podem
            ser alteradas na plataforma.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (pending || destination === campaign.status) return;
              const form = new FormData(event.currentTarget);
              startTransition(() => submit(form));
            }}
          >
            <input type="hidden" name="tipo" value="campaign" />
            <input type="hidden" name="id" value={campaign.id} />
            <label id={`${fieldId}-rotulo`}>Coluna de destino</label>
            <BlockPicker
              id={fieldId}
              labelledBy={`${fieldId}-rotulo`}
              name="status"
              stretch
              value={destination}
              disabled={pending}
              onChange={(v) => setDestination(v as AdStatus)}
              options={COLUMNS.map((column) => ({
                value: column.status,
                label: column.title,
              }))}
            />
            {campaign.source === "demo" && (
              <p>
                Demonstração: esta alteração afeta somente os exemplos, nunca
                anúncios reais.
              </p>
            )}
            {result?.pedeAprovacao && (
              <label className="campaign-move-approval">
                <input type="checkbox" name="aprovado" disabled={pending} />
                Confirmo a aprovação solicitada pelos limites de segurança.
              </label>
            )}
            {result && !result.ok && <p role="alert">{result.mensagem}</p>}
            <div>
              <button type="button" onClick={onClose} disabled={pending}>
                Cancelar movimento
              </button>
              <button
                type="submit"
                disabled={pending || destination === campaign.status}
              >
                {pending ? "Movendo…" : "Confirmar movimento"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
