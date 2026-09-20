"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { gerarAvisosAction, type ResultadoGeracao } from "./gerar-actions";

/** O botão que grava os avisos da prévia — e diz quantos gravou. */
export function GerarAvisosButton({ disabled }: { disabled?: boolean }) {
  const [estado, acao, pendente] = useActionState<ResultadoGeracao | null>(
    gerarAvisosAction,
    null,
  );

  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" disabled={pendente || disabled}>
        <Sparkles />
        {pendente ? "Gravando…" : "Gravar avisos de agora"}
      </Button>
      {estado && (
        <span
          role="status"
          className={cn(
            "text-xs font-semibold",
            estado.ok ? "text-success" : "text-warning",
          )}
        >
          {estado.mensagem}
        </span>
      )}
    </form>
  );
}
