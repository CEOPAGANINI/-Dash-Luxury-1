import type { Metadata } from "next";

import { PayoutsDashboard } from "@/features/unified-dashboard/business-modules";

export const metadata: Metadata = { title: "Repasses" };

/** Módulo da Dash 5.0 unificada, com os dados demonstrativos tipados. */
export default function Page() {
  return <PayoutsDashboard />;
}
