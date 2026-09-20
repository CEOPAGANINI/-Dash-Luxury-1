import type { Metadata } from "next";

import { ProductsDashboard } from "@/features/unified-dashboard/business-modules";

export const metadata: Metadata = { title: "Produtos" };

/** Módulo da Dash 5.0 unificada, com os dados demonstrativos tipados. */
export default function Page() {
  return <ProductsDashboard />;
}
