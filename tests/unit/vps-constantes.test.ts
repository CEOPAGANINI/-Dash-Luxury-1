// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { P_PEDIDO, P_TAREFA } from "@/features/vps/chaves";
import {
  CHAVES_POR_TIPO,
  ESQUEMAS_DE_PARAMS,
  PAGINA_DE_ESPERA,
  R_IPV4_FORMA,
  R_LOCAL_EMAIL,
  R_ROTULO,
  R_SEGMENTO,
  R_SHA256,
  R_SLUG,
  R_SLUG_CHECKOUT,
  R_TLD,
  R_UUID,
  SLUGS_RESERVADOS,
  SUFIXOS_BASE,
  SUFIXOS_SITE,
} from "@/features/vps/modelo";
import { OVERVIEW_COMMAND } from "@/features/vps/overview";
import {
  EXTENSOES_PERMITIDAS,
  IGNORAR_NO_ZIP,
  IGNORAR_NOME,
  LIMITES_DO_ZIP,
} from "@/features/vps/pacote-zip";
import { JANELA_SEQ_MS, MARCA_DASH } from "@/features/vps/protocolo";

/*
  tests/fixtures/vps/constantes.json é a ponte com o Python: o agente
  compara as próprias constantes com este arquivo, e este teste compara o
  arquivo com o TS. Mudou um lado sem o outro, um dos dois testes falha.
*/

const FIXTURES = path.resolve(__dirname, "../fixtures/vps");
const ler = (arquivo: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, arquivo), "utf8"));

describe("constantes.json = TS", () => {
  const c = ler("constantes.json");

  it("protocolo", () => {
    expect(c.prefixos).toEqual({ pedido: P_PEDIDO, tarefa: P_TAREFA });
    expect(c.marcaRevogacao).toEqual({
      status: 401,
      wwwAuthenticate: MARCA_DASH,
      corpo: { ok: false, error: "unauthorized" },
    });
    expect(c.janelaSeqMs).toBe(JANELA_SEQ_MS);
    expect(c.tipos).toEqual(CHAVES_POR_TIPO);
    expect(c.somenteLeitura).toEqual(["servidor.coletar"]);
  });

  it("regras de validação", () => {
    expect(c.sufixosBase).toEqual([...SUFIXOS_BASE]);
    expect(c.sufixosSite).toEqual([...SUFIXOS_SITE]);
    expect(c.slugsReservados).toEqual([...SLUGS_RESERVADOS]);
    expect(c.regex).toEqual({
      uuid: R_UUID.source,
      slug: R_SLUG.source,
      sha256: R_SHA256.source,
      rotulo: R_ROTULO.source,
      tld: R_TLD.source,
      localEmail: R_LOCAL_EMAIL.source,
      slugCheckout: R_SLUG_CHECKOUT.source,
      segmento: R_SEGMENTO.source,
      ipv4Forma: R_IPV4_FORMA.source,
    });
  });

  it("ZIP: extensões, lixo ignorado e limites (iguais aos do agente)", () => {
    expect(c.zip.extensoes).toEqual([...EXTENSOES_PERMITIDAS]);
    expect(c.zip.ignorarPrefixos).toEqual([...IGNORAR_NO_ZIP]);
    expect(c.zip.ignorarNomes).toEqual([...IGNORAR_NOME]);
    expect(c.zip.ignorarComecoDoNome).toBe("._");
    expect(c.zip.limites).toEqual({
      zip: LIMITES_DO_ZIP.zip,
      arquivos: LIMITES_DO_ZIP.arquivos,
      arquivo: LIMITES_DO_ZIP.arquivo,
      total: LIMITES_DO_ZIP.total,
    });
  });

  it("página de espera e OVERVIEW idênticos", () => {
    expect(c.paginaDeEspera).toBe(PAGINA_DE_ESPERA);
    expect(c.overview).toBe(OVERVIEW_COMMAND);
    // ASCII puro: os bytes são os mesmos no Python e no TS.
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(PAGINA_DE_ESPERA)).toBe(true);
  });
});

/**
 * Lê uma constante de texto direto da fonte do agente: `NOME = r"""..."""`
 * ou `NOME = ("..." '...' ...)` (concatenação implícita do Python). Assim a
 * igualdade vale mesmo se o constantes.json ficar para trás.
 */
