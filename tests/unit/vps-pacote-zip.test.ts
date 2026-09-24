// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { inspecionarZip } from "@/features/vps/pacote-zip";

/*
  ZIPs montados aqui mesmo, com zlib.deflateRawSync + zlib.crc32, para
  cada recusa ter um caso exato (e nenhum depender de ferramenta externa).
  Os ZIPs de exemplo de tests/fixtures/vps/zips/ saem do mesmo montador:
  GERAR_ZIPS_VPS=1 regrava os arquivos; sem a variável, o teste confere
  que eles continuam iguais ao que o montador produz.
*/

type EntradaZip = {
  nome: string;
  dados?: Buffer | string;
  /** 0 = guardado, 8 = deflate (padrão); outro número vira método bruto. */
  metodo?: number;
  modo?: number;
  flags?: number;
  /** Tamanhos declarados à força (para mentir no diretório central). */
  declarado?: { comprimido?: number; descomprimido?: number };
  crc?: number;
  extraCentral?: Buffer;
  /** false: sem a marca de UTF-8 (bit 11) no nome, como o ZIP do macOS. */
  utf8?: boolean;
  /** Os bytes do nome, quando não são o UTF-8 de `nome`. */
  nomeBruto?: Buffer;
};

/** 2026-01-01 00:00 em formato DOS: ZIP determinístico. */
const HORA_DOS = 0;
const DATA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;

