import { describe, expect, it } from "vitest";
import { principalOperator, roleAllows } from "@/lib/workspace-policy";

describe("workspace authorization", () => {
  const user = {
    id: "owner-id",
    email: "owner@example.test",
    name: "Owner",
    emailConfirmado: true,
  };
  it("claims the existing operation only from an explicit confirmed allowlist", () => {
    expect(principalOperator(user, { VPS_DONOS: " OWNER@example.test " })).toBe(
      true,
    );
    expect(
      principalOperator(
        { ...user, emailConfirmado: false },
        { VPS_DONOS: user.email },
      ),
    ).toBe(false);
    expect(principalOperator(user, {})).toBe(false);
    expect(
      principalOperator(user, {
        DASHBOARD_DONOS: "another@example.test",
        VPS_DONOS: user.email,
      }),
    ).toBe(false);
  });
  it("does not let viewers write or marketing manage financial settings", () => {
    expect(roleAllows("viewer", ["marketing"])).toBe(false);
    expect(roleAllows("marketing", ["finance"])).toBe(false);
    expect(roleAllows("marketing", ["marketing"])).toBe(true);
    expect(roleAllows("admin", ["finance"])).toBe(true);
  });
});
