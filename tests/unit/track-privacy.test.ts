import { describe, expect, it } from "vitest";
import {
  sanitizeTrackAttribution,
  sanitizeTrackPage,
  sanitizeTrackReferrer,
  TRACK_ATTRIBUTION_KEYS,
} from "../../src/features/analytics/track-privacy";

describe("analytics URL privacy", () => {
  it("keeps page paths without query parameters or fragments", () => {
    expect(
      sanitizeTrackPage(
        "/checkout/oferta?email=cliente@example.com&token=segredo#dados",
      ),
    ).toBe("/checkout/oferta");
    expect(sanitizeTrackPage("/funil/../oferta?utm_campaign=lancamento")).toBe(
      "/oferta",
    );
    expect(sanitizeTrackPage("/")).toBe("/");
  });

  it("keeps public VPS page locations without URL credentials", () => {
    expect(
      sanitizeTrackPage(
        "https://usuario:segredo@vendas.example/oferta?token=privado#email",
      ),
    ).toBe("https://vendas.example/oferta");
    expect(
      sanitizeTrackPage("http://vendas.example:8080/oferta?utm_source=meta"),
    ).toBe("http://vendas.example:8080/oferta");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/plain,segredo",
    "//vendas.example/oferta",
    "/\\vendas.example/oferta",
    "/..//vendas.example/oferta",
    "oferta",
    "/oferta\n?token=segredo",
    "https://",
    "",
  ])("discards unsupported page values: %s", (value) => {
    expect(sanitizeTrackPage(value)).toBeUndefined();
  });

  it("keeps only the referral origin", () => {
    expect(
      sanitizeTrackReferrer(
        "https://usuario:segredo@origem.example/conta/funil?email=cliente@example.com#privado",
      ),
    ).toBe("https://origem.example");
    expect(sanitizeTrackReferrer("https://origem.example:8443/anuncio")).toBe(
      "https://origem.example:8443",
    );
  });

  it("can sanitize an already sanitized page or referral without changing attribution", () => {
    const page = sanitizeTrackPage(
      "https://vendas.example/oferta?token=segredo#privado",
    );
    const referrer = sanitizeTrackReferrer(
      "https://origem.example/anuncio?email=cliente@example.com",
    );
    expect(sanitizeTrackPage(page)).toBe(page);
    expect(sanitizeTrackReferrer(referrer)).toBe(referrer);
  });

  it.each([
    "file:///privado",
    "javascript:alert(1)",
    "/conta",
    "https://origem.example\n/segredo",
    "",
  ])("discards unsupported referral values: %s", (value) => {
    expect(sanitizeTrackReferrer(value)).toBeUndefined();
  });

  it("preserves existing campaign and click attribution, dropping arbitrary fields", () => {
    const campaign = Object.fromEntries(
      TRACK_ATTRIBUTION_KEYS.map((key) => [key, `valor-${key}`]),
    );
    expect(
      sanitizeTrackAttribution({
        ...campaign,
        email: "cliente@example.com",
        token: "segredo",
        password: "privado",
      }),
    ).toEqual(campaign);
  });

  it("limits attribution values and ignores inherited or invalid fields", () => {
    const value = Object.assign(Object.create({ utm_source: "herdado" }), {
      utm_campaign: " x ",
      utm_medium: "social\u0000",
      fbclid: "x".repeat(250),
      utm_content: 42,
      utm_term: " ",
    });
    expect(sanitizeTrackAttribution(value)).toEqual({
      utm_campaign: "x",
      utm_medium: "social",
      fbclid: "x".repeat(200),
    });
    expect(sanitizeTrackAttribution(null)).toEqual({});
  });
});
