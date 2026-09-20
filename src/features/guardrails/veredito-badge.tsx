import { Badge } from "@/components/ui/badge";
import { VEREDITOS, type Veredito } from "./rules";

const VARIANTE: Record<
  (typeof VEREDITOS)[Veredito]["tom"],
  "success" | "muted" | "warning" | "destructive"
> = {
  success: "success",
  neutral: "muted",
  warning: "warning",
  destructive: "destructive",
};

/**
 * O selo do veredito. Verde só quando pode escalar; vermelho só na pausa —
 * a mesma régua de cor do resto do painel: cor onde existe decisão.
 */
export function VereditoBadge({
  veredito,
  className,
  children,
}: {
  veredito: Veredito;
  className?: string;
  /** Um complemento depois do rótulo — uma contagem, por exemplo. */
  children?: React.ReactNode;
}) {
  const def = VEREDITOS[veredito];
  return (
    <Badge variant={VARIANTE[def.tom]} className={className}>
      {def.label}
      {children !== undefined && children !== null && (
        <span className="font-extrabold tabular-nums">{children}</span>
      )}
    </Badge>
  );
}
