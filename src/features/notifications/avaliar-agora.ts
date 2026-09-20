import { getGuardrails } from "@/features/guardrails/queries";
import {
  demoRevenueByYear,
  demoRevenueCurrentWeek,
} from "@/lib/demo-data";
import { buildExecutiveDashboardModel } from "@/services/analytics/executive-dashboard-service";
import { avaliarRegras, type AvisoGerado } from "./rules";

/**
 * O que as regras diriam agora.
 *
 * A página de notificações e a ação que grava os avisos leem daqui, para
 * a prévia na tela e o que vai para o banco serem sempre a mesma lista.
 * A fonte é o mesmo modelo da Visão geral (últimos 7 dias); quando a
 * sincronização real entrar, é só esta função que troca de fonte.
 */
export async function avaliarAgora(): Promise<{
  avisos: AvisoGerado[];
  regrasPersistidas: boolean;
}> {
  const { regras, persistidas } = await getGuardrails();
  const { snapshot } = buildExecutiveDashboardModel({
    days: demoRevenueByYear,
    anchorDays: demoRevenueCurrentWeek,
    period: "7d",
  });
  return { avisos: avaliarRegras(snapshot, regras), regrasPersistidas: persistidas };
}
