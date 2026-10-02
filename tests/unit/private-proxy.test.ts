// @vitest-environment node
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: auth.create }));
import { config, isPublicAssetPath, proxy } from "../../src/proxy";

describe("private proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    auth.getUser.mockResolvedValue({ data: { user: null } });
    auth.create.mockImplementation(() => ({ auth: { getUser: auth.getUser } }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("fails closed without authentication settings in deployed private pages and APIs", async () => {
    for (const path of [
      "/",
      "/dashboard",
      "/api/painel/vps/estado",
      "/clientes/abc.png",
    ]) {
      const response = await proxy(
        new NextRequest(`https://panel.test${path}`),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(response.headers.get("x-middleware-next")).toBeNull();
    }
    expect(auth.create).not.toHaveBeenCalled();
  });

  it("preserves public shop, checkout, webhook and deliberate assets", async () => {
    for (const path of [
      "/p/product",
      "/checkout/product",
      "/api/webhooks/broski",
      "/landing/nebula-1.jpg",
    ]) {
      const response = await proxy(
        new NextRequest(`https://panel.test${path}`),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(isPublicAssetPath("/clientes/abc.png")).toBe(false);
    expect(isPublicAssetPath("/landing/nebula-1.jpg")).toBe(true);
  });

  it("covers private file-like paths in the actual Next matcher", () => {
    expect(
      doesProxyMatch({ config, nextConfig: {}, url: "/clientes/abc.png" }),
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: "/api/private/report.svg",
      }),
    ).toBe(true);
    expect(
      doesProxyMatch({ config, nextConfig: {}, url: "/_next/static/chunk.js" }),
    ).toBe(false);
  });

  it("redirects anonymous visitors to login and retains refresh cookies", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    auth.create.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([
        { name: "refresh-test", value: "rotated", options: { httpOnly: true } },
      ]);
      return { auth: { getUser: auth.getUser } };
    });
    const response = await proxy(
      new NextRequest("https://panel.test/dashboard"),
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(response.cookies.get("refresh-test")?.value).toBe("rotated");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("allows a validated user through with private response protection", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    auth.getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    const response = await proxy(
      new NextRequest("https://panel.test/dashboard"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("protects recovery and registration responses without preventing access", async () => {
    for (const path of [
      "/login",
      "/cadastro",
      "/recuperar-senha",
      "/auth/callback",
    ]) {
      const response = await proxy(
        new NextRequest(`https://panel.test${path}`),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });
});