function constanteDoPython(fonte: string, nome: string): string {
  const cru = new RegExp(`^${nome} = r"""([\\s\\S]*?)"""$`, "m").exec(fonte);
  if (cru) return cru[1];
  const grupo = new RegExp(`^${nome} = \\(\\n([\\s\\S]*?)\\n\\)$`, "m").exec(
    fonte,
  );
  if (!grupo) throw new Error(`${nome} não encontrado no .py`);
  const escapes: Record<string, string> = {
    n: "\n",
    t: "\t",
    "\\": "\\",
    '"': '"',
    "'": "'",
  };
  let texto = "";
  for (const m of grupo[1].matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g))
    texto += (m[1] ?? m[2]).replace(/\\(.)/g, (_, c: string) => {
      if (!(c in escapes)) throw new Error(`escape \\${c} em ${nome}`);
      return escapes[c];
    });
  return texto;
}

describe("agente em Python = TS (direto da fonte)", () => {
  const agente = readFileSync(
    path.resolve(__dirname, "../../public/agente/v1/dash_agent.py"),
    "utf8",
  );

  it("OVERVIEW é o OVERVIEW_COMMAND, byte a byte", () => {
    expect(constanteDoPython(agente, "OVERVIEW")).toBe(OVERVIEW_COMMAND);
  });

  it("PAGINA_DE_ESPERA é a mesma", () => {
    expect(constanteDoPython(agente, "PAGINA_DE_ESPERA")).toBe(
      PAGINA_DE_ESPERA,
    );
  });

  it("o leitor pega a diferença de um byte", () => {
    const mexido = agente.replace(
      "printf 'ORBIT_VPS_V1\\n'",
      "printf 'ORBIT_VPS_V1 \\n'",
    );
    expect(mexido).not.toBe(agente);
    expect(constanteDoPython(mexido, "OVERVIEW")).not.toBe(OVERVIEW_COMMAND);
  });
});

describe("goldens do nginx", () => {
  const { casos } = ler("golden/casos.json") as {
    casos: {
      arquivo: string;
      slug: string;
      dominios: string[];
      principal: string;
      origemCheckout: string;
      checkout: string | null;
      tls: boolean;
      ipv6: boolean;
      http2On: boolean;
    }[];
  };

  it("os 7 da spec existem", () => {
    expect(casos.map((c) => c.arquivo).sort()).toEqual(
      [
        "checkout-vercel-app.conf",
        "checkout.conf",
        "http-www.conf",
        "http.conf",
        "https-http2-on.conf",
        "https-ipv6.conf",
        "https.conf",
      ].sort(),
    );
    for (const c of casos)
      expect(existsSync(path.join(FIXTURES, "golden", c.arquivo))).toBe(true);
  });

  it.each(casos)("$arquivo: entradas válidas e texto coerente", (c) => {
    const params = {
      siteId: "11111111-2222-4333-8444-555555555555",
      slug: c.slug,
      dominios: c.dominios,
      principal: c.principal,
      origemCheckout: c.origemCheckout,
      checkout: c.checkout,
      tls: c.tls,
    };
    expect(
      ESQUEMAS_DE_PARAMS["site.configurar"].safeParse(params).success,
    ).toBe(true);
    const texto = readFileSync(
      path.join(FIXTURES, "golden", c.arquivo),
      "utf8",
    );
    expect(texto.startsWith("# dash-agent v1: gerado automaticamente.")).toBe(
      true,
    );
    expect(texto.endsWith("}\n")).toBe(true);
    expect(texto).toContain(`server_name ${c.dominios.join(" ")};`);
    expect(texto).toContain(
      `disable_symlinks if_not_owner from=/var/www/dash-funil/${c.slug};`,
    );
    expect(texto).toContain(
      `location ^~ /checkout/ { return 302 ${c.origemCheckout}$request_uri; }`,
    );
    expect(texto.includes("location = /checkout ")).toBe(c.checkout !== null);
    expect(texto.includes("listen 443")).toBe(c.tls);
    expect(texto.includes("listen [::]:")).toBe(c.ipv6);
    expect(texto.includes("http2 on;")).toBe(c.tls && c.http2On);
    expect((texto.match(/^server \{$/gm) ?? []).length).toBe(c.tls ? 2 : 1);
    // Chaves balanceadas e nenhuma linha solta de diretiva sem ';' ou '}'.
    expect((texto.match(/\{/g) ?? []).length).toBe(
      (texto.match(/\}/g) ?? []).length,
    );
    for (const linha of texto.split("\n").filter((l) => l.startsWith("  ")))
      expect(linha).toMatch(/[;}]$/);
    // Regex com '{' só entre aspas: sem elas o nginx -t recusa o arquivo.
    expect(texto).toContain('location ~* "\\.[0-9a-f]{8,}\\.(?:js|css)$" {');
  });
});
