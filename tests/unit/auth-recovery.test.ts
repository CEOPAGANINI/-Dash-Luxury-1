import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  reset: vi.fn(),
  user: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: api.reset,
      getUser: api.user,
      updateUser: api.update,
      signOut: api.signOut,
    },
  }),
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/app-url", () => ({
  getAppUrl: () => "https://dashboard.example.test",
}));
import {
  forgotPasswordAction,
  resetPasswordAction,
} from "@/features/auth/actions";
const form = (data: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, value);
  return result;
};
beforeEach(() => {
  vi.clearAllMocks();
  api.reset.mockResolvedValue({ error: null });
  api.user.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  api.update.mockResolvedValue({ error: null });
  api.signOut.mockResolvedValue({ error: null });
});
describe("complete password recovery", () => {
  it("requests PKCE recovery with the real callback", async () => {
    expect(
      (await forgotPasswordAction(null, form({ email: "owner@example.test" })))
        .ok,
    ).toBe(true);
    expect(api.reset).toHaveBeenCalledWith("owner@example.test", {
      redirectTo:
        "https://dashboard.example.test/auth/callback?next=/auth/redefinir-senha",
    });
  });
  it("rejects absent session, short passwords and mismatch without changing a credential", async () => {
    await resetPasswordAction(
      null,
      form({ password: "short", confirmPassword: "short" }),
    );
    api.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      (
        await resetPasswordAction(
          null,
          form({
            password: "safe-password-123",
            confirmPassword: "safe-password-123",
          }),
        )
      ).ok,
    ).toBe(false);
    expect(api.update).not.toHaveBeenCalled();
  });
  it("updates authenticated recovery and revokes existing sessions", async () => {
    expect(
      (
        await resetPasswordAction(
          null,
          form({
            password: "safe-password-123",
            confirmPassword: "safe-password-123",
          }),
        )
      ).ok,
    ).toBe(true);
    expect(api.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
