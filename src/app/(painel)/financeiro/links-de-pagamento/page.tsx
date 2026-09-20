import type { Metadata } from "next";

import { PaymentLinksDashboard } from "@/features/unified-dashboard/business-modules";

export const metadata: Metadata = { title: "Links de pagamento" };

/** Módulo da Dash 5.0 unificada, com os dados demonstrativos tipados. */
export default function Page() {
  return <PaymentLinksDashboard />;
}
