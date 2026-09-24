// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  arquivosCliente,
  ehBuiltinDoNode,
  importsDeValor,
  leitorEmMemoria,
  listarFontes,
  percorrer,
  type Alcance,
} from "../helpers/grafo-de-imports";

/*
  Fronteira servidor/cliente, TRANSITIVA (§14.B.10): nada que roda no
  navegador pode alcançar banco, node:*, next/headers, o cliente Supabase
  do servidor ou os módulos de servidor da VPS — nem por um import
  indireto. Um caso-controle em memória prova que o import indireto é pego.
*/

const RAIZ_SRC = path.resolve(__dirname, "../../src");

const PACOTES_PROIBIDOS = [
  /^postgres$/,
  /^drizzle-orm(?:\/|$)/,
  /^next\/headers$/,
  /^ssh2$/,
];
const MODULOS_DE_SERVIDOR_DA_VPS = [
  "chaves",
  "protocolo",
  "servico",
  "tarefas",
  "queries",
  "acesso",
  "schema-sql",
  "dns",
  "conferencia",
  "pacote-zip",
];

function arquivoProibido(arquivo: string, raiz: string): boolean {
  const rel = path.relative(raiz, arquivo).replace(/\\/g, "/");
  if (rel.startsWith("database/")) return true;
  if (/^lib\/supabase\/server\.tsx?$/.test(rel)) return true;
  const vps = /^features\/vps\/([^/]+)\.tsx?$/.exec(rel);
  return Boolean(vps && MODULOS_DE_SERVIDOR_DA_VPS.includes(vps[1]));
}

function violacoes(alcance: Alcance, raiz: string): string[] {
  const lista: string[] = [];
  const mostrar = (cadeia: string[]) =>
    cadeia
      .map((c) => (path.isAbsolute(c) ? path.relative(raiz, c) : c))
      .join(" → ");
  for (const [pacote, cadeia] of alcance.pacotes)
    if (
      ehBuiltinDoNode(pacote) ||
      PACOTES_PROIBIDOS.some((r) => r.test(pacote))
    )
      lista.push(mostrar(cadeia));
  for (const [arquivo, cadeia] of alcance.arquivos)
    if (arquivoProibido(arquivo, raiz)) lista.push(mostrar(cadeia));
  return lista;
}

describe("nenhum arquivo 'use client' alcança código de servidor", () => {
  const clientes = arquivosCliente(RAIZ_SRC);

  it("há arquivos cliente para percorrer", () => {
    expect(clientes.length).toBeGreaterThan(50);
  });

  it("nenhuma cadeia proibida a partir de todos os arquivos cliente", () => {
    const todas = clientes.flatMap((c) =>
      violacoes(percorrer(c, RAIZ_SRC), RAIZ_SRC),
    );
    expect([...new Set(todas)]).toEqual([]);
  });

  it("ninguém importa ssh2 (nem server-only) em src", () => {
    const culpados = listarFontes(RAIZ_SRC).filter((arquivo) =>
      importsDeValor(readFileSync(arquivo, "utf8"), arquivo).some((i) =>
        /^(?:ssh2|server-only)$/.test(i),
      ),
    );
    expect(culpados).toEqual([]);
  });
});

describe("casos-controle do grafo (em memória)", () => {
  const raiz = "/v/src";

  it("pega o import INDIRETO: cliente → modelo → node:url", () => {
    const leitor = leitorEmMemoria({
      "/v/src/features/vps/tela.tsx":
        '"use client";\nimport { x } from "./modelo";\n',
      "/v/src/features/vps/modelo.ts":
        'import { parse } from "node:url";\nexport const x = parse;\n',
    });
    const alcance = percorrer("/v/src/features/vps/tela.tsx", raiz, leitor);
    expect(violacoes(alcance, raiz)).toEqual([
      "features/vps/tela.tsx → features/vps/modelo.ts → node:url",
    ]);
  });

  it("resolve @/, index e export … from; pega módulo de servidor da VPS", () => {
    const leitor = leitorEmMemoria({
      "/v/src/a.tsx": '"use client";\nexport { b } from "@/lib/b";\n',
      "/v/src/lib/b/index.ts":
        'export const b = () => import("../../features/vps/tarefas");\n',
      "/v/src/features/vps/tarefas.ts": "export const t = 1;\n",
    });
    expect(violacoes(percorrer("/v/src/a.tsx", raiz, leitor), raiz)).toEqual([
      "a.tsx → lib/b/index.ts → features/vps/tarefas.ts",
    ]);
  });

  it("import type e export type não contam", () => {
    const leitor = leitorEmMemoria({
      "/v/src/a.tsx":
        '"use client";\nimport type { Db } from "@/database/client";\nimport { type X } from "drizzle-orm";\nexport type { Y } from "postgres";\n',
    });
    expect(violacoes(percorrer("/v/src/a.tsx", raiz, leitor), raiz)).toEqual(
      [],
    );
    expect(importsDeValor('import { type A, b } from "x";')).toEqual(["x"]);
  });

  it('um módulo "use server" é referência de action: o grafo para nele', () => {
    const leitor = leitorEmMemoria({
      "/v/src/tela.tsx": '"use client";\nimport { acao } from "./actions";\n',
      "/v/src/actions.ts":
        '"use server";\nimport { getDb } from "@/database/client";\nexport async function acao() {}\n',
      "/v/src/database/client.ts": 'import postgres from "postgres";\n',
    });
    const alcance = percorrer("/v/src/tela.tsx", raiz, leitor);
    expect(violacoes(alcance, raiz)).toEqual([]);
    expect([...alcance.acoes]).toEqual(["/v/src/actions.ts"]);
  });

  it("builtins sem o prefixo node: também contam", () => {
    for (const nome of [
      "crypto",
      "fs",
      "dns",
      "zlib",
      "http",
      "https",
      "net",
      "url",
      "fs/promises",
    ])
      expect(ehBuiltinDoNode(nome)).toBe(true);
    expect(ehBuiltinDoNode("react")).toBe(false);
  });
});
