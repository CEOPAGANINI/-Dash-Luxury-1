import { createHash } from "node:crypto";
import { crc32, inflateRawSync } from "node:zlib";

import { normalizeVpsRelativePath, VPS_UPLOAD_MAX_BYTES } from "./file-paths";
import {
  ehArquivoDeSistema,
  INDEX_HTML_MAX_BYTES,
  R_SEGMENTO,
  SEGMENTO_MAX_BYTES,
  segmentoDoZipOk,
  type PaginasDoFunil,
} from "./modelo";

/*
  Inspeção do ZIP antes de aceitar a publicação (§8.4). Só node:zlib, sem
  biblioteca: lê o fim do arquivo (EOCD) e o diretório central, e
  descomprime SÓ o index.html (para o sha256 da conferência "No ar" e para
  achar o rastreio).

  O objetivo é recusar cedo, com arquivo e motivo em português, o que o
  agente recusaria de qualquer jeito. A regra que vale de fato é a do
  agente (public/agente/v1/dash_agent.py), que extrai contando os bytes
  REAIS: aqui os tamanhos são os declarados no ZIP, que podem mentir.

  As listas de lixo ignorado, extensões, limites e a regra do nome são as
  mesmas do agente (tests/fixtures/vps/constantes.json e
  casos-validacao.json são conferidos pelos dois lados). O ZIP que o
  editor do funil exporta passa aqui e no agente:
  tests/integration/editor-para-servidor.test.ts prova isso.
*/

export const EXTENSOES_PERMITIDAS = [
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "json",
  "txt",
  "xml",
  "webmanifest",
  "map",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp4",
  "webm",
  "mp3",
  "pdf",
] as const;

/** Ignorados sem recusar: a regra mora em modelo.ts, que o editor também usa. */
export { IGNORAR_NO_ZIP, IGNORAR_NOME } from "./modelo";

export const LIMITES_DO_ZIP = {
  zip: VPS_UPLOAD_MAX_BYTES,
  arquivos: 2000,
  arquivo: 20 << 20,
  total: 50 << 20,
  /**
   * Razão descomprimido/comprimido que o deflate não alcança (no melhor
   * caso, 258 bytes em 2 bits): acima disto o tamanho declarado mente.
   * Não é um teto de "compressão suspeita": um arquivo honesto que
   * comprime 1000 vezes o agente extrai, e o editor do funil exporta.
   */
  razao: 1032,
  /**
   * O index.html descomprimido aqui tem teto de 2 MB, o mesmo que a
   * conferência "No ar" baixa para comparar o sha256 (conferencia.ts).
   */
  index: INDEX_HTML_MAX_BYTES,
} as const;

/** Só confere a razão acima disto: arquivo pequeno não esconde nada. */
const RAZAO_A_PARTIR_DE = 64 * 1024;

export type ProblemaDoZip = { arquivo: string; motivo: string };

export type ZipInspecionado =
  | {
      ok: true;
      sha256: string;
      zipBytes: number;
      /** Caminhos relativos à raiz do site (já sem a pasta-raiz comum). */
      arquivos: string[];
      bytesDescompactados: number;
      indexSha256: string;
      paginas: PaginasDoFunil;
      temRastreio: boolean;
      avisos: string[];
    }
  | { ok: false; problemas: ProblemaDoZip[] };

type Entrada = {
  nome: string;
  flags: number;
  metodo: number;
  crc: number;
  comprimido: number;
  descomprimido: number;
  atributos: number;
  deslocamentoLocal: number;
  nomeBruto: Buffer;
  /** Marcado como UTF-8 (bit 11) e com bytes que não são UTF-8. */
  nomeQuebrado: boolean;
};

const ZIP_TODO = "(o ZIP)";
const MAX_PROBLEMAS = 50;

const ehLixo = ehArquivoDeSistema;

const UTF8_ESTRITO = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});

/**
 * O nome como o agente vai ler. Marcado como UTF-8 (bit 11), o Python lê
 * UTF-8 e nem abre o ZIP se os bytes não forem: aqui isso vira recusa.
 * Sem a marca, o Python lê cp437; aqui o nome é lido como UTF-8 (ou
 * latin1) só para a mensagem: qualquer byte fora do ASCII já é recusado
 * pela regra do segmento. O BOM fica no nome, como no Python.
 */
function decodificarNome(
  bruto: Buffer,
  flags: number,
): { nome: string; quebrado: boolean } {
  try {
    return { nome: UTF8_ESTRITO.decode(bruto), quebrado: false };
  } catch {
    return { nome: bruto.toString("latin1"), quebrado: (flags & 0x800) !== 0 };
  }
}

/** "promoção.png" → "promocao.png": sugestão para a mensagem. */
function sugerirNome(segmento: string): string {
  return segmento
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_ .()+,-]+/g, "-")
    .replace(/^[.\- ]+/, "");
}

