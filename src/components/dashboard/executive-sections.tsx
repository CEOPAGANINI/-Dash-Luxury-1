import { getSession } from "@/lib/auth/session";
import {
  demoDailyRevenueGoal,
  demoOperationMaxMonth,
  demoOperationMinMonth,
  demoRevenueByDayHour,
  demoRevenueByYear,
  demoRevenueCurrentWeek,
} from "@/lib/demo-data";
import {
  ExecutiveOverview,
  type ExecutiveSectionKey,
} from "@/features/dashboard/executive-overview";

/**
 * Ponte servidor → cliente do dashboard modular: injeta os dados padrão na
 * ExecutiveOverview e escolhe quais sessões a página renderiza. Os filtros
 * globais persistem entre páginas via localStorage dentro do componente.
 */
export async function ExecutiveSections({
  sections,
  bare = false,
}: {
  sections: ExecutiveSectionKey[];
  /** Sem os cabeçalhos "Parte NN", quando a página já se apresenta sozinha. */
  bare?: boolean;
}) {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  return (
    <ExecutiveOverview
      days={demoRevenueByYear}
      anchorDays={demoRevenueCurrentWeek}
      demoMode={demoMode}
      operationMinMonth={demoOperationMinMonth}
      operationMaxMonth={demoOperationMaxMonth}
      dailyGoal={demoDailyRevenueGoal}
      hourlyByDay={demoRevenueByDayHour}
      sections={sections}
      bare={bare}
    />
  );
}
