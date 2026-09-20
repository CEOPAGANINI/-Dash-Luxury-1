import { Construction } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: number;
}

const PHASE_NAMES: Record<number, string> = {
  2: "Catálogo e loja",
  3: "Checkout",
  4: "Pagamentos",
  5: "Analytics",
  6: "Financeiro",
  7: "Pixels e integrações",
  8: "Landing pages e editor",
  9: "Clientes e comunicação",
  10: "Produção",
};

/**
 * Placeholder honesto para módulos ainda não implementados.
 * Deixa claro em qual fase do roadmap o módulo será construído —
 * nenhum botão falso, nenhuma funcionalidade simulada.
 */
export function ModulePlaceholder({
  title,
  description,
  phase,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon={Construction}
        title={`${title} — em desenvolvimento`}
        description={description}
        action={
          <Badge variant="info">
            Fase {phase} — {PHASE_NAMES[phase] ?? "Roadmap"}
          </Badge>
        }
        className="min-h-[420px]"
      />
    </div>
  );
}
