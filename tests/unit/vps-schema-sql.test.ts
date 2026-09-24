// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  vpsArtifacts,
  vpsJobs,
  vpsOperationAttempts,
  vpsReleases,
  vpsServers,
  vpsSiteDomains,
  vpsSites,
} from "@/database/schema";
import {
  comandosDoSqlVps,
  detalheDoErroPg,
  faltaTabelaVps,
  mensagemDeErroVps,
  SQL_VPS,
  TABELAS_VPS,
} from "@/features/vps/schema-sql";

const RAIZ = path.resolve(__dirname, "../..");
const ARQUIVO = readFileSync(
  path.join(RAIZ, "src/database/migrations/0006_vps.sql"),
  "utf8",
);
const TABELAS: PgTable[] = [
  vpsServers,
  vpsSites,
  vpsSiteDomains,
  vpsArtifacts,
  vpsReleases,
  vpsJobs,
  vpsOperationAttempts,
];

/** "CREATE TABLE … ( … );" → { tabela: { coluna: "tipo … NOT NULL" } } */
function colunasDoSql(texto: string): Map<string, Map<string, string>> {
  const tabelas = new Map<string, Map<string, string>>();
  for (const m of texto.matchAll(
    /CREATE TABLE IF NOT EXISTS "(\w+)" \(([\s\S]*?)\n\);/g,
  )) {
    const colunas = new Map<string, string>();
    for (const c of m[2].matchAll(/"(\w+)" ([a-z][^,\n]*?)(?=,\s*"|,?\s*$)/gm))
      colunas.set(c[1], c[2].trim());
    tabelas.set(m[1], colunas);
  }
  return tabelas;
}

const TIPO_SQL: Record<string, string> = {
  "timestamp with time zone": "timestamptz",
};

describe("0006_vps.sql = SQL_VPS", () => {
  it("o arquivo é idêntico à constante", () => {
    expect(SQL_VPS).toBe(ARQUIVO);
  });

  it("dá para dividir por ';': nada de $$ nem ';' em comentário ou texto", () => {
    expect(SQL_VPS).not.toContain("$$");
    for (const linha of SQL_VPS.split("\n")) {
      const comentario = linha.indexOf("--");
      if (comentario >= 0) expect(linha.slice(comentario)).not.toContain(";");
    }
    for (const literal of SQL_VPS.matchAll(/'[^']*'/g))
      expect(literal[0]).not.toContain(";");
    const comandos = comandosDoSqlVps();
    expect(comandos).toHaveLength(SQL_VPS.split(";").length - 1);
    for (const c of comandos)
      expect(c.replace(/^--.*\n/gm, "")).toMatch(
        /^(CREATE|ALTER|DELETE FROM "vps_operation_attempts"|DROP INDEX IF EXISTS) /,
      );
  });

  it("as 7 tabelas, com RLS ligado em todas", () => {
    const criadas = [
      ...SQL_VPS.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g),
    ].map((m) => m[1]);
    expect(criadas).toEqual([...TABELAS_VPS]);
    for (const t of TABELAS_VPS)
      expect(SQL_VPS).toContain(
        `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`,
      );
    expect(SQL_VPS.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(7);
  });

  it("colunas, tipos e NOT NULL batem com o schema do drizzle", () => {
    const sql = colunasDoSql(SQL_VPS);
    for (const tabela of TABELAS) {
      const config = getTableConfig(tabela);
      const doSql = sql.get(config.name);
      expect(doSql, config.name).toBeDefined();
      const doDrizzle = new Map(config.columns.map((c) => [c.name, c]));
      expect([...doSql!.keys()].sort(), config.name).toEqual(
        [...doDrizzle.keys()].sort(),
      );
      for (const [nome, coluna] of doDrizzle) {
        const definicao = doSql!.get(nome)!;
        const tipo = TIPO_SQL[coluna.getSQLType()] ?? coluna.getSQLType();
        expect(
          definicao.startsWith(tipo),
          `${config.name}.${nome}: ${definicao}`,
        ).toBe(true);
        const notNull = coluna.notNull || coluna.primary;
        expect(
          /NOT NULL/.test(definicao),
          `${config.name}.${nome} NOT NULL`,
        ).toBe(notNull);
        expect(
          /DEFAULT/.test(definicao),
          `${config.name}.${nome} DEFAULT`,
        ).toBe(coluna.hasDefault);
      }
    }
  });

  it("os índices do drizzle existem no SQL, com o mesmo UNIQUE", () => {
    for (const tabela of TABELAS) {
      for (const indice of getTableConfig(tabela).indexes) {
        const nome = indice.config.name!;
        const unico = indice.config.unique ? "UNIQUE " : "";
        expect(SQL_VPS, nome).toContain(
          `CREATE ${unico}INDEX IF NOT EXISTS "${nome}" ON "${getTableConfig(tabela).name}"`,
        );
      }
    }
  });
});

describe("regra de drivers (§3.3)", () => {
  function fontes(pasta: string): string[] {
    return readdirSync(pasta, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? fontes(path.join(pasta, d.name))
        : /\.tsx?$/.test(d.name)
          ? [path.join(pasta, d.name)]
          : [],
    );
  }

  it("nenhum extract(epoch nem ::bigint em src/features/vps", () => {
    const culpados = fontes(path.join(RAIZ, "src/features/vps")).filter((f) =>
      /extract\s*\(\s*epoch|::\s*bigint/i.test(readFileSync(f, "utf8")),
    );
    expect(culpados).toEqual([]);
  });
});

describe("erros do banco", () => {
  const embrulhado = (code: string, message: string, extra = {}) => {
    const original = Object.assign(new Error(message), { code, ...extra });
    return Object.assign(new Error("Failed query: insert …"), {
      cause: original,
    });
  };

  it("acha código e restrição dentro do DrizzleQueryError (postgres-js e PGlite)", () => {
    expect(
      detalheDoErroPg(
        embrulhado("23505", "duplicate key", { constraint_name: "a_idx" }),
      ),
    ).toEqual({
      codigo: "23505",
      restricao: "a_idx",
      mensagem: "duplicate key",
    });
    expect(
      detalheDoErroPg(embrulhado("23505", "dup", { constraint: "b_idx" }))
        .restricao,
    ).toBe("b_idx");
    expect(detalheDoErroPg(new Error("x"))).toEqual({
      codigo: null,
      restricao: null,
      mensagem: "x",
    });
  });

  it("tabela ausente manda colar a 0006", () => {
    const erro = embrulhado("42P01", 'relation "vps_servers" does not exist');
    expect(faltaTabelaVps(erro)).toBe(true);
    expect(mensagemDeErroVps(erro)).toMatch(/0006_vps\.sql/);
    expect(faltaTabelaVps(embrulhado("23505", "dup"))).toBe(false);
    expect(
      mensagemDeErroVps(new Error("permission denied for table x")),
    ).toMatch(/permissão/);
  });
});
