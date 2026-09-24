// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AVISOS_DE_USUARIOS,
  lerVisaoGeral,
  OVERVIEW_COMMAND,
  parseVpsOverviewOutput,
  semUsuarios,
  VpsLeituraError,
} from "@/features/vps/overview";

/*
  O parser veio do painel anterior sem mudança de lógica. A fixture é a
  saída REAL do OVERVIEW rodado neste container (sem systemd, por isso o
  aviso de serviços), e as adulteradas testam cada defesa.
*/

const REAL = readFileSync(
  path.resolve(__dirname, "../fixtures/vps/visao-geral-container.txt"),
  "utf8",
);

const linhas = (...corpo: string[]) =>
  ["ORBIT_VPS_V1", ...corpo, "END_ORBIT_VPS_V1", ""].join("\n");

const COMPLETA = linhas(
  "platform\tlinux",
  "hostname\tsrv1",
  "os\tUbuntu 24.04.1 LTS",
  "uptime\t93784.12",
  "cpu_before\t1000\t800",
  "cores\t2",
  "cpu_after\t1100\t850",
  "memory\t2000000\t500000",
  "disk\t40000000\t10000000",
  "user\troot\t0\t/root\t/bin/bash",
  "service\tnginx\tactive",
  "service\tapache2\tnot-installed",
  "service\tmysql\tnot-installed",
  "service\tpostgresql\tnot-installed",
  "service\tdocker\tinactive",
);

describe("parseVpsOverviewOutput", () => {
  it("lê a saída real do container", () => {
    const v = parseVpsOverviewOutput(REAL);
    expect(v.hostname).not.toBe("");
    expect(v.os).toMatch(/Linux|Ubuntu|Debian/);
    expect(v.cpuCores).toBeGreaterThan(0);
    expect(v.memory?.totalBytes).toBeGreaterThan(0);
    expect(v.disk?.totalBytes).toBeGreaterThan(0);
    expect(v.uptimeSeconds).toBeGreaterThan(0);
    expect(v.cpuPercent).not.toBeNull();
  });

  it("calcula CPU, memória e disco em bytes", () => {
    const v = parseVpsOverviewOutput(COMPLETA);
    expect(v.cpuPercent).toBe(50);
    expect(v.memory).toEqual({
      totalBytes: 2000000 * 1024,
      usedBytes: 500000 * 1024,
    });
    expect(v.disk).toEqual({
      totalBytes: 40000000 * 1024,
      usedBytes: 10000000 * 1024,
    });
    expect(v.services).toHaveLength(5);
    expect(v.warnings).toEqual([]);
  });

  it.each([
    ["sem o cabeçalho", COMPLETA.replace("ORBIT_VPS_V1\n", ""), /incompleta/],
    ["sem o fim", COMPLETA.replace("END_ORBIT_VPS_V1", ""), /incompleta/],
    [
      "métrica duplicada",
      linhas("platform\tlinux", "disk\t1\t1", "disk\t1\t1"),
      /duplicadas/,
    ],
    ["não Linux", linhas("platform\tunsupported"), /Linux/],
    [
      "acima de 64 KB",
      linhas("platform\tlinux", `os\t${"x".repeat(70_000)}`),
      /64 KB/,
    ],
  ])("recusa: %s", (_nome, saida, erro) => {
    expect(() => parseVpsOverviewOutput(saida)).toThrow(VpsLeituraError);
    expect(() => parseVpsOverviewOutput(saida)).toThrow(erro);
  });

  it("valores absurdos viram null com aviso, sem derrubar a leitura", () => {
    const v = parseVpsOverviewOutput(
      linhas(
        "platform\tlinux",
        "memory\t100\t200",
        "disk\t-1\t5",
        "cpu_before\t10\t5",
        "cpu_after\t5\t5",
        "cores\t0",
        "hostname\tsrv\u0007x",
      ),
    );
    expect(v.memory).toBeNull();
    expect(v.disk).toBeNull();
    expect(v.cpuPercent).toBeNull();
    expect(v.cpuCores).toBeNull();
    expect(v.hostname).toBe("srvx");
    expect(v.warnings).toContain("Uso do disco raiz (/) indisponível.");
  });
});

describe("gravação sem usuários", () => {
  it("tira users, sampledAt e os avisos sobre usuários", () => {
    const v = parseVpsOverviewOutput(
      linhas("platform\tlinux", "hostname\tsrv"),
    );
    expect(v.warnings).toContain(AVISOS_DE_USUARIOS[0]);
    const gravada = semUsuarios(v);
    expect(gravada).not.toHaveProperty("users");
    expect(gravada).not.toHaveProperty("sampledAt");
    for (const aviso of AVISOS_DE_USUARIOS)
      expect(gravada.warnings).not.toContain(aviso);
    expect(gravada.warnings).toContain("Uso do disco raiz (/) indisponível.");
  });

  it("lerVisaoGeral: ok com a real; erro legível com lixo", () => {
    const ok = lerVisaoGeral(REAL);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(JSON.stringify(ok.visao)).not.toMatch(/"users"|\/home\//);
    expect(lerVisaoGeral("lixo")).toEqual({
      ok: false,
      erro: "O servidor retornou uma coleta incompleta ou incompatível.",
    });
  });
});

describe("OVERVIEW_COMMAND", () => {
  it("é constante, só leitura, sem sudo nem interpolação", () => {
    expect(OVERVIEW_COMMAND.startsWith("export LC_ALL=C\n")).toBe(true);
    expect(OVERVIEW_COMMAND.endsWith("printf 'END_ORBIT_VPS_V1\\n'\n")).toBe(
      true,
    );
    expect(OVERVIEW_COMMAND).not.toMatch(/\bsudo\b|\brm\b|restart|\$\{/);
  });
});
