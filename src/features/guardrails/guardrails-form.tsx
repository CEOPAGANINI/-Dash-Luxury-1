"use client";

import { useActionState } from "react";
import { Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveGuardrailsAction, type ResultadoAcao } from "./actions";
import type { ProfitGuardrails } from "./rules";

interface Campo {
  name: keyof ProfitGuardrails;
  label: string;
  hint: string;
  /** Como o valor aparece no campo (o formulário fala em % e em reais). */
  para: (r: ProfitGuardrails) => string;
  sufixo?: string;
  step?: string;
  min?: string;
  max?: string;
}

const CAMPOS: Campo[] = [
  {
    name: "margemMinima",
    label: "Margem mínima para escalar",
    hint: "Abaixo disso a verba fica como está, mesmo com ROAS bom.",
    para: (r) => String(Math.round(r.margemMinima * 100)),
    sufixo: "%",
    step: "1",
    min: "0",
    max: "90",
  },
  {
    name: "roasMinimo",
    label: "ROAS mínimo",
    hint: "Abaixo disso a verba deve cair.",
    para: (r) => String(r.roasMinimo),
    sufixo: "x",
    step: "0.1",
    min: "0.5",
    max: "20",
  },
  {
    name: "roasPausa",
    label: "ROAS de pausa",
    hint: "Abaixo disso a verba para. 1,0x é o ponto em que cada real devolve um real.",
    para: (r) => String(r.roasPausa),
    sufixo: "x",
    step: "0.1",
    min: "0.1",
    max: "20",
  },
  {
    name: "gastoMaximoDia",
    label: "Teto de gasto por dia",
    hint: "Zero desliga o teto.",
    para: (r) => String(r.gastoMaximoDia),
    sufixo: "R$",
    step: "50",
    min: "0",
  },
  {
    name: "escalaMaxima",
    label: "Aumento máximo por decisão",
    hint: "Quanto a verba pode subir de uma vez, quando tudo está bem.",
    para: (r) => String(Math.round(r.escalaMaxima * 100)),
    sufixo: "%",
    step: "5",
    min: "0",
    max: "100",
  },
  {
    name: "diasToleranciaNegativo",
    label: "Dias de prejuízo tolerados",
    hint: "Quantos dias seguidos no vermelho antes de pausar.",
    para: (r) => String(r.diasToleranciaNegativo),
    sufixo: "dias",
    step: "1",
    min: "1",
    max: "30",
  },
  {
    name: "aprovacaoAcimaDe",
    label: "Aprovação humana acima de",
    hint: "Aumentos maiores que isto, em reais, esperam alguém confirmar.",
    para: (r) => String(r.aprovacaoAcimaDe),
    sufixo: "R$",
    step: "50",
    min: "0",
  },
];

/**
 * O formulário do freio de mão. Cada campo diz o que faz em uma linha —
 * quem configura isso precisa entender a consequência sem abrir manual.
 */
export function GuardrailsForm({
  regras,
  persistidas,
}: {
  regras: ProfitGuardrails;
  persistidas: boolean;
}) {
  const [estado, acao, pendente] = useActionState<ResultadoAcao | null, FormData>(
    saveGuardrailsAction,
    null,
  );

  return (
    <form action={acao} className="space-y-4">
      {!persistidas && (
        <p className="border-warning/40 bg-warning/10 text-warning rounded-lg border px-3 py-2 text-xs leading-5">
          Estas são as regras padrão. Elas ainda não foram salvas para a sua
          operação — ajuste o que quiser e salve.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPOS.map((campo) => (
          <label key={campo.name} className="bg-muted/20 block rounded-xl border p-3">
            <span className="block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
              {campo.label}
            </span>
            <span className="text-muted-foreground block text-[0.6875rem] leading-4">
              {campo.hint}
            </span>
            <span className="mt-2 flex items-center gap-2">
              <input
                type="number"
                name={campo.name}
                defaultValue={campo.para(regras)}
                step={campo.step}
                min={campo.min}
                max={campo.max}
                inputMode="decimal"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm font-bold tabular-nums outline-none focus-visible:ring-2"
              />
              {campo.sufixo && (
                <span className="text-muted-foreground shrink-0 text-xs font-bold">
                  {campo.sufixo}
                </span>
              )}
            </span>
          </label>
        ))}

        <label className="bg-muted/20 flex items-start gap-3 rounded-xl border p-3">
          <input
            type="checkbox"
            name="pausarDiaNegativo"
            defaultChecked={regras.pausarDiaNegativo}
            className="accent-foreground mt-0.5 size-4"
          />
          <span>
            <span className="block text-[0.6875rem] leading-4 font-extrabold tracking-wide uppercase">
              Pausar sozinho no prejuízo
            </span>
            <span className="text-muted-foreground block text-[0.6875rem] leading-4">
              Quando o dia fecha negativo pelos dias tolerados, a verba para
              sem esperar ninguém.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? <ShieldCheck /> : <Save />}
          {pendente ? "Salvando…" : "Salvar regras"}
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
      </div>
    </form>
  );
}
