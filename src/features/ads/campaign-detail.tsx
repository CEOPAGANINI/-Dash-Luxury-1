"use client";

import * as React from "react";
import { useActionState } from "react";

import { BlockPicker } from "@/components/ui/block-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateAdEntityAction, type ResultadoAds } from "./actions";
import { STATUS_LABEL, type AdStatus, type CampaignRow } from "./types";

/**
 * O formulário da página da campanha: nome, estado e orçamento diário.
 * Passa pelo mesmo freio de mão das outras telas; aumentos acima do valor
 * de aprovação pedem a caixa "Aprovo".
 */
export function CampaignDetailForm({ campanha: c }: { campanha: CampaignRow }) {
  const [estado, acao, pendente] = useActionState<ResultadoAds | null, FormData>(
    updateAdEntityAction,
    null,
  );
  const demo = c.id.startsWith("demo-");

  return (
    <form action={acao} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
      <input type="hidden" name="tipo" value="campaign" />
      <input type="hidden" name="id" value={c.id} />
      <label className="block">
        <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">Nome</span>
        <input name="name" defaultValue={c.name} className="border-input bg-background mt-1 h-9 w-full rounded-lg border px-3 text-sm" />
      </label>
      <div className="block">
        <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">Estado</span>
        <BlockPicker
          name="status"
          ariaLabel="Estado"
          size="sm"
          stretch
          className="mt-1"
          defaultValue={c.status}
          options={(Object.keys(STATUS_LABEL) as AdStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
      </div>
      <label className="block">
        <span className="text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">Orçamento/dia (R$)</span>
        <input name="dailyBudget" type="number" min="0" step="1" inputMode="decimal" defaultValue={c.dailyBudgetCents === null ? "" : String(c.dailyBudgetCents / 100)} className="border-input bg-background mt-1 h-9 w-full rounded-lg border px-3 text-sm" />
      </label>
      <Button type="submit" size="sm" disabled={pendente || demo}>{pendente ? "Salvando…" : "Salvar"}</Button>
      {estado?.pedeAprovacao && (
        <label className="flex items-center gap-2 text-xs md:col-span-4">
          <input type="checkbox" name="aprovado" className="accent-foreground size-4" />
          Aprovo este aumento — sei que passa do valor de aprovação do freio de mão.
        </label>
      )}
      {demo && <p className="text-muted-foreground text-xs md:col-span-4">Campanha de demonstração: edite pelos gerenciadores por rede (a edição fica só no navegador).</p>}
      {estado && <p role="status" className={cn("text-xs font-semibold md:col-span-4", estado.ok ? "text-success" : "text-warning")}>{estado.mensagem}</p>}
    </form>
  );
}
