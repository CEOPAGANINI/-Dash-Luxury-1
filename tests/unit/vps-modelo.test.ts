import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  calcularHostsReservados,
  calcularOrigensPermitidas,
  checkoutValido,
  derivarSlug,
  dominioDoSiteValido,
  emailValido,
  ESQUEMAS_DE_PARAMS,
  formatarBytes,
  formatarData,
  formatarDataHora,
  formatarHora,
  formatarTempoAtivo,
  hostValido,
  ipsEsperados,
  isPublicIpv4,
  lerDominioDoSite,
  normalizarHost,
  origemValida,
  porcentagem,
  R_SHA256,
  R_SLUG,
  R_UUID,
  segmentoDoZipOk,
  sinalDoServidor,
  slugLivre,
  slugValido,
  TIPOS_DE_TAREFA,
  CHAVES_POR_TIPO,
} from "@/features/vps/modelo";

/*
  Roda no ambiente padrão (jsdom) de propósito: modelo.ts vai para o
  navegador, então a normalização por `new URL` tem de funcionar lá.
*/

type Caso<T> = { valor: T; ok: boolean };
const casos = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../fixtures/vps/casos-validacao.json"),
    "utf8",
  ),
) as {
  normalizacao: { entrada: string; saida: string | null }[];
  host: Caso<string>[];
  dominioSite: Caso<string>[];
  origem: Caso<string>[];
  checkout: { url: string | null; origem: string; ok: boolean }[];
  email: Caso<string | null>[];
  slug: Caso<string>[];
  uuid: Caso<string>[];
  sha256: Caso<string>[];
  segmento: Caso<string>[];
  bytes: Caso<unknown>[];
  params: { tipo: string; params: unknown; ok: boolean; motivo?: string }[];
};

describe("casos-validacao.json (os mesmos do agente)", () => {
  it.each(casos.normalizacao)("normaliza $entrada", ({ entrada, saida }) => {
    expect(normalizarHost(entrada)).toBe(saida);
  });
  const regras: [string, Caso<unknown>[], (v: unknown) => boolean][] = [
    ["HOST", casos.host, hostValido],
    ["DOMINIO_SITE", casos.dominioSite, (v) => dominioDoSiteValido(v)],
    ["ORIGEM", casos.origem, origemValida],
    ["EMAIL", casos.email, emailValido],
    ["SLUG", casos.slug, slugValido],
    ["UUID", casos.uuid, (v) => R_UUID.test(v as string)],
    ["SHA256", casos.sha256, (v) => R_SHA256.test(v as string)],
    ["segmento", casos.segmento, (v) => segmentoDoZipOk(v as string, true)],
    [
      "bytes",
      casos.bytes,
      (v) =>
        ESQUEMAS_DE_PARAMS["site.publicar"].shape.bytes.safeParse(v).success,
    ],
  ];
  for (const [nome, lista, regra] of regras)
    it(`${nome}: ${lista.length} casos`, () => {
      const errados = lista.filter((c) => regra(c.valor) !== c.ok);
      expect(errados).toEqual([]);
    });
  it(`CHECKOUT: ${casos.checkout.length} casos`, () => {
    const errados = casos.checkout.filter(
      (c) => checkoutValido(c.url, c.origem) !== c.ok,
    );
    expect(errados).toEqual([]);
  });
  it(`parâmetros das tarefas: ${casos.params.length} casos`, () => {
    const errados = casos.params.filter((c) => {
      const esquema =
        ESQUEMAS_DE_PARAMS[c.tipo as keyof typeof ESQUEMAS_DE_PARAMS];
      return esquema.safeParse(c.params).success !== c.ok;
    });
    expect(errados).toEqual([]);
  });
  it("cobre os casos obrigatórios da spec", () => {
    const origem = casos.origem.find(
      (c) => c.valor === "https://dash-board-psi-one.vercel.app",
    );
    expect(origem?.ok).toBe(true);
    expect(
      casos.dominioSite.find((c) => c.valor === "loja.vercel.app")?.ok,
    ).toBe(false);
    expect(casos.normalizacao.map((c) => c.entrada)).toEqual(
      expect.arrayContaining(["0x7f.1", "Promoção.com.BR"]),
    );
  });
});

