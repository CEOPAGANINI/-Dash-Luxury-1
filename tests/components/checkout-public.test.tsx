import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutForm } from "@/features/checkout/checkout-form";
import { completarConfig } from "@/features/checkout-editor/checkout-config";
import { alphaGamerNebula } from "@/features/landing/technebula-data";

vi.mock("@/features/checkout/actions", () => ({
  submitCheckoutAction: vi.fn(async () => ({
    status: "unavailable",
    message: "synthetic unavailable",
  })),
}));
vi.mock("@/features/analytics/tracker", () => ({ sendTrack: vi.fn() }));
vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    void _fill;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ""} />;
  },
}));

const id = "11111111-1111-4111-8111-111111111111";
const attempt = "22222222-2222-4222-8222-222222222222";
const config = completarConfig({
  layout: "etapas",
  pagamentos: ["multibanco"],
  campos: [
    { id: "documento", ativo: false, obrigatorio: false },
    { id: "endereco", ativo: false, obrigatorio: false },
    { id: "telefone", ativo: false, obrigatorio: false },
  ],
  textos: { titulo: "Minha compra", botao: "Confirmar compra" },
});

describe("published checkout configuration and refresh recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "pending" }),
      })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses saved fields, methods and real sequential steps for digital purchases", async () => {
    const { container } = render(
      <CheckoutForm
        product={{ ...alphaGamerNebula, type: "digital" }}
        initialQuantity={1}
        shippingMethods={[]}
        checkoutId={id}
        paymentMethods={["multibanco"]}
        config={config}
        attemptId={attempt}
      />,
    );
    expect(screen.getByRole("heading", { name: "Minha compra" })).toBeTruthy();
    expect(screen.queryByLabelText("NIF")).toBeNull();
    expect(screen.queryByLabelText("Morada")).toBeNull();
    expect(screen.queryByRole("button", { name: /MB WAY/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Multibanco/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Cliente" },
    });
    fireEvent.change(screen.getByLabelText("Apelido"), {
      target: { value: "Teste" },
    });
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "cliente@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("button", { name: /Multibanco/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeTruthy();
    await waitFor(() =>
      expect(
        (container.querySelector('input[name="attemptId"]') as HTMLInputElement)
          .value,
      ).toBe(attempt),
    );
  });

  it("restores a created payment instead of offering a second payment after refresh", async () => {
    sessionStorage.setItem(
      `checkout-attempt:${id}`,
      JSON.stringify({
        id: attempt,
        result: {
          status: "payment_created",
          method: "multibanco",
          orderReference: "TEST-ONE",
          totalCents: 2500,
          multibanco: {
            entity: "12345",
            reference: "123456789",
            amountCents: 2500,
          },
        },
      }),
    );
    render(
      <CheckoutForm
        product={alphaGamerNebula}
        initialQuantity={1}
        shippingMethods={[]}
        checkoutId={id}
        paymentMethods={["multibanco"]}
        config={config}
        attemptId={crypto.randomUUID()}
      />,
    );
    await screen.findByRole("heading", {
      name: "Referência Multibanco gerada",
    });
    expect(screen.getByText("123456789")).toBeTruthy();
    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Iniciar outra compra/ }),
    ).toBeNull();
  });

  it("updates to confirmed only after the persisted payment is approved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "approved" }),
      })),
    );
    sessionStorage.setItem(
      `checkout-attempt:${id}`,
      JSON.stringify({
        id: attempt,
        result: {
          status: "payment_created",
          method: "mbway",
          orderReference: "TEST-ONE",
          totalCents: 2500,
          mbwayPhone: "+351912345678",
        },
      }),
    );
    render(
      <CheckoutForm
        product={alphaGamerNebula}
        initialQuantity={1}
        shippingMethods={[]}
        checkoutId={id}
        attemptId={crypto.randomUUID()}
      />,
    );
    await screen.findByRole("heading", { name: "Pagamento confirmado" });
    expect(
      screen.getByRole("button", { name: "Iniciar outra compra" }),
    ).toBeTruthy();
  });
});
