import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createBroskiProvider } from "@/payment-providers/broski";

const SECRET = "whbroski_test_secret_para_testes";

const provider = createBroskiProvider({
  environment: "production",
  apiKey: "sk_live_fake",
  webhookSecret: SECRET,
});

/** Monta o header no formato oficial: t=<unix>,v1=<hex> */
function signatureHeader(body: string, timestamp: number, secret = SECRET) {
  const v1 = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function requestWith(header: string | null) {
  return new Request("https://exemplo.pt/api/webhooks/broski", {
    method: "POST",
    headers: header ? { "Broski-Signature": header } : {},
  });
}

const body = JSON.stringify({
  id: "evt_ab12cd34ef",
  type: "order.paid",
  created: 1785234658,
  data: {
    object: {
      object: "order",
      id: "ord_k2t8byfbq8trnv",
      status: "paid",
      amount: 3990,
    },
  },
});

describe("verifyWebhookSignature", () => {
  it("aceita assinatura válida dentro da janela de tolerância", async () => {
    const now = Math.floor(Date.now() / 1000);
    const ok = await provider.verifyWebhookSignature(
      requestWith(signatureHeader(body, now)),
      body,
    );
    expect(ok).toBe(true);
  });

  it("rejeita corpo adulterado", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signatureHeader(body, now);
    const adulterado = body.replace('"amount":3990', '"amount":1');
    expect(
      await provider.verifyWebhookSignature(requestWith(header), adulterado),
    ).toBe(false);
  });

  it("rejeita assinatura feita com outro segredo", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signatureHeader(body, now, "whbroski_segredo_errado");
    expect(
      await provider.verifyWebhookSignature(requestWith(header), body),
    ).toBe(false);
  });

  it("rejeita evento antigo (proteção contra replay)", async () => {
    const antigo = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min atrás
    expect(
      await provider.verifyWebhookSignature(
        requestWith(signatureHeader(body, antigo)),
        body,
      ),
    ).toBe(false);
  });

  it("rejeita requisição sem o header de assinatura", async () => {
    expect(await provider.verifyWebhookSignature(requestWith(null), body)).toBe(
      false,
    );
  });
});

describe("parseWebhook", () => {
  it("extrai id do evento, tipo e status mapeado", async () => {
    const event = await provider.parseWebhook(body);
    expect(event.externalEventId).toBe("evt_ab12cd34ef");
    expect(event.type).toBe("order.paid");
    expect(event.paymentExternalId).toBe("ord_k2t8byfbq8trnv");
    expect(event.status).toBe("approved");
    expect(event.amountCents).toBe(3990);
  });

  it("mapeia awaiting_payment (Multibanco) para pending", async () => {
    const mb = JSON.stringify({
      id: "evt_mb1",
      type: "order.awaiting_payment",
      created: 1785234658,
      data: {
        object: {
          object: "order",
          id: "ord_mb",
          status: "awaiting_payment",
          amount: 3990,
        },
      },
    });
    const event = await provider.parseWebhook(mb);
    expect(event.status).toBe("pending");
  });
});
