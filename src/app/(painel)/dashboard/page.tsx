import type { Metadata } from "next";

import { getSession } from "@/lib/auth/session";
import { DashboardCanvas } from "@/features/dashboard/layout-canvas";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * Visão executiva: os números do dinheiro desta operação.
 *
 * Os blocos vêm do registro central e são desenhados pelo canvas, que
 * também permite reorganizá-los no modo "Organizar".
 */
export default async function DashboardPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return <DashboardCanvas area="visao" demoMode={demoMode} />;
}
