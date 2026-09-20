import type { DemoRevenueDay } from "@/lib/demo-data";

export interface DataFreshnessStatus {
  source: "checkout" | "media" | "crm" | "costs";
  label: string;
  completeness: number;
  lastSuccessfulSync: string | null;
  latencyMinutes: number | null;
  status: "healthy" | "delayed" | "estimated" | "unavailable";
  note: string;
}

export interface ExecutiveAnalyticsDataSet {
  revenueDays: DemoRevenueDay[];
  freshness: DataFreshnessStatus[];
  generatedAt: string;
  demoMode: boolean;
}

export interface ExecutiveAnalyticsQuery {
  workspaceId: string;
  startDate: string;
  endDate: string;
  timezone: string;
}
