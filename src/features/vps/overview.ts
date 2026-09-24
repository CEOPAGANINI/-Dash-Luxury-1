import type { VpsOverview, VpsOverviewSemUsuarios } from "./modelo";

/*
  A leitura de saúde do servidor (disco, memória, CPU, tempo ativo).

  O comando e o parser vieram do painel VPS anterior SEM mudança de
  lógica; só o erro mudou de nome (VpsSshError → VpsLeituraError). Antes
  o painel rodava o comando por SSH; agora quem roda é o agente, como
  dashagent, com `/bin/sh -c`, 15 s e 64 KB, e manda a saída crua no
  pulso ou no resultado de `servidor.coletar`. O parse continua no painel.

  O OVERVIEW de public/agente/v1/dash_agent.py é IDÊNTICO a
  OVERVIEW_COMMAND: o teste de compatibilidade do Python compara os dois
  (via tests/fixtures/vps/constantes.json).

  Na gravação (fora do parser) saem a lista de usuários, os avisos sobre
  ela e o `sampledAt` (hora do parse no painel): a tela usa
  `last_overview_at`.
*/

export const OUTPUT_LIMIT_BYTES = 64 * 1024;
export const SERVICE_NAMES = [
  "nginx",
  "apache2",
  "mysql",
  "postgresql",
  "docker",
] as const;
export const SERVICE_STATES = new Set([
  "active",
  "inactive",
  "failed",
  "activating",
  "deactivating",
  "reloading",
  "maintenance",
  "not-installed",
  "unknown",
]);

export class VpsLeituraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VpsLeituraError";
  }
}

// A single immutable, read-only Linux script. No request value is interpolated
// into this command, no sudo, shell sourcing, restart or remote installation.
export const OVERVIEW_COMMAND = String.raw`export LC_ALL=C
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
printf 'ORBIT_VPS_V1\n'
if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
  printf 'platform\tunsupported\nEND_ORBIT_VPS_V1\n'
  exit 0
fi
printf 'platform\tlinux\n'
printf 'hostname\t'; uname -n 2>/dev/null
awk '/^PRETTY_NAME=/ { sub(/^PRETTY_NAME=/, ""); sub(/^"/, ""); sub(/"$/, ""); gsub(/\t/, " "); print "os\t" $0; exit }' /etc/os-release 2>/dev/null
awk 'NR == 1 { print "uptime\t" $1; exit }' /proc/uptime 2>/dev/null
awk '$1 == "cpu" { sum=0; for(i=2;i<=9;i++)sum+=$i; printf "cpu_before\t%.0f\t%.0f\n",sum,$5+$6 } /^cpu[0-9]+ / { cores++ } END { if(cores>0)print "cores\t" cores }' /proc/stat 2>/dev/null
sleep 1
awk '$1 == "cpu" { sum=0; for(i=2;i<=9;i++)sum+=$i; printf "cpu_after\t%.0f\t%.0f\n",sum,$5+$6; exit }' /proc/stat 2>/dev/null
awk '$1 == "MemTotal:" { total=$2 } $1 == "MemAvailable:" { available=$2; found=1 } END { if(total>0 && found)printf "memory\t%.0f\t%.0f\n",total,total-available }' /proc/meminfo 2>/dev/null
df -Pk / 2>/dev/null | awk 'NR == 2 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ { print "disk\t" $2 "\t" $3 }'
(if command -v getent >/dev/null 2>&1; then getent passwd 2>/dev/null; else cat /etc/passwd 2>/dev/null; fi) | awk -F: 'NF >= 7 && $3 ~ /^[0-9]+$/ { print "user\t" $1 "\t" $3 "\t" $6 "\t" $7; count++; if(count>=100)exit }'
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  for service in nginx apache2 mysql postgresql docker; do
    systemctl show "$service.service" --property=LoadState --property=ActiveState --no-pager 2>/dev/null | awk -F= -v name="$service" '$1 == "LoadState" { load=$2 } $1 == "ActiveState" { active=$2 } END { state="unknown"; if(load=="not-found")state="not-installed"; else if(active ~ /^(active|inactive|failed|activating|deactivating|reloading|maintenance)$/)state=active; print "service\t" name "\t" state }'
  done
else
  printf 'services_unavailable\t1\n'
fi
printf 'END_ORBIT_VPS_V1\n'
`;

const cleanText = (value: string | undefined, max = 256): string =>
  (value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, max);

function nonnegative(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER
    ? parsed
    : null;
}

function bytePair(fields: string[] | undefined): VpsOverview["memory"] {
  const totalKiB = nonnegative(fields?.[0]);
  const usedKiB = nonnegative(fields?.[1]);
  if (
    totalKiB === null ||
    usedKiB === null ||
    totalKiB <= 0 ||
    usedKiB > totalKiB ||
    !Number.isSafeInteger(totalKiB * 1024) ||
    !Number.isSafeInteger(usedKiB * 1024)
  )
    return null;
  return { totalBytes: totalKiB * 1024, usedBytes: usedKiB * 1024 };
}