function montarZip(entradas: EntradaZip[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const e of entradas) {
    const nome = e.nomeBruto ?? Buffer.from(e.nome, "utf8");
    const pasta = e.nome.endsWith("/");
    const bruto = Buffer.isBuffer(e.dados)
      ? e.dados
      : Buffer.from(e.dados ?? "", "utf8");
    const metodo = e.metodo ?? (pasta ? 0 : 8);
    const dados = metodo === 8 ? deflateRawSync(bruto) : bruto;
    const crc = e.crc ?? crc32(bruto) >>> 0;
    const comprimido = e.declarado?.comprimido ?? dados.length;
    const descomprimido = e.declarado?.descomprimido ?? bruto.length;
    const flags = (e.flags ?? 0) | (e.utf8 === false ? 0 : 0x800);
    const modo = e.modo ?? (pasta ? 0o040755 : 0o100644);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(DATA_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido >>> 0, 18);
    local.writeUInt32LE(descomprimido >>> 0, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    const extra = e.extraCentral ?? Buffer.alloc(0);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(HORA_DOS, 12);
    central.writeUInt16LE(DATA_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido >>> 0, 20);
    central.writeUInt32LE(descomprimido >>> 0, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((modo << 16) >>> 0, 38);
    central.writeUInt32LE(deslocamento, 42);

    locais.push(local, nome, dados);
    centrais.push(central, nome, extra);
    deslocamento += local.length + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const INDEX_A = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Loja E2E</title><link rel="stylesheet" href="css/estilo.css"></head>
<body>
<h1>Versão A</h1>
<a href="/checkout?qty=1">Comprar</a>
<script src="https://dash-board-psi-one.vercel.app/agente/v1/rastreio.js" data-produto="cadeira-x" defer></script>
</body>
</html>
`;
const INDEX_B = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Loja E2E</title><script src="app.3f9a2b1c.js" defer></script></head>
<body>
<h1>Versão B</h1>
<a href="/checkout?qty=1">Comprar</a>
</body>
</html>
`;

/** Versão A: pasta-raiz comum, lixo do macOS, páginas do funil e rastreio. */
function zipSiteA(): Buffer {
  return montarZip([
    { nome: "site-a/" },
    { nome: "site-a/index.html", dados: INDEX_A },
    { nome: "site-a/css/", metodo: 0 },
    { nome: "site-a/css/estilo.css", dados: "body{font-family:sans-serif}\n" },
    {
      nome: "site-a/obrigado/index.html",
      dados: "<!doctype html><p>Obrigado!</p>\n",
    },
    { nome: "site-a/termos.html", dados: "<!doctype html><p>Termos</p>\n" },
    {
      nome: "site-a/privacidade.html",
      dados: "<!doctype html><p>Privacidade</p>\n",
    },
    {
      nome: "site-a/img/logo.svg",
      metodo: 0,
      dados: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\n',
    },
    { nome: "site-a/.DS_Store", dados: "lixo" },
    { nome: "__MACOSX/site-a/._index.html", dados: "lixo" },
  ]);
}

/** Versão B: plana, com upsell e asset com hash no nome, sem rastreio. */
function zipSiteB(): Buffer {
  return montarZip([
    { nome: "index.html", dados: INDEX_B },
    { nome: "upsell.html", dados: "<!doctype html><p>Leve dois</p>\n" },
    { nome: "app.3f9a2b1c.js", dados: "console.log('b')\n" },
  ]);
}

const PASTA_ZIPS = path.resolve(__dirname, "../fixtures/vps/zips");
const sha256 = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");

function problemas(zip: Buffer) {
  const r = inspecionarZip(zip);
  if (r.ok) throw new Error("era para recusar");
  return r.problemas;
}

const comIndex = (...outras: EntradaZip[]) =>
  montarZip([{ nome: "index.html", dados: "<p>oi</p>" }, ...outras]);

describe("ZIPs de exemplo (tests/fixtures/vps/zips)", () => {
  it("são os mesmos bytes que o montador produz", () => {
    const zips = { "site-a.zip": zipSiteA(), "site-b.zip": zipSiteB() };
    for (const [nome, bytes] of Object.entries(zips)) {
      const arquivo = path.join(PASTA_ZIPS, nome);
      if (process.env.GERAR_ZIPS_VPS === "1") writeFileSync(arquivo, bytes);
      expect(existsSync(arquivo)).toBe(true);
      expect(readFileSync(arquivo).equals(bytes)).toBe(true);
    }
  });

  it("aceita a versão A: tira a pasta-raiz, ignora o lixo e acha as páginas", () => {
    const r = inspecionarZip(readFileSync(path.join(PASTA_ZIPS, "site-a.zip")));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.arquivos).toEqual([
      "css/estilo.css",
      "img/logo.svg",
      "index.html",
      "obrigado/index.html",
      "privacidade.html",
      "termos.html",
    ]);
    expect(r.indexSha256).toBe(sha256(INDEX_A));
    expect(r.temRastreio).toBe(true);
    expect(r.paginas).toEqual({
      landing: "index.html",
      obrigado: "obrigado/index.html",
      upsell: null,
      downsell: null,
      legais: ["privacidade.html", "termos.html"],
    });
    expect(r.avisos.join(" ")).toMatch(/2 arquivos de sistema ignorados/);
    expect(r.avisos.join(" ")).toMatch(/A pasta "site-a" foi usada como raiz/);
    expect(r.sha256).toBe(sha256(zipSiteA()));
  });

  it("aceita a versão B: plana, sem rastreio, com upsell", () => {
    const r = inspecionarZip(zipSiteB());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.temRastreio).toBe(false);
    expect(r.paginas.upsell).toBe("upsell.html");
    expect(r.paginas.obrigado).toBeNull();
    expect(r.indexSha256).toBe(sha256(INDEX_B));
    expect(r.avisos).toEqual([]);
    expect(r.bytesDescompactados).toBe(
      Buffer.byteLength(INDEX_B) +
        Buffer.byteLength("<!doctype html><p>Leve dois</p>\n") +
        Buffer.byteLength("console.log('b')\n"),
    );
  });
});

describe("inspecionarZip: recusas com arquivo e motivo em português", () => {
  it.each([
    ["../fora.html", "caminho com '..' não é aceito"],
    ["/etc/cron.html", "caminho absoluto não é aceito"],
    [
      "pasta\\x.html",
      "barra invertida no nome (ZIP feito no Windows?): gere o ZIP de novo",
    ],
    [".env.html", "arquivo ou pasta oculta (começa com ponto) não é aceito"],
    [
      "img/.oculto/x.png",
      "arquivo ou pasta oculta (começa com ponto) não é aceito",
    ],
    ["script.php", "tipo de arquivo não permitido (só páginas estáticas)"],
    ["sem-extensao", "tipo de arquivo não permitido (só páginas estáticas)"],
    [
      "promoção.png".normalize("NFD"),
      "renomeie sem acento nem espaço especial (ex.: promocao.png)",
    ],
    [
      "a*b.png",
      'nome com caractere não permitido (< > : " | ? * ou caractere de controle)',
    ],
    [
      "a\u0085b.png",
      'nome com caractere não permitido (< > : " | ? * ou caractere de controle)',
    ],
    [`${"ã".repeat(126)}.png`, "nome longo demais (até 255 bytes)"],
    ["pasta//x.html", "caminho com pasta vazia"],
  ])("%s", (nome, motivo) => {
    expect(problemas(comIndex({ nome, dados: "x" }))).toEqual([
      { arquivo: nome, motivo },
    ]);
  });

  it("acento em NFC marcado como UTF-8, sinais e 255 bytes: aceitos (é o que o editor do funil grava)", () => {
    const nomes = [
      "img/promoção.png",
      "verão/oferta.html",
      "Captura de Tela 2024-01-01 às 10.00.00\u202fAM.png",
      "img/logo@2x.png",
      "css/a&b'c[1]~#%.css",
      "css/-x.css",
      "css/ x.css",
      `${"ã".repeat(125)}.png`,
    ];
    const r = inspecionarZip(
      comIndex(...nomes.map((nome) => ({ nome, dados: "x" }))),
    );
    expect(r.ok ? r.arquivos : r.problemas).toEqual(
      ["index.html", ...nomes].sort(),
    );
  });

  it("acento sem a marca de UTF-8: o agente leria cp437 e gravaria outro nome", () => {
    expect(
      problemas(comIndex({ nome: "promoção.png", dados: "x", utf8: false })),
    ).toEqual([
      {
        arquivo: "promoção.png",
        motivo: "renomeie sem acento nem espaço especial (ex.: promocao.png)",
      },
    ]);
    expect(
      problemas(
        comIndex({
          nome: "Captura de Tela 2024-01-01 às 10.00.00\u202fAM.png",
          dados: "x",
          utf8: false,
        }),
      ),
    ).toEqual([
      {
        arquivo: "Captura de Tela 2024-01-01 às 10.00.00\u202fAM.png",
        motivo: "o nome tem um espaço especial do macOS; renomeie",
      },
    ]);
  });

  it("marcado como UTF-8 sem ser UTF-8: o agente nem abriria o ZIP", () => {
    const nomeBruto = Buffer.from([0x61, 0xff, 0x2e, 0x63, 0x73, 0x73]);
    expect(
      problemas(comIndex({ nome: "a?.css", nomeBruto, dados: "x" })),
    ).toEqual([
      {
        arquivo: "a\u00ff.css",
        motivo: "o ZIP diz que o nome é UTF-8, mas não é: gere o ZIP de novo",
      },
    ]);
  });

  it("o BOM no começo do nome fica no nome (como no Python)", () => {
    const nomeBruto = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("a.css"),
    ]);
    // Sem a marca de UTF-8 é recusado; o Python leria "∩╗┐a.css".
    expect(
      problemas(
        comIndex({ nome: "a.css", nomeBruto, dados: "x", utf8: false }),
      ),
    ).toEqual([
      {
        arquivo: "\ufeffa.css",
        motivo: "renomeie sem acento nem espaço especial (ex.: a.css)",
      },
    ]);
  });

  it("link simbólico", () => {
    expect(
      problemas(
        comIndex({ nome: "atalho.html", dados: "/etc/passwd", modo: 0o120777 }),
      ),
    ).toEqual([
      {
        arquivo: "atalho.html",
        motivo: "link simbólico ou arquivo especial não é aceito",
      },
    ]);
  });

  it("arquivo com senha e método de compressão estranho", () => {
    expect(
      problemas(comIndex({ nome: "a.css", dados: "x", flags: 0x1 })),
    ).toEqual([{ arquivo: "a.css", motivo: "arquivo com senha não é aceito" }]);
    expect(
      problemas(comIndex({ nome: "b.css", dados: "x", metodo: 12 }))[0].motivo,
    ).toMatch(/método de compressão não aceito/);
  });

  it("nome repetido sem diferenciar maiúsculas", () => {
    expect(
      problemas(
        comIndex(
          { nome: "Foto.png", dados: "1" },
          { nome: "foto.png", dados: "2" },
        ),
      ),
    ).toEqual([
      {
        arquivo: "foto.png",
        motivo:
          "nome repetido (maiúsculas e minúsculas contam como o mesmo arquivo)",
      },
    ]);
  });

  it("sem index.html, ou com o nome em maiúsculas", () => {
    expect(problemas(montarZip([{ nome: "home.html", dados: "x" }]))).toEqual([
      {
        arquivo: "(o ZIP)",
        motivo: "falta o index.html na raiz (a primeira página do site)",
      },
    ]);
    expect(
      problemas(montarZip([{ nome: "Index.html", dados: "x" }]))[0].motivo,
    ).toBe("o index.html precisa ter o nome em minúsculas");
  });

  it("razão acima do que o deflate alcança: o tamanho declarado mente", () => {
    // 1 MB de zeros comprime ~1000 vezes de verdade: o agente extrai, aceita.
    const zeros = Buffer.alloc(1 << 20);
    expect(
      inspecionarZip(comIndex({ nome: "zeros.txt", dados: zeros })).ok,
    ).toBe(true);
    expect(
      problemas(
        comIndex({
          nome: "bomba.txt",
          dados: zeros,
          declarado: { descomprimido: 19 << 20 },
        }),
      ),
    ).toEqual([
      {
        arquivo: "bomba.txt",
        motivo:
          "tamanho declarado impossível para o que está comprimido (ZIP adulterado ou corrompido): gere o ZIP de novo",
      },
    ]);
  });

  it("tamanhos declarados: arquivo acima de 20 MB e total acima de 50 MB", () => {
    const grande = 21 << 20;
    expect(
      problemas(
        comIndex({
          nome: "video.mp4",
          dados: "x",
          metodo: 0,
          declarado: { comprimido: grande, descomprimido: grande },
        }),
      ),
    ).toEqual([
      { arquivo: "video.mp4", motivo: "arquivo passa de 20 MB descompactado" },
    ]);
    const quase = 19 << 20;
    const tres = [1, 2, 3].map((n) => ({
      nome: `v${n}.mp4`,
      dados: "x",
      metodo: 0,
      declarado: { comprimido: quase, descomprimido: quase },
    }));
    expect(problemas(comIndex(...tres))).toEqual([
      { arquivo: "(o ZIP)", motivo: "o site descompactado passa de 50 MB" },
    ]);
  });

  it("mais de 2000 arquivos", () => {
    const muitos = Array.from({ length: 2000 }, (_, i) => ({
      nome: `a/${i}.txt`,
      dados: "",
      metodo: 0,
    }));
    expect(problemas(comIndex(...muitos))).toEqual([
      { arquivo: "(o ZIP)", motivo: "o ZIP tem mais de 2000 arquivos" },
    ]);
  });

  it("ZIP64 (no fim do arquivo e no campo extra da entrada)", () => {
    const zip = comIndex();
    const fim = zip.length - 22;
    const zip64 = Buffer.from(zip);
    zip64.writeUInt16LE(0xffff, fim + 8);
    zip64.writeUInt16LE(0xffff, fim + 10);
    expect(problemas(zip64)[0].motivo).toBe(
      "ZIP64 não é aceito: gere um ZIP comum (até 3 MB).",
    );
    const extra = Buffer.alloc(8);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(4, 2);
    expect(
      problemas(comIndex({ nome: "a.css", dados: "x", extraCentral: extra }))[0]
        .motivo,
    ).toBe("ZIP64 não é aceito: gere um ZIP comum (até 3 MB).");
  });

  it("nome local diferente do central (ZIP adulterado)", () => {
    const zip = comIndex({ nome: "ok.css", dados: "x" });
    const i = zip.indexOf(Buffer.from("ok.css"));
    zip.write("oo", i, "latin1");
    expect(problemas(zip)).toEqual([
      {
        arquivo: "ok.css",
        motivo:
          "o nome no cabeçalho do arquivo é diferente do índice (ZIP adulterado ou corrompido)",
      },
    ]);
  });

  it("index.html acima de 2 MB e index.html com CRC errado", () => {
    let texto = "";
    let semente = 7;
    while (texto.length < 2.2 * (1 << 20)) {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff;
      texto += String.fromCharCode(97 + (semente % 26));
    }
    expect(
      problemas(montarZip([{ nome: "index.html", dados: texto }])),
    ).toEqual([
      { arquivo: "index.html", motivo: "o index.html passa de 2 MB" },
    ]);
    expect(
      problemas(
        montarZip([{ nome: "index.html", dados: "<p>oi</p>", crc: 1 }]),
      ),
    ).toEqual([
      {
        arquivo: "index.html",
        motivo: "o index.html está corrompido dentro do ZIP (CRC)",
      },
    ]);
  });

  it("não é ZIP, está vazio ou passa de 3 MB", () => {
    expect(
      problemas(Buffer.from("isto não é um zip de verdade, só texto"))[0]
        .motivo,
    ).toBe("O arquivo não é um ZIP válido.");
    expect(problemas(Buffer.alloc(0))[0].motivo).toBe("O arquivo está vazio.");
    expect(problemas(Buffer.alloc(3_000_001))[0].motivo).toBe(
      "O ZIP precisa ter até 3 MB.",
    );
  });

  it("lixo conhecido é ignorado sem recusar", () => {
    const r = inspecionarZip(
      comIndex(
        { nome: "Thumbs.db", dados: "x" },
        { nome: "img/desktop.ini", dados: "x" },
        { nome: ".htaccess", dados: "x" },
        { nome: "img/._foto.png", dados: "x" },
        { nome: "__MACOSX/qualquer.bin", dados: "x" },
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.arquivos).toEqual(["index.html"]);
      expect(r.avisos[0]).toMatch(/^5 arquivos de sistema ignorados/);
    }
  });

  it("junta vários problemas de uma vez", () => {
    const lista = problemas(
      comIndex({ nome: "a.php", dados: "x" }, { nome: "a:b.png", dados: "x" }),
    );
    expect(lista.map((p) => p.arquivo)).toEqual(["a.php", "a:b.png"]);
  });
});