/** Motivo em português para um segmento que não passa em segmentoDoZipOk. */
function motivoDoSegmento(segmento: string, marcadoUtf8: boolean): string {
  if (segmento === "") return "caminho com pasta vazia";
  if (segmento.startsWith("."))
    return "arquivo ou pasta oculta (começa com ponto) não é aceito";
  if (!R_SEGMENTO.test(segmento))
    return 'nome com caractere não permitido (< > : " | ? * ou caractere de controle)';
  if (Buffer.byteLength(segmento, "utf8") > SEGMENTO_MAX_BYTES)
    return `nome longo demais (até ${SEGMENTO_MAX_BYTES} bytes)`;
  // Sobra o acento que chegaria errado ao disco da VPS: nome sem a marca
  // de UTF-8 no ZIP, ou em NFD (o ZIP do macOS).
  if (!marcadoUtf8 && /[  -​  　]/.test(segmento))
    return "o nome tem um espaço especial do macOS; renomeie";
  const sugestao = sugerirNome(segmento);
  return sugestao && segmentoDoZipOk(sugestao, false)
    ? `renomeie sem acento nem espaço especial (ex.: ${sugestao})`
    : "renomeie sem acento nem espaço especial";
}

/**
 * Lê o diretório central. Devolve as entradas ou um problema que impede
 * ler o resto (não é ZIP, ZIP64, ZIP em partes, índice corrompido).
 */
function lerDiretorio(
  zip: Buffer,
): { ok: true; entradas: Entrada[] } | { ok: false; problema: string } {
  const minimo = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let p = zip.length - 22; p >= minimo; p--) {
    if (
      zip.readUInt32LE(p) === 0x06054b50 &&
      p + 22 + zip.readUInt16LE(p + 20) <= zip.length
    ) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0)
    return { ok: false, problema: "O arquivo não é um ZIP válido." };
  const disco = zip.readUInt16LE(eocd + 4);
  const discoDoIndice = zip.readUInt16LE(eocd + 6);
  const noDisco = zip.readUInt16LE(eocd + 8);
  const total = zip.readUInt16LE(eocd + 10);
  const tamanho = zip.readUInt32LE(eocd + 12);
  const inicio = zip.readUInt32LE(eocd + 16);
  if (
    total === 0xffff ||
    tamanho === 0xffffffff ||
    inicio === 0xffffffff ||
    (eocd >= 20 && zip.readUInt32LE(eocd - 20) === 0x07064b50)
  )
    return {
      ok: false,
      problema: "ZIP64 não é aceito: gere um ZIP comum (até 3 MB).",
    };
  if (disco !== 0 || discoDoIndice !== 0 || noDisco !== total)
    return { ok: false, problema: "ZIP dividido em partes não é aceito." };
  if (inicio + tamanho > eocd)
    return { ok: false, problema: "O índice do ZIP está corrompido." };

  const entradas: Entrada[] = [];
  let p = inicio;
  for (let i = 0; i < total; i++) {
    if (p + 46 > eocd || zip.readUInt32LE(p) !== 0x02014b50)
      return { ok: false, problema: "O índice do ZIP está corrompido." };
    const tamNome = zip.readUInt16LE(p + 28);
    const tamExtra = zip.readUInt16LE(p + 30);
    const tamComentario = zip.readUInt16LE(p + 32);
    if (p + 46 + tamNome + tamExtra + tamComentario > eocd)
      return { ok: false, problema: "O índice do ZIP está corrompido." };
    const flags = zip.readUInt16LE(p + 8);
    const nomeBruto = zip.subarray(p + 46, p + 46 + tamNome);
    const { nome, quebrado } = decodificarNome(nomeBruto, flags);
    const entrada: Entrada = {
      nome,
      nomeQuebrado: quebrado,
      flags,
      metodo: zip.readUInt16LE(p + 10),
      crc: zip.readUInt32LE(p + 16),
      comprimido: zip.readUInt32LE(p + 20),
      descomprimido: zip.readUInt32LE(p + 24),
      atributos: zip.readUInt32LE(p + 38),
      deslocamentoLocal: zip.readUInt32LE(p + 42),
      nomeBruto,
    };
    // Campo extra 0x0001 = ZIP64 por entrada.
    const extra = zip.subarray(p + 46 + tamNome, p + 46 + tamNome + tamExtra);
    for (let e = 0; e + 4 <= extra.length;) {
      if (extra.readUInt16LE(e) === 0x0001)
        return {
          ok: false,
          problema: "ZIP64 não é aceito: gere um ZIP comum (até 3 MB).",
        };
      e += 4 + extra.readUInt16LE(e + 2);
    }
    if (
      entrada.comprimido === 0xffffffff ||
      entrada.descomprimido === 0xffffffff ||
      entrada.deslocamentoLocal === 0xffffffff
    )
      return {
        ok: false,
        problema: "ZIP64 não é aceito: gere um ZIP comum (até 3 MB).",
      };
    entradas.push(entrada);
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return { ok: true, entradas };
}

