// @vitest-environment node
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { conferirPublico, lookupFixo } from "@/features/vps/conferencia";
import { PAGINA_DE_ESPERA } from "@/features/vps/modelo";

/*
  Um servidor http local faz o papel da VPS. O domínio nunca é resolvido
  de verdade: o `lookup` injetado manda tudo para 127.0.0.1, e o IPv4
  "público" do alvo só passa pela checagem (não é contatado).
*/

const INDEX = "<!doctype html><h1>Versão A</h1>\n";
const SHA_INDEX = createHash("sha256").update(INDEX).digest("hex");

let servidor: Server;
let porta: number;
const vistos: IncomingMessage[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    vistos.push(req);
    const host = req.headers.host;
    if (host === "espera.com.br") return res.end(PAGINA_DE_ESPERA);
    if (host === "redireciona.com.br") {
      res.writeHead(301, { location: "https://outro.com.br/" });
      return res.end();
    }
    if (host === "grande.com.br") return res.end("x".repeat(3 * 1024 * 1024));
    if (host === "lento.com.br") return;
    if (host === "erro.com.br") {
      res.writeHead(404);
      return res.end("não achou");
    }
    if (host === "outra.com.br") return res.end("<h1>Outra coisa</h1>");
    res.end(INDEX);
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  porta = (servidor.address() as AddressInfo).port;
});

afterAll(() => {
  servidor.closeAllConnections();
  servidor.close();
});

const conferir = (dominio: string, extra: { timeoutMs?: number } = {}) =>
  conferirPublico(
    {
      dominio,
      ipv4: "93.184.216.34",
      https: false,
      indexSha256: SHA_INDEX,
      versaoId: "v1",
    },
    { porta, lookup: lookupFixo("127.0.0.1"), ...extra },
  );

describe("conferirPublico", () => {
  it("ok quando o sha256 do corpo é o do index.html da versão ativa", async () => {
    const r = await conferir("loja.com.br");
    expect(r).toMatchObject({
      estado: "ok",
      status: 200,
      url: "http://loja.com.br/",
      versaoId: "v1",
    });
    expect(Number.isFinite(Date.parse(r.em!))).toBe(true);
    const pedido = vistos.at(-1)!;
    expect(pedido.headers.host).toBe("loja.com.br");
    expect(pedido.headers["accept-encoding"]).toBe("identity");
  });

  it("pagina_de_espera quando o corpo é a página de espera", async () => {
    expect((await conferir("espera.com.br")).estado).toBe("pagina_de_espera");
  });

  it("outra_coisa: conteúdo diferente, HTTP de erro e corpo acima de 2 MB", async () => {
    expect((await conferir("outra.com.br")).estado).toBe("outra_coisa");
    expect(await conferir("erro.com.br")).toMatchObject({
      estado: "outra_coisa",
      status: 404,
    });
    expect((await conferir("grande.com.br")).detalhe).toMatch(/2 MB/);
  });

  it("redirecionamento não é seguido", async () => {
    const antes = vistos.length;
    const r = await conferir("redireciona.com.br");
    expect(r).toMatchObject({ estado: "outra_coisa", status: 301 });
    expect(r.detalhe).toMatch(/https:\/\/outro\.com\.br\//);
    expect(vistos.length).toBe(antes + 1);
  });

  it("erro: sem resposta no tempo e porta fechada", async () => {
    const lento = await conferir("lento.com.br", { timeoutMs: 200 });
    expect(lento).toMatchObject({ estado: "erro", status: null });
    expect(lento.detalhe).toMatch(/Sem resposta/);
    const fechada = await conferirPublico(
      {
        dominio: "loja.com.br",
        ipv4: "93.184.216.34",
        https: false,
        indexSha256: SHA_INDEX,
      },
      { porta: 1, lookup: lookupFixo("127.0.0.1") },
    );
    expect(fechada.estado).toBe("erro");
  });

  it("sem SSRF: IP que não é público nem é tentado", async () => {
    const antes = vistos.length;
    for (const ipv4 of ["127.0.0.1", "10.0.0.5", null]) {
      const r = await conferirPublico(
        { dominio: "loja.com.br", ipv4, https: false, indexSha256: SHA_INDEX },
        { porta },
      );
      expect(r.estado).toBe("erro");
    }
    expect(vistos.length).toBe(antes);
  });
});
