import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, isDatabaseConfigured } from "@/database/client";

import { TRACK_EVENTS } from "./track";
import {
  sanitizeTrackAttribution,
  sanitizeTrackPage,
  sanitizeTrackReferrer,
} from "./track-privacy";

export const MAX_TRACK_BYTES = 16 * 1024;
export const TRACK_REQUESTS_PER_MINUTE = 120;

export const trackRequestSchema = z.object({
  anonymousId: z.string().trim().min(1).max(64),
  event: z.enum(TRACK_EVENTS),
  page: z.string().max(512).transform(sanitizeTrackPage).optional(),
  referrer: z.string().max(512).transform(sanitizeTrackReferrer).optional(),
  productSlug: z.string().max(128).optional(),
  checkoutId: z.string().uuid().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  valueCents: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  utm: z
    .record(z.string().regex(/^[a-zA-Z0-9_]{1,32}$/), z.string().max(200))
    .refine((value) => Object.keys(value).length <= 16)
    .transform(sanitizeTrackAttribution)
    .optional(),
});

export class TrackBodyTooLarge extends Error {}

/** Content-Length não basta: o limite vale também para corpos em streaming. */
export async function readTrackBody(request: Request): Promise<unknown> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_TRACK_BYTES) throw new TrackBodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_TRACK_BYTES) {
        await reader.cancel();
        throw new TrackBodyTooLarge();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

/**
 * Contador persistente e atômico: funciona entre instâncias serverless.
 * A plataforma de entrada deve substituir x-forwarded-for (como a Vercel).
 * Apenas o hash do IP é armazenado; buckets ociosos expiram em 24 horas.
 */
export async function allowTrackRequest(
  ip: string | null,
  now = new Date(),
): Promise<boolean> {
  if (!isDatabaseConfigured()) throw new Error("analytics_unavailable");
  const key = createHash("sha256")
    .update(`public-track:${ip || "unknown"}`)
    .digest("hex");
  const window = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const expires = new Date(now.getTime() + 86_400_000);
  const result = await getDb().execute(sql`
    WITH expired AS (
      DELETE FROM rate_limit_buckets WHERE bucket_key IN (
        SELECT bucket_key FROM rate_limit_buckets WHERE expires_at < ${now.toISOString()}::timestamptz LIMIT 100
      ) AND bucket_key <> ${key}
    )
    INSERT INTO rate_limit_buckets (bucket_key, window_start, requests, expires_at)
    VALUES (${key}, ${window.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
    ON CONFLICT (bucket_key) DO UPDATE SET
      requests = CASE WHEN rate_limit_buckets.window_start = EXCLUDED.window_start
        THEN rate_limit_buckets.requests + 1 ELSE 1 END,
      window_start = EXCLUDED.window_start, expires_at = EXCLUDED.expires_at
    WHERE rate_limit_buckets.window_start <> EXCLUDED.window_start
      OR rate_limit_buckets.requests < ${TRACK_REQUESTS_PER_MINUTE}
    RETURNING requests
  `);
  const rows = Array.isArray(result)
    ? result
    : (result as unknown as { rows: unknown[] }).rows;
  return rows.length > 0;
}
