// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  nomeDoArquivo,
  tituloDaPagina,
  validarUrl,
} from "@/features/capture/capture-model";

/*
  O modelo do Asimov Site Downloader: a URL só passa se for http/https e
  não apontar para um host local óbvio; o nome do arquivo é seguro; o
  título sai do <title>. A trava de SSRF de verdade (IP público) é da rota.
*/

describe("validação da URL de captura", () => {
  it("aceita http e https e completa o esquema", () => {
    const r = validarUrl("exemplo.com/pagina");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.https).toBe(true);
      expect(r.url.toString()).toBe("https://exemplo.com/pagina");
    }
  });

  it("recusa vazio, esquema estranho e host local", () => {
    for (const mau of [
      "",
      "  ",
      "ftp://exemplo.com",
      "http://localhost/x",
      "http://127.0.0.1/x",
      "https://algo.local/",
      "http://0.0.0.0/",
    ]) {
      expect(validarUrl(mau).ok, mau).toBe(false);
    }
  });
});

describe("nome do arquivo", () => {
  it("usa host e última parte do caminho, com extensão", () => {
    const { url } = validarUrl("https://loja.com/promo/oferta/") as {
      url: URL;
    };
    expect(nomeDoArquivo(url, "zip")).toBe("loja.com-oferta.zip");
  });
  it("cai para 'captura' quando não sobra nada", () => {
    const { url } = validarUrl("https://x") as { url: URL };
    expect(nomeDoArquivo(url, "html")).toMatch(/\.html$/);
  });
});

describe("título da página", () => {
  it("tira do <title> e normaliza o espaço", () => {
    expect(tituloDaPagina("<title>  Minha\n  Página </title>")).toBe(
      "Minha Página",
    );
    expect(tituloDaPagina("<html>sem título</html>")).toBe("");
  });
});
