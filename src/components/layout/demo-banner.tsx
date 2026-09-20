import { TriangleAlert } from "lucide-react";

/**
 * Banner permanente do modo demonstração — visível sempre que o Supabase
 * não está configurado. Nenhum dado exibido no painel é real neste modo.
 */
export function DemoBanner() {
  return (
    <div className="bg-warning/15 text-warning-foreground dark:text-warning flex items-center gap-2 border-b px-4 py-2 text-xs md:px-6">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span>
        <strong>Sem dados conectados:</strong> o banco de dados não está ativo.
        Os valores identificados como exemplo são ilustrativos e não representam
        resultados reais. Nenhuma integração está ativa. Configure o Supabase no
        arquivo <code className="font-mono">.env</code> (instruções em
        docs/DEPLOY.md).
      </span>
    </div>
  );
}