describe("normalização e regras de domínio", () => {
  it("punycode e IPv4 alternativo por WHATWG; 0x7f.1 vira IP e é recusado", () => {
    expect(normalizarHost("Promoção.com.BR")).toBe("xn--promoo-7ta5a.com.br");
    expect(normalizarHost("0x7f.1")).toBe("127.0.0.1");
    expect(lerDominioDoSite("0x7f.1")).toBeNull();
    expect(lerDominioDoSite("Promoção.com.BR")).toBe("xn--promoo-7ta5a.com.br");
  });

  it("vercel.app vale como origem, nunca como site", () => {
    expect(origemValida("https://dash-board-psi-one.vercel.app")).toBe(true);
    expect(hostValido("dash-board-psi-one.vercel.app")).toBe(true);
    expect(dominioDoSiteValido("dash-board-psi-one.vercel.app")).toBe(false);
    expect(lerDominioDoSite("Loja.Vercel.App")).toBeNull();
  });

  it("o host do app e das origens extras fica reservado", () => {
    const reservados = calcularHostsReservados(
      "https://painel.loja.com.br",
      "https://checkout.loja.com.br, lixo",
    );
    expect(reservados).toEqual(["painel.loja.com.br", "checkout.loja.com.br"]);
    expect(lerDominioDoSite("painel.loja.com.br", reservados)).toBeNull();
    expect(lerDominioDoSite("loja.com.br", reservados)).toBe("loja.com.br");
  });

  it("lista ORIGENS: app só se https; extras passam pela regra", () => {
    expect(
      calcularOrigensPermitidas(
        "https://dash-board-psi-one.vercel.app",
        "https://checkout.loja.com.br/, http://x.com.br, https://y.com.br:8443, ,https://checkout.loja.com.br",
      ),
    ).toEqual([
      "https://dash-board-psi-one.vercel.app",
      "https://checkout.loja.com.br",
    ]);
    expect(
      calcularOrigensPermitidas(
        "http://127.0.0.1:3100",
        "https://checkout-e2e.com.br",
      ),
    ).toEqual(["https://checkout-e2e.com.br"]);
    expect(calcularOrigensPermitidas("http://localhost:3000", "")).toEqual([]);
  });

  it("checkout e e-mail", () => {
    const o = "https://checkout-e2e.com.br";
    expect(checkoutValido(`${o}/checkout/cadeira-x`, o)).toBe(true);
    expect(checkoutValido(null, o)).toBe(true);
    expect(checkoutValido(`${o}/checkout/cadeira-x/`, o)).toBe(false);
    expect(emailValido("-x@loja.com.br")).toBe(false);
    expect(emailValido(null)).toBe(true);
  });

  it("isPublicIpv4 (literal do painel anterior)", () => {
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "192.168.1.1",
      "203.0.113.10",
      "100.64.0.1",
      "08.8.8.8",
      "256.1.1.1",
    ])
      expect(isPublicIpv4(ip)).toBe(false);
  });
});

