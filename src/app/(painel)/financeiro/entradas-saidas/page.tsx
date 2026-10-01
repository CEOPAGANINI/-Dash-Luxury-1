import type { Metadata } from "next";

import { LedgerDashboard } from "@/features/unified-dashboard/ledger-dashboard";
import { getUnifiedFinancialData } from "@/features/unified-dashboard/finance-data";
import { UnifiedDashboardProvider } from "@/features/unified-dashboard/operation-provider";

export const metadata: Metadata = { title: "Financeiro · Entradas/Saídas" };

export default async function EntradasSaidasPage() {
  const data = await getUnifiedFinancialData();
  return (
    <UnifiedDashboardProvider initialData={data}>
      <LedgerDashboard />
    </UnifiedDashboardProvider>
  );
}
