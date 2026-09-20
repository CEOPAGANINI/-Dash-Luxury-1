"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Pause, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/features/unified-dashboard/formatters";
import { updateAdEntityAction, type ResultadoAds } from "./actions";
import type { CampaignFormAction } from "./demo-store";
import type { AdEntityType, AdStatus, CampaignRow } from "./types";

export function StatusToggle({
  tipo,
  id,
  nome,
  status,
  action = updateAdEntityAction,
}: {
  tipo: AdEntityType;
  id: string;
  nome: string;
  status: AdStatus;
  action?: CampaignFormAction;
}) {
  const [result, submit, pending] = useActionState(action, null);
  const next = status === "active" ? "paused" : "active";
  return (
    <form action={submit} className="campaign-status-action">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`${next === "active" ? "Ativar" : "Pausar"} ${nome}`}
      >
        {next === "active" ? <Play aria-hidden /> : <Pause aria-hidden />}
        {pending ? "Aplicando…" : next === "active" ? "Ativar" : "Pausar"}
      </Button>
      {result && !result.ok && (
        <span role="alert" className="campaign-inline-message">
          {result.mensagem}
        </span>
      )}
    </form>
  );
}

export function InlineCampaignBudget({
  campaign,
  readOnly,
  action = updateAdEntityAction,
}: {
  campaign: CampaignRow;
  readOnly: boolean;
  action?: CampaignFormAction;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setEditing(false);
    // Return keyboard focus after the inline form unmounts.
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const value =
    campaign.dailyBudgetCents === null
      ? "Não definido"
      : formatCurrency(campaign.dailyBudgetCents / 100, 2);
  if (readOnly) return <span>{value}</span>;
  return (
    <div className="campaign-inline-budget">
      <button
        ref={trigger}
        type="button"
        className="campaign-budget-trigger"
        aria-label={`Editar orçamento de ${campaign.name}`}
        aria-expanded={editing}
        hidden={editing}
        onClick={() => {
          setMessage("");
          setEditing(true);
        }}
      >
        <span>{value}</span>
        <Pencil size={13} aria-hidden />
      </button>
      {editing && (
        <BudgetForm
          campaign={campaign}
          action={action}
          onCancel={close}
          onSaved={(result) => {
            setMessage(result.mensagem);
            close();
          }}
        />
      )}
      {!editing && message && (
        <span role="status" className="campaign-inline-message">
          {message}
        </span>
      )}
    </div>
  );
}

function BudgetForm({
  campaign,
  action,
  onCancel,
  onSaved,
}: {
  campaign: CampaignRow;
  action: CampaignFormAction;
  onCancel: () => void;
  onSaved: (result: ResultadoAds) => void;
}) {
  const [result, submit, pending] = useActionState<
    ResultadoAds | null,
    FormData
  >(async (previous, form) => {
    try {
      const response = await action(previous, form);
      if (response.ok) onSaved(response);
      return response;
    } catch {
      return {
        ok: false,
        mensagem: "Não foi possível salvar. Tente novamente.",
      };
    }
  }, null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);
        // Dispatch explicitly so a rejected action never resets the user's draft.
        startTransition(() => submit(form));
      }}
      className="campaign-budget-form"
      aria-label={`Orçamento de ${campaign.name}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <input type="hidden" name="tipo" value="campaign" />
      <input type="hidden" name="id" value={campaign.id} />
      <label>
        Diário em R$
        <input
          autoFocus
          name="dailyBudget"
          aria-label={`Orçamento diário de ${campaign.name} (R$)`}
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          required
          defaultValue={
            campaign.dailyBudgetCents === null
              ? ""
              : String(campaign.dailyBudgetCents / 100)
          }
          disabled={pending}
        />
      </label>
      {result?.pedeAprovacao && (
        <label className="campaign-budget-approval">
          <input type="checkbox" name="aprovado" disabled={pending} />
          Aprovo o aumento acima do limite de aprovação.
        </label>
      )}
      <div className="campaign-budget-buttons">
        <button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" disabled={pending} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {result && !result.ok && (
        <span role="alert" className="campaign-inline-message">
          {result.mensagem}
        </span>
      )}
    </form>
  );
}
