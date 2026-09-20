import type * as React from "react";

import { Badge } from "@/components/ui/badge";

type StatusVariant = "success" | "warning" | "destructive" | "info" | "muted";

const DOT_CLASS: Record<StatusVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

/** Selo de status reutilizável (Nível 1/3): sempre bolinha + texto, nunca só cor. */
export function StatusBadge({
  variant,
  children,
}: {
  variant: StatusVariant;
  children: React.ReactNode;
}) {
  return (
    <Badge variant={variant} className="gap-1.5 font-medium">
      <span className={`size-1.5 rounded-full ${DOT_CLASS[variant]}`} />
      {children}
    </Badge>
  );
}
