// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("published build version", () => {
  it("uses the explicit commit when Vercel supplies an empty git variable", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("COMMIT_SHA", "abcdef123456789");
    const { default: config } = await import("../../next.config");
    expect(config.env?.NEXT_PUBLIC_VERSAO).toBe("abcdef1");
  });
  it("prefers the actual Vercel commit and provides a nonempty local fallback", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "123456789abcdef");
    vi.stubEnv("COMMIT_SHA", "abcdef123456789");
    expect(
      (await import("../../next.config")).default.env?.NEXT_PUBLIC_VERSAO,
    ).toBe("1234567");
    vi.resetModules();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("COMMIT_SHA", "");
    expect(
      (await import("../../next.config")).default.env?.NEXT_PUBLIC_VERSAO,
    ).toBe("local");
  });
});
