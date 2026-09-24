// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENTE_ROOT_SHA256,
  AGENTE_SHA256,
  AGENTE_VERSAO,
  INSTALADOR_SHA256,
} from "@/features/vps/agente-versao";

/*
  As constantes são geradas por `npm run vps:selar`. Este teste falha se
  alguém mudar um arquivo de public/agente/v1 sem selar de novo — o
  comando do painel conferiria um sha antigo e a instalação abortaria.
  Enquanto os arquivos não existem, o valor tem de ser o marcador de
  zeros (nada de sha "inventado").
*/

const PASTA = path.resolve(__dirname, "../../public/agente/v1");
const MARCADOR = "0".repeat(64);
const SELADOS = [
  ["INSTALADOR_SHA256", INSTALADOR_SHA256, "instalar.sh"],
  ["AGENTE_SHA256", AGENTE_SHA256, "dash_agent.py"],
  ["AGENTE_ROOT_SHA256", AGENTE_ROOT_SHA256, "dash_agent_root.py"],
] as const;

const sha256 = (arquivo: string) =>
  createHash("sha256").update(readFileSync(arquivo)).digest("hex");

describe("agente-versao.ts", () => {
  it("versão semântica e sha em hex", () => {
    expect(AGENTE_VERSAO).toMatch(/^\d+\.\d+\.\d+$/);
    for (const [, valor] of SELADOS) expect(valor).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(SELADOS)(
    "%s bate com o arquivo (ou é o marcador sem arquivo)",
    (_nome, valor, arquivo) => {
      const caminho = path.join(PASTA, arquivo);
      if (existsSync(caminho)) expect(valor).toBe(sha256(caminho));
      else expect(valor).toBe(MARCADOR);
    },
  );

  it("o instalador carrega o sha dos dois .py, e os .py a mesma versão", () => {
    const instalador = path.join(PASTA, "instalar.sh");
    if (existsSync(instalador)) {
      const texto = readFileSync(instalador, "utf8");
      expect(texto).toContain(AGENTE_SHA256);
      expect(texto).toContain(AGENTE_ROOT_SHA256);
      expect(texto).toContain(`"${AGENTE_VERSAO}"`);
    }
    for (const arquivo of ["dash_agent.py", "dash_agent_root.py"]) {
      const caminho = path.join(PASTA, arquivo);
      if (existsSync(caminho))
        expect(readFileSync(caminho, "utf8")).toContain(`"${AGENTE_VERSAO}"`);
    }
  });
});
