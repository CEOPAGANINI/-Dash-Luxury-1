import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

import ts from "typescript";

/*
  Grafo de imports para o teste de arquitetura da VPS.

  O pacote `server-only` não é usado (ele quebra o seed rodado com tsx);
  quem garante a fronteira servidor/cliente é este grafo: a partir de cada
  arquivo "use client", segue os imports estáticos, dinâmicos e
  `export … from`, resolvendo `@/` e caminhos relativos, e diz aonde
  chegou. É TRANSITIVO de propósito: cliente → modelo → `node:url` tem de
  ser pego, mesmo sem nenhum import proibido direto no cliente.

  Regras de leitura, iguais às do bundler:
  - `import type` e `export type … from` somem na compilação: não contam;
    `import { type A }` só com especificadores de tipo também não;
  - um módulo "use server" vira referência de action no cliente: o grafo
    chega nele, mas não entra nele.
*/

export type LeitorDeArquivos = {
  ler(caminho: string): string | null;
  existe(caminho: string): boolean;
};

export const leitorDoDisco: LeitorDeArquivos = {
  ler: (caminho) => {
    try {
      return readFileSync(caminho, "utf8");
    } catch {
      return null;
    }
  },
  existe: (caminho) => existsSync(caminho) && statSync(caminho).isFile(),
};

/** Leitor em memória (caso-controle do teste). */
export function leitorEmMemoria(
  arquivos: Record<string, string>,
): LeitorDeArquivos {
  return {
    ler: (caminho) => arquivos[caminho] ?? null,
    existe: (caminho) => caminho in arquivos,
  };
}

const EXTENSOES = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function diretivas(fonte: ts.SourceFile): string[] {
  const lista: string[] = [];
  for (const instrucao of fonte.statements) {
    if (
      ts.isExpressionStatement(instrucao) &&
      ts.isStringLiteral(instrucao.expression)
    )
      lista.push(instrucao.expression.text);
    else break;
  }
  return lista;
}

export function temDiretiva(texto: string, diretiva: string): boolean {
  const fonte = ts.createSourceFile("x.tsx", texto, ts.ScriptTarget.Latest);
  return diretivas(fonte).includes(diretiva);
}

/** Os especificadores que sobrevivem à compilação (sem os só de tipo). */
export function importsDeValor(texto: string, nome = "x.tsx"): string[] {
  const fonte = ts.createSourceFile(
    nome,
    texto,
    ts.ScriptTarget.Latest,
    true,
    nome.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lista: string[] = [];
  const visitar = (no: ts.Node) => {
    if (ts.isImportDeclaration(no) && ts.isStringLiteral(no.moduleSpecifier)) {
      const clausula = no.importClause;
      const soTipo =
        clausula?.isTypeOnly ||
        (clausula &&
          !clausula.name &&
          clausula.namedBindings &&
          ts.isNamedImports(clausula.namedBindings) &&
          clausula.namedBindings.elements.length > 0 &&
          clausula.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!soTipo) lista.push(no.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(no) &&
      no.moduleSpecifier &&
      ts.isStringLiteral(no.moduleSpecifier)
    ) {
      const soTipo =
        no.isTypeOnly ||
        (no.exportClause &&
          ts.isNamedExports(no.exportClause) &&
          no.exportClause.elements.length > 0 &&
          no.exportClause.elements.every((e) => e.isTypeOnly));
      if (!soTipo) lista.push(no.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(no) &&
      no.arguments.length >= 1 &&
      ts.isStringLiteralLike(no.arguments[0]) &&
      (no.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(no.expression) && no.expression.text === "require"))
    ) {
      lista.push(no.arguments[0].text);
    } else if (
      ts.isImportEqualsDeclaration(no) &&
      !no.isTypeOnly &&
      ts.isExternalModuleReference(no.moduleReference) &&
      ts.isStringLiteral(no.moduleReference.expression)
    ) {
      lista.push(no.moduleReference.expression.text);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return lista;
}

/**
 * Resolve um especificador para arquivo (relativo ou `@/`) ou devolve o
 * pacote/builtin como está. `null` quando é relativo e não existe.
 */
export function resolver(
  especificador: string,
  deArquivo: string,
  raizSrc: string,
  leitor: LeitorDeArquivos,
):
  | { tipo: "arquivo"; caminho: string }
  | { tipo: "pacote"; nome: string }
  | null {
  let base: string | null = null;
  if (especificador.startsWith("@/"))
    base = path.join(raizSrc, especificador.slice(2));
  else if (especificador.startsWith("./") || especificador.startsWith("../"))
    base = path.resolve(path.dirname(deArquivo), especificador);
  if (base === null) return { tipo: "pacote", nome: especificador };
  const candidatos = [
    base,
    ...EXTENSOES.map((e) => base + e),
    ...EXTENSOES.map((e) => path.join(base, `index${e}`)),
  ];
  const achado = candidatos.find(
    (c) => EXTENSOES.some((e) => c.endsWith(e)) && leitor.existe(c),
  );
  return achado ? { tipo: "arquivo", caminho: achado } : null;
}

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));

export function ehBuiltinDoNode(nome: string): boolean {
  if (nome.startsWith("node:")) return true;
  return BUILTINS.has(nome.split("/")[0]);
}

export type Alcance = {
  /** Arquivo alcançado → cadeia de imports desde a entrada. */
  arquivos: Map<string, string[]>;
  /** Pacote ou builtin alcançado → cadeia até o arquivo que o importou. */
  pacotes: Map<string, string[]>;
  /** Módulos "use server" alcançados (não percorridos). */
  acoes: Set<string>;
};

/** Percorre o grafo a partir de uma entrada (busca em largura). */
export function percorrer(
  entrada: string,
  raizSrc: string,
  leitor: LeitorDeArquivos = leitorDoDisco,
): Alcance {
  const alcance: Alcance = {
    arquivos: new Map([[entrada, [entrada]]]),
    pacotes: new Map(),
    acoes: new Set(),
  };
  const fila = [entrada];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    const cadeia = alcance.arquivos.get(atual)!;
    const texto = leitor.ler(atual);
    if (texto === null) continue;
    if (atual !== entrada && temDiretiva(texto, "use server")) {
      alcance.acoes.add(atual);
      continue;
    }
    for (const especificador of importsDeValor(texto, atual)) {
      const r = resolver(especificador, atual, raizSrc, leitor);
      if (!r) continue;
      if (r.tipo === "pacote") {
        if (!alcance.pacotes.has(r.nome))
          alcance.pacotes.set(r.nome, [...cadeia, r.nome]);
        continue;
      }
      if (!alcance.arquivos.has(r.caminho)) {
        alcance.arquivos.set(r.caminho, [...cadeia, r.caminho]);
        fila.push(r.caminho);
      }
    }
  }
  return alcance;
}

/** Todo arquivo .ts/.tsx de uma pasta (recursivo). */
export function listarFontes(pasta: string): string[] {
  const saida: string[] = [];
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...listarFontes(caminho));
    else if (/\.(?:ts|tsx)$/.test(item.name) && !item.name.endsWith(".d.ts"))
      saida.push(caminho);
  }
  return saida;
}

/** Os arquivos com a diretiva "use client" no topo. */
export function arquivosCliente(
  pasta: string,
  leitor: LeitorDeArquivos = leitorDoDisco,
): string[] {
  return listarFontes(pasta).filter((arquivo) => {
    const texto = leitor.ler(arquivo);
    return texto !== null && temDiretiva(texto, "use client");
  });
}
