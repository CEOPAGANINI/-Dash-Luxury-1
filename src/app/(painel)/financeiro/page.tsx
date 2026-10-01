import type { Metadata } from "next";

import { FinanceOverviewDashboard } from "@/features/unified-dashboard/business-modules";
import { getUnifiedFinancialData } from "@/features/unified-dashboard/finance-data";
import { UnifiedDashboardProvider } from "@/features/unified-dashboard/operation-provider";

export const metadata: Metadata = { title: "Financeiro" };

/** Apenas o livro-caixa desta operação; não consulta catálogo ou mídia. */
export default async function Page() {
  const data = await getUnifiedFinancialData();
  return (
    <UnifiedDashboardProvider initialData={data}>
      <FinanceOverviewDashboard />
    </UnifiedDashboardProvider>
  );
}
