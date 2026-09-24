import { TriangleAlert } from "lucide-react";

/**
 * Banner permanente do modo demonstração. É o único aviso do painel: as
 * páginas não repetem a mensagem. O texto depende do motivo, para nunca
 * dizer "números de exemplo" quando o banco está ligado e só o login é de
 * demonstração.
 */
export function DemoBanner({ semBanco }: { semBanco: boolean }) {
  return (
    <div className="bg-warning/15 text-warning-foreground dark:text-warning flex items-center gap-2 border-b px-4 py-2 text-xs md:px-6">
      <TriangleAlert className="size-3.5 shrink-0" />
      {semBanco ? (
        <span>
          <strong>Modo demonstração:</strong> os números são de exemplo e não
          representam resultados reais. Conecte o banco de dados para ver os
          seus.
        </span>
      ) : (
        <span>
          <strong>Entrada de demonstração:</strong> o painel está aberto sem
          login. Ative o login para proteger os seus dados.
        </span>
      )}
    </div>
  );
}