/** Defensive parsing is exported for fixture-based tests, never a live mock. */
export function parseVpsOverviewOutput(output: string): VpsOverview {
  if (Buffer.byteLength(output) > OUTPUT_LIMIT_BYTES)
    throw new VpsLeituraError(
      "A resposta do servidor excedeu o limite seguro de 64 KB.",
    );
  const lines = output.trimEnd().split("\n");
  if (lines[0] !== "ORBIT_VPS_V1" || lines.at(-1) !== "END_ORBIT_VPS_V1")
    throw new VpsLeituraError(
      "O servidor retornou uma coleta incompleta ou incompatível.",
    );
  const fields = new Map<string, string[]>();
  const users: VpsOverview["users"] = [];
  const services: VpsOverview["services"] = [];
  for (const line of lines.slice(1, -1)) {
    const [key, ...values] = line.split("\t");
    if (key === "user") {
      const uid = nonnegative(values[1]);
      if (
        users.length < 100 &&
        /^[a-z_][a-z0-9_-]{0,31}$/i.test(values[0] ?? "") &&
        uid !== null &&
        Number.isSafeInteger(uid) &&
        values.length === 4
      ) {
        users.push({
          name: values[0],
          uid,
          home: cleanText(values[2], 512),
          shell: cleanText(values[3], 512),
        });
      }
    } else if (key === "service") {
      if (
        (SERVICE_NAMES as readonly string[]).includes(values[0]) &&
        SERVICE_STATES.has(values[1]) &&
        !services.some((service) => service.name === values[0])
      )
        services.push({ name: values[0], state: values[1] });
    } else if (fields.has(key)) {
      throw new VpsLeituraError(
        "O servidor retornou métricas duplicadas ou incompatíveis.",
      );
    } else {
      fields.set(key, values);
    }
  }
  if (fields.get("platform")?.[0] !== "linux")
    throw new VpsLeituraError(
      "A coleta desta versão requer um servidor Linux.",
    );
  const cpuBefore = fields.get("cpu_before")?.map(nonnegative);
  const cpuAfter = fields.get("cpu_after")?.map(nonnegative);
  let cpuPercent: number | null = null;
  if (
    cpuBefore?.length === 2 &&
    cpuAfter?.length === 2 &&
    cpuBefore.every((n) => n !== null) &&
    cpuAfter.every((n) => n !== null)
  ) {
    const total = cpuAfter[0]! - cpuBefore[0]!;
    const idle = cpuAfter[1]! - cpuBefore[1]!;
    if (total > 0 && idle >= 0 && idle <= total)
      cpuPercent = Math.round(((total - idle) / total) * 1000) / 10;
  }
  const cores = nonnegative(fields.get("cores")?.[0]);
  const cpuCores =
    cores !== null && cores > 0 && Number.isSafeInteger(cores) ? cores : null;
  const uptimeSeconds = nonnegative(fields.get("uptime")?.[0]);
  const memory = bytePair(fields.get("memory"));
  const disk = bytePair(fields.get("disk"));
  const hostname = cleanText(fields.get("hostname")?.[0]);
  const os = cleanText(fields.get("os")?.[0]);
  const warnings: string[] = [];
  if (!hostname) warnings.push("Nome do servidor indisponível.");
  if (!os) warnings.push("Nome da distribuição Linux indisponível.");
  if (uptimeSeconds === null) warnings.push("Tempo de atividade indisponível.");
  if (cpuPercent === null)
    warnings.push(
      "Uso de CPU indisponível: não foi possível comparar duas amostras válidas.",
    );
  if (cpuCores === null)
    warnings.push("Quantidade de núcleos de CPU indisponível.");
  if (memory === null)
    warnings.push(
      "Memória indisponível: /proc/meminfo não forneceu totais válidos.",
    );
  if (disk === null) warnings.push("Uso do disco raiz (/) indisponível.");
  if (users.length === 0) warnings.push("Lista de usuários indisponível.");
  if (users.length >= 100)
    warnings.push("A lista mostra no máximo 100 contas do sistema.");
  if (services.length === 0 || fields.has("services_unavailable"))
    warnings.push(
      "Serviços indisponíveis: systemd ausente ou acesso insuficiente.",
    );
  else if (
    services.length < SERVICE_NAMES.length ||
    services.some((service) => service.state === "unknown")
  )
    warnings.push(
      "Não foi possível determinar o estado de todos os serviços consultados.",
    );
  return {
    sampledAt: new Date().toISOString(),
    hostname,
    os,
    uptimeSeconds,
    cpuPercent,
    cpuCores,
    memory,
    disk,
    users,
    services,
    warnings,
  };
}

/** Avisos do parser que falam da lista de usuários (que não é gravada). */
export const AVISOS_DE_USUARIOS = [
  "Lista de usuários indisponível.",
  "A lista mostra no máximo 100 contas do sistema.",
] as const;

/**
 * O que vai para `last_overview`: a leitura sem `users`, sem os avisos
 * sobre usuários e sem `sampledAt`.
 */
export function semUsuarios(visao: VpsOverview): VpsOverviewSemUsuarios {
  const { users: _users, sampledAt: _sampledAt, ...resto } = visao;
  void _users;
  void _sampledAt;
  return {
    ...resto,
    warnings: visao.warnings.filter(
      (aviso) => !(AVISOS_DE_USUARIOS as readonly string[]).includes(aviso),
    ),
  };
}

/**
 * Parse da saída crua do agente, pronto para gravar. Falhou: a mensagem
 * vai para `last_overview_error` e a última leitura boa continua.
 */
export function lerVisaoGeral(
  saida: string,
): { ok: true; visao: VpsOverviewSemUsuarios } | { ok: false; erro: string } {
  try {
    return { ok: true, visao: semUsuarios(parseVpsOverviewOutput(saida)) };
  } catch (erro) {
    return {
      ok: false,
      erro:
        erro instanceof VpsLeituraError
          ? erro.message
          : "Não foi possível ler a saída do servidor.",
    };
  }
}
