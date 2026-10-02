// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ create: vi.fn(), getUser: vi.fn() }));
vi.mock("../../src/lib/supabase/server", () => ({ createClient: auth.create }));
import { getSession } from "../../src/lib/auth/session";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("private server session", () => {
  it("never grants a demo session in production or Vercel when settings are absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await getSession()).toBeNull();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(await getSession()).toBeNull();
    expect(auth.create).not.toHaveBeenCalled();
  });

  it("keeps the explicit demo available only in local development", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect((await getSession())?.demoMode).toBe(true);
  });

  it("requires a user validated by the auth server when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    auth.create.mockResolvedValue({ auth: { getUser: auth.getUser } });
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await getSession()).toBeNull();
    auth.getUser.mockResolvedValue({
      data: { user: { id: "owner-test", email_confirmed_at: "2026-01-01" } },
    });
    expect(await getSession()).toMatchObject({
      demoMode: false,
      user: { id: "owner-test", emailConfirmado: true },
    });
  });
});
