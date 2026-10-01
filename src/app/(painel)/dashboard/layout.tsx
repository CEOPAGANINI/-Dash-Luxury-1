import { Suspense, type ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getUnifiedDashboardData } from "@/features/unified-dashboard/live-data";
import { UnifiedDashboardProvider } from "@/features/unified-dashboard/operation-provider";

async function DashboardDataRegion({ children }: { children: ReactNode }) {
  const data = await getUnifiedDashboardData();
  return (
    <UnifiedDashboardProvider initialData={data}>
      {children}
    </UnifiedDashboardProvider>
  );
}

/** Todas as áreas do dashboard compartilham um contêiner neutro. */
export default function DashboardSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardShell>
      <Suspense
        fallback={
          <div role="status" className="border bg-card p-5 text-sm">
            Consultando os dados da operação…
          </div>
        }
      >
        <DashboardDataRegion>{children}</DashboardDataRegion>
      </Suspense>
    </DashboardShell>
  );
}
