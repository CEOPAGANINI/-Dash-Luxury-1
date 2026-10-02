export type SecurityStatus = "active" | "warning" | "pending" | "unknown";
export type SecuritySource = "live" | "audit" | "planned";
export type SecurityCategory =
  "application" | "database" | "github" | "vercel" | "infrastructure";

export interface SecurityCheck {
  id: string;
  title: string;
  description: string;
  detail: string;
  status: SecurityStatus;
  source: SecuritySource;
  category: SecurityCategory;
  checkedAt: string | null;
  actionHref?: string;
  actionLabel?: string;
}

export interface SecuritySnapshot {
  checkedAt: string;
  version: string;
  checks: SecurityCheck[];
}

export const LIVE_CHECK_MAX_AGE_MS = 120_000;

/** A lost connection must not leave a previously green live check active. */
export function isLiveCheckFresh(
  check: SecurityCheck,
  now = Date.now(),
): boolean {
  if (check.source !== "live" || !check.checkedAt) return false;
  const checkedAt = Date.parse(check.checkedAt);
  return (
    Number.isFinite(checkedAt) &&
    checkedAt <= now + 30_000 &&
    now - checkedAt <= LIVE_CHECK_MAX_AGE_MS
  );
}

export function expireLiveChecks(
  checks: SecurityCheck[],
  now = Date.now(),
): SecurityCheck[] {
  return checks.map((check) => {
    if (check.source !== "live" || isLiveCheckFresh(check, now)) return check;
    return {
      ...check,
      status: "unknown",
      detail: "Verificação ao vivo desatualizada. Atualize para confirmar.",
    };
  });
}
