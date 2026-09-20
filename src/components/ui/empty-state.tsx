import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center",
        className,
      )}
      {...props}
    >
      {Icon && (
        <div className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
          <Icon className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="text-muted-foreground mx-auto max-w-md text-sm text-balance">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };
