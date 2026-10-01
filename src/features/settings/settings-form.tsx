"use client";
import { useActionState } from "react";
import type { SettingsResult } from "./operation-actions";
export function SettingsForm({
  action,
  children,
  label = "Salvar alterações",
}: {
  action: (
    prev: SettingsResult | null,
    data: FormData,
  ) => Promise<SettingsResult>;
  children?: React.ReactNode;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="cfg-form">
      {children}
      {state && (
        <p
          role="status"
          className={state.ok ? "text-success" : "text-destructive"}
        >
          {state.message}
        </p>
      )}
      <button className="cfg-botao-primario" disabled={pending}>
        {pending ? "Processando…" : label}
      </button>
    </form>
  );
}
