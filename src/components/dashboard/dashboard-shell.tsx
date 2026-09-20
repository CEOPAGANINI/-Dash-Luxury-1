import type { ReactNode } from "react";

/**
 * Casca neutra das cinco páginas do dashboard. Cada página decide se o seu
 * conteúdo segue o fluxo normal ou usa uma navegação interna por seções.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0" data-dashboard-content>
      {children}
    </div>
  );
}
