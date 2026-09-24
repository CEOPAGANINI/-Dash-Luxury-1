import { redirect } from "next/navigation";

import { isDatabaseConfigured } from "@/database/client";
import { getSession } from "@/lib/auth/session";
import { ConnectionsProvider } from "@/lib/data-connections";
import { Header } from "@/components/layout/header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DemoBanner } from "@/components/layout/demo-banner";
import { listConnections } from "@/features/integrations/connections-store";
import { countUnreadNotifications } from "@/features/notifications/queries";
import { UnifiedDashboardProvider } from "@/features/unified-dashboard/operation-provider";

export default async function PainelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  const semBanco = !isDatabaseConfigured();

  const [unreadCount, conexoes] = await Promise.all([
    countUnreadNotifications(),
    listConnections(),
  ]);

  return (
    /* A casca mantém cabeçalho e navegação estáveis; cada página do
       dashboard controla internamente o encaixe de suas seções. */
    /* O provedor guarda a operação, a rede, o funil e o dia escolhidos pelos
       painéis da Dash 5, para que a escolha valha em todas as páginas. */
    /* As conexões vêm do banco uma vez por página; o checklist da Visão
       geral e a página de Integrações leem o mesmo estado. */
    <UnifiedDashboardProvider>
      <ConnectionsProvider initial={conexoes}>
        <div
          className="dash-skin cl cl-workspace bg-background text-foreground flex min-h-svh w-full"
          data-design-system="commandlayer"
          data-demo-mode={session.demoMode ? "true" : undefined}
        >
          <AppSidebar user={session.user} unreadCount={unreadCount} />
          <div className="cl-workspace-column flex min-w-0 flex-1 flex-col">
            <Header user={session.user} unreadCount={unreadCount} />
            {(session.demoMode || semBanco) && (
              <DemoBanner semBanco={semBanco} />
            )}
            <main
              id="dashboard-content"
              className="dash-main cl-workspace-scroll w-full flex-1"
              tabIndex={-1}
            >
              {children}
            </main>
          </div>
        </div>
      </ConnectionsProvider>
    </UnifiedDashboardProvider>
  );
}
