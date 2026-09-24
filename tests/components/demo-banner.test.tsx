import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DemoBanner } from "@/components/layout/demo-banner";

afterEach(cleanup);

describe("aviso do modo demonstração", () => {
  it("sem banco: diz que os números são de exemplo, falando com quem usa", () => {
    const { container } = render(<DemoBanner semBanco />);
    const texto = container.textContent ?? "";
    expect(texto).toMatch(/Modo demonstração/);
    expect(texto).toMatch(/os números são de exemplo/);
    expect(texto).toMatch(/Conecte o banco de dados/);
    expect(texto).not.toMatch(/\.env|DEPLOY\.md|docs\/|Supabase/);
  });

  it("com banco e sem login: não chama de exemplo os números que são reais", () => {
    const { container } = render(<DemoBanner semBanco={false} />);
    const texto = container.textContent ?? "";
    expect(texto).toMatch(/sem login/);
    expect(texto).not.toMatch(/exemplo|Conecte o banco/);
    expect(texto).not.toMatch(/\.env|DEPLOY\.md|docs\/|Supabase/);
  });
});