/** Onde começam os dados da entrada, conferindo o cabeçalho local. */
function inicioDosDados(zip: Buffer, e: Entrada): number | null {
  const p = e.deslocamentoLocal;
  if (p + 30 > zip.length || zip.readUInt32LE(p) !== 0x04034b50) return null;
  const tamNome = zip.readUInt16LE(p + 26);
  const tamExtra = zip.readUInt16LE(p + 28);
  if (p + 30 + tamNome + tamExtra > zip.length) return null;
  if (!zip.subarray(p + 30, p + 30 + tamNome).equals(e.nomeBruto)) return null;
  return p + 30 + tamNome + tamExtra;
}

/** Uma pasta-raiz comum a tudo ("site/…"), se houver: é removida. */
function raizComum(nomes: string[]): string {
  if (nomes.length === 0) return "";
  const primeiro = nomes[0].split("/")[0];
  if (!primeiro) return "";
  const prefixo = `${primeiro}/`;
  return nomes.every((n) => n.startsWith(prefixo)) ? prefixo : "";
}

function acharPagina(arquivos: Set<string>, nome: string): string | null {
  for (const candidato of [`${nome}/index.html`, `${nome}.html`])
    if (arquivos.has(candidato)) return candidato;
  return null;
}

export function inspecionarZip(bytes: Buffer | Uint8Array): ZipInspecionado {
  const zip = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const recusar = (motivo: string): ZipInspecionado => ({
    ok: false,
    problemas: [{ arquivo: ZIP_TODO, motivo }],
  });
  if (zip.length === 0) return recusar("O arquivo está vazio.");
  if (zip.length > LIMITES_DO_ZIP.zip)
    return recusar("O ZIP precisa ter até 3 MB.");
  if (zip.length < 22) return recusar("O arquivo não é um ZIP válido.");

  const lido = lerDiretorio(zip);
  if (!lido.ok) return recusar(lido.problema);

  const problemas: ProblemaDoZip[] = [];
  const problema = (arquivo: string, motivo: string) => {
    if (problemas.length < MAX_PROBLEMAS) problemas.push({ arquivo, motivo });
  };

  const validas = lido.entradas.filter((e) => !ehLixo(e.nome));
  const ignorados = lido.entradas.length - validas.length;
  for (const e of lido.entradas) {
    if (inicioDosDados(zip, e) === null)
      problema(
        e.nome,
        "o nome no cabeçalho do arquivo é diferente do índice (ZIP adulterado ou corrompido)",
      );
    // Vale até para o lixo: o agente lê todos os nomes ao abrir o ZIP.
    else if (e.nomeQuebrado)
      problema(
        e.nome,
        "o ZIP diz que o nome é UTF-8, mas não é: gere o ZIP de novo",
      );
  }

  const prefixo = raizComum(validas.map((e) => e.nome));
  const arquivos = new Map<string, Entrada>();
  const vistos = new Set<string>();
  let declarado = 0;

  for (const e of validas) {
    if (e.flags & 0x1) {
      problema(e.nome, "arquivo com senha não é aceito");
      continue;
    }
    const tipo = (e.atributos >>> 16) & 0o170000;
    if (tipo !== 0 && tipo !== 0o100000 && tipo !== 0o040000) {
      problema(e.nome, "link simbólico ou arquivo especial não é aceito");
      continue;
    }
    if (e.metodo !== 0 && e.metodo !== 8) {
      problema(
        e.nome,
        "método de compressão não aceito: gere um ZIP comum (sem 7z, bzip2 ou LZMA)",
      );
      continue;
    }
    if (e.nome.endsWith("/")) continue;

    const rel = e.nome.slice(prefixo.length);
    const partes = rel.split("/");
    if (rel.includes("\\")) {
      problema(
        e.nome,
        "barra invertida no nome (ZIP feito no Windows?): gere o ZIP de novo",
      );
      continue;
    }
    if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) {
      problema(e.nome, "caminho absoluto não é aceito");
      continue;
    }
    if (partes.includes("..") || partes.includes(".")) {
      problema(e.nome, "caminho com '..' não é aceito");
      continue;
    }
    const marcadoUtf8 = (e.flags & 0x800) !== 0;
    const ruim = partes.find((s) => !segmentoDoZipOk(s, marcadoUtf8));
    if (ruim !== undefined) {
      problema(e.nome, motivoDoSegmento(ruim, marcadoUtf8));
      continue;
    }
    if (partes[0].startsWith(".dash-")) {
      problema(e.nome, "nome reservado (.dash-) não é aceito");
      continue;
    }
    try {
      normalizeVpsRelativePath(rel);
    } catch {
      problema(e.nome, "caminho inválido");
      continue;
    }
    const nomeArquivo = partes[partes.length - 1];
    const ponto = nomeArquivo.lastIndexOf(".");
    const extensao =
      ponto > 0 ? nomeArquivo.slice(ponto + 1).toLowerCase() : "";
    if (!(EXTENSOES_PERMITIDAS as readonly string[]).includes(extensao)) {
      problema(e.nome, "tipo de arquivo não permitido (só páginas estáticas)");
      continue;
    }
    const chave = rel.toLowerCase();
    if (vistos.has(chave)) {
      problema(
        e.nome,
        "nome repetido (maiúsculas e minúsculas contam como o mesmo arquivo)",
      );
      continue;
    }
    vistos.add(chave);
    if (e.descomprimido > LIMITES_DO_ZIP.arquivo) {
      problema(e.nome, "arquivo passa de 20 MB descompactado");
      continue;
    }
    if (
      e.descomprimido > RAZAO_A_PARTIR_DE &&
      e.descomprimido / Math.max(e.comprimido, 1) > LIMITES_DO_ZIP.razao
    ) {
      problema(
        e.nome,
        "tamanho declarado impossível para o que está comprimido (ZIP adulterado ou corrompido): gere o ZIP de novo",
      );
      continue;
    }
    declarado += e.descomprimido;
    arquivos.set(rel, e);
  }

  if (arquivos.size > LIMITES_DO_ZIP.arquivos)
    problema(ZIP_TODO, "o ZIP tem mais de 2000 arquivos");
  if (declarado > LIMITES_DO_ZIP.total)
    problema(ZIP_TODO, "o site descompactado passa de 50 MB");
  const index = arquivos.get("index.html");
  if (!index && problemas.length === 0)
    problema(
      ZIP_TODO,
      [...arquivos.keys()].some((n) => n.toLowerCase() === "index.html")
        ? "o index.html precisa ter o nome em minúsculas"
        : "falta o index.html na raiz (a primeira página do site)",
    );
  if (problemas.length > 0 || !index) return { ok: false, problemas };

  // Só o index.html é descomprimido, com teto e CRC conferido.
  const inicio = inicioDosDados(zip, index)!;
  const dados = zip.subarray(inicio, inicio + index.comprimido);
  let conteudo: Buffer;
  try {
    if (index.descomprimido > LIMITES_DO_ZIP.index) throw new RangeError();
    conteudo =
      index.metodo === 0
        ? Buffer.from(dados)
        : inflateRawSync(dados, { maxOutputLength: LIMITES_DO_ZIP.index });
  } catch (erro) {
    return {
      ok: false,
      problemas: [
        {
          arquivo: "index.html",
          motivo:
            erro instanceof RangeError
              ? "o index.html passa de 2 MB"
              : "o index.html está corrompido dentro do ZIP",
        },
      ],
    };
  }
  if (
    conteudo.length !== index.descomprimido ||
    crc32(conteudo) >>> 0 !== index.crc >>> 0
  )
    return {
      ok: false,
      problemas: [
        {
          arquivo: "index.html",
          motivo: "o index.html está corrompido dentro do ZIP (CRC)",
        },
      ],
    };

  const nomes = new Set(arquivos.keys());
  const legais = [...nomes]
    .filter((n) =>
      /^(?:termos|privacidade|cookies)[^/]*(?:\.html?|\/index\.html?)$/.test(n),
    )
    .sort();
  const paginas: PaginasDoFunil = {
    landing: "index.html",
    obrigado: acharPagina(nomes, "obrigado"),
    upsell: acharPagina(nomes, "upsell"),
    downsell: acharPagina(nomes, "downsell"),
    legais,
  };

  const avisos: string[] = [];
  if (ignorados > 0)
    avisos.push(
      `${ignorados} ${ignorados === 1 ? "arquivo de sistema ignorado" : "arquivos de sistema ignorados"} (__MACOSX, .DS_Store, Thumbs.db, desktop.ini, .htaccess, ._*).`,
    );
  if (prefixo)
    avisos.push(
      `A pasta "${prefixo.slice(0, -1)}" foi usada como raiz do site.`,
    );

  return {
    ok: true,
    sha256: createHash("sha256").update(zip).digest("hex"),
    zipBytes: zip.length,
    arquivos: [...nomes].sort(),
    bytesDescompactados: declarado,
    indexSha256: createHash("sha256").update(conteudo).digest("hex"),
    paginas,
    temRastreio: conteudo.toString("utf8").includes("/agente/v1/rastreio.js"),
    avisos,
  };
}
