// Sela o agente da VPS (npm run vps:selar).
//
// 1. Calcula o sha256 de dash_agent.py, dash_agent_root.py e desinstalar.sh e injeta os três
//    no cabeçalho de public/agente/v1/instalar.sh: o instalador só instala o que bater com eles.
// 2. Calcula o sha256 do instalar.sh já selado e grava src/features/vps/agente-versao.ts, de onde
//    o painel monta o comando "curl … | sha256sum -c" e o teste confere a divergência. Se o
//    arquivo já existe, só os VALORES das 4 constantes mudam (cabeçalho e formato ficam como estão).
//
// Rode sempre que mudar qualquer arquivo de public/agente/v1. A ordem importa: o sha do
// instalador só fica certo depois de os sha dos .py entrarem nele.
//
//   node scripts/vps/selar.mjs                 sela tudo
//   node scripts/vps/selar.mjs --so-instalador só injeta os sha no instalar.sh
//   node scripts/vps/selar.mjs --verificar     não grava nada; sai 1 se algo estiver fora do selo
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTA = join(RAIZ, "public", "agente", "v1");
const INSTALADOR = join(PASTA, "instalar.sh");
const VERSAO_TS = join(RAIZ, "src", "features", "vps", "agente-versao.ts");

const args = new Set(process.argv.slice(2));
const verificar = args.has("--verificar");
const soInstalador = args.has("--so-instalador");

const sha256 = (dados) => createHash("sha256").update(dados).digest("hex");
const ler = (arquivo) => readFileSync(join(PASTA, arquivo));

function versaoDe(arquivo, padrao) {
  const m = ler(arquivo).toString("utf8").match(padrao);
  if (!m) throw new Error(`Não achei a versão em ${arquivo}.`);
  return m[1];
}

const versao = versaoDe(
  "dash_agent.py",
  /^VERSAO, P_PEDIDO, P_TAREFA = "([0-9.]+)"/m,
);
for (const [arquivo, padrao] of [
  ["dash_agent_root.py", /^VERSAO = "([0-9.]+)"/m],
  ["instalar.sh", /^VERSAO="([0-9.]+)"/m],
]) {
  const outra = versaoDe(arquivo, padrao);
  if (outra !== versao) {
    console.error(
      `Versões diferentes: dash_agent.py ${versao}, ${arquivo} ${outra}.`,
    );
    process.exit(1);
  }
}

const selos = {
  SHA_AGENTE: sha256(ler("dash_agent.py")),
  SHA_ROOT: sha256(ler("dash_agent_root.py")),
  SHA_DESINSTALAR: sha256(ler("desinstalar.sh")),
};

const instaladorAtual = readFileSync(INSTALADOR, "utf8");
let instaladorSelado = instaladorAtual;
for (const [nome, valor] of Object.entries(selos)) {
  const linha = new RegExp(`^${nome}="[^"]*"$`, "m");
  if (!linha.test(instaladorSelado)) {
    console.error(`Não achei a linha ${nome}="…" em instalar.sh.`);
    process.exit(1);
  }
  instaladorSelado = instaladorSelado.replace(linha, `${nome}="${valor}"`);
}

const valores = {
  AGENTE_VERSAO: versao,
  INSTALADOR_SHA256: sha256(instaladorSelado),
  AGENTE_SHA256: selos.SHA_AGENTE,
  AGENTE_ROOT_SHA256: selos.SHA_ROOT,
};

/** Troca só o valor de `export const NOME = "…"` (numa linha ou quebrado depois do "="). */
function selarTs(atual) {
  let texto = atual;
  for (const [nome, valor] of Object.entries(valores)) {
    const constante = new RegExp(`(export const ${nome}\\s*=\\s*)"[^"]*"`);
    if (!constante.test(texto)) {
      console.error(
        `Não achei export const ${nome} = "…" em agente-versao.ts.`,
      );
      process.exit(1);
    }
    texto = texto.replace(constante, `$1"${valor}"`);
  }
  return texto;
}

const versaoTs = existsSync(VERSAO_TS)
  ? selarTs(readFileSync(VERSAO_TS, "utf8"))
  : `// Gerado por scripts/vps/selar.mjs (npm run vps:selar). Não edite à mão.
// O teste vps-agente-versao confere estes valores contra os arquivos de public/agente/v1.
export const AGENTE_VERSAO = "${valores.AGENTE_VERSAO}";
export const INSTALADOR_SHA256 =
  "${valores.INSTALADOR_SHA256}";
export const AGENTE_SHA256 =
  "${valores.AGENTE_SHA256}";
export const AGENTE_ROOT_SHA256 =
  "${valores.AGENTE_ROOT_SHA256}";
`;

const pendencias = [];
if (instaladorSelado !== instaladorAtual) pendencias.push("instalar.sh");
if (!soInstalador) {
  const atual = existsSync(VERSAO_TS) ? readFileSync(VERSAO_TS, "utf8") : "";
  if (atual !== versaoTs) pendencias.push("src/features/vps/agente-versao.ts");
}

if (verificar) {
  if (pendencias.length) {
    console.error(
      `Fora do selo: ${pendencias.join(", ")}. Rode npm run vps:selar.`,
    );
    process.exit(1);
  }
  console.log("Selo em dia.");
  process.exit(0);
}

if (instaladorSelado !== instaladorAtual)
  writeFileSync(INSTALADOR, instaladorSelado);
if (!soInstalador) writeFileSync(VERSAO_TS, versaoTs);
console.log(`Agente ${versao} selado.`);
console.log(`  dash_agent.py       ${selos.SHA_AGENTE}`);
console.log(`  dash_agent_root.py  ${selos.SHA_ROOT}`);
console.log(`  desinstalar.sh      ${selos.SHA_DESINSTALAR}`);
console.log(`  instalar.sh         ${sha256(instaladorSelado)}`);
