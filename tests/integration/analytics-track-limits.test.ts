// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/database/client", () => ({
  getDb: () => state.db,
  isDatabaseConfigured: () => true,
}));

import {
  allowTrackRequest,
  MAX_TRACK_BYTES,
  readTrackBody,
  TrackBodyTooLarge,
  trackRequestSchema,
  TRACK_REQUESTS_PER_MINUTE,
} from "@/features/analytics/track-request";
import { criarBancoDeTeste, type BancoDeTeste } from "../helpers/pglite";

let banco: BancoDeTeste;
beforeAll(async () => {
  banco = await criarBancoDeTeste();
  state.db = banco.db;
}, 60_000);
afterAll(async () => {
  await banco.pg.close();
});

describe("limites do rastreio público", () => {
  it("rejeita tipos incorretos, valores negativos, UTM arbitrário e moeda inválida", () => {
    const event = { anonymousId: "anon", event: "page_view" };
    for (const patch of [
      { page: {} },
      { anonymousId: [] },
      { valueCents: -1 },
      { valueCents: 1.5 },
      { utm: { utm_source: {} } },
      { currency: "<script>" },
    ]) {
      expect(trackRequestSchema.safeParse({ ...event, ...patch }).success).toBe(
        false,
      );
    }
    expect(
      trackRequestSchema.safeParse({
        ...event,
        utm: { utm_source: "meta" },
        currency: "BRL",
        valueCents: 1500,
      }).success,
    ).toBe(true);
  });

  it("limita bytes mesmo sem Content-Length", async () => {
    const request = new Request("https://app.test/api/public/track", {
      method: "POST",
      body: "a".repeat(MAX_TRACK_BYTES + 1),
    });
    await expect(readTrackBody(request)).rejects.toBeInstanceOf(
      TrackBodyTooLarge,
    );
  });

  it("o contador atômico não ultrapassa o teto em chamadas concorrentes e reseta a janela", async () => {
    const time = new Date("2026-10-01T10:00:00Z");
    const attempts = await Promise.all(
      Array.from({ length: TRACK_REQUESTS_PER_MINUTE + 8 }, () =>
        allowTrackRequest("198.51.100.24", time),
      ),
    );
    expect(attempts.filter(Boolean)).toHaveLength(TRACK_REQUESTS_PER_MINUTE);
    expect(
      await allowTrackRequest(
        "198.51.100.24",
        new Date(time.getTime() + 60_000),
      ),
    ).toBe(true);
    const result = await banco.pg.query<{ bucket_key: string }>(
      "SELECT bucket_key FROM rate_limit_buckets",
    );
    expect(result.rows[0].bucket_key).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rows[0].bucket_key).not.toContain("198.51");
  });
});
