import type { Metadata } from "next";

import { getSession } from "@/lib/auth/session";
import { DashboardCanvas } from "@/features/dashboard/layout-canvas";

export const metadata: Metadata = { title: "Qualidade de Dados" };

/**
 * Qualidade de dados: o quanto dá para confiar em cada número.
 *
 * Os blocos vêm do registro central e são desenhados pelo canvas, que
 * também permite reorganizá-los no modo "Organizar".
 */
export default async function DadosPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return <DashboardCanvas area="dados" demoMode={demoMode} />;
}