describe("slug", () => {
  it("deriva do nome sem acento, minúsculo, até 40", () => {
    expect(derivarSlug("Cadeira Ergonômica X")).toBe("cadeira-ergonomica-x");
    expect(derivarSlug("  --Loja.com.br--  ")).toBe("loja-com-br");
    expect(derivarSlug("!!!")).toBe("site");
    const longo = derivarSlug("a".repeat(39) + " b");
    expect(longo).toBe("a".repeat(39));
    expect(R_SLUG.test(derivarSlug("x".repeat(80)))).toBe(true);
  });
  it("colisão recebe -2, -3, sem passar de 40", () => {
    expect(slugLivre("loja", [])).toBe("loja");
    expect(slugLivre("loja", ["loja"])).toBe("loja-2");
    expect(slugLivre("loja", ["loja", "loja-2"])).toBe("loja-3");
    const base = "b".repeat(40);
    const livre = slugLivre(base, [base]);
    expect(livre).toBe(`${"b".repeat(38)}-2`);
    expect(R_SLUG.test(livre)).toBe(true);
  });
  it("o slug do servidor padrão antigo nunca é dado a um site", () => {
    // "000 Padrão" derivava para o nome do catch-all das instalações antigas
    // (dash-000-padrao.conf): aplicar o site apagaria o servidor padrão.
    expect(derivarSlug("000 Padrão")).toBe("000-padrao");
    expect(slugLivre(derivarSlug("000 Padrão"), [])).toBe("000-padrao-2");
    expect(slugValido("000-padrao")).toBe(false);
    expect(slugValido("000-padrao-2")).toBe(true);
    expect(
      ESQUEMAS_DE_PARAMS["site.remover"].safeParse({
        siteId: "11111111-2222-4333-8444-555555555555",
        slug: "000-padrao",
      }).success,
    ).toBe(false);
  });
});

describe("IPs esperados e sinal", () => {
  it("IP informado vence; senão públicos relatados mais o IP visto", () => {
    const base = {
      ipOverride: null,
      publicIpv4: ["8.8.8.8", "10.0.0.2"],
      publicIpv6: ["2001:DB8::1"],
      lastSeenIp: "1.1.1.1",
    };
    expect(ipsEsperados(base)).toEqual({
      ipv4: ["8.8.8.8", "1.1.1.1"],
      ipv6: ["2001:db8::1"],
    });
    expect(ipsEsperados({ ...base, ipOverride: "9.9.9.9" }).ipv4).toEqual([
      "9.9.9.9",
    ]);
    expect(ipsEsperados({ ...base, lastSeenIp: "192.168.0.1" }).ipv4).toEqual([
      "8.8.8.8",
    ]);
  });
  it("online só com pulso há menos de 90 s", () => {
    const agora = new Date("2026-09-23T12:00:00Z");
    expect(sinalDoServidor(null, agora)).toBe("nunca");
    expect(sinalDoServidor("2026-09-23T11:59:00Z", agora)).toBe("online");
    expect(sinalDoServidor("2026-09-23T11:58:00Z", agora)).toBe("sem_sinal");
  });
});

describe("tipos de tarefa", () => {
  it("chaves exatas iguais às do schema zod, na mesma ordem", () => {
    for (const tipo of TIPOS_DE_TAREFA) {
      const esquema = ESQUEMAS_DE_PARAMS[tipo] as unknown as {
        shape?: Record<string, unknown>;
        def?: { shape?: Record<string, unknown> };
      };
      expect(Object.keys(esquema.shape ?? {})).toEqual(CHAVES_POR_TIPO[tipo]);
    }
  });
});

describe("formatação no fuso de São Paulo", () => {
  it("hora, data e data com hora não dependem do fuso da máquina", () => {
    // 00:30 UTC é 21:30 do dia anterior em São Paulo (UTC−3).
    const iso = "2026-09-24T00:30:00.000Z";
    expect(formatarHora(iso)).toBe("21:30");
    expect(formatarData(iso)).toBe("23/09/2026");
    expect(formatarDataHora(iso)).toBe("23/09 21:30");
    expect(formatarHora(null)).toBe("—");
    expect(formatarData("não é data")).toBe("—");
  });
  it("bytes, tempo ativo e porcentagem", () => {
    expect(formatarBytes(512)).toBe("512 B");
    expect(formatarBytes(1536)).toBe("1,5 KB");
    expect(formatarBytes(5 * 1024 ** 3)).toBe("5 GB");
    expect(formatarBytes(null)).toBe("—");
    expect(formatarTempoAtivo(59)).toBe("0 min");
    expect(formatarTempoAtivo(3 * 3600 + 120)).toBe("3 h 2 min");
    expect(formatarTempoAtivo(26 * 3600)).toBe("1 d 2 h");
    expect(porcentagem(1, 3)).toBe(33);
    expect(porcentagem(1, 0)).toBe(0);
  });
});
