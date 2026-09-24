// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { unzipSync, zipSync, type Zippable } from "fflate";
import { afterAll, describe, expect, it } from "vitest";

import {
  createFlowPage,
  createFlowTemplate,
  FLOW_TEMPLATE_LABELS,
  INITIAL_FLOW,
  PAGE_KIND_LABELS,
  type FlowTemplateKind,
  type LandingFlow,
  type PageKind,
} from "@/features/landing-editor/flow-model";
import {
  importSiteFiles,
  type SitePackage,
} from "@/features/landing-editor/site-package";
import {
  exportFlowPage,
  STATIC_EXPORT_MAX_BYTES,
} from "@/features/landing-editor/static-page-export";
import { VPS_UPLOAD_MAX_BYTES } from "@/features/vps/file-paths";
import {
  inspecionarZip,
  LIMITES_DO_ZIP,
  type ZipInspecionado,
} from "@/features/vps/pacote-zip";
import { problemaDoArquivo } from "@/features/vps/vps-cliente";

/*
  Contrato editor do funil → Servidor do Funil.

  O editor (src/features/landing-editor/static-page-export.ts) exporta cada
  etapa como um ZIP de site estático; o Servidor recebe esse ZIP na
  publicação (inspecionarZip, em src/features/vps/pacote-zip.ts) e o agente
  da VPS o extrai de verdade (extrair, em public/agente/v1/dash_agent.py).
  Os dois lados foram escritos sem se conhecerem. A regra que este teste
  prova: tudo o que o editor gera, o Servidor aceita e o agente extrai
  igual, byte a byte; o que o Servidor recusa, o editor não gera.

  As três divergências que sobraram da união (arquivo oculto, nome acima de
  255 bytes e index.html acima de 2 MB) estão fechadas: o editor confere as
  mesmas regras do Servidor antes de gerar o ZIP e recusa com o mesmo
  motivo. Estão em "o que o editor recusa", ao lado dos outros casos.

  O ZIP "cru" dos casos de borda sai do mesmo fflate e do mesmo nível 6 do
  editor: é o ZIP que o editor geraria se não recusasse antes.
*/

const REPO = path.resolve(__dirname, "../..");
const CONSTANTES = JSON.parse(
  readFileSync(path.join(REPO, "tests/fixtures/vps/constantes.json"), "utf8"),
) as { zip: { limites: { zip: number } } };

const texto = new TextEncoder();
const sha256 = (dados: Uint8Array | string) =>
  createHash("sha256").update(dados).digest("hex");

type Arquivos = Record<string, string | Uint8Array>;
type Aceito = Extract<ZipInspecionado, { ok: true }>;

/** Toda etapa ganha um destino real: o editor não exporta ligação sem URL. */
function comDestinos(funil: LandingFlow): LandingFlow {
  return {
    ...funil,
    pages: funil.pages.map((pagina) => ({
      ...pagina,
      url: `https://loja.exemplo.com.br/${pagina.kind}`,
    })),
  };
}

const FUNIL = comDestinos(INITIAL_FLOW);

function pacote(arquivos: Arquivos, entrada = "index.html"): SitePackage {
  return {
    version: 1,
    name: "Pacote do teste",
    importedAt: "2026-09-24T00:00:00.000Z",
    entryPath: entrada,
    files: Object.entries(arquivos).map(([caminho, dados]) => ({
      path: caminho,
      data: typeof dados === "string" ? texto.encode(dados) : dados,
      mime: "dica/que-o-editor-ignora",
    })),
  };
}

/** A exportação da landing do funil padrão com um pacote HTML importado. */
function exportar(arquivos: Arquivos, entrada?: string) {
  return exportFlowPage(FUNIL, "page-landing", pacote(arquivos, entrada));
}

function zipCru(arquivos: Arquivos): Uint8Array {
  const entradas: Zippable = {};
  for (const [caminho, dados] of Object.entries(arquivos))
    entradas[caminho] = typeof dados === "string" ? texto.encode(dados) : dados;
  return zipSync(entradas, { level: 6 });
}

