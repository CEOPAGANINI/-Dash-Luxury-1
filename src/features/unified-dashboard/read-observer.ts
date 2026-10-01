type DashboardReadStage =
  | "context"
  | "daily-orders"
  | "daily-payments"
  | "catalog"
  | "recent-orders"
  | "clients"
  | "ledger"
  | "media"
  | "client-totals"
  | "financial-context"
  | "financial-ledger";

/** Operational timings only: no SQL, parameters, IDs, data or raw errors. */
export async function observeDashboardRead<T>(
  stage: DashboardReadStage,
  read: () => PromiseLike<T>,
): Promise<T> {
  const started = Date.now();
  const report = (phase: "started" | "ready" | "failed") => {
    if (process.env.VERCEL_ENV !== "production") return;
    console.info(
      "[dashboard-read]",
      JSON.stringify({ stage, phase, durationMs: Date.now() - started }),
    );
  };
  report("started");
  try {
    const result = await read();
    report("ready");
    return result;
  } catch (error) {
    report("failed");
    throw error;
  }
}
