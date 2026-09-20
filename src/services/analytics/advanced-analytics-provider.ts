export interface ForecastPoint {
  date: string;
  expected: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface AnomalySignal {
  metric: string;
  date: string;
  observed: number;
  expected: number;
  severity: "low" | "medium" | "high";
  explanation: string;
}

/**
 * Fronteira para um serviço analítico separado (por exemplo, Python).
 * O dashboard não depende da linguagem usada para previsão ou anomalias.
 */
export interface AdvancedAnalyticsProvider {
  forecast(input: {
    workspaceId: string;
    metric: string;
    horizonDays: number;
  }): Promise<ForecastPoint[]>;

  detectAnomalies(input: {
    workspaceId: string;
    metric: string;
    startDate: string;
    endDate: string;
  }): Promise<AnomalySignal[]>;
}