/** O Servidor aceita (e, se não aceitar, a falha mostra os problemas). */
function aceitar(bytes: Uint8Array): Aceito {
  const r = inspecionarZip(bytes);
  expect(r.ok ? [] : r.problemas).toEqual([]);
  return r as Aceito;
}

function recusas(bytes: Uint8Array) {
  const r = inspecionarZip(bytes);
  if (r.ok) throw new Error("o Servidor aceitou um ZIP que devia recusar");
  return r.problemas;
}

/** Tudo o que o Servidor diz de um ZIP que o editor exportou. */
function conferirSaidaDoEditor(
  saida: { bytes: Uint8Array; filename: string; fileCount: number },
  inspecao: Aceito,
) {
  const dentro = unzipSync(saida.bytes);
  expect(saida.bytes.byteLength).toBeLessThanOrEqual(STATIC_EXPORT_MAX_BYTES);
  // O mesmo filtro do navegador e da rota de publicação (.zip de 1 byte a 3 MB).
  expect(
    problemaDoArquivo(new File([Buffer.from(saida.bytes)], saida.filename)),
  ).toBeNull();
  expect(inspecao.zipBytes).toBe(saida.bytes.byteLength);
  expect(inspecao.sha256).toBe(sha256(saida.bytes));
  expect(inspecao.arquivos).toEqual(Object.keys(dentro).sort());
  expect(inspecao.arquivos).toHaveLength(saida.fileCount);
  // O "No ar" compara o index.html servido com este sha256.
  expect(inspecao.indexSha256).toBe(sha256(dentro["index.html"]));
  expect(inspecao.bytesDescompactados).toBe(
    Object.values(dentro).reduce((soma, dados) => soma + dados.byteLength, 0),
  );
  expect(inspecao.paginas.landing).toBe("index.html");
}

// ---------------------------------------------------------------------------
// 1. Toda etapa que o editor sabe fazer vira um ZIP que o Servidor aceita
// ---------------------------------------------------------------------------

const MODELOS = Object.keys(FLOW_TEMPLATE_LABELS) as FlowTemplateKind[];
const ETAPAS_DOS_MODELOS = MODELOS.flatMap((modelo) => {
  const funil = comDestinos(createFlowTemplate(modelo));
  return funil.pages.map((pagina) => {
    const saidas = funil.connections.filter(
      (c) => c.source === pagina.id,
    ).length;
    return [
      modelo,
      pagina.kind,
      saidas === 1 ? "1 ligação de saída" : `${saidas} ligações de saída`,
      { funil, id: pagina.id, saidas },
    ] as const;
  });
});

const TIPOS = Object.keys(PAGE_KIND_LABELS) as PageKind[];
/** Uma página de cada tipo, solta (sem ligação): cobre até os tipos fora dos modelos. */
const FUNIL_DE_TODOS_OS_TIPOS: LandingFlow = comDestinos({
  version: 1,
  name: "Todas as etapas",
  pages: TIPOS.map((tipo, i) => ({
    ...createFlowPage(tipo, i),
    id: `p-${tipo}`,
  })),
  connections: [],
});

