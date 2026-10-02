/** Demo sessions are restricted to local development and automated tests. */
export function allowLocalDemo(env: {
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}): boolean {
  return (
    (env.NODE_ENV === "development" || env.NODE_ENV === "test") &&
    !env.VERCEL &&
    !env.VERCEL_ENV
  );
}

/** Defense in depth; access control remains enforced by authenticated routes. */
export function protectPrivateResponse(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  const csp = headers.get("Content-Security-Policy");
  const directives = (csp ?? "")
    .split(";")
    .map((directive) => directive.trim())
    .filter(
      (directive) => directive && !/^frame-ancestors(?:\s|$)/i.test(directive),
    );
  headers.set(
    "Content-Security-Policy",
    [...directives, "frame-ancestors 'none'"].join("; "),
  );
}
