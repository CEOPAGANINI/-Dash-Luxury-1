import type {
  AdvancedAnalyticsProvider,
  AnomalySignal,
  ForecastPoint,
} from "@/services/analytics/advanced-analytics-provider";

/** Adaptador HTTP para um worker de ciência de dados independente. */
export class HttpAdvancedAnalyticsProvider implements AdvancedAnalyticsProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Serviço analítico indisponível (${response.status}).`);
    }

    return (await response.json()) as T;
  }

  forecast(input: {
    workspaceId: string;
    metric: string;
    horizonDays: number;
  }): Promise<ForecastPoint[]> {
    return this.request<ForecastPoint[]>("/v1/forecast", input);
  }

  detectAnomalies(input: {
    workspaceId: string;
    metric: string;
    startDate: string;
    endDate: string;
  }): Promise<AnomalySignal[]> {
    return this.request<AnomalySignal[]>("/v1/anomalies", input);
  }
}
