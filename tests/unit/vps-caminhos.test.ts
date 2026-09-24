import { describe, expect, it } from "vitest";

import {
  normalizeVpsRelativePath,
  VPS_UPLOAD_MAX_BYTES,
} from "@/features/vps/file-paths";

/*
  Casos portados de tests/components/vps-file-paths.test.ts, que saiu com a
  VPS por SSH (arquivada no ramo chatgpt-trabalho). A função e o limite
  ficaram: o pacote-zip usa normalizeVpsRelativePath em cada nome do ZIP, e
  o limite de 3.000.000 bytes vale no navegador, na rota de publicar e no
  modelo. Os casos de isInsideVpsRoot não vieram: a função saiu, e a
  contenção na raiz é do agente.
*/

describe("normalizeVpsRelativePath", () => {
  it.each(["", "loja", "releases/meu-site/imagens", "páginas/oferta.html"])(
    "aceita o caminho relativo limpo %j",
    (caminho) => expect(normalizeVpsRelativePath(caminho)).toBe(caminho),
  );

  it.each([
    "/",
    "/etc/passwd",
    "..",
    "site/../etc",
    "./site",
    "site//image",
    "site/",
    "x\\y",
    "x\nfile",
    "\0",
    "a".repeat(1025),
    null,
    123,
  ])("recusa o caminho que escapa ou está malformado %j", (caminho) =>
    expect(() => normalizeVpsRelativePath(caminho)).toThrow(),
  );

  it("segmento de até 255 caracteres passa; de 256, não", () => {
    const limite = `pasta/${"a".repeat(255)}`;
    expect(normalizeVpsRelativePath(limite)).toBe(limite);
    expect(() => normalizeVpsRelativePath(`pasta/${"a".repeat(256)}`)).toThrow(
      "Escolha uma pasta dentro da raiz cadastrada.",
    );
  });

  it("caractere de controle ou barra invertida dá a mensagem de caminho inválido", () => {
    expect(() => normalizeVpsRelativePath("a\u007fb")).toThrow(
      "Caminho de pasta inválido.",
    );
    expect(() => normalizeVpsRelativePath("a\\b")).toThrow(
      "Caminho de pasta inválido.",
    );
  });
});

describe("VPS_UPLOAD_MAX_BYTES", () => {
  it("é 3.000.000 bytes, abaixo do limite de corpo da função hospedada", () =>
    expect(VPS_UPLOAD_MAX_BYTES).toBe(3_000_000));
});
