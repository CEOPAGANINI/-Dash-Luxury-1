// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { sendTrack } from "../../src/features/analytics/tracker";

afterEach(() => vi.unstubAllGlobals());

it("removes sensitive URL parts from the outgoing browser payload, including overrides", () => {
  const request = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response()),
  );
  vi.stubGlobal("fetch", request);
  sendTrack("page_view", {
    page: "/oferta?email=cliente@example.com&token=segredo#privado",
    referrer:
      "https://usuario:segredo@ref.example/painel?token=privado#interno",
    utm: {
      utm_source: "meta",
      sck: "campanha-anuncio",
      gclid: "click-id",
      email: "cliente@example.com",
      token: "segredo",
    },
  });
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][1]?.referrerPolicy).toBe("no-referrer");
  const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(payload).toMatchObject({
    page: "/oferta",
    referrer: "https://ref.example",
    utm: { utm_source: "meta", sck: "campanha-anuncio", gclid: "click-id" },
  });
  expect(JSON.stringify(payload)).not.toMatch(
    /segredo|privado|cliente@example|painel/,
  );
});