describe("página gerada pelo editor → Servidor", () => {
  it("os modelos cobrem landing, checkout, obrigado, upsell e downsell", () => {
    const etapas = new Set(ETAPAS_DOS_MODELOS.map(([, etapa]) => etapa));
    for (const etapa of [
      "landing",
      "checkout",
      "thank-you",
      "upsell",
      "downsell",
    ] as const)
      expect(etapas.has(etapa)).toBe(true);
    expect([...MODELOS].sort()).toEqual(["basic", "store", "upsell"]);
  });

  it.each(ETAPAS_DOS_MODELOS)(
    "modelo %s, etapa %s (%s)",
    async (_modelo, _etapa, _saidas, { funil, id, saidas }) => {
      const saida = await exportFlowPage(funil, id);
      const inspecao = aceitar(saida.bytes);
      conferirSaidaDoEditor(saida, inspecao);
      expect(inspecao.arquivos).toEqual(["index.html", "orbit-page.css"]);
      expect(inspecao.avisos).toEqual([]);
      const html = new TextDecoder().decode(
        unzipSync(saida.bytes)["index.html"],
      );
      // Cada ligação de saída vira um link para o destino real.
      expect(html.match(/<a class="action/g) ?? []).toHaveLength(saidas);
    },
  );

  it.each(TIPOS)("tipo de etapa %s, numa página solta", async (tipo) => {
    const saida = await exportFlowPage(FUNIL_DE_TODOS_OS_TIPOS, `p-${tipo}`);
    conferirSaidaDoEditor(saida, aceitar(saida.bytes));
  });
});

// ---------------------------------------------------------------------------
// 2. Página importada pelo caminho real do editor
// ---------------------------------------------------------------------------

const HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Oferta</title><link rel="stylesheet" href="css/estilo.css"></head>
<body><h1>Promoção de verão</h1><img src="img/logo.svg" alt=""></body>
</html>
`;

describe("página importada pelo editor → Servidor", () => {
  it("ZIP com pasta-raiz e lixo do macOS: importa, exporta e o Servidor aceita", async () => {
    const zipDoUsuario = zipCru({
      "meu-site/index.html": HTML,
      "meu-site/css/estilo.css": "body{margin:0}",
      "meu-site/img/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
      "meu-site/obrigado/index.html": "<!doctype html><p>Obrigado!</p>",
      "meu-site/termos.html": "<!doctype html><p>Termos</p>",
      "meu-site/.DS_Store": "lixo",
      "__MACOSX/meu-site/._index.html": "lixo",
    });
    const site = await importSiteFiles([
      new File([Buffer.from(zipDoUsuario)], "meu-site.zip"),
    ]);
    const saida = await exportFlowPage(FUNIL, "page-landing", site);
    const inspecao = aceitar(saida.bytes);
    conferirSaidaDoEditor(saida, inspecao);
    expect(inspecao.arquivos).toEqual([
      "css/estilo.css",
      "img/logo.svg",
      "index.html",
      "obrigado/index.html",
      "termos.html",
    ]);
    // O Servidor reconhece as páginas do funil que vieram no pacote.
    expect(inspecao.paginas).toEqual({
      landing: "index.html",
      obrigado: "obrigado/index.html",
      upsell: null,
      downsell: null,
      legais: ["termos.html"],
    });
    expect(inspecao.indexSha256).toBe(sha256(HTML));
  });

  it("entrada numa subpasta: o editor cria o index.html da raiz e guarda o antigo", async () => {
    const saida = await exportar(
      {
        "index.html": "<!doctype html><p>Home antiga</p>",
        "ofertas/oferta.html": HTML,
        "ofertas/css/estilo.css": "body{}",
      },
      "ofertas/oferta.html",
    );
    const inspecao = aceitar(saida.bytes);
    conferirSaidaDoEditor(saida, inspecao);
    expect(inspecao.arquivos).toEqual([
      "index.html",
      "ofertas/css/estilo.css",
      "ofertas/oferta.html",
      "orbit-original-index.html",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. Casos de borda: as regras dos dois lados, lado a lado
// ---------------------------------------------------------------------------

type Borda = {
  caso: string;
  arquivos: Arquivos;
  entrada?: string;
  /** Os arquivos que o Servidor lista, quando o editor gera o ZIP. */
  publicados?: string[];
};
type BordaRecusadaPeloEditor = Borda & {
  editor: RegExp;
  /** O mesmo conteúdo num ZIP cru: o Servidor aceita (null) ou recusa com este motivo. */
  servidor: string | null;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NFD = (s: string) => s.normalize("NFD");

const EDITOR_GERA_SERVIDOR_ACEITA: Borda[] = [
  {
    caso: "index.html na raiz, com pasta de assets",
    arquivos: { "index.html": HTML, "css/estilo.css": "body{}" },
    publicados: ["css/estilo.css", "index.html"],
  },
  {
    caso: "index.html só dentro de uma pasta (o editor mantém a pasta e põe um index.html na raiz)",
    arquivos: { "site/index.html": HTML, "site/css/estilo.css": "body{}" },
    entrada: "site/index.html",
    publicados: ["index.html", "site/css/estilo.css", "site/index.html"],
  },
  {
    caso: "entrada com outro nome numa pasta, sem index.html nenhum",
    arquivos: { "paginas/oferta.html": HTML, "paginas/a.css": "a{}" },
    entrada: "paginas/oferta.html",
    publicados: ["index.html", "paginas/a.css", "paginas/oferta.html"],
  },
  {
    caso: "entrada Index.HTML em maiúsculas (sai index.html minúsculo)",
    arquivos: { "Index.HTML": HTML },
    entrada: "Index.HTML",
    publicados: ["index.html"],
  },
  {
    caso: "arquivo vazio",
    arquivos: { "index.html": HTML, "vazio.txt": "" },
    publicados: ["index.html", "vazio.txt"],
  },
  {
    caso: "index.html vazio",
    arquivos: { "index.html": "" },
    publicados: ["index.html"],
  },
  {
    caso: "nomes com acento (o editor grava em NFC, marcado como UTF-8)",
    arquivos: {
      "index.html": HTML,
      "img/promoção.png": PNG,
      [NFD("ofertas/verão/oferta.html")]: HTML,
    },
    publicados: ["img/promoção.png", "index.html", "ofertas/verão/oferta.html"],
  },
  {
    caso: "entrada numa pasta com acento (o <base> aponta para ela)",
    arquivos: { "index.html": HTML, "ofertas/verão/oferta.html": HTML },
    entrada: "ofertas/verão/oferta.html",
    publicados: [
      "index.html",
      "ofertas/verão/oferta.html",
      "orbit-original-index.html",
    ],
  },
  {
    caso: "@2x, &, apóstrofo, colchetes, til, #, %, hífen e espaço no começo",
    arquivos: {
      "index.html": HTML,
      "img/logo@2x.png": PNG,
      "css/a&b.css": "a{}",
      "css/d'agua.css": "a{}",
      "css/[1].css": "a{}",
      "css/~x.css": "a{}",
      "css/#1.css": "a{}",
      "css/100%.css": "a{}",
      "css/-x.css": "a{}",
      "css/ x.css": "a{}",
    },
  },
  {
    caso: "espaço especial do macOS (U+202F) no nome",
    arquivos: {
      "index.html": HTML,
      "Captura de Tela 2024-01-01 às 10.00.00\u202fAM.png": PNG,
    },
  },
  {
    caso: "nome de 255 caracteres (o máximo do editor)",
    arquivos: { "index.html": HTML, [`${"a".repeat(251)}.css`]: "a{}" },
  },
  {
    // O macOS deixa "._logo.png" ao lado do original em pendrive e pasta de
    // rede. O Servidor descarta sem recusar; o editor nem o põe no ZIP.
    caso: "arquivo \"._\" do macOS fora de __MACOSX",
    arquivos: { "index.html": HTML, "img/logo.png": PNG, "img/._logo.png": PNG },
    publicados: ["img/logo.png", "index.html"],
  },
  {
    caso: "arquivo de 1 MB que comprime mais de 1000 vezes",
    arquivos: { "index.html": HTML, "dados.json": "0".repeat(1 << 20) },
    publicados: ["dados.json", "index.html"],
  },
];

/** Letras pseudoaleatórias: comprimem pouco, e o ZIP fica abaixo de 3 MB. */
function indexAcimaDoTeto(): Uint8Array {
  let semente = 7;
  const letras = new Uint8Array(LIMITES_DO_ZIP.index + 1024);
  for (let i = 0; i < letras.length; i++) {
    semente = (semente * 1103515245 + 12345) >>> 0;
    letras[i] = 97 + ((semente >>> 16) % 26);
  }
  return letras;
}

const EDITOR_RECUSA: BordaRecusadaPeloEditor[] = [
  {
    caso: "PHP",
    arquivos: { "index.html": HTML, "contato.php": "<?php echo 1;" },
    editor: /WordPress\/PHP/,
    servidor: "tipo de arquivo não permitido (só páginas estáticas)",
  },
  {
    caso: ".htaccess",
    arquivos: { "index.html": HTML, ".htaccess": "Deny from all" },
    editor: /Tipo de arquivo não permitido: \.htaccess/,
    servidor: null, // ignorado, com aviso
  },
  {
    caso: "pasta __MACOSX",
    arquivos: { "index.html": HTML, "__MACOSX/._index.html": "lixo" },
    editor: /metadados/,
    servidor: null, // ignorada, com aviso
  },
  {
    caso: 'caminho com ".."',
    arquivos: { "index.html": HTML, "../fora.html": HTML },
    editor: /pastas '\.\.' não são aceitas/,
    servidor: "caminho com '..' não é aceito",
  },
  {
    caso: "nome repetido só na caixa",
    arquivos: { "index.html": HTML, "Foto.png": PNG, "foto.png": PNG },
    editor: /duplicado/,
    servidor:
      "nome repetido (maiúsculas e minúsculas contam como o mesmo arquivo)",
  },
  {
    caso: "arquivo sem extensão com nome de extensão",
    arquivos: { "index.html": HTML, css: "a{}" },
    editor: /Tipo de arquivo não permitido: css\./,
    servidor: "tipo de arquivo não permitido (só páginas estáticas)",
  },
  {
    caso: "arquivo oculto só com extensão",
    arquivos: { "index.html": HTML, ".css": "a{}" },
    editor: /Tipo de arquivo não permitido: \.css\./,
    servidor: "arquivo ou pasta oculta (começa com ponto) não é aceito",
  },
  {
    caso: "pasta oculta (.well-known: o nginx nega /. e ela é do certbot)",
    arquivos: {
      "index.html": HTML,
      ".well-known/security.txt": "Contact: mailto:seguranca@exemplo.com.br",
    },
    editor: /arquivo ou pasta oculta/,
    servidor: "arquivo ou pasta oculta (começa com ponto) não é aceito",
  },
  {
    caso: "nome acima de 255 bytes (132 letras, mas 260 bytes no Linux)",
    arquivos: { "index.html": HTML, [`${"ã".repeat(128)}.css`]: "a{}" },
    editor: /passa de 255 bytes/,
    servidor: "nome longo demais (até 255 bytes)",
  },
  {
    caso: "index.html acima de 2 MB (o teto do que o 'No ar' baixa)",
    arquivos: { "index.html": indexAcimaDoTeto() },
    editor: /index\.html passa de 2 MB/,
    servidor: "o index.html passa de 2 MB",
  },
];

describe("casos de borda: o que o editor gera, o Servidor aceita", () => {
  it.each(EDITOR_GERA_SERVIDOR_ACEITA.map((b) => [b.caso, b] as const))(
    "%s",
    async (_caso, { arquivos, entrada, publicados }) => {
      const saida = await exportar(arquivos, entrada);
      const inspecao = aceitar(saida.bytes);
      conferirSaidaDoEditor(saida, inspecao);
      if (publicados) expect(inspecao.arquivos).toEqual(publicados);
    },
  );

  it("o nome com acento sai em NFC mesmo quando o pacote veio em NFD (macOS)", async () => {
    const saida = await exportar({
      "index.html": HTML,
      [NFD("promoção.png")]: PNG,
    });
    expect(Object.keys(unzipSync(saida.bytes))).toContain("promoção.png");
    // O mesmo nome em NFD, num ZIP que não passou pelo editor, o Servidor
    // recusa: no disco da VPS ele não casaria com o link em NFC do HTML.
    expect(
      recusas(zipCru({ "index.html": HTML, [NFD("promoção.png")]: PNG })),
    ).toEqual([
      {
        arquivo: NFD("promoção.png"),
        motivo: "renomeie sem acento nem espaço especial (ex.: promocao.png)",
      },
    ]);
  });
});

describe("casos de borda: o que o editor recusa (e o que o Servidor faria)", () => {
  it.each(EDITOR_RECUSA.map((b) => [b.caso, b] as const))(
    "%s",
    async (_caso, { arquivos, entrada, editor, servidor }) => {
      await expect(exportar(arquivos, entrada)).rejects.toThrow(editor);
      const cru = inspecionarZip(zipCru(arquivos));
      if (servidor === null) {
        expect(cru.ok).toBe(true);
        if (cru.ok)
          expect(cru.avisos[0]).toMatch(/1 arquivo de sistema ignorado/);
      } else {
        expect(cru.ok ? [] : cru.problemas.map((p) => p.motivo)).toContain(
          servidor,
        );
      }
    },
  );
});

// ---------------------------------------------------------------------------
// 4. O limite de 3.000.000 bytes é o mesmo nos dois lados
// ---------------------------------------------------------------------------

/** Bytes pseudoaleatórios fixos (xorshift32): não comprimem e o teste se repete igual. */
const ALEATORIO = (() => {
  const dados = new Uint8Array(3_100_000);
  let x = 2463534242;
  for (let i = 0; i < dados.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    dados[i] = x & 0xff;
  }
  return dados;
})();

/**
 * Um pacote que o editor transforma num ZIP de exatamente `alvo` bytes. O
 * tamanho não depende da hora gravada no ZIP, então o zipSync (mesmo
 * fflate, mesmo nível) serve para procurar o tamanho da imagem.
 */
function pacoteDeTamanho(alvo: number): Arquivos {
  for (const nome of ["img/foto.png", "img/foto1.png", "img/foto12.png"]) {
    const html = `<!doctype html><title>Grande</title><img src="${nome}">`;
    const vistos = new Set<number>();
    let n = alvo - 300;
    while (!vistos.has(n)) {
      vistos.add(n);
      const arquivos = { "index.html": html, [nome]: ALEATORIO.subarray(0, n) };
      const tamanho = zipCru(arquivos).byteLength;
      if (tamanho === alvo) return arquivos;
      n += alvo - tamanho;
    }
  }
  throw new Error(`nenhum pacote deu um ZIP de exatamente ${alvo} bytes`);
}

describe("limite de 3.000.000 bytes", () => {
  it("é o mesmo número no editor, no painel, na rota e no agente", () => {
    expect(STATIC_EXPORT_MAX_BYTES).toBe(3_000_000);
    expect(VPS_UPLOAD_MAX_BYTES).toBe(STATIC_EXPORT_MAX_BYTES);
    expect(LIMITES_DO_ZIP.zip).toBe(STATIC_EXPORT_MAX_BYTES);
    // O agente confere este mesmo arquivo (tests/agente/test_compat.py).
    expect(CONSTANTES.zip.limites.zip).toBe(STATIC_EXPORT_MAX_BYTES);
  });

  it("exatamente 3.000.000: o editor gera e o Servidor aceita", async () => {
    const saida = await exportar(pacoteDeTamanho(3_000_000));
    expect(saida.bytes.byteLength).toBe(3_000_000);
    conferirSaidaDoEditor(saida, aceitar(saida.bytes));
  }, 60_000);

  it("3.000.001: o editor recusa e o Servidor também", async () => {
    const arquivos = pacoteDeTamanho(3_000_001);
    await expect(exportar(arquivos)).rejects.toThrow(/excede 3 MB/);
    const cru = zipCru(arquivos);
    expect(cru.byteLength).toBe(3_000_001);
    expect(recusas(cru)).toEqual([
      { arquivo: "(o ZIP)", motivo: "O ZIP precisa ter até 3 MB." },
    ]);
    expect(
      problemaDoArquivo(new File([Buffer.from(cru)], "pagina.zip")),
    ).toMatch(/o limite é 3 MB/);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 5. O agente Python extrai o ZIP do editor, byte a byte
// ---------------------------------------------------------------------------

/** O primeiro Python ≥ 3.10 da máquina (o agente não roda em versão menor). */
function acharPython(): string | null {
  for (const nome of [
    "python3.12",
    "python3.13",
    "python3.11",
    "python3.10",
    "python3",
  ]) {
    const r = spawnSync(
      nome,
      [
        "-c",
        "import sys; print(sys.executable if sys.version_info >= (3, 10) else '')",
      ],
      { encoding: "utf8" },
    );
    const executavel = r.status === 0 ? r.stdout.trim() : "";
    if (executavel) return executavel;
  }
  return null;
}
const PYTHON = acharPython();
const SCRIPT = path.join(REPO, "tests/agente/extrair_zip.py");
const TEMPORARIA = mkdtempSync(path.join(os.tmpdir(), "editor-servidor-"));
afterAll(() => rmSync(TEMPORARIA, { recursive: true, force: true }));

type Extracao =
  | { ok: true; arquivos: number; bytes: number; limiteZip: number }
  | { ok: false; codigo: string; detalhe: string };

let contador = 0;
/** Grava o ZIP, chama a extrair() do agente e devolve o resultado e a pasta. */
function extrairNoAgente(zip: Uint8Array): {
  resultado: Extracao;
  destino: string;
} {
  const pasta = path.join(TEMPORARIA, String(++contador));
  const destino = path.join(pasta, "site");
  mkdirSync(destino, { recursive: true });
  const arquivo = path.join(pasta, "pagina.zip");
  writeFileSync(arquivo, zip);
  const r = spawnSync(PYTHON as string, [SCRIPT, arquivo, destino], {
    encoding: "utf8",
    // Ambiente mínimo: nada do ambiente do teste chega ao Python.
    env: {
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  if (r.status !== 0)
    throw new Error(`o script saiu com ${r.status}: ${r.stderr}`);
  return { resultado: JSON.parse(r.stdout) as Extracao, destino };
}

function lerPasta(raiz: string): Map<string, Buffer> {
  const achados = new Map<string, Buffer>();
  for (const item of readdirSync(raiz, {
    recursive: true,
    withFileTypes: true,
  }))
    if (item.isFile()) {
      const caminho = path.join(item.parentPath, item.name);
      achados.set(path.relative(raiz, caminho), readFileSync(caminho));
    }
  return achados;
}

describe.skipIf(!PYTHON)("agente Python real extrai o ZIP do editor", () => {
  const CASOS: [string, () => Promise<{ bytes: Uint8Array }>][] = [
    ["landing gerada", () => exportFlowPage(FUNIL, "page-landing")],
    [
      "upsell gerado (duas saídas)",
      () => {
        const funil = comDestinos(createFlowTemplate("upsell"));
        return exportFlowPage(funil, "template-upsell-page-upsell");
      },
    ],
    [
      "pacote importado com subpasta, acento, @2x, espaço especial e arquivo vazio",
      () =>
        exportar(
          {
            "index.html": "<!doctype html><p>Home antiga</p>",
            "ofertas/verão/oferta.html": HTML,
            "ofertas/verão/img/logo@2x.png": PNG,
            "Captura de Tela às 10.00.00\u202fAM.png": PNG,
            "vazio.txt": "",
            "dados.json": "0".repeat(1 << 20),
          },
          "ofertas/verão/oferta.html",
        ),
    ],
    [
      "ZIP de exatamente 3.000.000 bytes",
      () => exportar(pacoteDeTamanho(3_000_000)),
    ],
  ];

  it.each(CASOS)(
    "%s",
    async (_nome, gerar) => {
      const { bytes } = await gerar();
      const inspecao = aceitar(bytes);
      const { resultado, destino } = extrairNoAgente(bytes);
      expect(resultado).toEqual({
        ok: true,
        arquivos: inspecao.arquivos.length,
        bytes: inspecao.bytesDescompactados,
        limiteZip: VPS_UPLOAD_MAX_BYTES,
      });
      const noDisco = lerPasta(destino);
      const noZip = unzipSync(bytes);
      expect([...noDisco.keys()].sort()).toEqual(inspecao.arquivos);
      for (const [caminho, dados] of Object.entries(noZip))
        expect(noDisco.get(caminho)?.equals(Buffer.from(dados))).toBe(true);
      // O index.html que o nginx vai servir é o mesmo que o painel guardou.
      expect(sha256(noDisco.get("index.html")!)).toBe(inspecao.indexSha256);
    },
    60_000,
  );

  it("o que o Servidor recusa, o agente também recusa (arquivo oculto)", async () => {
    // O editor já não gera este ZIP; o cru prova a terceira camada.
    const bytes = zipCru({
      "index.html": HTML,
      ".well-known/security.txt": "Contact: mailto:seguranca@exemplo.com.br",
    });
    expect(inspecionarZip(bytes).ok).toBe(false);
    const { resultado, destino } = extrairNoAgente(bytes);
    expect(resultado).toMatchObject({ ok: false, codigo: "zip_nome" });
    expect(lerPasta(destino).size).toBe(0);
  });
});
