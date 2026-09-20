import type { AcquisitionDailyRecord } from "./acquisition-analytics";
import type { OperationId } from "./types";

/**
 * Read model for the acquisition UI. A server adapter must produce one row
 * per account-local date/channel, using mutually exclusive checkout attribution.
 * Platform-reported conversion totals must never be combined here.
 */
export interface AcquisitionDataSource {
  /** Demonstration is explicit and must always be labeled in the UI. */
  mode?: "live" | "demo";
  /** End of the simulated period; ignored for live sources. */
  demoAsOf?: string;
  operationId: OperationId;
  status: "ready" | "loading" | "error" | "unavailable";
  records: AcquisitionDailyRecord[];
  /** True only after deduplication and exclusive channel attribution upstream. */
  attributionVerified: boolean;
  attributionModel?: string;
  sourceName?: string;
  updatedAt?: string;
  timeZone?: string;
  roasTarget?: number;
  errorMessage?: string;
}

// Absence is not zero. Demo data requires the explicit demonstration source.
export const UNAVAILABLE_ACQUISITION_SOURCE: AcquisitionDataSource = {
  operationId: "alpha",
  status: "unavailable",
  records: [],
  attributionVerified: false,
};
