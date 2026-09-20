import type { Metadata } from "next";

import { getSession } from "@/lib/auth/session";
import { DashboardCanvas } from "@/features/dashboard/layout-canvas";

export const metadata: Metadata = { title: "Notificações" };

/**
 * Notificações: o que precisa de atenção, em ordem de impacto.
 *
 * Os blocos vêm do registro central e são desenhados pelo canvas, que
 * também permite reorganizá-los no modo "Organizar".
 */
export default async function NotificacoesPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return <DashboardCanvas area="notificacoes" demoMode={demoMode} />;
}
