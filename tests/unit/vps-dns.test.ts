// @vitest-environment node
import { describe, expect, it } from "vitest";

import { verificarDominio, type ResolvedorDns } from "@/features/vps/dns";

const erro = (code: string) => Object.assign(new Error(code), { code });

function falso(
  a: string[] | Error | "nunca",
  aaaa: string[] | Error | "nunca" = erro("ENODATA"),
): ResolvedorDns {
  const responder = (v: string[] | Error | "nunca") =>
    v === "nunca"
      ? new Promise<string[]>(() => {})
      : v instanceof Error
        ? Promise.reject(v)
        : Promise.resolve(v);
  return { resolve4: () => responder(a), resolve6: () => responder(aaaa) };
}

const esperados = { ipv4: ["8.8.8.8"], ipv6: ["2001:db8::1"] };

describe("verificarDominio", () => {
  it("ok: todos os A esperados e AAAA vazio", async () => {
    const r = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(["8.8.8.8"]),
    });
    expect(r.status).toBe("ok");
    expect(r.detalhe).toMatchObject({
      a: ["8.8.8.8"],
      aaaa: [],
      esperadosV4: ["8.8.8.8"],
    });
  });

  it("ok: AAAA esperado (maiúsculas não importam)", async () => {
    const r = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(["8.8.8.8"], ["2001:DB8::1"]),
    });
    expect(r.status).toBe("ok");
  });

  it("outro_ip: lista o que viu e lembra da nuvem cinza", async () => {
    const r = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(["104.21.1.1", "8.8.8.8"]),
    });
    expect(r.status).toBe("outro_ip");
    expect(r.detalhe.a).toEqual(["104.21.1.1", "8.8.8.8"]);
    expect(r.detalhe.mensagem).toMatch(/104\.21\.1\.1/);
    expect(r.detalhe.mensagem).toMatch(/nuvem cinza/);
  });

  it.each(["ENOTFOUND", "ENODATA"])("sem_registro com %s", async (codigo) => {
    const r = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(erro(codigo)),
    });
    expect(r.status).toBe("sem_registro");
    expect(r.detalhe.mensagem).toMatch(/registro A .* 8\.8\.8\.8/);
  });

  it("aaaa_divergente: A certo e AAAA de fora", async () => {
    const r = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(["8.8.8.8"], ["2606:4700::1"]),
    });
    expect(r.status).toBe("aaaa_divergente");
    expect(r.detalhe.mensagem).toMatch(/apague o AAAA/);
  });

  it("erro_consulta: SERVFAIL e timeout (teto próprio)", async () => {
    const servfail = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso(erro("ESERVFAIL")),
    });
    expect(servfail).toMatchObject({
      status: "erro_consulta",
      detalhe: { erro: "ESERVFAIL" },
    });
    const inicio = Date.now();
    const lento = await verificarDominio("loja.com.br", esperados, {
      resolvedor: falso("nunca", "nunca"),
      tetoMs: 50,
    });
    expect(lento).toMatchObject({
      status: "erro_consulta",
      detalhe: { erro: "ETIMEOUT" },
    });
    expect(Date.now() - inicio).toBeLessThan(2000);
  });

  it("sem IP público conhecido pede o IP ao dono", async () => {
    const r = await verificarDominio(
      "loja.com.br",
      { ipv4: [], ipv6: [] },
      { resolvedor: falso(["8.8.8.8"]) },
    );
    expect(r.status).toBe("erro_consulta");
    expect(r.detalhe.mensagem).toMatch(/Informe o IP público da VPS/i);
  });
});
