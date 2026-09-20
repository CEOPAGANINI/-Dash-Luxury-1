import type {
  ExecutiveAnalyticsDataSet,
  ExecutiveAnalyticsQuery,
} from "@/data/contracts/executive-dashboard";

/** Contrato único de leitura. A UI não precisa conhecer Supabase, SQL ou APIs de mídia. */
export interface ExecutiveAnalyticsRepository {
  getExecutiveData(
    query: ExecutiveAnalyticsQuery,
  ): Promise<ExecutiveAnalyticsDataSet>;
}
