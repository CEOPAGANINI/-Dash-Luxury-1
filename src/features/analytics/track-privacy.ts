/** Attribution fields already collected by the public pages and VPS tracker. */
export const TRACK_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "src",
  "sck",
  "fbclid",
  "gclid",
  "ttclid",
] as const;

const INTERNAL_ORIGIN = "https://tracking.invalid";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Keep the visited path, never URL credentials, query parameters or fragments. */
export function sanitizeTrackPage(value: unknown): string | undefined {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value))
    return undefined;
  const raw = value.trim();
  const relative = raw.startsWith("/") && !raw.startsWith("//");
  if (!relative && !/^https?:\/\//i.test(raw)) return undefined;
  try {
    const url = new URL(raw, INTERNAL_ORIGIN);
    if (!["https:", "http:"].includes(url.protocol)) return undefined;
    if (
      relative &&
      (url.origin !== INTERNAL_ORIGIN || url.pathname.startsWith("//"))
    )
      return undefined;
    return (relative ? url.pathname : url.origin + url.pathname).slice(0, 512);
  } catch {
    return undefined;
  }
}

/** Referral attribution needs the site origin, not its private paths or URL values. */
export function sanitizeTrackReferrer(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    CONTROL_CHARACTERS.test(value) ||
    !/^https?:\/\//i.test(value.trim())
  )
    return undefined;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol)
      ? url.origin.slice(0, 512)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Prevent arbitrary URL fields from becoming persistent analytics metadata. */
export function sanitizeTrackAttribution(
  value: unknown,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result;
  for (const key of TRACK_ATTRIBUTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== "string") continue;
    const safe = raw
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 200);
    if (safe) result[key] = safe;
  }
  return result;
}
