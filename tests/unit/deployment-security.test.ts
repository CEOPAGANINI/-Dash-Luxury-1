import { describe, expect, it } from "vitest";
import {
  allowLocalDemo,
  protectPrivateResponse,
} from "../../src/lib/auth/deployment-security";

describe("private deployment policy", () => {
  it("allows demo only locally", () => {
    expect(allowLocalDemo({ NODE_ENV: "development" })).toBe(true);
    expect(allowLocalDemo({ NODE_ENV: "test" })).toBe(true);
    expect(allowLocalDemo({ NODE_ENV: "production" })).toBe(false);
    expect(allowLocalDemo({ NODE_ENV: "development", VERCEL: "1" })).toBe(
      false,
    );
    expect(allowLocalDemo({ VERCEL_ENV: "preview" })).toBe(false);
    expect(allowLocalDemo({})).toBe(false);
  });
  it("keeps private responses out of shared caches and external frames", () => {
    const headers = new Headers();
    protectPrivateResponse(headers);
    expect(headers.get("Cache-Control")).toContain("no-store");
    expect(headers.get("X-Robots-Tag")).toContain("noindex");
    expect(headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'none'",
    );
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("preserves an existing CSP instead of overwriting its restrictions", () => {
    const headers = new Headers({
      "Content-Security-Policy": "default-src 'self'",
    });
    protectPrivateResponse(headers);
    expect(headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; frame-ancestors 'none'",
    );
    protectPrivateResponse(headers);
    expect(
      headers.get("Content-Security-Policy")?.match(/frame-ancestors/g),
    ).toHaveLength(1);
  });
  it("closes framing even when an earlier CSP allowed it", () => {
    const headers = new Headers({
      "Content-Security-Policy":
        "default-src 'self'; frame-ancestors *; script-src 'self'",
    });
    protectPrivateResponse(headers);
    expect(headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
    );
  });
});
