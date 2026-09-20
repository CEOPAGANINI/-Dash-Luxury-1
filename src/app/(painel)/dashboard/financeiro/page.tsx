import type { Metadata } from "next";

import { getSession } from "@/lib/auth/session";
import { DashboardCanvas } from "@/features/dashboard/layout-canvas";

export const metadata: Metadata = { title: "Financeiro" };

/**
 * Financeiro: para onde o dinheiro foi e em que ritmo está sendo gasto.
 *
 * Os blocos vêm do registro central e são desenhados pelo canvas, que
 * também permite reorganizá-los no modo "Organizar".
 */
export default async function FinanceiroPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return <DashboardCanvas area="financeiro" demoMode={demoMode} />;
}
